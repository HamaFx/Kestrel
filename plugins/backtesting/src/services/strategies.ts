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

// Saved-strategy application service shared by the HTTP routes and agent tools.

import { PluginRouteApiError } from '@kestrel/plugin-sdk';

import {
  deleteBacktestStrategy,
  getBacktestStrategy,
  listBacktestStrategies,
  upsertBacktestStrategy,
} from '../db/queries';
import type { BacktestStrategyRow } from '@kestrel/db';
import { slugifyName, type SaveStrategyInput } from '../schemas';

export interface StrategySummaryView {
  id: string;
  name: string;
  slug: string;
  description: string;
  tags: string[];
  favorite: boolean;
  updatedAt: string;
}

export interface StrategyDetailView extends StrategySummaryView {
  source: string;
  params: Record<string, unknown>;
}

export function strategySummaryView(row: BacktestStrategyRow): StrategySummaryView {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    tags: row.tags,
    favorite: row.favorite,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function strategyDetailView(row: BacktestStrategyRow): StrategyDetailView {
  return {
    ...strategySummaryView(row),
    source: row.source,
    params: row.params,
  };
}

export async function listStrategyViews(
  userId: string,
  opts: { limit: number },
): Promise<StrategySummaryView[]> {
  const rows = await listBacktestStrategies(userId, opts);
  return rows.map(strategySummaryView);
}

export async function saveStrategyForUser(
  userId: string,
  input: SaveStrategyInput,
): Promise<BacktestStrategyRow> {
  const slug = input.slug ?? slugifyName(input.name);
  if (!slug) {
    throw new PluginRouteApiError(400, 'Could not derive a slug from the name.', 'INVALID_SLUG');
  }
  return upsertBacktestStrategy({
    userId,
    name: input.name,
    slug,
    description: input.description ?? '',
    source: input.source,
    params: input.params ?? {},
    tags: input.tags ?? [],
    ...(input.favorite !== undefined ? { favorite: input.favorite } : {}),
  });
}

export async function getStrategyForUser(
  userId: string,
  strategyId: string,
): Promise<BacktestStrategyRow> {
  if (!strategyId) {
    throw new PluginRouteApiError(400, 'A strategy id is required.', 'MISSING_STRATEGY_ID');
  }
  const row = await getBacktestStrategy(userId, strategyId);
  if (!row) {
    throw new PluginRouteApiError(404, 'Strategy not found.', 'STRATEGY_NOT_FOUND');
  }
  return row;
}

export async function deleteStrategyForUser(userId: string, strategyId: string): Promise<boolean> {
  if (!strategyId) {
    throw new PluginRouteApiError(400, 'A strategy id is required.', 'MISSING_STRATEGY_ID');
  }
  return deleteBacktestStrategy(userId, strategyId);
}
