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

// Pure paper-broker domain — position/order evaluation.
//
// No database, no network, no clock: every function takes the state it needs
// and returns a decision. The services in `src/services/` persist those
// decisions. This split lets the money math be unit-tested exhaustively.

import { grossPnl, round } from './math';
import { exitQuote } from './quotes';
import { contractSizeFor } from './symbols';
import type {
  OrderMatch,
  OrderSide,
  PaperOrderState,
  PaperPositionState,
  PositionEvaluation,
  Quotes,
} from './types';

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
