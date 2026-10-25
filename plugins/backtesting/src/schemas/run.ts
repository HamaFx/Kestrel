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

// Tool/API schemas for the Backtesting Lab — runs, trades and metrics.
//
// These are the contract shared by the Mastra tool adapter, the plugin HTTP
// routes, and the React cards. Keep them JSON-serialisable — Mastra streams
// the parsed output straight into the chat part.

import { SymbolSchema, TimeframeSchema } from '@kestrel/shared';
import { z } from 'zod';

export const MAX_SOURCE_CHARS = 100_000;

export const TradeSideSchema = z.enum(['long', 'short']);
export const ExitReasonSchema = z.enum([
  'stop_loss',
  'take_profit',
  'trailing_stop',
  'max_bars',
  'end_of_data',
  'manual',
]);

export const BacktestTradeSchema = z.object({
  id: z.number().int(),
  side: TradeSideSchema,
  entryType: z.enum(['market', 'limit']),
  entryTime: z.number(),
  exitTime: z.number(),
  entryPrice: z.number(),
  exitPrice: z.number(),
  stop: z.number(),
  target: z.number().nullable(),
  quantity: z.number(),
  riskAmount: z.number(),
  pnl: z.number(),
  fees: z.number(),
  rMultiple: z.number(),
  barsHeld: z.number().int(),
  exitReason: ExitReasonSchema,
  mfe: z.number(),
  mae: z.number(),
  reason: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const EquityPointSchema = z.object({
  t: z.number(),
  equity: z.number(),
  drawdown: z.number(),
  drawdownPct: z.number(),
});

export const BacktestMetricsSchema = z.object({
  trades: z.number().int(),
  wins: z.number().int(),
  losses: z.number().int(),
  breakeven: z.number().int(),
  winRate: z.number(),
  profitFactor: z.number(),
  netPnl: z.number(),
  returnPct: z.number(),
  grossProfit: z.number(),
  grossLoss: z.number(),
  feesPaid: z.number(),
  expectancy: z.number(),
  expectancyR: z.number(),
  averageR: z.number(),
  averageWinR: z.number(),
  averageLossR: z.number(),
  totalR: z.number(),
  largestWin: z.number(),
  largestLoss: z.number(),
  maxDrawdown: z.number(),
  maxDrawdownPct: z.number(),
  maxDrawdownBars: z.number().int(),
  sharpeRatio: z.number(),
  sortinoRatio: z.number(),
  averageBarsHeld: z.number(),
  exposurePct: z.number(),
  longTrades: z.number().int(),
  shortTrades: z.number().int(),
  longWinRate: z.number(),
  shortWinRate: z.number(),
  consecutiveWins: z.number().int(),
  consecutiveLosses: z.number().int(),
  bestTradeR: z.number(),
  worstTradeR: z.number(),
  finalEquity: z.number(),
});

export const RejectedSignalSchema = z.object({
  signalIndex: z.number().int(),
  signalTime: z.number(),
  reason: z.string(),
});

/** Params are passed verbatim to `ctx.params`; they must survive JSON. */
export const StrategyParamsSchema = z.record(z.string(), z.unknown());

export const RunBacktestInputSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    symbol: SymbolSchema,
    timeframe: TimeframeSchema,
    /** Full strategy source. Required unless `strategyId` is supplied. */
    source: z.string().min(20).max(MAX_SOURCE_CHARS).optional(),
    /** Saved strategy id or slug. */
    strategyId: z.string().min(1).max(120).optional(),
    params: StrategyParamsSchema.optional(),
    /** Number of closed bars to request (newest-first window). */
    count: z.coerce.number().int().min(60).max(5000).default(1000),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    initialBalance: z.coerce.number().min(100).max(100_000_000).default(10_000),
    riskPct: z.coerce.number().min(0.01).max(10).default(1),
    spread: z.coerce.number().min(0).max(10_000).optional(),
    slippage: z.coerce.number().min(0).max(10_000).optional(),
    commissionPerUnit: z.coerce.number().min(0).max(10_000).optional(),
    leverage: z.coerce.number().min(1).max(500).optional(),
    allowShort: z.boolean().optional(),
    maxBarsInTrade: z.coerce.number().int().min(1).max(10_000).optional(),
    /** Persist the run to the library/history. Defaults to true. */
    persist: z.boolean().optional(),
  })
  .refine((value) => Boolean(value.source) || Boolean(value.strategyId), {
    message: 'Provide `source` or `strategyId`.',
  });

export type RunBacktestInput = z.infer<typeof RunBacktestInputSchema>;

export const RunResultSchema = z.object({
  runId: z.string(),
  name: z.string(),
  symbol: z.string(),
  timeframe: z.string(),
  status: z.enum(['completed', 'failed']),
  bars: z.number().int(),
  from: z.number(),
  to: z.number(),
  initialBalance: z.number(),
  finalEquity: z.number(),
  metrics: BacktestMetricsSchema,
  trades: z.array(BacktestTradeSchema),
  equityCurve: z.array(EquityPointSchema),
  rejectedSignals: z.array(RejectedSignalSchema),
  warnings: z.array(z.string()),
  logs: z.array(z.string()),
  durationMs: z.number().int(),
  truncated: z.boolean(),
  error: z.string().nullable(),
});

export type RunResult = z.infer<typeof RunResultSchema>;

export const RunSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  symbol: z.string(),
  timeframe: z.string(),
  status: z.enum(['completed', 'failed']),
  createdAt: z.string(),
  bars: z.number().int(),
  metrics: z.object({
    trades: z.number().int(),
    winRate: z.number(),
    netPnl: z.number(),
    returnPct: z.number(),
    maxDrawdownPct: z.number(),
    profitFactor: z.number(),
    expectancyR: z.number(),
  }),
});

export type RunSummary = z.infer<typeof RunSummarySchema>;

export const ListRunsInputSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  symbol: SymbolSchema.optional(),
});

export const ListRunsOutputSchema = z.object({
  runs: z.array(RunSummarySchema),
  totalReturned: z.number().int(),
});

export const GetRunInputSchema = z.object({
  runId: z.string().min(1),
  /** Cap the number of trades/equity points returned. */
  maxTrades: z.coerce.number().int().min(1).max(1000).default(200),
  maxEquityPoints: z.coerce.number().int().min(20).max(2000).default(500),
});

export const RunDetailSchema = RunResultSchema.extend({
  source: z.string(),
  params: StrategyParamsSchema,
  engineVersion: z.string(),
});

export type RunDetail = z.infer<typeof RunDetailSchema>;

// ── Async queue payloads ─────────────────────────────────────────────────

export const AsyncRunOutputSchema = z.object({
  jobId: z.string(),
  message: z.string(),
});

export const RunJobStatusOutputSchema = z.object({
  jobId: z.string(),
  /** pg-boss job state. */
  state: z.enum(['created', 'retry', 'active', 'completed', 'cancelled', 'failed']),
  runId: z.string().nullable(),
  error: z.string().nullable(),
  message: z.string(),
});

export type RunJobStatus = z.infer<typeof RunJobStatusOutputSchema>;

// ── API-only payloads ────────────────────────────────────────────────────

export const DeleteRunInputSchema = z.object({ runId: z.string().min(1) });
