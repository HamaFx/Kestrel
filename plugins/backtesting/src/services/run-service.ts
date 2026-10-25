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

// Backtest application service.
//
// Owns the boundary between market data / persistence and the pure engine.
// Both the agent tool and the plugin HTTP routes call this module so a manual
// UI run and a chat run produce identical artifacts.

import { getCandles } from '@kestrel/data';
import { msPerTimeframe, pipSize, type Candle, type Symbol, type Timeframe } from '@kestrel/shared';

import {
  deleteBacktestRun,
  getBacktestRun,
  getBacktestStrategy,
  listBacktestRuns,
  persistBacktestRun,
  pruneBacktestRuns,
  type PersistBacktestRunInput,
} from '../db/queries';
import type { BacktestRunRow } from '../db/tables';
import { downsample, runBacktest as executeBacktest, type RunBacktestOutput } from '../engine/run';
import type { RunBacktestInput, RunDetail, RunResult, RunSummary } from '../schemas';
import { normaliseSettings, type BacktestSettings } from '../settings';

export const ENGINE_VERSION = 'kestrel-engine-1';

const PERSIST_LIMITS = {
  trades: 1_000,
  equityPoints: 1_500,
  rejectedSignals: 100,
  logs: 100,
} as const;

const TOOL_LIMITS = {
  trades: 200,
  equityPoints: 500,
  rejectedSignals: 50,
  logs: 50,
} as const;

function cloneParams(params: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!params) return {};
  let serialised: string;
  try {
    serialised = JSON.stringify(params);
  } catch {
    throw new Error('Strategy params must be JSON-serialisable.');
  }
  if (serialised.length > 20_000) {
    throw new Error('Strategy params are too large (max 20KB).');
  }
  return JSON.parse(serialised) as Record<string, unknown>;
}

function closedCandlesOnly(candles: readonly Candle[], timeframe: Timeframe): Candle[] {
  const now = Date.now();
  const barMs = msPerTimeframe(timeframe);
  return candles.filter((candle) => candle.t + barMs <= now);
}

export interface BacktestRunRequest {
  userId: string;
  input: RunBacktestInput;
  settings: Readonly<Record<string, unknown>>;
  signal?: AbortSignal;
}

export interface BacktestRunResponse {
  row: BacktestRunRow;
  result: RunResult;
  logs: string[];
  source: string;
}

export async function runBacktestForUser(
  request: BacktestRunRequest,
): Promise<BacktestRunResponse> {
  const settings = normaliseSettings(request.settings);
  const input = request.input;

  let source = input.source?.trim() ?? '';
  let params = cloneParams(input.params);
  let name = input.name?.trim() ?? '';

  if (input.strategyId) {
    const strategy = await getBacktestStrategy(request.userId, input.strategyId);
    if (!strategy) throw new Error(`Saved strategy "${input.strategyId}" was not found.`);
    if (!source) source = strategy.source;
    if (Object.keys(params).length === 0) params = cloneParams(strategy.params);
    if (!name) name = strategy.name;
  }

  if (!source) throw new Error('A strategy source or saved strategy is required.');
  if (!name) name = `${input.symbol} ${input.timeframe} strategy`;

  const count = Math.max(60, Math.min(input.count ?? settings.maxCandles, 5000));
  let candles: Candle[];
  try {
    candles = await getCandles(input.symbol as Symbol, input.timeframe as Timeframe, {
      count,
      includeOpenBar: false,
      ...(input.from ? { from: input.from } : {}),
      ...(input.to ? { to: input.to } : {}),
      ...(request.signal ? { signal: request.signal } : {}),
    });
  } catch (err) {
    throw new Error(
      `Could not load ${input.symbol} ${input.timeframe} candles: ${
        err instanceof Error ? err.message : String(err)
      }`,
      { cause: err },
    );
  }

  const closed = closedCandlesOnly(candles, input.timeframe as Timeframe);
  if (closed.length < 30) {
    throw new Error(
      `Only ${closed.length} closed ${input.timeframe} candles are available for ${input.symbol}. Try a smaller timeframe or a larger window.`,
    );
  }

  const unit = pipSize(input.symbol);
  const spread = input.spread ?? settings.defaultSpreadPips * unit;
  const slippage = input.slippage ?? settings.defaultSlippagePips * unit;
  const commissionPerUnit = input.commissionPerUnit ?? settings.commissionPerUnit;
  const leverage = input.leverage ?? settings.leverage;

  const startedAt = Date.now();
  const output: RunBacktestOutput = await executeBacktest({
    symbol: input.symbol as Symbol,
    timeframe: input.timeframe as Timeframe,
    candles: closed,
    source,
    params,
    ...(request.signal ? { signal: request.signal } : {}),
    options: {
      initialBalance: input.initialBalance ?? settings.defaultInitialBalance,
      riskPct: input.riskPct ?? settings.defaultRiskPct,
      spread,
      slippage,
      commissionPerUnit,
      leverage,
      ...(input.allowShort !== undefined ? { allowShort: input.allowShort } : {}),
      ...(input.maxBarsInTrade !== undefined ? { maxBarsInTrade: input.maxBarsInTrade } : {}),
    },
  });
  const durationMs = Date.now() - startedAt;

  const persist = input.persist !== false;
  if (!persist) {
    const synthetic: BacktestRunRow = {
      id: `preview-${Date.now()}`,
      tenantId: '',
      userId: request.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      name,
      symbol: input.symbol,
      timeframe: input.timeframe,
      source,
      params,
      status: 'completed',
      engineVersion: ENGINE_VERSION,
      bars: output.result.bars,
      fromTs: output.result.from ? new Date(output.result.from) : null,
      toTs: output.result.to ? new Date(output.result.to) : null,
      initialBalance: output.result.initialBalance,
      finalEquity: output.result.finalEquity,
      metrics: output.result.metrics,
      equityCurve: output.result.equityCurve,
      trades: output.result.trades,
      rejectedSignals: output.result.rejectedSignals,
      warnings: output.result.warnings,
      logs: output.logs,
      durationMs,
      error: null,
    };
    return {
      row: synthetic,
      result: toRunResult(synthetic, TOOL_LIMITS),
      logs: output.logs,
      source,
    };
  }

  const persistInput: PersistBacktestRunInput = {
    userId: request.userId,
    name,
    symbol: input.symbol,
    timeframe: input.timeframe,
    source,
    params,
    status: 'completed',
    engineVersion: ENGINE_VERSION,
    bars: output.result.bars,
    fromTs: output.result.from ? new Date(output.result.from) : null,
    toTs: output.result.to ? new Date(output.result.to) : null,
    initialBalance: output.result.initialBalance,
    finalEquity: output.result.finalEquity,
    metrics: output.result.metrics,
    equityCurve: downsample(output.result.equityCurve, PERSIST_LIMITS.equityPoints),
    trades: output.result.trades.slice(-PERSIST_LIMITS.trades),
    rejectedSignals: output.result.rejectedSignals.slice(0, PERSIST_LIMITS.rejectedSignals),
    warnings: output.result.warnings,
    logs: output.logs.slice(0, PERSIST_LIMITS.logs),
    durationMs,
    error: null,
  };

  const row = await persistBacktestRun(persistInput);
  await pruneBacktestRuns(request.userId, settings.keepRuns).catch(() => 0);

  return {
    row,
    result: toRunResult(row, TOOL_LIMITS),
    logs: output.logs,
    source,
  };
}

export interface RunViewLimits {
  trades?: number;
  equityPoints?: number;
  rejectedSignals?: number;
  logs?: number;
}

export function toRunResult(row: BacktestRunRow, limits: RunViewLimits = {}): RunResult {
  const maxTrades = limits.trades ?? TOOL_LIMITS.trades;
  const maxEquity = limits.equityPoints ?? TOOL_LIMITS.equityPoints;
  const maxRejected = limits.rejectedSignals ?? TOOL_LIMITS.rejectedSignals;
  const maxLogs = limits.logs ?? TOOL_LIMITS.logs;

  const trades = row.trades.slice(-maxTrades);
  const equityCurve = downsample(row.equityCurve, maxEquity);
  const truncated =
    row.trades.length > trades.length ||
    row.equityCurve.length > maxEquity ||
    row.rejectedSignals.length > maxRejected ||
    row.logs.length > maxLogs;

  return {
    runId: row.id,
    name: row.name,
    symbol: row.symbol,
    timeframe: row.timeframe,
    status: row.status === 'failed' ? 'failed' : 'completed',
    bars: row.bars,
    from: row.fromTs ? row.fromTs.getTime() : 0,
    to: row.toTs ? row.toTs.getTime() : 0,
    initialBalance: row.initialBalance,
    finalEquity: row.finalEquity,
    metrics: row.metrics,
    trades,
    equityCurve,
    rejectedSignals: row.rejectedSignals.slice(0, maxRejected),
    warnings: row.warnings,
    logs: row.logs.slice(0, maxLogs),
    durationMs: row.durationMs,
    truncated,
    error: row.error,
  };
}

export function toRunDetail(row: BacktestRunRow): RunDetail {
  const result = toRunResult(row, {
    trades: PERSIST_LIMITS.trades,
    equityPoints: PERSIST_LIMITS.equityPoints,
    rejectedSignals: PERSIST_LIMITS.rejectedSignals,
    logs: PERSIST_LIMITS.logs,
  });
  return {
    ...result,
    source: row.source,
    params: row.params,
    engineVersion: row.engineVersion,
  };
}

export function toRunSummary(row: BacktestRunRow): RunSummary {
  return {
    id: row.id,
    name: row.name,
    symbol: row.symbol,
    timeframe: row.timeframe,
    status: row.status === 'failed' ? 'failed' : 'completed',
    createdAt: row.createdAt.toISOString(),
    bars: row.bars,
    metrics: {
      trades: row.metrics.trades,
      winRate: row.metrics.winRate,
      netPnl: row.metrics.netPnl,
      returnPct: row.metrics.returnPct,
      maxDrawdownPct: row.metrics.maxDrawdownPct,
      profitFactor: row.metrics.profitFactor,
      expectancyR: row.metrics.expectancyR,
    },
  };
}

export async function listRunSummaries(
  userId: string,
  opts: { limit?: number; symbol?: string } = {},
): Promise<RunSummary[]> {
  const rows = await listBacktestRuns(userId, { limit: opts.limit ?? 10 });
  const filtered = opts.symbol ? rows.filter((row) => row.symbol === opts.symbol) : rows;
  return filtered.map(toRunSummary);
}

export async function getRunDetail(userId: string, runId: string): Promise<RunDetail | null> {
  const row = await getBacktestRun(userId, runId);
  return row ? toRunDetail(row) : null;
}

export async function deleteRun(userId: string, runId: string): Promise<boolean> {
  return deleteBacktestRun(userId, runId);
}

export type { BacktestSettings };
