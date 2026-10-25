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

// Authenticated Paper Trading HTTP routes — strategy-run handlers.
//
// Mounted at /api/plugins/paper-trading/<path> by the core plugin dispatcher.

import { DeployStrategyRunInputSchema, UpdateStrategyRunInputSchema } from '../../schemas';
import {
  deleteStrategyRunForUser,
  deployStrategyRunForUser,
  listStrategyRunViews,
  setStrategyRunStatus,
} from '../../services/strategy-runs';
import { normaliseSettings } from '../../settings';
import { ApiError, json, parseBody, wrap } from './shared';

export const listStrategyRuns = wrap(async (ctx) => {
  const runs = await listStrategyRunViews(ctx.userId);
  return json({ runs, count: runs.length });
});

export const deployStrategyRun = wrap(async (ctx) => {
  const settings = normaliseSettings(ctx.settings);
  const input = await parseBody(ctx.request, DeployStrategyRunInputSchema);
  const run = await deployStrategyRunForUser({ userId: ctx.userId, input, settings });
  return json(
    {
      ok: true,
      message: `Deployed ${run.name} to the AI Agent Sandbox. It will evaluate on each new ${run.timeframe} bar.`,
      run,
    },
    201,
  );
}, 400);

export const updateStrategyRun = wrap(async (ctx) => {
  const strategyRunId = ctx.params['strategyRunId'];
  if (!strategyRunId) {
    throw new ApiError(400, 'A strategy run id is required.', 'MISSING_STRATEGY_RUN_ID');
  }
  const body = await parseBody(ctx.request, UpdateStrategyRunInputSchema);
  const run = await setStrategyRunStatus(ctx.userId, strategyRunId, body.action);
  if (!run) throw new ApiError(404, 'Strategy run not found.', 'STRATEGY_RUN_NOT_FOUND');
  return json({ ok: true, message: `Strategy ${body.action}d.`, run });
}, 400);

export const deleteStrategyRun = wrap(async (ctx) => {
  const strategyRunId = ctx.params['strategyRunId'];
  if (!strategyRunId) {
    throw new ApiError(400, 'A strategy run id is required.', 'MISSING_STRATEGY_RUN_ID');
  }
  const deleted = await deleteStrategyRunForUser(ctx.userId, strategyRunId);
  if (!deleted) throw new ApiError(404, 'Strategy run not found.', 'STRATEGY_RUN_NOT_FOUND');
  return json({ ok: true, message: 'Strategy deployment deleted.' });
});
