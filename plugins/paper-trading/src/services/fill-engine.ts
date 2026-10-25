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

// Resting-order fills and quote-driven position maintenance.

import { getAccount, listOrders, listPositions, updateOrder, updatePosition } from '../db/queries';
import type { PaperAccountRow, PaperOrderRow, PaperPositionRow } from '../db/tables';
import {
  accountSnapshot,
  contractSizeFor,
  evaluatePosition,
  matchOrder,
  validateBracket,
  type Quotes,
} from '../domain';
import type { PaperSettings } from '../settings';
import { applyClose } from './position-lifecycle';
import { slippageFor } from './pricing';
import { createPosition, exitWithSlippage, minStopDistance, positionState } from './trading-shared';

async function fillOrder(args: {
  userId: string;
  order: PaperOrderRow;
  account: PaperAccountRow;
  quotes: Quotes;
  settings: PaperSettings;
  now: Date;
  source: string;
}): Promise<PaperPositionRow | null> {
  const match = matchOrder(
    {
      side: args.order.side === 'sell' ? 'sell' : 'buy',
      type: args.order.type === 'limit' || args.order.type === 'stop' ? args.order.type : 'market',
      quantity: args.order.quantity,
      limitPrice: args.order.limitPrice,
      stopPrice: args.order.stopPrice,
    },
    args.quotes,
    slippageFor(args.order.symbol, args.settings),
  );
  if (!match.triggered || match.price === null) return null;

  const bracketError = validateBracket({
    side: args.order.side === 'sell' ? 'sell' : 'buy',
    entryPrice: match.price,
    stopLoss: args.order.stopLoss,
    takeProfit: args.order.takeProfit,
    minStopDistance: minStopDistance(args.order.symbol, args.settings),
  });
  if (bracketError) {
    await updateOrder(args.userId, args.order.id, {
      status: 'rejected',
      reason: bracketError,
    });
    return null;
  }

  const contractSize = contractSizeFor(args.order.symbol);
  const open = await listPositions(args.userId, {
    accountId: args.account.id,
    status: 'open',
    limit: 100,
  });
  const snapshot = accountSnapshot(
    { balance: args.account.balance },
    open.map((position) => ({
      side: position.side === 'short' ? ('short' as const) : ('long' as const),
      symbol: position.symbol,
      quantity: position.quantity,
      entryPrice: position.entryPrice,
      unrealizedPnl: position.unrealizedPnl,
      status: 'open' as const,
    })),
    args.account.leverage,
  );

  const notional = match.price * args.order.quantity * contractSize;
  const margin = notional / Math.max(1, args.account.leverage);
  const marginCap =
    Math.max(0, snapshot.freeMargin) * (args.settings.maxMarginUtilisationPct / 100);
  if (margin > marginCap + 0.01) {
    await updateOrder(args.userId, args.order.id, {
      status: 'rejected',
      reason: `Gap moved the entry; margin ${margin.toFixed(2)} exceeds the available cap.`,
    });
    return null;
  }

  if (args.order.stopLoss !== null) {
    const risk = Math.abs(match.price - args.order.stopLoss) * args.order.quantity * contractSize;
    const maxRisk = (snapshot.equity * args.settings.maxRiskPct) / 100;
    if (risk > maxRisk + 0.01) {
      await updateOrder(args.userId, args.order.id, {
        status: 'rejected',
        reason: `Gap moved the entry; risk ${risk.toFixed(2)} exceeds the ${args.settings.maxRiskPct}% cap.`,
      });
      return null;
    }
  }

  const position = await createPosition({
    userId: args.userId,
    account: args.account,
    symbol: args.order.symbol,
    side: args.order.side === 'sell' ? 'sell' : 'buy',
    quantity: args.order.quantity,
    price: match.price,
    stopLoss: args.order.stopLoss,
    takeProfit: args.order.takeProfit,
    trailingStopDistance: args.order.trailingStopDistance,
    breakEvenAtR: args.order.breakEvenAtR,
    orderId: args.order.id,
    source: args.source,
    notes: args.order.notes,
    ts: args.now,
    settings: args.settings,
  });

  await updateOrder(args.userId, args.order.id, {
    status: 'filled',
    filledPrice: match.price,
    filledAt: args.now,
    positionId: position.id,
  });

  return position;
}

export interface ProcessQuotesResult {
  filled: number;
  closed: number;
  marked: number;
}

/**
 * Process a quote snapshot for one user. Used by the tick subscriber and the
 * minute fallback job. Closes stops/targets, moves trailing stops, fills
 * resting orders and refreshes unrealised P&L.
 */
export async function processQuotesForUser(args: {
  userId: string;
  quotesBySymbol: ReadonlyMap<string, Quotes>;
  settings: PaperSettings;
  now?: Date;
  source?: string;
  onJournalError?: (err: unknown) => void;
}): Promise<ProcessQuotesResult> {
  const now = args.now ?? new Date();
  const [positions, orders] = await Promise.all([
    listPositions(args.userId, { status: 'open', limit: 100 }),
    listOrders(args.userId, { status: 'pending', limit: 100 }),
  ]);
  const accounts = new Map<string, PaperAccountRow>();
  for (const row of [...positions, ...orders]) {
    if (accounts.has(row.accountId)) continue;
    const account = await getAccount(args.userId, row.accountId);
    if (account) accounts.set(row.accountId, account);
  }

  let closed = 0;
  let marked = 0;
  let filled = 0;

  for (const position of positions) {
    const quotes = args.quotesBySymbol.get(position.symbol);
    if (!quotes) continue;
    const account = accounts.get(position.accountId);
    if (!account) continue;
    const evaluation = evaluatePosition(positionState(position), quotes);

    if (evaluation.close) {
      await applyClose({
        userId: args.userId,
        position,
        account,
        exitPrice: exitWithSlippage(position, evaluation.close.price, args.settings),
        quantity: position.quantity,
        reason: evaluation.close.reason,
        settings: args.settings,
        source: args.source ?? 'tick',
        now,
        ...(args.onJournalError ? { onJournalError: args.onJournalError } : {}),
      });
      closed += 1;
      continue;
    }

    const trailingChanged =
      evaluation.trailingStopPrice !== null &&
      evaluation.trailingStopPrice !== position.trailingStopPrice;
    const pnlChanged = Math.abs(evaluation.unrealizedPnl - position.unrealizedPnl) >= 0.01;
    if (trailingChanged || pnlChanged) {
      await updatePosition(args.userId, position.id, {
        unrealizedPnl: evaluation.unrealizedPnl,
        ...(trailingChanged ? { trailingStopPrice: evaluation.trailingStopPrice } : {}),
      });
      marked += 1;
    }
  }

  for (const order of orders) {
    const quotes = args.quotesBySymbol.get(order.symbol);
    if (!quotes) continue;
    const account = accounts.get(order.accountId);
    if (!account) continue;
    if (order.expiresAt && now > order.expiresAt) {
      await updateOrder(args.userId, order.id, {
        status: 'expired',
        reason: 'Day order expired.',
      });
      continue;
    }
    const position = await fillOrder({
      userId: args.userId,
      order,
      account,
      quotes,
      settings: args.settings,
      now,
      source: args.source ?? 'tick',
    });
    if (position) filled += 1;
  }

  return { filled, closed, marked };
}

// ── Position management ──────────────────────────────────────────────────
