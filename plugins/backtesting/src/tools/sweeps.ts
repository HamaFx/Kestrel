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

// Parameter-sweep tools.
//
// Execution (`backtest_sweep_strategy`) is a heavy sandbox run and is scoped
// to canonical-chat. Lookup/inspection tools are read-only and also reachable
// from the committee specialist desks.

import type { PluginToolRegistration } from '@kestrel/plugin-sdk';
import type { z } from 'zod';

import {
  GetSweepInputSchema,
  ListSweepsInputSchema,
  ListSweepsOutputSchema,
  SweepDetailSchema,
  SweepInputSchema,
} from '../schemas';
import { getSweepDetail, listSweepViews, runSweepForUser } from '../services/sweep-service';

const sweepTool: PluginToolRegistration<
  z.infer<typeof SweepInputSchema>,
  z.infer<typeof SweepDetailSchema>
> = {
  name: 'backtest_sweep_strategy',
  description:
    'Run a small parameter sweep over a saved strategy or inline source. Provide a parameterSpace of at most 6 parameters (each with up to 10 values) and an objective (expectancyR, profitFactor, netPnl, returnPct, sharpeRatio or maxDrawdownPct). The tool caps at 30 combinations in-chat; use the Sweeps tab for larger grids. Returns the ranked combinations and the best parameter set that met minTrades. Heavy sandbox execution is available in canonical-chat.',
  inputSchema: SweepInputSchema,
  outputSchema: SweepDetailSchema,
  access: 'read-only',
  attachTo: ['canonical-chat'],
  execute: async (input, ctx) => {
    const parsed = SweepInputSchema.parse({
      ...input,
      maxCombinations: Math.min(input.maxCombinations, 30),
    });
    const row = await runSweepForUser({
      userId: ctx.userId,
      input: parsed,
      settings: ctx.settings,
      ...(ctx.signal ? { signal: ctx.signal } : {}),
    });
    const detail = await getSweepDetail(ctx.userId, row.id);
    if (!detail) throw new Error('Sweep result disappeared before it could be read.');
    return detail;
  },
};

const listSweepsTool: PluginToolRegistration<
  z.infer<typeof ListSweepsInputSchema>,
  z.infer<typeof ListSweepsOutputSchema>
> = {
  name: 'backtest_list_sweeps',
  description:
    'List recent parameter sweeps with objective, status, progress, and the best score / params / metrics. Use it before referencing a sweep id or when the user asks "what sweeps have I run?".',
  inputSchema: ListSweepsInputSchema,
  outputSchema: ListSweepsOutputSchema,
  access: 'read-only',
  attachTo: ['canonical-chat', 'technical', 'risk'],
  execute: async (input, ctx) => {
    const sweeps = await listSweepViews(ctx.userId, input.limit);
    return { sweeps, totalReturned: sweeps.length };
  },
};

const getSweepTool: PluginToolRegistration<
  z.infer<typeof GetSweepInputSchema>,
  z.infer<typeof SweepDetailSchema>
> = {
  name: 'backtest_get_sweep',
  description:
    'Fetch a saved parameter sweep by id: parameter space, the ranked combinations with scores, the best parameter set and metrics, and the out-of-sample (`oosMetrics`) result when the sweep used a walk-forward `trainRatio` split.',
  inputSchema: GetSweepInputSchema,
  outputSchema: SweepDetailSchema,
  access: 'read-only',
  attachTo: ['canonical-chat', 'technical', 'risk'],
  execute: async (input, ctx) => {
    const detail = await getSweepDetail(ctx.userId, input.sweepId);
    if (!detail) throw new Error(`Parameter sweep "${input.sweepId}" was not found.`);
    return detail;
  },
};

export const sweepTools: readonly PluginToolRegistration[] = [
  sweepTool,
  listSweepsTool,
  getSweepTool,
];
