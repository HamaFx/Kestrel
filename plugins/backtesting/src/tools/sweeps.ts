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

// Parameter-sweep tool.

import type { PluginToolRegistration } from '@kestrel/plugin-sdk';
import type { z } from 'zod';

import { SweepDetailSchema, SweepInputSchema } from '../schemas';
import { getSweepDetail, runSweepForUser } from '../services/sweep-service';

const sweepTool: PluginToolRegistration<
  z.infer<typeof SweepInputSchema>,
  z.infer<typeof SweepDetailSchema>
> = {
  name: 'backtest_sweep_strategy',
  description:
    'Run a small parameter sweep over a saved strategy or inline source. Provide a parameterSpace of at most 6 parameters (each with up to 10 values) and an objective (expectancyR, profitFactor, netPnl, returnPct, sharpeRatio or maxDrawdownPct). The tool caps at 30 combinations in-chat; use the Sweeps tab for larger grids. Returns the ranked combinations and the best parameter set that met minTrades.',
  inputSchema: SweepInputSchema,
  outputSchema: SweepDetailSchema,
  access: 'read-only',
  attachTo: ['canonical-chat', 'technical'],
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

export const sweepTools: readonly PluginToolRegistration[] = [sweepTool];
