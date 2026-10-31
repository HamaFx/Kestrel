/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Position close/modify and order cancellation.

import {
  getAccount,
  getOrder,
  getPosition,
  incrementAccountBalance,
  insertFill,
  updateOpenPosition,
  updateOrder,
  updatePosition,
} from '../db/queries';
import type { PaperAccountRow, PaperPositionRow } from '../db/tables';
import {
  contractSizeFor,
  entryFeeFor,
  exitQuote,
  grossPnl,
  validateBracket,
  type PositionCloseReason,
} from '../domain';
import type { AccountView, FillView, OrderView, PositionView } from '../schemas';
import type { PaperSettings } from '../settings';
import { accountViewById } from './accounts';
import { syncJournal } from './journal-sync';
import { loadTick } from './pricing';
import {
  allocateEntryFee,
  exitWithSlippage,
  minStopDistance,
  positionState,
  quotesFor,
} from './trading-shared';
import { fillView, orderView, positionView } from './views';

export async function applyClose(args: {
  userId: string;
  position: PaperPositionRow;
  account: PaperAccountRow;
  exitPrice: number;
  quantity: number;
  reason: PositionCloseReason;
  settings: PaperSettings;
  source: string;
  now: Date;
  onJournalError?: (err: unknown) => void;
}): Promise<{ position: PaperPositionRow; fill: FillView | null; closed: boolean }> {
  const closeQuantity = Math.min(args.quantity, args.position.quantity);
  if (!(closeQuantity > 0)) {
    throw new Error('Close quantity must be positive.');
  }
  const full = closeQuantity >= args.position.quantity - 1e-9;
  const contractSize = contractSizeFor(args.position.symbol);
  const side = args.position.side === 'short' ? 'short' : 'long';
  const entryFeeShare = allocateEntryFee(args.position, closeQuantity);
  const exitFee = entryFeeFor(closeQuantity, args.settings.commissionPerUnit);
  const gross = grossPnl(
    side,
    args.position.entryPrice,
    args.exitPrice,
    closeQuantity,
    contractSize,
  );
  const pnl = gross - entryFeeShare - exitFee;
  const fillKind =
    args.reason === 'stop_loss'
      ? 'stop_loss'
      : args.reason === 'take_profit'
        ? 'take_profit'
        : args.reason === 'trailing_stop'
          ? 'trailing_stop'
          : full
            ? 'close'
            : 'partial_close';

  // Claim the row before any side effect: the TickBus subscriber and the
  // market-watch job can evaluate the same stop at the same time, and only one
  // of them may close, insert a fill, and credit the balance.
  const updated = full
    ? await updateOpenPosition(args.userId, args.position.id, {
        status: 'closed',
        quantity: 0,
        closePrice: args.exitPrice,
        closeTime: args.now,
        closeReason: args.reason,
        realizedPnl: args.position.realizedPnl + pnl,
        unrealizedPnl: 0,
        exitFee: args.position.exitFee + exitFee,
      })
    : await updateOpenPosition(args.userId, args.position.id, {
        quantity: args.position.quantity - closeQuantity,
        realizedPnl: args.position.realizedPnl + pnl,
        unrealizedPnl: args.position.unrealizedPnl * (1 - closeQuantity / args.position.quantity),
        // Keep the original risk so R and the Journal reflect the whole trade
        // across partial closes, not just the remaining slice.
        entryFee: args.position.entryFee * (1 - closeQuantity / args.position.quantity),
        exitFee: args.position.exitFee + exitFee,
      });
  if (!updated) {
    // Another worker won the claim; do not duplicate the fill or the credit.
    return { position: args.position, fill: null, closed: false };
  }

  const fill = await insertFill({
    userId: args.userId,
    accountId: args.account.id,
    positionId: args.position.id,
    orderId: null,
    kind: fillKind,
    price: args.exitPrice,
    quantity: closeQuantity,
    pnl,
    fees: exitFee + entryFeeShare,
    ts: args.now,
    meta: {
      reason: args.reason,
      source: args.source,
      remaining: full ? 0 : args.position.quantity - closeQuantity,
    },
  });

  // Atomic increment: concurrent closes must never lose a realised-P&L update.
  await incrementAccountBalance(args.userId, args.account.id, pnl);

  if (full) {
    // Prior partials are already in realizedPnl; the journal must reflect the
    // whole trade, not just the final slice.
    await syncJournal({
      position: args.position,
      account: args.account,
      exitPrice: args.exitPrice,
      pnl: args.position.realizedPnl + pnl,
      recordedQuantity: args.position.initialQuantity,
      reason: args.reason,
      settings: args.settings,
      closedAt: args.now,
      ...(args.onJournalError ? { onError: args.onJournalError } : {}),
    });
  }

  return { position: updated, fill: fillView(fill), closed: full };
}

// ── Place order ──────────────────────────────────────────────────────────

export async function closePositionForUser(args: {
  userId: string;
  positionId: string;
  quantity?: number;
  reason?: string;
  settings: PaperSettings;
  source?: string;
  now?: Date;
  signal?: AbortSignal;
  onJournalError?: (err: unknown) => void;
}): Promise<{ position: PositionView; account: AccountView; fill: FillView | null }> {
  const position = await getPosition(args.userId, args.positionId);
  if (!position) throw new Error('Position not found.');
  if (position.status !== 'open') throw new Error('This position is already closed.');
  const account = await getAccount(args.userId, position.accountId);
  if (!account) throw new Error('Account not found.');

  const tick = await loadTick(position.symbol, args.signal);
  const quotes = quotesFor(position.symbol, tick, args.settings);
  const exitPrice = exitWithSlippage(
    position,
    exitQuote(positionState(position), quotes),
    args.settings,
  );
  const now = args.now ?? new Date();
  const reason: PositionCloseReason = 'manual';

  const result = await applyClose({
    userId: args.userId,
    position,
    account,
    exitPrice,
    quantity: args.quantity ?? position.quantity,
    reason,
    settings: args.settings,
    source: args.source ?? 'manual',
    now,
    ...(args.onJournalError ? { onJournalError: args.onJournalError } : {}),
  });
  const refreshedAccount = (await getAccount(args.userId, account.id)) ?? account;
  // `fill === null` means a concurrent tick/watch closed the row between the
  // read above and the atomic claim: report the current state, not a duplicate.
  const current = result.fill
    ? result.position
    : ((await getPosition(args.userId, args.positionId)) ?? result.position);
  return {
    position: positionView(current, refreshedAccount),
    account: await accountViewById(args.userId, refreshedAccount),
    fill: result.fill,
  };
}

export async function modifyPositionForUser(args: {
  userId: string;
  positionId: string;
  patch: {
    stopLoss?: number | null;
    takeProfit?: number | null;
    trailingStop?: number | null;
    breakEvenAtR?: number | null;
  };
  settings: PaperSettings;
  signal?: AbortSignal;
}): Promise<{ position: PositionView; account: AccountView }> {
  const position = await getPosition(args.userId, args.positionId);
  if (!position) throw new Error('Position not found.');
  if (position.status !== 'open') throw new Error('This position is already closed.');
  const account = await getAccount(args.userId, position.accountId);
  if (!account) throw new Error('Account not found.');

  const tick = await loadTick(position.symbol, args.signal);
  const quotes = quotesFor(position.symbol, tick, args.settings);
  const reference = quotes.mid;
  const nextStop = args.patch.stopLoss !== undefined ? args.patch.stopLoss : position.stopLoss;
  const nextTarget =
    args.patch.takeProfit !== undefined ? args.patch.takeProfit : position.takeProfit;

  if (args.settings.requireStopLoss && nextStop === null) {
    throw new Error(
      'A stop loss is required on this deployment. Set a new stopLoss instead of clearing it.',
    );
  }

  const geometry =
    position.side === 'short'
      ? { side: 'sell' as const, entryPrice: reference }
      : { side: 'buy' as const, entryPrice: reference };
  const error = validateBracket({
    ...geometry,
    stopLoss: nextStop,
    takeProfit: nextTarget,
    minStopDistance: minStopDistance(position.symbol, args.settings),
  });
  if (error) throw new Error(error);

  const patch: Parameters<typeof updatePosition>[2] = {};
  if (args.patch.stopLoss !== undefined) patch.stopLoss = args.patch.stopLoss;
  if (args.patch.takeProfit !== undefined) patch.takeProfit = args.patch.takeProfit;
  if (args.patch.breakEvenAtR !== undefined) patch.breakEvenAtR = args.patch.breakEvenAtR;
  if (args.patch.trailingStop !== undefined) {
    patch.trailingStopDistance = args.patch.trailingStop;
    if (args.patch.trailingStop === null) patch.trailingStopPrice = null;
  }

  const updated = await updatePosition(args.userId, position.id, patch);
  if (!updated) throw new Error('Position disappeared while updating.');
  const refreshedAccount = (await getAccount(args.userId, account.id)) ?? account;
  return {
    position: positionView(updated, refreshedAccount),
    account: await accountViewById(args.userId, refreshedAccount),
  };
}

export async function cancelOrderForUser(args: {
  userId: string;
  orderId: string;
}): Promise<{ order: OrderView | null; message: string }> {
  const order = await getOrder(args.userId, args.orderId);
  if (!order) throw new Error('Order not found.');
  if (order.status !== 'pending') {
    return { order: orderView(order), message: 'Order is no longer pending.' };
  }
  const updated = await updateOrder(args.userId, order.id, {
    status: 'cancelled',
    reason: 'Cancelled by user.',
  });
  return {
    order: updated ? orderView(updated) : null,
    message: 'Order cancelled.',
  };
}

// ── Reads ────────────────────────────────────────────────────────────────
