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

// Pure paper-broker domain.
//
// No database, no network, no clock: every function takes the state it needs
// and returns a decision. The services in `src/services/` persist those
// decisions. This split lets the money math be unit-tested exhaustively.

import { pipSize, tryGetSymbolDefinition } from '@kestrel/shared';

export const ACCOUNT_MODES = ['confirm', 'autonomous_sandbox'] as const;
export type AccountMode = (typeof ACCOUNT_MODES)[number];

export type PositionSide = 'long' | 'short';
export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop';
export type OrderStatus = 'pending' | 'filled' | 'cancelled' | 'rejected' | 'expired';
export type PositionStatus = 'open' | 'closed';
export type PositionCloseReason =
  'manual' | 'stop_loss' | 'take_profit' | 'trailing_stop' | 'account_reset';

export interface MarketTick {
  symbol: string;
  bid: number;
  ask: number;
  mid: number;
  ts: number;
  source?: string;
}

export interface Quotes {
  bid: number;
  ask: number;
  mid: number;
}

export interface PaperPositionState {
  side: PositionSide;
  symbol: string;
  quantity: number;
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  trailingStopDistance: number | null;
  trailingStopPrice: number | null;
  breakEvenAtR: number | null;
  initialRiskAmount: number;
  entryFee: number;
}

export interface PaperOrderState {
  side: OrderSide;
  type: OrderType;
  quantity: number;
  limitPrice: number | null;
  stopPrice: number | null;
}

export interface SizingArgs {
  equity: number;
  freeMargin: number;
  leverage: number;
  contractSize: number;
  entryPrice: number;
  stopLoss: number | null;
  riskPct: number | null;
  requestedQuantity: number | null;
  maxRiskPct: number;
  maxMarginUtilisationPct: number;
}

export type SizingResult =
  | { ok: true; quantity: number; riskAmount: number; notional: number; margin: number }
  | { ok: false; reason: string };

export interface PositionEvaluation {
  close: { price: number; reason: PositionCloseReason } | null;
  /** New trailing/breakeven stop, or null when it should not change. */
  trailingStopPrice: number | null;
  unrealizedPnl: number;
  rMultiple: number;
}

export function contractSizeFor(symbol: string): number {
  return tryGetSymbolDefinition(symbol)?.capabilities.contractSize ?? 1;
}

export function pipSizeFor(symbol: string): number {
  return pipSize(symbol);
}

export function sideToPosition(side: OrderSide): PositionSide {
  return side === 'buy' ? 'long' : 'short';
}

export function positionToExitSide(side: PositionSide): OrderSide {
  return side === 'long' ? 'sell' : 'buy';
}

function round(value: number, digits: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Normalise a provider tick to a tradable bid/ask.
 *
 * Some providers return bid === ask (a mid-only quote). In that case we
 * synthesise a symmetric spread from the plugin settings so P&L is never
 * frictionless.
 */
export function quotesFromTick(tick: MarketTick, spread: number): Quotes {
  const half = Math.max(0, spread) / 2;
  const hasRealSpread = tick.bid > 0 && tick.ask > 0 && tick.ask > tick.bid;
  const mid = Number.isFinite(tick.mid) && tick.mid > 0 ? tick.mid : (tick.bid + tick.ask) / 2;
  const bid = hasRealSpread ? tick.bid : mid - half;
  const ask = hasRealSpread ? tick.ask : mid + half;
  return {
    bid: round(Math.max(0.0000001, bid), 8),
    ask: round(Math.max(bid + 0.0000001, ask), 8),
    mid: round((bid + ask) / 2, 8),
  };
}

/** Market fill price with adverse slippage. */
export function marketFillPrice(side: OrderSide, quotes: Quotes, slippage: number): number {
  const slip = Math.max(0, slippage);
  return round(side === 'buy' ? quotes.ask + slip : quotes.bid - slip, 8);
}

/** Exit price for a position (long sells the bid, short buys the ask). */
export function exitQuote(position: Pick<PaperPositionState, 'side'>, quotes: Quotes): number {
  return position.side === 'long' ? quotes.bid : quotes.ask;
}

export function entryFeeFor(quantity: number, commissionPerUnit: number): number {
  return round(Math.max(0, commissionPerUnit) * quantity, 6);
}

/** Gross P&L before fees. */
export function grossPnl(
  side: PositionSide,
  entryPrice: number,
  exitPrice: number,
  quantity: number,
  contractSize: number,
): number {
  const direction = side === 'long' ? 1 : -1;
  return (exitPrice - entryPrice) * direction * quantity * contractSize;
}

/** Notional exposure and margin required at a given price. */
export function positionMargin(
  position: Pick<PaperPositionState, 'quantity' | 'entryPrice'>,
  contractSize: number,
  leverage: number,
): number {
  const notional = position.quantity * position.entryPrice * contractSize;
  return notional / Math.max(1, leverage);
}

export interface AccountLike {
  balance: number;
  equity: number;
  marginUsed: number;
  initialBalance: number;
}

export interface PositionForAccount {
  side: PositionSide;
  symbol: string;
  quantity: number;
  entryPrice: number;
  unrealizedPnl: number;
  status: PositionStatus;
}

export interface AccountSnapshot {
  balance: number;
  equity: number;
  unrealizedPnl: number;
  marginUsed: number;
  freeMargin: number;
  marginUtilisationPct: number;
}

export function accountSnapshot(
  account: Pick<AccountLike, 'balance'>,
  positions: readonly PositionForAccount[],
  leverage: number,
): AccountSnapshot {
  const open = positions.filter((position) => position.status === 'open');
  const unrealizedPnl = round(
    open.reduce((sum, position) => sum + position.unrealizedPnl, 0),
    2,
  );
  const equity = round(account.balance + unrealizedPnl, 2);
  const marginUsed = round(
    open.reduce(
      (sum, position) => sum + positionMargin(position, contractSizeFor(position.symbol), leverage),
      0,
    ),
    2,
  );
  const freeMargin = round(equity - marginUsed, 2);
  const marginUtilisationPct = equity > 0 ? round((marginUsed / equity) * 100, 2) : 0;
  return {
    balance: round(account.balance, 2),
    equity,
    unrealizedPnl,
    marginUsed,
    freeMargin,
    marginUtilisationPct,
  };
}

/**
 * Position size from risk and/or margin constraints.
 *
 * When `requestedQuantity` is supplied it wins, but the resulting risk and
 * margin are still validated. Otherwise `stopLoss` + `riskPct` are required.
 */
export function sizePosition(args: SizingArgs): SizingResult {
  const leverage = Math.max(1, args.leverage);
  const entry = args.entryPrice;
  if (!(entry > 0) || !Number.isFinite(entry)) {
    return { ok: false, reason: 'Entry price must be positive.' };
  }
  if (args.equity <= 0) {
    return { ok: false, reason: 'Account equity is zero.' };
  }

  const marginCap = Math.max(0, args.freeMargin) * (args.maxMarginUtilisationPct / 100);
  const maxQtyByMargin = (marginCap * leverage) / (entry * args.contractSize);
  if (!(maxQtyByMargin > 0)) {
    return { ok: false, reason: 'No free margin is available for this order.' };
  }

  let quantity: number;
  let riskAmount: number;

  if (args.requestedQuantity !== null) {
    quantity = args.requestedQuantity;
    if (!(quantity > 0) || !Number.isFinite(quantity)) {
      return { ok: false, reason: 'Quantity must be positive.' };
    }
    if (quantity > maxQtyByMargin + 1e-9) {
      return {
        ok: false,
        reason: `Quantity ${round(quantity, 4)} exceeds the available margin (max ${round(
          maxQtyByMargin,
          4,
        )}).`,
      };
    }
    if (args.stopLoss !== null) {
      const stopDistance = Math.abs(entry - args.stopLoss);
      riskAmount = stopDistance * quantity * args.contractSize;
      const maxRisk = (args.equity * args.maxRiskPct) / 100;
      if (riskAmount > maxRisk + 0.01) {
        return {
          ok: false,
          reason: `Risk ${round(riskAmount, 2)} exceeds the ${args.maxRiskPct}% cap (${round(
            maxRisk,
            2,
          )}). Reduce quantity or tighten the stop.`,
        };
      }
    } else {
      riskAmount = 0;
    }
  } else {
    if (args.stopLoss === null) {
      return {
        ok: false,
        reason: 'A stop loss is required when sizing from risk percentage.',
      };
    }
    const stopDistance = Math.abs(entry - args.stopLoss);
    if (!(stopDistance > 0)) {
      return { ok: false, reason: 'Stop loss must differ from the entry price.' };
    }
    const riskPct = args.riskPct ?? 1;
    if (!(riskPct > 0) || riskPct > args.maxRiskPct + 0.0001) {
      return {
        ok: false,
        reason: `Risk per trade must be between 0.01% and ${args.maxRiskPct}%.`,
      };
    }
    const riskBudget = (args.equity * riskPct) / 100;
    quantity = riskBudget / (stopDistance * args.contractSize);
    riskAmount = riskBudget;
  }

  quantity = Math.min(quantity, maxQtyByMargin);
  if (!(quantity > 0) || !Number.isFinite(quantity)) {
    return { ok: false, reason: 'Position size is below the minimum.' };
  }

  const notional = quantity * entry * args.contractSize;
  const margin = notional / leverage;
  if (margin > marginCap + 0.01) {
    return {
      ok: false,
      reason: `Margin ${round(margin, 2)} exceeds the ${args.maxMarginUtilisationPct}% utilisation cap.`,
    };
  }

  return {
    ok: true,
    quantity: round(quantity, 6),
    riskAmount: round(riskAmount, 2),
    notional: round(notional, 2),
    margin: round(margin, 2),
  };
}

function effectiveStop(position: PaperPositionState): number | null {
  if (position.side === 'long') {
    const values = [position.stopLoss, position.trailingStopPrice].filter(
      (value): value is number => typeof value === 'number' && Number.isFinite(value),
    );
    return values.length > 0 ? Math.max(...values) : null;
  }
  const values = [position.stopLoss, position.trailingStopPrice].filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );
  return values.length > 0 ? Math.min(...values) : null;
}

/**
 * Evaluate a position against the latest quotes.
 *
 * Stop wins over target when both are crossed (we cannot know tick order).
 * The returned `trailingStopPrice` is the *new* stop to persist, if it moved.
 */
export function evaluatePosition(position: PaperPositionState, quotes: Quotes): PositionEvaluation {
  const entry = position.entryPrice;
  const direction = position.side === 'long' ? 1 : -1;
  const markPrice = quotes.mid;
  const unrealizedPnl = round(
    (markPrice - entry) * direction * position.quantity * contractSizeFor(position.symbol) -
      position.entryFee,
    2,
  );
  const initialStopDistance = position.stopLoss !== null ? Math.abs(entry - position.stopLoss) : 0;
  const rMultiple =
    initialStopDistance > 0 ? round(((markPrice - entry) * direction) / initialStopDistance, 4) : 0;

  const stop = effectiveStop(position);
  const exitPrice = exitQuote(position, quotes);
  const stopHit =
    stop !== null && (position.side === 'long' ? exitPrice <= stop : exitPrice >= stop);
  if (stopHit && stop !== null) {
    const fromTrailing =
      position.trailingStopPrice !== null &&
      (position.stopLoss === null
        ? true
        : position.side === 'long'
          ? position.trailingStopPrice > position.stopLoss
          : position.trailingStopPrice < position.stopLoss);
    return {
      close: { price: exitPrice, reason: fromTrailing ? 'trailing_stop' : 'stop_loss' },
      trailingStopPrice: null,
      unrealizedPnl,
      rMultiple,
    };
  }

  if (position.takeProfit !== null) {
    const targetHit =
      position.side === 'long'
        ? exitPrice >= position.takeProfit
        : exitPrice <= position.takeProfit;
    if (targetHit) {
      return {
        close: { price: exitPrice, reason: 'take_profit' },
        trailingStopPrice: null,
        unrealizedPnl,
        rMultiple,
      };
    }
  }

  let nextTrailing = position.trailingStopPrice;

  if (
    position.breakEvenAtR !== null &&
    position.breakEvenAtR > 0 &&
    rMultiple >= position.breakEvenAtR
  ) {
    nextTrailing =
      position.side === 'long'
        ? Math.max(nextTrailing ?? Number.NEGATIVE_INFINITY, entry)
        : Math.min(nextTrailing ?? Number.POSITIVE_INFINITY, entry);
  }

  if (position.trailingStopDistance !== null && position.trailingStopDistance > 0) {
    const distance = position.trailingStopDistance;
    if (position.side === 'long') {
      const candidate = quotes.bid - distance;
      if (candidate > (nextTrailing ?? Number.NEGATIVE_INFINITY) && candidate < quotes.bid) {
        nextTrailing = candidate;
      }
    } else {
      const candidate = quotes.ask + distance;
      if (candidate < (nextTrailing ?? Number.POSITIVE_INFINITY) && candidate > quotes.ask) {
        nextTrailing = candidate;
      }
    }
  }

  let changed: number | null = null;
  if (nextTrailing !== position.trailingStopPrice) {
    if (
      nextTrailing !== null &&
      Number.isFinite(nextTrailing) &&
      (position.side === 'long' ? nextTrailing < quotes.bid : nextTrailing > quotes.ask) &&
      (position.stopLoss === null
        ? true
        : position.side === 'long'
          ? nextTrailing > position.stopLoss
          : nextTrailing < position.stopLoss)
    ) {
      changed = round(nextTrailing, 8);
    }
  }

  return { close: null, trailingStopPrice: changed, unrealizedPnl, rMultiple };
}

export interface OrderMatch {
  triggered: boolean;
  price: number | null;
}

/** Match a resting order against quotes. */
export function matchOrder(order: PaperOrderState, quotes: Quotes, slippage: number): OrderMatch {
  const slip = Math.max(0, slippage);

  if (order.type === 'limit' && order.limitPrice !== null) {
    const limit = order.limitPrice;
    if (order.side === 'buy' && quotes.ask <= limit) {
      return { triggered: true, price: round(quotes.ask, 8) };
    }
    if (order.side === 'sell' && quotes.bid >= limit) {
      return { triggered: true, price: round(quotes.bid, 8) };
    }
    return { triggered: false, price: null };
  }

  if (order.type === 'stop' && order.stopPrice !== null) {
    const trigger = order.stopPrice;
    if (order.side === 'buy' && quotes.ask >= trigger) {
      return { triggered: true, price: round(quotes.ask + slip, 8) };
    }
    if (order.side === 'sell' && quotes.bid <= trigger) {
      return { triggered: true, price: round(quotes.bid - slip, 8) };
    }
    return { triggered: false, price: null };
  }

  return { triggered: false, price: null };
}

/** Validate stop/target geometry for a new order. */
export function validateBracket(args: {
  side: OrderSide;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  minStopDistance: number;
}): string | null {
  const { side, entryPrice, stopLoss, takeProfit } = args;
  if (stopLoss !== null) {
    if (entryPrice !== null) {
      const valid =
        side === 'buy'
          ? stopLoss < entryPrice - args.minStopDistance
          : stopLoss > entryPrice + args.minStopDistance;
      if (!valid) {
        return `Stop loss must be ${side === 'buy' ? 'below' : 'above'} the entry by at least ${round(
          args.minStopDistance,
          6,
        )}.`;
      }
    }
  }
  if (takeProfit !== null && entryPrice !== null) {
    const valid =
      side === 'buy'
        ? takeProfit > entryPrice + args.minStopDistance
        : takeProfit < entryPrice - args.minStopDistance;
    if (!valid) {
      return `Take profit must be ${side === 'buy' ? 'above' : 'below'} the entry by at least ${round(
        args.minStopDistance,
        6,
      )}.`;
    }
  }
  return null;
}

export function outcomeFor(pnl: number): 'win' | 'loss' | 'breakeven' {
  if (pnl > 0.005) return 'win';
  if (pnl < -0.005) return 'loss';
  return 'breakeven';
}

export function rMultipleFor(
  position: Pick<PaperPositionState, 'side' | 'entryPrice' | 'initialRiskAmount'>,
  exitPrice: number,
  quantity: number,
  contractSize: number,
): number {
  if (!(position.initialRiskAmount > 0)) return 0;
  const pnl = grossPnl(position.side, position.entryPrice, exitPrice, quantity, contractSize);
  return round(pnl / position.initialRiskAmount, 4);
}
