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

// Deterministic bar-by-bar execution simulator.
//
// Design rules:
//   * A signal is generated at a bar close and can only be filled at the NEXT
//     bar (market) or later (limit). Nothing can fill on the bar that produced
//     it, which removes the most common look-ahead mistake.
//   * If a bar's range touches both the stop and the target, the stop wins.
//     We cannot know intrabar order from OHLC, so we choose the adverse case.
//   * Gaps fill at the bar open, never at the level that was jumped.
//   * Costs (half-spread, slippage, commission) are applied on every fill.
//   * Only one position or resting entry is allowed at a time.
//
// The simulator never reads the clock and never mutates its inputs.

import type { Candle } from '@kestrel/shared';

import { computeMetrics } from './metrics';
import type {
  BacktestOptions,
  BacktestResult,
  BacktestTrade,
  EquityPoint,
  GeneratedSignal,
  RejectedSignal,
  TradeExitReason,
  TradeSide,
} from './types';

interface OpenPosition {
  signal: GeneratedSignal;
  side: TradeSide;
  entryType: 'market' | 'limit';
  entryIndex: number;
  entryTime: number;
  entryPrice: number;
  rawEntryPrice: number;
  stop: number;
  target: number | null;
  quantity: number;
  riskAmount: number;
  initialRiskDistance: number;
  entryFee: number;
  breakEvenAtR: number | null;
  maxBars: number;
  trailingValue: number | null;
  trailingType: 'atr' | 'percent' | 'fixed' | null;
  mfeR: number;
  maeR: number;
  breakEvenApplied: boolean;
}

interface PendingEntry {
  signal: GeneratedSignal;
  expiresIndex: number;
  limitPrice: number;
}

export interface SimulateArgs {
  candles: readonly Candle[];
  signals: readonly GeneratedSignal[];
  options: BacktestOptions;
  /** ATR series used by `trailing: { type: 'atr' }`. */
  atr: readonly (number | null)[];
}

function finite(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function signedPnl(
  side: TradeSide,
  entry: number,
  exit: number,
  quantity: number,
  contractSize: number,
): number {
  const diff = side === 'long' ? exit - entry : entry - exit;
  return diff * quantity * contractSize;
}

export function simulateBacktest(args: SimulateArgs): BacktestResult {
  const candles = args.candles;
  const options = args.options;
  const signals = [...args.signals].sort((a, b) => a.signalIndex - b.signalIndex);
  const signalByIndex = new Map<number, GeneratedSignal>();
  for (const signal of signals) {
    if (!signalByIndex.has(signal.signalIndex)) signalByIndex.set(signal.signalIndex, signal);
  }

  const trades: BacktestTrade[] = [];
  const rejectedSignals: RejectedSignal[] = [];
  const equityCurve: EquityPoint[] = [];
  const warnings: string[] = [];

  let cash = options.initialBalance;
  let peakEquity = options.initialBalance;
  let barsWithPosition = 0;

  let position: OpenPosition | null = null;
  let pending: PendingEntry | null = null;
  let marketIntent: GeneratedSignal | null = null;
  let nextTradeId = 1;

  const halfSpread = Math.max(0, options.spread) / 2;
  const slippage = Math.max(0, options.slippage);

  if (candles.length === 0) {
    warnings.push('No candles were available for this backtest.');
  }

  const reject = (signal: GeneratedSignal, reason: string): void => {
    rejectedSignals.push({
      signalIndex: signal.signalIndex,
      signalTime: signal.signalTime,
      reason,
    });
  };

  const markToMarket = (price: number): number => {
    if (!position) return cash;
    const gross = signedPnl(
      position.side,
      position.entryPrice,
      price,
      position.quantity,
      options.contractSize,
    );
    return cash + gross - position.entryFee;
  };

  // Emit mark-to-market equity with the running drawdown, so the persisted
  // curve is useful on its own (metrics recomputes the summary from it).
  const recordEquity = (index: number, price: number): void => {
    const equity = markToMarket(price);
    if (equity > peakEquity) peakEquity = equity;
    const drawdown = peakEquity - equity;
    const drawdownPct = peakEquity > 0 ? (drawdown / peakEquity) * 100 : 0;
    equityCurve.push({
      t: candles[index]!.t,
      equity: round(equity, 2),
      drawdown: round(drawdown, 2),
      drawdownPct: round(drawdownPct, 3),
    });
  };

  const closePosition = (index: number, rawExit: number, reason: TradeExitReason): void => {
    if (!position) return;
    const current = position;
    const exitPrice =
      current.side === 'long' ? rawExit - halfSpread - slippage : rawExit + halfSpread + slippage;
    const exitFee = options.commissionPerUnit * current.quantity;
    const gross = signedPnl(
      current.side,
      current.entryPrice,
      exitPrice,
      current.quantity,
      options.contractSize,
    );
    const fees = current.entryFee + exitFee;
    const pnl = gross - fees;
    cash += pnl;

    const riskPerUnit = current.riskAmount;
    trades.push({
      id: nextTradeId++,
      side: current.side,
      entryType: current.entryType,
      entryTime: current.entryTime,
      exitTime: candles[index]!.t,
      entryPrice: round(current.entryPrice, 6),
      exitPrice: round(exitPrice, 6),
      stop: round(current.stop, 6),
      target: current.target === null ? null : round(current.target, 6),
      quantity: round(current.quantity, 6),
      riskAmount: round(riskPerUnit, 2),
      pnl: round(pnl, 2),
      fees: round(fees, 2),
      rMultiple: round(riskPerUnit > 0 ? pnl / riskPerUnit : 0, 4),
      barsHeld: index - current.entryIndex,
      exitReason: reason,
      mfe: round(current.mfeR, 4),
      mae: round(current.maeR, 4),
      ...(current.signal.reason ? { reason: current.signal.reason } : {}),
      ...(current.signal.tags?.length ? { tags: [...current.signal.tags] } : {}),
    });
    position = null;
  };

  const openPosition = (
    signal: GeneratedSignal,
    index: number,
    rawEntry: number,
    entryType: 'market' | 'limit',
  ): void => {
    const side = signal.side;
    const entryPrice =
      side === 'long' ? rawEntry + halfSpread + slippage : rawEntry - halfSpread - slippage;

    const stopDistance = side === 'long' ? entryPrice - signal.stop : signal.stop - entryPrice;
    if (!(stopDistance > 0) || !Number.isFinite(stopDistance)) {
      reject(signal, 'Stop loss is on the wrong side of the entry price');
      return;
    }
    if (stopDistance <= halfSpread + slippage) {
      reject(signal, 'Stop loss is inside the spread/slippage buffer');
      return;
    }
    if (signal.target !== undefined && signal.target !== null) {
      const targetDistance =
        side === 'long' ? signal.target - entryPrice : entryPrice - signal.target;
      if (!(targetDistance > 0)) {
        reject(signal, 'Take profit is on the wrong side of the entry price');
        return;
      }
    }

    const riskPct = clamp(finite(signal.riskPct, options.riskPct), 0.01, 10);
    const riskBudget = (cash * riskPct) / 100;
    if (!(riskBudget > 0)) {
      reject(signal, 'Account equity is too small to size a position');
      return;
    }

    let quantity = riskBudget / (stopDistance * options.contractSize);
    const maxQuantity =
      (cash * Math.max(1, options.leverage)) / (entryPrice * options.contractSize);
    quantity = Math.min(quantity, maxQuantity);
    if (!(quantity > 0) || !Number.isFinite(quantity)) {
      reject(signal, 'Risk sizing produced a zero position');
      return;
    }

    const riskAmount = stopDistance * quantity * options.contractSize;
    if (riskAmount < 0.5) {
      reject(signal, 'Position risk is below the minimum tradable size');
      return;
    }

    const trailing = signal.trailing;
    const maxBars = clamp(
      Math.round(finite(signal.maxBars, options.maxBarsInTrade)),
      1,
      Math.max(1, candles.length),
    );

    position = {
      signal,
      side,
      entryType,
      entryIndex: index,
      entryTime: candles[index]!.t,
      entryPrice,
      rawEntryPrice: rawEntry,
      stop: signal.stop,
      target: signal.target ?? null,
      quantity,
      riskAmount,
      initialRiskDistance: stopDistance,
      entryFee: options.commissionPerUnit * quantity,
      breakEvenAtR:
        signal.breakEvenAtR !== undefined && Number.isFinite(signal.breakEvenAtR)
          ? Math.max(0, signal.breakEvenAtR)
          : null,
      maxBars,
      trailingValue:
        trailing && Number.isFinite(trailing.value) && trailing.value > 0 ? trailing.value : null,
      trailingType:
        trailing && Number.isFinite(trailing.value) && trailing.value > 0 ? trailing.type : null,
      mfeR: 0,
      maeR: 0,
      breakEvenApplied: false,
    };
  };

  const checkExit = (index: number): void => {
    if (!position) return;
    const candle = candles[index]!;
    const current = position;

    // Track excursions for the report.
    const favourable =
      current.side === 'long' ? candle.h - current.entryPrice : current.entryPrice - candle.l;
    const adverse =
      current.side === 'long' ? current.entryPrice - candle.l : candle.h - current.entryPrice;
    if (current.initialRiskDistance > 0) {
      current.mfeR = Math.max(current.mfeR, favourable / current.initialRiskDistance);
      current.maeR = Math.max(current.maeR, adverse / current.initialRiskDistance);
    }

    const stopHit = current.side === 'long' ? candle.l <= current.stop : candle.h >= current.stop;
    const gapThroughStop =
      current.side === 'long' ? candle.o <= current.stop : candle.o >= current.stop;

    if (gapThroughStop) {
      closePosition(index, candle.o, 'stop_loss');
      return;
    }
    if (stopHit) {
      closePosition(index, current.stop, 'stop_loss');
      return;
    }

    if (current.target !== null) {
      const gapThroughTarget =
        current.side === 'long' ? candle.o >= current.target : candle.o <= current.target;
      if (gapThroughTarget) {
        closePosition(index, candle.o, 'take_profit');
        return;
      }
      const targetHit =
        current.side === 'long' ? candle.h >= current.target : candle.l <= current.target;
      if (targetHit) {
        closePosition(index, current.target, 'take_profit');
        return;
      }
    }

    if (index - current.entryIndex >= current.maxBars) {
      closePosition(index, candle.c, 'max_bars');
    }
  };

  const updateTrailing = (index: number): void => {
    if (!position) return;
    const candle = candles[index]!;
    const current = position;

    if (
      current.breakEvenAtR !== null &&
      !current.breakEvenApplied &&
      current.mfeR >= current.breakEvenAtR
    ) {
      current.stop =
        current.side === 'long'
          ? Math.max(current.stop, current.entryPrice)
          : Math.min(current.stop, current.entryPrice);
      current.breakEvenApplied = true;
    }

    if (current.trailingType !== null && current.trailingValue !== null) {
      let distance: number | null = null;
      if (current.trailingType === 'atr') {
        const atr = args.atr[index];
        if (typeof atr === 'number' && Number.isFinite(atr) && atr > 0) {
          distance = atr * current.trailingValue;
        }
      } else if (current.trailingType === 'percent') {
        distance = (candle.c * current.trailingValue) / 100;
      } else {
        distance = current.trailingValue;
      }

      if (distance !== null && distance > 0) {
        if (current.side === 'long') {
          const candidate = candle.c - distance;
          if (candidate > current.stop) current.stop = candidate;
        } else {
          const candidate = candle.c + distance;
          if (candidate < current.stop) current.stop = candidate;
        }
      }
    }
  };

  const tryFillPending = (index: number): void => {
    if (!pending || position) return;
    const candle = candles[index]!;
    const signal = pending.signal;

    if (index > pending.expiresIndex) {
      reject(signal, 'Limit entry expired before price reached it');
      pending = null;
      return;
    }

    const limit = pending.limitPrice;
    if (signal.side === 'long') {
      if (candle.o <= limit) {
        pending = null;
        openPosition(signal, index, candle.o, 'limit');
        return;
      }
      if (candle.l <= limit) {
        pending = null;
        openPosition(signal, index, limit, 'limit');
      }
      return;
    }

    if (candle.o >= limit) {
      pending = null;
      openPosition(signal, index, candle.o, 'limit');
      return;
    }
    if (candle.h >= limit) {
      pending = null;
      openPosition(signal, index, limit, 'limit');
    }
  };

  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index]!;

    // A market signal from the previous close fills at this bar's open.
    if (marketIntent) {
      const intent = marketIntent;
      marketIntent = null;
      openPosition(intent, index, candle.o, 'market');
    }

    if (pending) tryFillPending(index);

    if (position) {
      barsWithPosition += 1;
      checkExit(index);
      if (position) updateTrailing(index);
    }

    // Signals are generated at this bar's close and may only act from the
    // next bar onward. The engine deliberately ignores unknown signal indexes.
    const signal = signalByIndex.get(index);
    if (signal) {
      if (index === candles.length - 1) {
        reject(signal, 'Signal occurred on the final bar; no bar left to fill it');
      } else if (position) {
        reject(signal, 'A position is already open');
      } else if (pending) {
        reject(signal, 'Another limit entry is already resting');
      } else if (signal.side === 'short' && !options.allowShort) {
        reject(signal, 'Short selling is disabled for this run');
      } else {
        const entry = signal.entry ?? 'market';
        if (entry === 'market') {
          // Fill at the next bar open. The intent is consumed at the top of
          // the next iteration so this bar's equity never contains a position
          // that did not exist yet.
          marketIntent = signal;
        } else if (Number.isFinite(entry) && entry > 0) {
          const validBars = clamp(Math.round(finite(signal.validBars, 5)), 1, 500);
          pending = {
            signal,
            expiresIndex: index + validBars,
            limitPrice: entry,
          };
        } else {
          reject(signal, 'Limit entry price is invalid');
        }
      }
    }

    recordEquity(index, candle.c);
  }

  if (position) {
    closePosition(candles.length - 1, candles[candles.length - 1]!.c, 'end_of_data');
  }
  if (pending) {
    reject(pending.signal, 'Limit entry was still resting at the end of the data');
    pending = null;
  }
  if (marketIntent) {
    reject(marketIntent, 'Market entry could not fill before the end of the data');
  }

  const metrics = computeMetrics({
    trades,
    equityCurve,
    initialBalance: options.initialBalance,
    finalEquity: cash,
    bars: candles.length,
    barsWithPosition,
  });

  return {
    symbol: options.symbol,
    timeframe: options.timeframe,
    bars: candles.length,
    from: candles[0]?.t ?? 0,
    to: candles[candles.length - 1]?.t ?? 0,
    initialBalance: options.initialBalance,
    finalEquity: round(cash, 2),
    metrics,
    trades,
    equityCurve,
    rejectedSignals,
    warnings,
    truncated: false,
  };
}

export function round(value: number, digits: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
