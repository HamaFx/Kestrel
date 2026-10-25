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

// Deterministic bar-by-bar execution loop.
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

import { computeMetrics } from '../metrics';
import type { BacktestResult, GeneratedSignal } from '../types';
import { closePosition, recordEquity, reject } from './accounting';
import { checkExit, openPosition, tryFillPending, updateTrailing } from './entries';
import { clamp, finite, round } from './math';
import type { SimulateArgs, SimulatorState } from './types';

export function simulateBacktest(args: SimulateArgs): BacktestResult {
  const candles = args.candles;
  const options = args.options;
  const signals = [...args.signals].sort((a, b) => a.signalIndex - b.signalIndex);
  const signalByIndex = new Map<number, GeneratedSignal>();
  for (const signal of signals) {
    if (!signalByIndex.has(signal.signalIndex)) signalByIndex.set(signal.signalIndex, signal);
  }

  const state: SimulatorState = {
    candles,
    options,
    atr: args.atr,
    trades: [],
    rejectedSignals: [],
    equityCurve: [],
    warnings: [],
    halfSpread: Math.max(0, options.spread) / 2,
    slippage: Math.max(0, options.slippage),
    cash: options.initialBalance,
    peakEquity: options.initialBalance,
    barsWithPosition: 0,
    position: null,
    pending: null,
    marketIntent: null,
    nextTradeId: 1,
  };

  if (candles.length === 0) {
    state.warnings.push('No candles were available for this backtest.');
  }

  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index]!;

    // A market signal from the previous close fills at this bar's open.
    if (state.marketIntent) {
      const intent = state.marketIntent;
      state.marketIntent = null;
      openPosition(state, intent, index, candle.o, 'market');
    }

    if (state.pending) tryFillPending(state, index);

    if (state.position) {
      state.barsWithPosition += 1;
      checkExit(state, index);
      if (state.position) updateTrailing(state, index);
    }

    // Signals are generated at this bar's close and may only act from the
    // next bar onward. The engine deliberately ignores unknown signal indexes.
    const signal = signalByIndex.get(index);
    if (signal) {
      if (index === candles.length - 1) {
        reject(state, signal, 'Signal occurred on the final bar; no bar left to fill it');
      } else if (state.position) {
        reject(state, signal, 'A position is already open');
      } else if (state.pending) {
        reject(state, signal, 'Another limit entry is already resting');
      } else if (signal.side === 'short' && !options.allowShort) {
        reject(state, signal, 'Short selling is disabled for this run');
      } else {
        const entry = signal.entry ?? 'market';
        if (entry === 'market') {
          // Fill at the next bar open. The intent is consumed at the top of
          // the next iteration so this bar's equity never contains a position
          // that did not exist yet.
          state.marketIntent = signal;
        } else if (Number.isFinite(entry) && entry > 0) {
          const validBars = clamp(Math.round(finite(signal.validBars, 5)), 1, 500);
          state.pending = {
            signal,
            expiresIndex: index + validBars,
            limitPrice: entry,
          };
        } else {
          reject(state, signal, 'Limit entry price is invalid');
        }
      }
    }

    recordEquity(state, index, candle.c);
  }

  if (state.position) {
    closePosition(state, candles.length - 1, candles[candles.length - 1]!.c, 'end_of_data');
  }
  if (state.pending) {
    reject(state, state.pending.signal, 'Limit entry was still resting at the end of the data');
    state.pending = null;
  }
  if (state.marketIntent) {
    reject(state, state.marketIntent, 'Market entry could not fill before the end of the data');
  }

  const metrics = computeMetrics({
    trades: state.trades,
    equityCurve: state.equityCurve,
    initialBalance: options.initialBalance,
    finalEquity: state.cash,
    bars: candles.length,
    barsWithPosition: state.barsWithPosition,
  });

  return {
    symbol: options.symbol,
    timeframe: options.timeframe,
    bars: candles.length,
    from: candles[0]?.t ?? 0,
    to: candles[candles.length - 1]?.t ?? 0,
    initialBalance: options.initialBalance,
    finalEquity: round(state.cash, 2),
    metrics,
    trades: state.trades,
    equityCurve: state.equityCurve,
    rejectedSignals: state.rejectedSignals,
    warnings: state.warnings,
    truncated: false,
  };
}
