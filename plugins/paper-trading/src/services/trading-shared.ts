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

// Shared position primitives used by order placement, fills, and lifecycle.

import { pipSize } from '@kestrel/shared';

import {
  insertFill,
  insertPosition,
  listOrders,
  listPositions,
  lockAccountForWrite,
} from '../db/queries';
import type { PaperAccountRow, PaperPositionRow } from '../db/tables';
import {
  accountSnapshot,
  contractSizeFor,
  entryFeeFor,
  quotesFromTick,
  round,
  type AccountSnapshot,
  type MarketTick,
  type OrderSide,
  type PaperPositionState,
  type Quotes,
} from '../domain';
import type { PaperSettings } from '../settings';
import { slippageFor, spreadFor } from './pricing';

export function positionState(row: PaperPositionRow): PaperPositionState {
  return {
    side: row.side === 'short' ? 'short' : 'long',
    symbol: row.symbol,
    quantity: row.quantity,
    entryPrice: row.entryPrice,
    stopLoss: row.stopLoss,
    takeProfit: row.takeProfit,
    trailingStopDistance: row.trailingStopDistance,
    trailingStopPrice: row.trailingStopPrice,
    breakEvenAtR: row.breakEvenAtR,
    initialRiskAmount: row.initialRiskAmount,
    entryFee: row.entryFee,
  };
}

export function nextUtcMidnight(now: Date): Date {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next;
}

export function minStopDistance(symbol: string, settings: PaperSettings): number {
  return Math.max(spreadFor(symbol, settings) * 1.5, pipSize(symbol) * 2);
}

export function quotesFor(symbol: string, tick: MarketTick, settings: PaperSettings): Quotes {
  return quotesFromTick(tick, spreadFor(symbol, settings));
}

/** Exits pay the adverse side of the spread plus slippage. */
export function exitWithSlippage(
  position: Pick<PaperPositionRow, 'side' | 'symbol'>,
  price: number,
  settings: PaperSettings,
): number {
  const slip = slippageFor(position.symbol, settings);
  return position.side === 'long' ? price - slip : price + slip;
}

export function allocateEntryFee(position: PaperPositionRow, closeQuantity: number): number {
  if (!(position.quantity > 0)) return 0;
  const share = Math.min(1, closeQuantity / position.quantity);
  return position.entryFee * share;
}

async function insertOpenFill(args: {
  userId: string;
  accountId: string;
  positionId: string;
  orderId: string | null;
  price: number;
  quantity: number;
  fees: number;
  ts: Date;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await insertFill({
    userId: args.userId,
    accountId: args.accountId,
    positionId: args.positionId,
    orderId: args.orderId,
    kind: 'open',
    price: args.price,
    quantity: args.quantity,
    pnl: 0,
    fees: args.fees,
    ts: args.ts,
    ...(args.meta ? { meta: args.meta } : {}),
  });
}

export interface AccountTradeState {
  account: PaperAccountRow;
  snapshot: AccountSnapshot;
  /** Open positions for this account, read under the account lock. */
  openCount: number;
  /** Pending orders for this account, read under the account lock. */
  pendingCount: number;
}

/**
 * Serialise margin / position-limit guards with the write that follows.
 *
 * Takes the account row's write lock (`SELECT ... FOR UPDATE`) and only then
 * re-reads its open positions and pending orders, so two concurrent fills or
 * placements for the same account cannot both pass a check against the same
 * pre-write snapshot. The lock is held until the surrounding transaction
 * commits — production callers always run inside `withTenantDb*`. Returns
 * `null` when the account row no longer exists.
 */
export async function lockAccountForTrade(
  userId: string,
  accountId: string,
): Promise<AccountTradeState | null> {
  const account = await lockAccountForWrite(userId, accountId);
  if (!account) return null;
  const [open, pending] = await Promise.all([
    listPositions(userId, { accountId, status: 'open', limit: 100 }),
    listOrders(userId, { accountId, status: 'pending', limit: 100 }),
  ]);
  const snapshot = accountSnapshot(
    { balance: account.balance },
    open.map((position) => ({
      side: position.side === 'short' ? ('short' as const) : ('long' as const),
      symbol: position.symbol,
      quantity: position.quantity,
      entryPrice: position.entryPrice,
      unrealizedPnl: position.unrealizedPnl,
      status: 'open' as const,
    })),
    account.leverage,
  );
  return { account, snapshot, openCount: open.length, pendingCount: pending.length };
}

/**
 * Re-verify the open-position cap and the margin/risk budget on freshly
 * locked state, immediately before the position or order is inserted. The
 * messages match the pre-write sizing checks, so single-threaded callers
 * never see this throw; only a concurrent writer can trip it. Returns the
 * freshly read account row for the insert.
 */
export async function assertAccountCanOpen(args: {
  userId: string;
  account: PaperAccountRow;
  settings: PaperSettings;
  /** Unrounded margin of the order at its reference price. */
  margin: number;
  /** Unrounded stop-distance risk; 0 when the order carries no stop. */
  risk: number;
}): Promise<PaperAccountRow> {
  const state = await lockAccountForTrade(args.userId, args.account.id);
  if (!state) throw new Error('Account not found.');
  const used = state.openCount + state.pendingCount;
  if (used >= args.settings.maxOpenPositions) {
    throw new Error(
      `This account already has ${used} open/pending trades; the cap is ${args.settings.maxOpenPositions}.`,
    );
  }
  const marginCap =
    Math.max(0, state.snapshot.freeMargin) * (args.settings.maxMarginUtilisationPct / 100);
  if (args.margin > marginCap + 0.01) {
    throw new Error(
      `Margin ${round(args.margin, 2)} exceeds the ${args.settings.maxMarginUtilisationPct}% utilisation cap.`,
    );
  }
  const maxRisk = (state.snapshot.equity * args.settings.maxRiskPct) / 100;
  if (args.risk > maxRisk + 0.01) {
    throw new Error(
      `Risk ${round(args.risk, 2)} exceeds the ${args.settings.maxRiskPct}% cap (${round(
        maxRisk,
        2,
      )}). Reduce quantity or tighten the stop.`,
    );
  }
  return state.account;
}

export async function createPosition(args: {
  userId: string;
  account: PaperAccountRow;
  symbol: string;
  side: OrderSide;
  quantity: number;
  price: number;
  stopLoss: number | null;
  takeProfit: number | null;
  trailingStopDistance: number | null;
  breakEvenAtR: number | null;
  orderId: string | null;
  source: string;
  notes: string | null;
  ts: Date;
  settings: PaperSettings;
}): Promise<PaperPositionRow> {
  const contractSize = contractSizeFor(args.symbol);
  const initialRiskAmount =
    args.stopLoss !== null
      ? Math.abs(args.price - args.stopLoss) * args.quantity * contractSize
      : 0;
  const entryFee = entryFeeFor(args.quantity, args.settings.commissionPerUnit);

  const position = await insertPosition({
    userId: args.userId,
    accountId: args.account.id,
    symbol: args.symbol,
    side: args.side === 'buy' ? 'long' : 'short',
    quantity: args.quantity,
    initialQuantity: args.quantity,
    entryPrice: args.price,
    entryTime: args.ts,
    stopLoss: args.stopLoss,
    takeProfit: args.takeProfit,
    trailingStopDistance: args.trailingStopDistance,
    breakEvenAtR: args.breakEvenAtR,
    initialRiskAmount,
    entryFee,
    source: args.source,
    notes: args.notes,
  });

  await insertOpenFill({
    userId: args.userId,
    accountId: args.account.id,
    positionId: position.id,
    orderId: args.orderId,
    price: args.price,
    quantity: args.quantity,
    fees: entryFee,
    ts: args.ts,
    meta: {
      symbol: args.symbol,
      side: position.side,
      stopLoss: args.stopLoss,
      takeProfit: args.takeProfit,
    },
  });

  return position;
}
