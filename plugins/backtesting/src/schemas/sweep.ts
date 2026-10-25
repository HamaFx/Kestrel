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

// Tool/API schemas for the Backtesting Lab — parameter sweeps.

import { SymbolSchema, TimeframeSchema } from '@kestrel/shared';
import { z } from 'zod';

import { MAX_SOURCE_CHARS, StrategyParamsSchema } from './run';

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
