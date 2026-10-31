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

// In-memory sweep execution.
//
// A sweep loads its candle window and builds its feature matrices exactly
// once, then evaluates every parameter combination against that shared data.
// With a `trainRatio`, the first slice ranks parameters in-sample and the
// remainder is evaluated out-of-sample for each combination.

import { getCandles } from '@kestrel/data';
import {
  msPerTimeframe,
  pipSize,
  tryGetSymbolDefinition,
  type Candle,
  type Symbol,
  type Timeframe,
} from '@kestrel/shared';

import { buildFeatureMatrix, type FeatureMatrix } from '../engine/features';
import { defaultBacktestOptions } from '../engine/run';
import { runStrategySandbox } from '../engine/sandbox';
import { simulateBacktest } from '../engine/simulator';
import type { BacktestMetrics, BacktestOptions } from '../engine/types';
import type { SweepObjective } from '../schemas';
import type { BacktestSettings } from '../settings';

const MIN_BARS = 30;

export interface SweepMetricsSummary {
  trades: number;
  winRate: number;
  netPnl: number;
  returnPct: number;
  maxDrawdownPct: number;
  profitFactor: number;
  sharpeRatio: number;
  expectancyR: number;
}

export interface SweepResult {
  params: Record<string, unknown>;
  score: number | null;
  metrics: SweepMetricsSummary | null;
  oosMetrics?: SweepMetricsSummary | null;
  error: string | null;
}

export function metricsSummary(metrics: BacktestMetrics): SweepMetricsSummary {
  return {
    trades: metrics.trades,
    winRate: metrics.winRate,
    netPnl: metrics.netPnl,
    returnPct: metrics.returnPct,
    maxDrawdownPct: metrics.maxDrawdownPct,
    profitFactor: Number.isFinite(metrics.profitFactor) ? metrics.profitFactor : 0,
    sharpeRatio: Number.isFinite(metrics.sharpeRatio) ? metrics.sharpeRatio : 0,
    expectancyR: metrics.expectancyR,
  };
}

export function scoreFor(metrics: SweepMetricsSummary, objective: SweepObjective): number {
  switch (objective) {
    case 'profitFactor':
      return metrics.profitFactor;
    case 'netPnl':
      return metrics.netPnl;
    case 'returnPct':
      return metrics.returnPct;
    case 'sharpeRatio':
      return metrics.sharpeRatio;
    case 'maxDrawdownPct':
      // Lower drawdown is better.
      return -metrics.maxDrawdownPct;
    case 'expectancyR':
    default:
      return metrics.expectancyR;
  }
}

interface SweepWindowSlice {
  candles: Candle[];
  matrix: FeatureMatrix;
}

export interface SweepWindow {
  symbol: Symbol;
  timeframe: Timeframe;
  options: BacktestOptions;
  /** Full closed-candle window (also built for OOS sweeps for parity/debugging). */
  full: SweepWindowSlice;
  inSample: SweepWindowSlice | null;
  outOfSample: SweepWindowSlice | null;
  trainRatio: number | null;
}

export interface PrepareSweepWindowArgs {
  symbol: Symbol;
  timeframe: Timeframe;
  count: number;
  initialBalance: number;
  riskPct: number;
  trainRatio: number | null;
  settings: BacktestSettings;
  signal?: AbortSignal;
}

/** Load the candle window and build every feature matrix the sweep needs. */
export async function prepareSweepWindow(args: PrepareSweepWindowArgs): Promise<SweepWindow> {
  const count = Math.max(60, Math.min(args.count, 5000));
  const candles = await getCandles(args.symbol, args.timeframe, {
    count,
    includeOpenBar: false,
    ...(args.signal ? { signal: args.signal } : {}),
  });

  const barMs = msPerTimeframe(args.timeframe);
  const now = Date.now();
  const closed = candles
    .filter((candle) => candle.t + barMs <= now)
    .sort((a, b) => a.t - b.t);
  if (closed.length < MIN_BARS) {
    throw new Error(
      `Only ${closed.length} closed ${args.timeframe} candles are available for ${args.symbol}. Fetch more history before sweeping.`,
    );
  }

  const unit = pipSize(args.symbol);
  const options = defaultBacktestOptions({
    symbol: args.symbol,
    timeframe: args.timeframe,
    contractSize: tryGetSymbolDefinition(args.symbol)?.capabilities.contractSize ?? 1,
    overrides: {
      initialBalance: args.initialBalance,
      riskPct: args.riskPct,
      spread: args.settings.defaultSpreadPips * unit,
      slippage: args.settings.defaultSlippagePips * unit,
      commissionPerUnit: args.settings.commissionPerUnit,
      leverage: args.settings.leverage,
    },
  });

  const buildSlice = (slice: Candle[]): SweepWindowSlice => ({
    candles: slice,
    matrix: buildFeatureMatrix({ symbol: args.symbol, timeframe: args.timeframe, candles: slice }),
  });

  const window: SweepWindow = {
    symbol: args.symbol,
    timeframe: args.timeframe,
    options,
    full: buildSlice(closed),
    inSample: null,
    outOfSample: null,
    trainRatio: args.trainRatio,
  };

  if (args.trainRatio !== null) {
    const splitIndex = Math.floor(closed.length * args.trainRatio);
    const inSampleCandles = closed.slice(0, splitIndex);
    const outOfSampleCandles = closed.slice(splitIndex);
    if (inSampleCandles.length < MIN_BARS || outOfSampleCandles.length < MIN_BARS) {
      throw new Error(
        `A ${Math.round(args.trainRatio * 100)}% in-sample split leaves fewer than ${MIN_BARS} bars in one window. Request more candles.`,
      );
    }
    window.inSample = buildSlice(inSampleCandles);
    window.outOfSample = buildSlice(outOfSampleCandles);
  }

  return window;
}

async function simulateSlice(args: {
  window: SweepWindow;
  slice: SweepWindowSlice;
  source: string;
  params: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<SweepMetricsSummary> {
  const sandbox = await runStrategySandbox({
    source: args.source,
    matrix: args.slice.matrix,
    symbol: args.window.symbol,
    timeframe: args.window.timeframe,
    params: args.params,
    costs: {
      spread: args.window.options.spread,
      slippage: args.window.options.slippage,
      commissionPerUnit: args.window.options.commissionPerUnit,
    },
    ...(args.signal ? { signal: args.signal } : {}),
  });
  const result = simulateBacktest({
    candles: args.slice.candles,
    signals: sandbox.signals,
    options: args.window.options,
    atr: args.slice.matrix.series.atr14,
  });
  return metricsSummary(result.metrics);
}

/**
 * Run one parameter combination against the prepared window.
 *
 * With a `trainRatio` the reported `metrics` are in-sample (what the sweep
 * ranks by) and `oosMetrics` come from the untouched out-of-sample slice.
 */
export async function runSweepCombination(args: {
  window: SweepWindow;
  source: string;
  params: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<{ metrics: SweepMetricsSummary; oosMetrics: SweepMetricsSummary | null }> {
  const primary = args.window.inSample ?? args.window.full;
  const metrics = await simulateSlice({
    window: args.window,
    slice: primary,
    source: args.source,
    params: args.params,
    ...(args.signal ? { signal: args.signal } : {}),
  });

  let oosMetrics: SweepMetricsSummary | null = null;
  if (args.window.outOfSample) {
    oosMetrics = await simulateSlice({
      window: args.window,
      slice: args.window.outOfSample,
      source: args.source,
      params: args.params,
      ...(args.signal ? { signal: args.signal } : {}),
    });
  }

  return { metrics, oosMetrics };
}
