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

// Parameter-sweep application service.
//
// Expands a small parameter grid, runs the same deterministic engine as a
// normal backtest, ranks results by an explicit objective, and persists
// progress so the worker/UI can resume viewing a long sweep.
//
// The candle window and feature matrices are prepared once per sweep (see
// `sweep-execution.ts`); `persistRuns: true` keeps the legacy per-combination
// persisted-run path, while OOS (`trainRatio`) sweeps always run in memory.

import type { Symbol, Timeframe } from '@kestrel/shared';

import {
  createBacktestSweep,
  getBacktestStrategy,
  getBacktestSweep,
  updateBacktestSweep,
} from '../db/queries';
import type { BacktestSweepRow } from '../db/tables';
import { yieldToEventLoop } from '../engine/yield';
import type { SweepInput, SweepObjective } from '../schemas';
import { normaliseSettings } from '../settings';
import { runBacktestForUser } from './run-service';
import {
  metricsSummary,
  prepareSweepWindow,
  runSweepCombination,
  scoreFor,
  type SweepMetricsSummary,
  type SweepResult,
  type SweepWindow,
} from './sweep-execution';
import { getSweepDetail, listSweepViews } from './sweep-views';

export { getSweepDetail, listSweepViews };
export type { SweepMetricsSummary, SweepResult } from './sweep-execution';

const MAX_RESULTS = 200;
/** Flush progress (and check cancellation) every N combinations. */
const PROGRESS_FLUSH_EVERY = 5;
/** `trainRatio` rides inside baseParams because the sweep table has no column for it. */
const TRAIN_RATIO_KEY = '__trainRatio';

export class SweepCancelledError extends Error {
  constructor() {
    super('Sweep was cancelled.');
    this.name = 'SweepCancelledError';
  }
}

/** Read and clamp the persisted OOS split ratio, or null when absent. */
function trainRatioFrom(baseParams: Record<string, unknown>): number | null {
  const raw = baseParams[TRAIN_RATIO_KEY];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  return Math.min(0.9, Math.max(0.5, raw));
}

function withoutTrainRatio(params: Record<string, unknown>): Record<string, unknown> {
  const clean = { ...params };
  delete clean[TRAIN_RATIO_KEY];
  return clean;
}

export function expandParameterSpace(
  base: Record<string, unknown>,
  space: readonly { name: string; values: readonly (string | number | boolean)[] }[],
  maxCombinations: number,
): Array<Record<string, unknown>> {
  let combinations: Array<Record<string, unknown>> = [{ ...base }];
  for (const entry of space) {
    const next: Array<Record<string, unknown>> = [];
    for (const combination of combinations) {
      for (const value of entry.values) {
        next.push({ ...combination, [entry.name]: value });
        if (next.length > maxCombinations) {
          throw new Error(
            `Parameter space exceeds the ${maxCombinations}-combination limit. Reduce values or raise maxCombinations (max 200).`,
          );
        }
      }
    }
    combinations = next;
  }
  return combinations;
}

export async function createSweepForUser(args: {
  userId: string;
  input: SweepInput;
  settings: Readonly<Record<string, unknown>>;
}): Promise<BacktestSweepRow> {
  let source = args.input.source?.trim() ?? '';
  let baseParams = { ...(args.input.baseParams ?? {}) };
  let name = args.input.name?.trim() ?? '';

  if (args.input.strategyId) {
    const strategy = await getBacktestStrategy(args.userId, args.input.strategyId);
    if (!strategy) throw new Error(`Saved strategy "${args.input.strategyId}" was not found.`);
    if (!source) source = strategy.source;
    baseParams = { ...strategy.params, ...baseParams };
    if (!name) name = `${strategy.name} sweep`;
  }
  if (!source) throw new Error('A strategy source or saved strategy is required.');
  if (!name) name = `${args.input.symbol} ${args.input.timeframe} sweep`;
  if (args.input.trainRatio !== undefined) {
    baseParams = { ...baseParams, [TRAIN_RATIO_KEY]: args.input.trainRatio };
  }

  const combinations = expandParameterSpace(
    baseParams,
    args.input.parameterSpace,
    args.input.maxCombinations,
  );

  return createBacktestSweep({
    userId: args.userId,
    name,
    strategyId: args.input.strategyId ?? null,
    symbol: args.input.symbol,
    timeframe: args.input.timeframe,
    source,
    baseParams,
    parameterSpace: args.input.parameterSpace.map((entry) => ({
      name: entry.name,
      values: [...entry.values],
    })),
    objective: args.input.objective,
    count: args.input.count,
    initialBalance: args.input.initialBalance,
    riskPct: args.input.riskPct,
    minTrades: args.input.minTrades,
    persistRuns: args.input.persistRuns,
    status: 'queued',
    total: combinations.length,
    completed: 0,
    bestParams: null,
    bestMetrics: null,
    bestScore: null,
    results: [],
    error: null,
  });
}

export async function executeSweep(args: {
  userId: string;
  sweepId: string;
  settings: Readonly<Record<string, unknown>>;
  signal?: AbortSignal;
}): Promise<BacktestSweepRow> {
  const row = await getBacktestSweep(args.userId, args.sweepId);
  if (!row) throw new Error('Sweep not found.');
  if (row.status === 'cancelled') return row;

  const trainRatio = trainRatioFrom(row.baseParams);
  const combinations = expandParameterSpace(
    row.baseParams,
    row.parameterSpace,
    Math.max(row.total, 1),
  ).map(withoutTrainRatio);

  let results: SweepResult[] = [];
  let best: {
    score: number;
    params: Record<string, unknown>;
    metrics: SweepMetricsSummary;
  } | null = null;

  await updateBacktestSweep(args.userId, args.sweepId, {
    status: 'running',
    completed: 0,
    total: combinations.length,
    results: [],
    error: null,
  });

  try {
    // Load the candle window and build the feature matrices once for the whole
    // sweep. OOS sweeps always run in memory so both windows share the data.
    let window: SweepWindow | null = null;
    if (!row.persistRuns || trainRatio !== null) {
      window = await prepareSweepWindow({
        symbol: row.symbol as Symbol,
        timeframe: row.timeframe as Timeframe,
        count: row.count,
        initialBalance: row.initialBalance,
        riskPct: row.riskPct,
        trainRatio,
        settings: normaliseSettings(args.settings),
        ...(args.signal ? { signal: args.signal } : {}),
      });
    }

    for (let index = 0; index < combinations.length; index += 1) {
      if (args.signal?.aborted) throw new SweepCancelledError();
      // R16 — a combination is CPU-bound synchronous work (QuickJS evaluation
      // plus the simulator). Yield a macrotask turn between combinations so
      // health checks, tick ingestion, cancellation and every other job on
      // this process get to run; the sandbox deadline bounds the block inside
      // one combination.
      await yieldToEventLoop();
      const params = combinations[index]!;

      try {
        let metrics: SweepMetricsSummary;
        let oosMetrics: SweepMetricsSummary | null = null;
        if (window) {
          const outcome = await runSweepCombination({
            window,
            source: row.source,
            params,
            ...(args.signal ? { signal: args.signal } : {}),
          });
          metrics = outcome.metrics;
          oosMetrics = outcome.oosMetrics;
        } else {
          const response = await runBacktestForUser({
            userId: args.userId,
            settings: args.settings,
            ...(args.signal ? { signal: args.signal } : {}),
            input: {
              name: `${row.name} #${index + 1}`,
              symbol: row.symbol as Symbol,
              timeframe: row.timeframe as Timeframe,
              source: row.source,
              params,
              count: row.count,
              initialBalance: row.initialBalance,
              riskPct: row.riskPct,
              persist: row.persistRuns,
            },
          });
          metrics = metricsSummary(response.result.metrics);
        }

        const score = scoreFor(metrics, row.objective as SweepObjective);
        results.push({
          params,
          score,
          metrics,
          ...(window ? { oosMetrics } : {}),
          error: null,
        });
        if (metrics.trades >= row.minTrades && (best === null || score > best.score)) {
          best = { score, params, metrics };
        }
      } catch (err) {
        results.push({
          params,
          score: null,
          metrics: null,
          ...(window ? { oosMetrics: null } : {}),
          error: err instanceof Error ? err.message : String(err),
        });
      }

      if (results.length > MAX_RESULTS) results = results.slice(-MAX_RESULTS);

      const isLast = index === combinations.length - 1;
      if ((index + 1) % PROGRESS_FLUSH_EVERY === 0 || isLast) {
        const current = await getBacktestSweep(args.userId, args.sweepId);
        if (!current || current.status === 'cancelled') throw new SweepCancelledError();
        await updateBacktestSweep(args.userId, args.sweepId, {
          completed: index + 1,
          results: results as unknown as Array<Record<string, unknown>>,
        });
      }
    }

    results.sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
    const completed = await updateBacktestSweep(args.userId, args.sweepId, {
      status: 'completed',
      completed: combinations.length,
      results: results as unknown as Array<Record<string, unknown>>,
      ...(best
        ? {
            bestParams: best.params,
            bestMetrics: best.metrics as unknown as Record<string, unknown>,
            bestScore: best.score,
          }
        : {}),
    });
    if (!completed) throw new Error('Sweep disappeared before completion.');
    return completed;
  } catch (err) {
    const cancelled = err instanceof SweepCancelledError || args.signal?.aborted === true;
    await updateBacktestSweep(args.userId, args.sweepId, {
      status: cancelled ? 'cancelled' : 'failed',
      error: cancelled ? 'Cancelled by user.' : err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export async function runSweepForUser(args: {
  userId: string;
  input: SweepInput;
  settings: Readonly<Record<string, unknown>>;
  signal?: AbortSignal;
}): Promise<BacktestSweepRow> {
  const row = await createSweepForUser(args);
  return executeSweep({
    userId: args.userId,
    sweepId: row.id,
    settings: args.settings,
    ...(args.signal ? { signal: args.signal } : {}),
  });
}
