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

// Row -> view mappers. The API, tools and UI all consume the view shapes.

import type { PaperAccountRow, PaperFillRow, PaperOrderRow, PaperPositionRow } from '../db/tables';
import { accountSnapshot, type AccountMode, type PositionSide } from '../domain';
import {
  isAccountMode,
  type AccountView,
  type FillView,
  type OrderView,
  type PositionView,
} from '../schemas';

function sideOf(row: PaperPositionRow): PositionSide {
  return row.side === 'short' ? 'short' : 'long';
}

function modeOf(account: PaperAccountRow | undefined): AccountMode {
  if (!account) return 'confirm';
  return isAccountMode(account.mode) ? account.mode : 'confirm';
}

function round(value: number, digits: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function accountView(
  account: PaperAccountRow,
  openPositions: readonly PaperPositionRow[],
): AccountView {
  const snapshot = accountSnapshot(
    { balance: account.balance },
    openPositions.map((position) => ({
      side: sideOf(position),
      symbol: position.symbol,
      quantity: position.quantity,
      entryPrice: position.entryPrice,
      unrealizedPnl: position.unrealizedPnl,
      status: 'open' as const,
    })),
    account.leverage,
  );
  return {
    id: account.id,
    name: account.name,
    mode: modeOf(account),
    currency: account.currency,
    initialBalance: round(account.initialBalance, 2),
    balance: snapshot.balance,
    equity: snapshot.equity,
    unrealizedPnl: snapshot.unrealizedPnl,
    marginUsed: snapshot.marginUsed,
    freeMargin: snapshot.freeMargin,
    marginUtilisationPct: snapshot.marginUtilisationPct,
    leverage: account.leverage,
    riskPerTradePct: account.riskPerTradePct,
    openPositions: openPositions.length,
    createdAt: account.createdAt.toISOString(),
  };
}

export function positionView(
  position: PaperPositionRow,
  account: PaperAccountRow | undefined,
): PositionView {
  const pnl =
    position.status === 'closed'
      ? position.realizedPnl
      : position.realizedPnl + position.unrealizedPnl;
  const rMultiple = position.initialRiskAmount > 0 ? round(pnl / position.initialRiskAmount, 4) : 0;

  return {
    id: position.id,
    accountId: position.accountId,
    accountMode: modeOf(account),
    accountName: account?.name ?? 'Paper account',
    symbol: position.symbol,
    side: sideOf(position),
    status: position.status === 'closed' ? 'closed' : 'open',
    quantity: round(position.quantity, 6),
    initialQuantity: round(position.initialQuantity, 6),
    entryPrice: round(position.entryPrice, 6),
    entryTime: position.entryTime.toISOString(),
    stopLoss: position.stopLoss === null ? null : round(position.stopLoss, 6),
    takeProfit: position.takeProfit === null ? null : round(position.takeProfit, 6),
    trailingStopDistance:
      position.trailingStopDistance === null ? null : round(position.trailingStopDistance, 6),
    trailingStopPrice:
      position.trailingStopPrice === null ? null : round(position.trailingStopPrice, 6),
    breakEvenAtR: position.breakEvenAtR === null ? null : round(position.breakEvenAtR, 2),
    initialRiskAmount: round(position.initialRiskAmount, 2),
    unrealizedPnl: round(position.unrealizedPnl, 2),
    realizedPnl: round(position.realizedPnl, 2),
    pnl: round(pnl, 2),
    entryFee: round(position.entryFee, 2),
    exitFee: round(position.exitFee, 2),
    rMultiple,
    closePrice: position.closePrice === null ? null : round(position.closePrice, 6),
    closeTime: position.closeTime ? position.closeTime.toISOString() : null,
    closeReason:
      position.closeReason === null ? null : (position.closeReason as PositionView['closeReason']),
    source: position.source,
    notes: position.notes,
  };
}

export function orderView(order: PaperOrderRow): OrderView {
  return {
    id: order.id,
    accountId: order.accountId,
    symbol: order.symbol,
    side: order.side === 'sell' ? 'sell' : 'buy',
    type: order.type === 'limit' || order.type === 'stop' ? order.type : 'market',
    status:
      order.status === 'filled' ||
      order.status === 'cancelled' ||
      order.status === 'rejected' ||
      order.status === 'expired'
        ? order.status
        : 'pending',
    quantity: round(order.quantity, 6),
    riskPct: order.riskPct === null ? null : round(order.riskPct, 3),
    limitPrice: order.limitPrice === null ? null : round(order.limitPrice, 6),
    stopPrice: order.stopPrice === null ? null : round(order.stopPrice, 6),
    stopLoss: order.stopLoss === null ? null : round(order.stopLoss, 6),
    takeProfit: order.takeProfit === null ? null : round(order.takeProfit, 6),
    trailingStopDistance:
      order.trailingStopDistance === null ? null : round(order.trailingStopDistance, 6),
    breakEvenAtR: order.breakEvenAtR === null ? null : round(order.breakEvenAtR, 2),
    timeInForce: order.timeInForce === 'day' ? 'day' : 'gtc',
    filledPrice: order.filledPrice === null ? null : round(order.filledPrice, 6),
    filledAt: order.filledAt ? order.filledAt.toISOString() : null,
    positionId: order.positionId,
    reason: order.reason,
    notes: order.notes,
    expiresAt: order.expiresAt ? order.expiresAt.toISOString() : null,
    createdAt: order.createdAt.toISOString(),
  };
}

export function fillView(fill: PaperFillRow): FillView {
  return {
    id: fill.id,
    accountId: fill.accountId,
    positionId: fill.positionId,
    orderId: fill.orderId,
    kind: fill.kind,
    price: round(fill.price, 6),
    quantity: round(fill.quantity, 6),
    pnl: round(fill.pnl, 2),
    fees: round(fill.fees, 2),
    ts: fill.ts.toISOString(),
  };
}
