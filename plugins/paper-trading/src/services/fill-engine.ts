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

import {
  claimPendingOrder,
  getAccount,
  listOrders,
  listPositions,
  updateOpenPosition,
  updateOrder,
} from '../db/queries';
import type { PaperAccountRow, PaperOrderRow, PaperPositionRow } from '../db/tables';
import {
  contractSizeFor,
  evaluatePosition,
  matchOrder,
  quotesFromTick,
  validateBracket,
  type MarketTick,
} from '../domain';
import type { PaperSettings } from '../settings';
import { applyClose } from './position-lifecycle';
import { isTickTradable, slippageFor, spreadFor } from './pricing';
import {
  createPosition,
  exitWithSlippage,
  lockAccountForTrade,
  minStopDistance,
  positionState,
} from './trading-shared';

async function fillOrder(args: {
  userId: string;
  order: PaperOrderRow;
  account: PaperAccountRow;
  tick: MarketTick;
  settings: PaperSettings;
  now: Date;
  source: string;
}): Promise<PaperPositionRow | null> {
  const quotes = quotesFromTick(args.tick, spreadFor(args.order.symbol, args.settings));
  const match = matchOrder(
    {
      side: args.order.side === 'sell' ? 'sell' : 'buy',
      type: args.order.type === 'limit' || args.order.type === 'stop' ? args.order.type : 'market',
      quantity: args.order.quantity,
      limitPrice: args.order.limitPrice,
      stopPrice: args.order.stopPrice,
    },
    quotes,
    slippageFor(args.order.symbol, args.settings),
  );
  if (!match.triggered || match.price === null) return null;

  const reject = async (reason: string): Promise<null> => {
    // Only a still-pending order may be rejected: a concurrent TickBus /
    // market-watch pass may have filled or cancelled it already.
    await claimPendingOrder(args.userId, args.order.id, { status: 'rejected', reason });
    return null;
  };

  const bracketError = validateBracket({
    side: args.order.side === 'sell' ? 'sell' : 'buy',
    entryPrice: match.price,
    stopLoss: args.order.stopLoss,
    takeProfit: args.order.takeProfit,
    minStopDistance: minStopDistance(args.order.symbol, args.settings),
  });
  if (bracketError) return reject(bracketError);

  const contractSize = contractSizeFor(args.order.symbol);

  // Serialise the margin/risk guards with the position insert: take the
  // account row's lock, then re-read its open positions so a concurrent fill
  // cannot pass the same check against a pre-fill snapshot and over-allocate
  // margin. The lock is held until the surrounding tenant transaction commits.
  const state = await lockAccountForTrade(args.userId, args.account.id);
  if (!state) return reject('Account not found.');
  const { account, snapshot } = state;

  const notional = match.price * args.order.quantity * contractSize;
  const margin = notional / Math.max(1, account.leverage);
  const marginCap =
    Math.max(0, snapshot.freeMargin) * (args.settings.maxMarginUtilisationPct / 100);
  if (margin > marginCap + 0.01) {
    return reject(`Gap moved the entry; margin ${margin.toFixed(2)} exceeds the available cap.`);
  }

  if (args.order.stopLoss !== null) {
    const risk = Math.abs(match.price - args.order.stopLoss) * args.order.quantity * contractSize;
    const maxRisk = (snapshot.equity * args.settings.maxRiskPct) / 100;
    if (risk > maxRisk + 0.01) {
      return reject(
        `Gap moved the entry; risk ${risk.toFixed(2)} exceeds the ${args.settings.maxRiskPct}% cap.`,
      );
    }
  }

  // Atomic claim: only one concurrent evaluator may create the position and
  // mark the order filled. The loser sees `undefined` and returns null.
  const claimed = await claimPendingOrder(args.userId, args.order.id, {
    status: 'filled',
    filledPrice: match.price,
    filledAt: args.now,
  });
  if (!claimed) return null;

  try {
    const position = await createPosition({
      userId: args.userId,
      account,
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

    await updateOrder(args.userId, args.order.id, { positionId: position.id });
    return position;
  } catch (err) {
    // Position creation failed after the claim: put the order back so the
    // entry is not silently swallowed, then surface the failure.
    await updateOrder(args.userId, args.order.id, {
      status: 'pending',
      filledPrice: null,
      filledAt: null,
    }).catch(() => undefined);
    throw err;
  }
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
 *
 * Ticks whose market is closed, flagged stale, or older than five minutes are
 * skipped entirely: the paper broker never fills against a dead weekend quote.
 */
export async function processQuotesForUser(args: {
  userId: string;
  ticksBySymbol: ReadonlyMap<string, MarketTick>;
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
    const tick = args.ticksBySymbol.get(position.symbol);
    if (!tick || !isTickTradable(tick).ok) continue;
    const account = accounts.get(position.accountId);
    if (!account) continue;
    const quotes = quotesFromTick(tick, spreadFor(position.symbol, args.settings));
    const evaluation = evaluatePosition(positionState(position), quotes);

    if (evaluation.close) {
      // A take-profit is a resting limit exit: it fills at the target price
      // with no adverse slippage. Stops, trailing stops and manual closes
      // cross the book and pay slippage.
      const exitPrice =
        evaluation.close.reason === 'take_profit'
          ? evaluation.close.price
          : exitWithSlippage(position, evaluation.close.price, args.settings);
      const result = await applyClose({
        userId: args.userId,
        position,
        account,
        exitPrice,
        quantity: position.quantity,
        reason: evaluation.close.reason,
        settings: args.settings,
        source: args.source ?? 'tick',
        now,
        ...(args.onJournalError ? { onJournalError: args.onJournalError } : {}),
      });
      if (result.closed) closed += 1;
      continue;
    }

    const trailingChanged =
      evaluation.trailingStopPrice !== null &&
      evaluation.trailingStopPrice !== position.trailingStopPrice;
    const pnlChanged = Math.abs(evaluation.unrealizedPnl - position.unrealizedPnl) >= 0.01;
    if (trailingChanged || pnlChanged) {
      await updateOpenPosition(args.userId, position.id, {
        unrealizedPnl: evaluation.unrealizedPnl,
        ...(trailingChanged ? { trailingStopPrice: evaluation.trailingStopPrice } : {}),
      });
      marked += 1;
    }
  }

  for (const order of orders) {
    const tick = args.ticksBySymbol.get(order.symbol);
    const account = accounts.get(order.accountId);
    if (!tick || !account) continue;
    if (order.expiresAt && now > order.expiresAt) {
      await claimPendingOrder(args.userId, order.id, {
        status: 'expired',
        reason: 'Day order expired.',
      });
      continue;
    }
    if (!isTickTradable(tick).ok) continue;
    const position = await fillOrder({
      userId: args.userId,
      order,
      account,
      tick,
      settings: args.settings,
      now,
      source: args.source ?? 'tick',
    });
    if (position) filled += 1;
  }

  return { filled, closed, marked };
}

// ── Position management ──────────────────────────────────────────────────
