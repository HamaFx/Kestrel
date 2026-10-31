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
// so they never block on approval. Pausing/stopping a deployed strategy is
// risk-reducing too; resuming (new risk) and deleting (data loss) confirm.

import type { PluginToolRegistration } from '@kestrel/plugin-sdk';
import type { z } from 'zod';

import {
  ControlStrategyRunInputSchema,
  ControlStrategyRunOutputSchema,
  DeployStrategyRunInputSchema,
  DeployStrategyRunOutputSchema,
  GetAccountsInputSchema,
  ListStrategyRunsOutputSchema,
} from '../schemas';
import {
  deleteStrategyRunForUser,
  deployStrategyRunForUser,
  listStrategyRunViews,
  setStrategyRunStatus,
} from '../services/strategy-runs';
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
    'Deploy an agent-authored or saved backtest strategy to the autonomous AI Agent Sandbox.',
    'Pass the strategy source and params directly, or pass strategyId with a saved strategy slug/id (also pass symbol and timeframe) or a completed backtest runId — the server resolves source, params and metadata, so the source never has to be re-emitted.',
    'The runner evaluates getSignal(ctx) on every new closed bar and places virtual orders with the signal stop/target, limit entry, trailing stop, breakeven and maxBars rules; it never places a real trade.',
    'Use paper_list_strategy_runs to check status, and paper_control_strategy_run to pause, resume, stop or delete the deployment.',
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

export const controlStrategyRunTool: PluginToolRegistration<
  z.infer<typeof ControlStrategyRunInputSchema>,
  z.infer<typeof ControlStrategyRunOutputSchema>
> = {
  name: 'paper_control_strategy_run',
  description: [
    'Pause, resume, stop, or delete a deployed paper strategy run by id.',
    'Pause and stop are risk-reducing and run without an approval card; resume re-enables autonomous entries and delete removes the deployment, so both require confirmation.',
    'Use paper_list_strategy_runs to find the strategyRunId.',
  ].join(' '),
  inputSchema: ControlStrategyRunInputSchema,
  outputSchema: ControlStrategyRunOutputSchema,
  access: 'write',
  requiresConfirmation: (input) => input.action === 'resume' || input.action === 'delete',
  attachTo: ['canonical-chat', 'technical'],
  execute: async (input, ctx) => {
    if (input.action === 'delete') {
      const deleted = await deleteStrategyRunForUser(ctx.userId, input.strategyRunId);
      if (!deleted) throw new Error(`Strategy run "${input.strategyRunId}" was not found.`);
      return {
        ok: true,
        message: 'Strategy run deleted.',
        action: 'delete' as const,
        run: null,
      };
    }
    const run = await setStrategyRunStatus(ctx.userId, input.strategyRunId, input.action);
    if (!run) throw new Error(`Strategy run "${input.strategyRunId}" was not found.`);
    const verb =
      input.action === 'pause' ? 'paused' : input.action === 'resume' ? 'resumed' : 'stopped';
    return { ok: true, message: `Strategy run ${verb}.`, action: input.action, run };
  },
};
