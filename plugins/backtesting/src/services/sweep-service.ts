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

import type { Symbol, Timeframe } from '@kestrel/shared';

import {
  createBacktestSweep,
  getBacktestStrategy,
  getBacktestSweep,
  listBacktestSweeps,
  updateBacktestSweep,
} from '../db/queries';
import type { BacktestSweepRow } from '../db/tables';
import {
  SweepDetailSchema,
  SweepSummarySchema,
  type SweepInput,
  type SweepObjective,
} from '../schemas';
import { runBacktestForUser } from './run-service';

const MAX_RESULTS = 200;

export class SweepCancelledError extends Error {
  constructor() {
    super('Sweep was cancelled.');
    this.name = 'SweepCancelledError';
  }
}

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
  error: string | null;
}

function metricsSummary(metrics: {
  trades: number;
  winRate: number;
  netPnl: number;
  returnPct: number;
  maxDrawdownPct: number;
  profitFactor: number;
  sharpeRatio: number;
  expectancyR: number;
}): SweepMetricsSummary {
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

function scoreFor(metrics: SweepMetricsSummary, objective: SweepObjective): number {
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

function rowSummary(row: BacktestSweepRow) {
  return SweepSummarySchema.parse({
    id: row.id,
    name: row.name,
    symbol: row.symbol,
    timeframe: row.timeframe,
    objective: row.objective,
    status: row.status,
    total: row.total,
    completed: row.completed,
    bestScore: row.bestScore,
    bestParams: row.bestParams,
    bestMetrics: row.bestMetrics,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function rowDetail(row: BacktestSweepRow) {
  return SweepDetailSchema.parse({
    ...rowSummary(row),
    strategyId: row.strategyId,
    source: row.source,
    baseParams: row.baseParams,
    parameterSpace: row.parameterSpace,
    count: row.count,
    initialBalance: row.initialBalance,
    riskPct: row.riskPct,
    minTrades: row.minTrades,
    persistRuns: row.persistRuns,
    results: row.results,
  });
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

  const combinations = expandParameterSpace(
    row.baseParams,
    row.parameterSpace,
    Math.max(row.total, 1),
  );
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
    for (let index = 0; index < combinations.length; index += 1) {
      if (args.signal?.aborted) throw new SweepCancelledError();
      const current = await getBacktestSweep(args.userId, args.sweepId);
      if (!current || current.status === 'cancelled') throw new SweepCancelledError();

      const params = combinations[index]!;
      try {
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
        const metrics = metricsSummary(response.result.metrics);
        const score = scoreFor(metrics, row.objective as SweepObjective);
        results.push({ params, score, metrics, error: null });
        if (metrics.trades >= row.minTrades && (best === null || score > best.score)) {
          best = { score, params, metrics };
        }
      } catch (err) {
        results.push({
          params,
          score: null,
          metrics: null,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      if (results.length > MAX_RESULTS) results = results.slice(-MAX_RESULTS);
      await updateBacktestSweep(args.userId, args.sweepId, {
        completed: index + 1,
        results: results as unknown as Array<Record<string, unknown>>,
      });
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

export async function listSweepViews(userId: string, limit = 20) {
  const rows = await listBacktestSweeps(userId, limit);
  return rows.map(rowSummary);
}

export async function getSweepDetail(userId: string, sweepId: string) {
  const row = await getBacktestSweep(userId, sweepId);
  return row ? rowDetail(row) : null;
}

export { rowSummary, rowDetail };
