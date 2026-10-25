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

// Tool/API schemas for the Backtesting Lab.
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

export const SaveStrategyInputSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
    .optional(),
  description: z.string().max(1000).optional(),
  source: z.string().min(20).max(MAX_SOURCE_CHARS),
  params: StrategyParamsSchema.optional(),
  tags: z.array(z.string().min(1).max(32)).max(12).optional(),
  favorite: z.boolean().optional(),
});

export type SaveStrategyInput = z.infer<typeof SaveStrategyInputSchema>;

export const StrategySummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  favorite: z.boolean(),
  updatedAt: z.string(),
});

export const SaveStrategyOutputSchema = z.object({
  ok: z.boolean(),
  strategy: StrategySummarySchema,
  message: z.string(),
});

export const ListStrategiesInputSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const ListStrategiesOutputSchema = z.object({
  strategies: z.array(StrategySummarySchema),
});

export const ReadStrategyInputSchema = z.object({
  strategyId: z.string().min(1),
});

export const ReadStrategyOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  source: z.string(),
  params: StrategyParamsSchema,
  tags: z.array(z.string()),
});

export const DeleteStrategyInputSchema = z.object({
  strategyId: z.string().min(1),
});

export const OkOutputSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
});

// ── User knowledge base (plugin_storage backed) ──────────────────────────

export const KnowledgeKeySchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'Use a kebab-case key (a-z, 0-9, -).');

export const KnowledgeListInputSchema = z.object({});

export const KnowledgeDocumentSummarySchema = z.object({
  key: z.string(),
  title: z.string(),
  tags: z.array(z.string()),
  updatedAt: z.string(),
  chars: z.number().int(),
});

export const KnowledgeListOutputSchema = z.object({
  documents: z.array(KnowledgeDocumentSummarySchema),
});

export type KnowledgeDocumentSummary = z.infer<typeof KnowledgeDocumentSummarySchema>;

export const KnowledgeReadInputSchema = z.object({
  key: KnowledgeKeySchema,
});

export const KnowledgeReadOutputSchema = z.object({
  key: z.string(),
  title: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
  updatedAt: z.string(),
});

export type KnowledgeReadOutput = z.infer<typeof KnowledgeReadOutputSchema>;

export const KnowledgeSaveInputSchema = z.object({
  key: KnowledgeKeySchema.optional(),
  title: z.string().min(1).max(160),
  content: z.string().min(20).max(60_000),
  tags: z.array(z.string().min(1).max(32)).max(12).optional(),
});

export type KnowledgeSaveInput = z.infer<typeof KnowledgeSaveInputSchema>;

export const KnowledgeSaveOutputSchema = z.object({
  ok: z.boolean(),
  key: z.string(),
  title: z.string(),
  message: z.string(),
});

export const KnowledgeDeleteInputSchema = z.object({
  key: KnowledgeKeySchema,
});

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

// ── Parameter sweeps ─────────────────────────────────────────────────────

export const SweepObjectiveSchema = z.enum([
  'profitFactor',
  'netPnl',
  'returnPct',
  'sharpeRatio',
  'expectancyR',
  'maxDrawdownPct',
]);

export type SweepObjective = z.infer<typeof SweepObjectiveSchema>;

export const ParameterSpaceEntrySchema = z.object({
  name: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[A-Za-z_][A-Za-z0-9_.-]*$/, 'Parameter names must be identifiers.'),
  values: z
    .array(z.union([z.string().max(120), z.number(), z.boolean()]))
    .min(1)
    .max(10),
});

export type ParameterSpaceEntry = z.infer<typeof ParameterSpaceEntrySchema>;

export const SweepInputSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    strategyId: z.string().min(1).max(120).optional(),
    source: z.string().min(20).max(MAX_SOURCE_CHARS).optional(),
    symbol: SymbolSchema,
    timeframe: TimeframeSchema,
    baseParams: StrategyParamsSchema.optional(),
    parameterSpace: z.array(ParameterSpaceEntrySchema).min(1).max(6),
    objective: SweepObjectiveSchema.default('expectancyR'),
    minTrades: z.coerce.number().int().min(1).max(1000).default(5),
    maxCombinations: z.coerce.number().int().min(1).max(200).default(50),
    count: z.coerce.number().int().min(60).max(5000).default(1000),
    initialBalance: z.coerce.number().min(100).max(100_000_000).default(10_000),
    riskPct: z.coerce.number().min(0.01).max(10).default(1),
    /** Persist synthetic runs during the sweep. Default false (sweep only). */
    persistRuns: z.boolean().default(false),
  })
  .refine((value) => Boolean(value.strategyId) || Boolean(value.source), {
    message: 'Provide `strategyId` or `source`.',
  });

export type SweepInput = z.infer<typeof SweepInputSchema>;

export const SweepMetricsSchema = z.object({
  trades: z.number().int(),
  winRate: z.number(),
  netPnl: z.number(),
  returnPct: z.number(),
  maxDrawdownPct: z.number(),
  profitFactor: z.number(),
  sharpeRatio: z.number(),
  expectancyR: z.number(),
});

export const SweepResultSchema = z.object({
  params: StrategyParamsSchema,
  score: z.number().nullable(),
  metrics: SweepMetricsSchema.nullable(),
  error: z.string().nullable(),
});

export const SweepSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  symbol: z.string(),
  timeframe: z.string(),
  objective: SweepObjectiveSchema,
  status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']),
  total: z.number().int(),
  completed: z.number().int(),
  bestScore: z.number().nullable(),
  bestParams: StrategyParamsSchema.nullable(),
  bestMetrics: SweepMetricsSchema.nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SweepSummary = z.infer<typeof SweepSummarySchema>;

export const SweepDetailSchema = SweepSummarySchema.extend({
  strategyId: z.string().nullable(),
  source: z.string(),
  baseParams: StrategyParamsSchema,
  parameterSpace: z.array(ParameterSpaceEntrySchema),
  count: z.number().int(),
  initialBalance: z.number(),
  riskPct: z.number(),
  minTrades: z.number().int(),
  persistRuns: z.boolean(),
  results: z.array(SweepResultSchema),
});

export type SweepDetail = z.infer<typeof SweepDetailSchema>;

export const ListSweepsOutputSchema = z.object({
  sweeps: z.array(SweepSummarySchema),
  totalReturned: z.number().int(),
});

export const CreateSweepOutputSchema = z.object({
  sweep: SweepDetailSchema,
  jobId: z.string().nullable(),
  message: z.string(),
});

export const SweepQueueJobSchema = z.object({
  userId: z.string().min(1),
  tenantId: z.string().min(1),
  sweepId: z.string().uuid(),
  settings: z.record(z.string(), z.unknown()),
});

export type SweepQueueJob = z.infer<typeof SweepQueueJobSchema>;

// ── API-only payloads ────────────────────────────────────────────────────

export const DeleteRunInputSchema = z.object({ runId: z.string().min(1) });

export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}
