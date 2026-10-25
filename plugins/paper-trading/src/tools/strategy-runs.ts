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

// Paper Trading deployed-strategy tools.
//
// Confirmation policy (D-02):
//   * Personal Demo (mode 'confirm') — order placement and risk changes need
//     the Mastra approval card before execution.
//   * AI Agent Sandbox (mode 'autonomous_sandbox') — agents may place, trail
//     and close trades without approval.
// Closing a position and cancelling a pending order are always risk-reducing,
// so they never block on approval.

import type { PluginToolRegistration } from '@kestrel/plugin-sdk';
import type { z } from 'zod';

import {
  DeployStrategyRunInputSchema,
  DeployStrategyRunOutputSchema,
  GetAccountsInputSchema,
  ListStrategyRunsOutputSchema,
} from '../schemas';
import { deployStrategyRunForUser, listStrategyRunViews } from '../services/strategy-runs';
import { normaliseSettings } from '../settings';

export const listStrategyRunsTool: PluginToolRegistration<
  z.infer<typeof GetAccountsInputSchema>,
  z.infer<typeof ListStrategyRunsOutputSchema>
> = {
  name: 'paper_list_strategy_runs',
  description:
    'List the user’s deployed backtest strategies in the AI Agent Sandbox with status, last signal, bar time and order counts.',
  inputSchema: GetAccountsInputSchema,
  outputSchema: ListStrategyRunsOutputSchema,
  access: 'read-only',
  attachTo: ['canonical-chat', 'technical', 'risk'],
  execute: async (_input, ctx) => {
    const runs = await listStrategyRunViews(ctx.userId);
    return { runs, count: runs.length };
  },
};

export const deployStrategyTool: PluginToolRegistration<
  z.infer<typeof DeployStrategyRunInputSchema>,
  z.infer<typeof DeployStrategyRunOutputSchema>
> = {
  name: 'paper_deploy_strategy',
  description: [
    'Deploy an exact agent-authored or saved backtest strategy to the autonomous AI Agent Sandbox.',
    'Provide the strategy source and params (snapshot at deploy time), symbol, timeframe and a name.',
    'The runner evaluates getSignal(ctx) on every new closed bar and places virtual market orders with the signal stop/target; it never places a real trade.',
    'Use paper_list_strategy_runs to check status, and the Paper Trading page to pause, resume or stop.',
  ].join(' '),
  inputSchema: DeployStrategyRunInputSchema,
  outputSchema: DeployStrategyRunOutputSchema,
  access: 'write',
  requiresConfirmation: true,
  attachTo: ['canonical-chat', 'technical'],
  execute: async (input, ctx) => {
    const settings = normaliseSettings(ctx.settings);
    const run = await deployStrategyRunForUser({ userId: ctx.userId, input, settings });
    return {
      ok: true,
      message: `Deployed ${run.name} to the AI Agent Sandbox.`,
      run,
    };
  },
};
