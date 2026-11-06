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

// Saved-strategy library routes.

import { PluginRouteApiError, type PluginApiRouteHandler } from '@kestrel/plugin-sdk';

import { SaveStrategyInputSchema } from '../../schemas';
import {
  deleteStrategyForUser,
  getStrategyForUser,
  listStrategyViews,
  saveStrategyForUser,
  strategyDetailView,
  strategySummaryView,
} from '../../services/strategies';
import { byMethod, json, parseBody, queryNumber, wrap } from './shared';

// ── Strategies ───────────────────────────────────────────────────────────

const listStrategies = wrap(async (ctx) => {
  const limit = Math.min(50, Math.max(1, queryNumber(ctx.request, 'limit', 50)));
  return json({ strategies: await listStrategyViews(ctx.userId, { limit }) });
});

const saveStrategy = wrap(
  async (ctx) => {
    const input = await parseBody(ctx.request, SaveStrategyInputSchema);
    const row = await saveStrategyForUser(ctx.userId, input);
    return json({ strategy: strategySummaryView(row) });
  },
  { userErrorStatus: 400 },
);

const getStrategy = wrap(async (ctx) => {
  const row = await getStrategyForUser(ctx.userId, ctx.params['strategyId'] ?? '');
  return json({ strategy: strategyDetailView(row) });
});

const removeStrategy = wrap(async (ctx) => {
  const deleted = await deleteStrategyForUser(ctx.userId, ctx.params['strategyId'] ?? '');
  if (!deleted) {
    throw new PluginRouteApiError(404, 'Strategy not found.', 'STRATEGY_NOT_FOUND');
  }
  return json({ ok: true });
});

export const strategyRoutes: Readonly<Record<string, PluginApiRouteHandler>> = {
  '/strategies': byMethod({ GET: listStrategies, POST: saveStrategy }),
  '/strategies/:strategyId': byMethod({ GET: getStrategy, DELETE: removeStrategy }),
};
