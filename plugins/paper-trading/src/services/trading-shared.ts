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

import { insertFill, insertPosition } from '../db/queries';
import type { PaperAccountRow, PaperPositionRow } from '../db/tables';
import {
  contractSizeFor,
  entryFeeFor,
  quotesFromTick,
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

export async function insertOpenFill(args: {
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
