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

import type { PluginApiRouteHandler } from '@kestrel/plugin-sdk';

import {
  deleteBacktestStrategy,
  getBacktestStrategy,
  listBacktestStrategies,
  upsertBacktestStrategy,
} from '../../db/queries';
import { SaveStrategyInputSchema, slugifyName } from '../../schemas';
import { ApiError, byMethod, json, parseBody, queryNumber, wrap } from './shared';

// ── Strategies ───────────────────────────────────────────────────────────

const listStrategies = wrap(async (ctx) => {
  const limit = Math.min(50, Math.max(1, queryNumber(ctx.request, 'limit', 50)));
  const rows = await listBacktestStrategies(ctx.userId, { limit });
  return json({
    strategies: rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      tags: row.tags,
      favorite: row.favorite,
      updatedAt: row.updatedAt.toISOString(),
    })),
  });
});

const saveStrategy = wrap(
  async (ctx) => {
    const input = await parseBody(ctx.request, SaveStrategyInputSchema);
    const slug = input.slug ?? slugifyName(input.name);
    if (!slug) throw new ApiError(400, 'Could not derive a slug from the name.', 'INVALID_SLUG');
    const row = await upsertBacktestStrategy({
      userId: ctx.userId,
      name: input.name,
      slug,
      description: input.description ?? '',
      source: input.source,
      params: input.params ?? {},
      tags: input.tags ?? [],
      ...(input.favorite !== undefined ? { favorite: input.favorite } : {}),
    });
    return json({
      strategy: {
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        tags: row.tags,
        favorite: row.favorite,
        updatedAt: row.updatedAt.toISOString(),
      },
    });
  },
  { userErrorStatus: 400 },
);

const getStrategy = wrap(async (ctx) => {
  const strategyId = ctx.params['strategyId'];
  if (!strategyId) throw new ApiError(400, 'A strategy id is required.', 'MISSING_STRATEGY_ID');
  const row = await getBacktestStrategy(ctx.userId, strategyId);
  if (!row) throw new ApiError(404, 'Strategy not found.', 'STRATEGY_NOT_FOUND');
  return json({
    strategy: {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      source: row.source,
      params: row.params,
      tags: row.tags,
      favorite: row.favorite,
      updatedAt: row.updatedAt.toISOString(),
    },
  });
});

const removeStrategy = wrap(async (ctx) => {
  const strategyId = ctx.params['strategyId'];
  if (!strategyId) throw new ApiError(400, 'A strategy id is required.', 'MISSING_STRATEGY_ID');
  const deleted = await deleteBacktestStrategy(ctx.userId, strategyId);
  if (!deleted) throw new ApiError(404, 'Strategy not found.', 'STRATEGY_NOT_FOUND');
  return json({ ok: true });
});

export const strategyRoutes: Readonly<Record<string, PluginApiRouteHandler>> = {
  '/strategies': byMethod({ GET: listStrategies, POST: saveStrategy }),
  '/strategies/:strategyId': byMethod({ GET: getStrategy, DELETE: removeStrategy }),
};
