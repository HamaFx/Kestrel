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

// Tool/API schemas for the Paper Trading broker — deployed strategy runs.

import { SymbolSchema, TimeframeSchema } from '@kestrel/shared';
import { z } from 'zod';

export const DeployStrategyRunInputSchema = z.object({
  name: z.string().min(1).max(120),
  strategyId: z.string().max(120).optional(),
  symbol: SymbolSchema,
  timeframe: TimeframeSchema,
  source: z.string().min(20).max(100_000),
  params: z.record(z.string(), z.unknown()).default({}),
  riskPct: z.number().min(0.01).max(20).default(1),
  /** Deployed strategies always run in the autonomous sandbox. */
  account: z.literal('sandbox').default('sandbox'),
});

export type DeployStrategyRunInput = z.infer<typeof DeployStrategyRunInputSchema>;

export const StrategyRunStatusSchema = z.enum(['active', 'paused', 'stopped', 'error']);

export const StrategyRunSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  name: z.string(),
  strategyId: z.string().nullable(),
  symbol: z.string(),
  timeframe: z.string(),
  riskPct: z.number(),
  status: StrategyRunStatusSchema,
  lastBarTime: z.string().nullable(),
  lastSignal: z.enum(['long', 'short']).nullable(),
  lastSignalAt: z.string().nullable(),
  positionId: z.string().nullable(),
  signalCount: z.number().int(),
  orderCount: z.number().int(),
  lastError: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type StrategyRunView = z.infer<typeof StrategyRunSchema>;

export const ListStrategyRunsOutputSchema = z.object({
  runs: z.array(StrategyRunSchema),
  count: z.number().int(),
});

export const UpdateStrategyRunInputSchema = z.object({
  action: z.enum(['pause', 'resume', 'stop']),
});

export const DeployStrategyRunOutputSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  run: StrategyRunSchema,
});
