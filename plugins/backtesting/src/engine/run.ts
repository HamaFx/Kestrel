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

// Backtest orchestration: candles -> point-in-time features -> sandboxed
// signals -> deterministic execution -> scorecard.

import { tryGetSymbolDefinition, type Candle, type Symbol, type Timeframe } from '@kestrel/shared';

import { buildFeatureMatrix } from './features';
import { runStrategySandbox } from './sandbox';
import { simulateBacktest } from './simulator';
import type { BacktestOptions, BacktestResult } from './types';

export interface RunBacktestArgs {
  symbol: Symbol;
  timeframe: Timeframe;
  candles: readonly Candle[];
  source: string;
  params?: Record<string, unknown>;
  options?: Partial<BacktestOptions>;
  signal?: AbortSignal;
  sandboxTimeoutMs?: number;
}

export interface RunBacktestOutput {
  result: BacktestResult;
  logs: string[];
  /** ATR(14) at the final bar, used by the UI to sanity-check stop sizes. */
  latestAtr: number | null;
}

const MIN_WARMUP_BARS = 200;

export function defaultBacktestOptions(args: {
  symbol: Symbol;
  timeframe: Timeframe;
  contractSize: number;
  overrides?: Partial<BacktestOptions>;
}): BacktestOptions {
  const overrides = args.overrides ?? {};
  return {
    symbol: args.symbol,
    timeframe: args.timeframe,
    initialBalance: clampNumber(overrides.initialBalance, 100, 100_000_000, 10_000),
    riskPct: clampNumber(overrides.riskPct, 0.01, 10, 1),
    spread: clampNumber(overrides.spread, 0, 10_000, 0),
    slippage: clampNumber(overrides.slippage, 0, 10_000, 0),
    commissionPerUnit: clampNumber(overrides.commissionPerUnit, 0, 10_000, 0),
    leverage: clampNumber(overrides.leverage, 1, 500, 10),
    contractSize: clampNumber(args.contractSize, 0.000001, 10_000_000, 1),
    allowShort: overrides.allowShort ?? true,
    maxBarsInTrade: Math.round(clampNumber(overrides.maxBarsInTrade, 1, 10_000, 100)),
  };
}

function clampNumber(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** Read a numeric field off a point when present (e.g. `equity`, `drawdownPct`). */
function numericField<T>(point: T, key: string): number | null {
  if (typeof point !== 'object' || point === null) return null;
  const value = (point as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Index of the largest numeric `key` on `points`, or -1 when the field is absent. */
function maxFieldIndex<T>(points: readonly T[], key: string): number {
  let bestIndex = -1;
  let bestValue = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < points.length; index += 1) {
    const value = numericField(points[index], key);
    if (value !== null && value > bestValue) {
      bestValue = value;
      bestIndex = index;
    }
  }
  return bestIndex;
}

/**
 * Downsample a series to at most `max` points (plus up to two forced extrema).
 *
 * For equity-curve-shaped points this picks the largest `drawdownPct` inside
 * each bucket and always keeps the global peak-equity and worst-drawdown
 * points, so charts never flatten the drawdown that matters.
 */
export function downsample<T>(points: readonly T[], max: number): T[] {
  if (points.length <= max || max < 3) return [...points];
  const keep = new Set<number>([0, points.length - 1]);
  const step = (points.length - 1) / (max - 1);

  for (let index = 1; index < max - 1; index += 1) {
    const center = index * step;
    const start = Math.max(0, Math.ceil(center - step / 2));
    const end = Math.min(points.length - 1, Math.floor(center + step / 2));
    let best = Math.round(center);
    let bestDrawdown = Number.NEGATIVE_INFINITY;
    for (let candidate = start; candidate <= end; candidate += 1) {
      const drawdown = numericField(points[candidate], 'drawdownPct');
      if (drawdown !== null && drawdown > bestDrawdown) {
        bestDrawdown = drawdown;
        best = candidate;
      }
    }
    keep.add(best);
  }

  const peakIndex = maxFieldIndex(points, 'equity');
  if (peakIndex >= 0) keep.add(peakIndex);
  const troughIndex = maxFieldIndex(points, 'drawdownPct');
  if (troughIndex >= 0) keep.add(troughIndex);

  return [...keep].sort((a, b) => a - b).map((index) => points[index]!);
}

export async function runBacktest(args: RunBacktestArgs): Promise<RunBacktestOutput> {
  const candles = [...args.candles]
    .filter(
      (candle) =>
        Number.isFinite(candle.t) &&
        Number.isFinite(candle.o) &&
        Number.isFinite(candle.h) &&
        Number.isFinite(candle.l) &&
        Number.isFinite(candle.c),
    )
    .sort((a, b) => a.t - b.t);

  if (candles.length < 30) {
    throw new Error(
      `Not enough candles for a backtest (${candles.length}). Request at least 30 bars; 300+ is recommended.`,
    );
  }

  const contractSize =
    args.options?.contractSize ??
    tryGetSymbolDefinition(args.symbol)?.capabilities.contractSize ??
    1;

  const options = defaultBacktestOptions({
    symbol: args.symbol,
    timeframe: args.timeframe,
    contractSize,
    ...(args.options ? { overrides: args.options } : {}),
  });

  const matrix = buildFeatureMatrix({
    symbol: args.symbol,
    timeframe: args.timeframe,
    candles,
  });

  const sandbox = await runStrategySandbox({
    source: args.source,
    matrix,
    symbol: args.symbol,
    timeframe: args.timeframe,
    params: args.params ?? {},
    costs: {
      spread: options.spread,
      slippage: options.slippage,
      commissionPerUnit: options.commissionPerUnit,
    },
    ...(args.signal ? { signal: args.signal } : {}),
    ...(args.sandboxTimeoutMs !== undefined
      ? { limits: { timeoutMs: args.sandboxTimeoutMs } }
      : {}),
  });

  const result = simulateBacktest({
    candles,
    signals: sandbox.signals,
    options,
    atr: matrix.series.atr14,
  });

  if (candles.length < MIN_WARMUP_BARS) {
    result.warnings.push(
      `Only ${candles.length} bars were available; EMA200/ADX warm-up may be incomplete. Use 300+ bars for stable features.`,
    );
  }
  if (sandbox.signals.length === 0) {
    result.warnings.push('The strategy produced no entry signals over this window.');
  }
  if (result.rejectedSignals.length > 0) {
    result.warnings.push(
      `${result.rejectedSignals.length} signal(s) were rejected by risk/execution validation.`,
    );
  }
  if (sandbox.logs.length > 0) {
    result.warnings.push(`Strategy logged ${sandbox.logs.length} message(s); see run logs.`);
  }

  // The full curve stays in memory for analysis; transport/persistence caps it.
  const latestAtr = matrix.series.atr14[matrix.series.atr14.length - 1] ?? null;

  return { result, logs: sandbox.logs, latestAtr };
}
