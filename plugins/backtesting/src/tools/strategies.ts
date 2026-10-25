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

// Saved-strategy library tools.

import type { PluginToolRegistration } from '@kestrel/plugin-sdk';
import type { z } from 'zod';

import {
  deleteBacktestStrategy,
  getBacktestStrategy,
  listBacktestStrategies,
  upsertBacktestStrategy,
} from '../db/queries';
import {
  DeleteStrategyInputSchema,
  ListStrategiesInputSchema,
  ListStrategiesOutputSchema,
  OkOutputSchema,
  ReadStrategyInputSchema,
  ReadStrategyOutputSchema,
  SaveStrategyInputSchema,
  SaveStrategyOutputSchema,
  slugifyName,
} from '../schemas';
import { strategySummary } from './shared';

const saveStrategyTool: PluginToolRegistration<
  z.infer<typeof SaveStrategyInputSchema>,
  z.infer<typeof SaveStrategyOutputSchema>
> = {
  name: 'backtest_save_strategy',
  description:
    'Save (or update) a strategy in the user’s Backtesting Lab library so it can be reused by name/slug in later runs. Saving is idempotent per slug: sending the same slug updates the source and params instead of creating a duplicate.',
  inputSchema: SaveStrategyInputSchema,
  outputSchema: SaveStrategyOutputSchema,
  access: 'write',
  requiresConfirmation: false,
  attachTo: ['canonical-chat', 'technical'],
  execute: async (input, ctx) => {
    const slug = input.slug ?? slugifyName(input.name);
    if (!slug) throw new Error('Could not derive a slug from the strategy name.');
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
    return {
      ok: true,
      strategy: strategySummary(row),
      message: `Saved strategy "${row.name}" as ${row.slug}.`,
    };
  },
};

const listStrategiesTool: PluginToolRegistration<
  z.infer<typeof ListStrategiesInputSchema>,
  z.infer<typeof ListStrategiesOutputSchema>
> = {
  name: 'backtest_list_strategies',
  description:
    'List strategies saved in the user’s Backtesting Lab library. Use the returned slug with backtest_run_strategy({ strategyId }) or backtest_read_strategy to inspect its source.',
  inputSchema: ListStrategiesInputSchema,
  outputSchema: ListStrategiesOutputSchema,
  access: 'read-only',
  attachTo: ['canonical-chat', 'technical'],
  execute: async (input, ctx) => {
    const rows = await listBacktestStrategies(ctx.userId, { limit: input.limit });
    return { strategies: rows.map(strategySummary) };
  },
};

const readStrategyTool: PluginToolRegistration<
  z.infer<typeof ReadStrategyInputSchema>,
  z.infer<typeof ReadStrategyOutputSchema>
> = {
  name: 'backtest_read_strategy',
  description:
    'Read a saved strategy’s exact JavaScript source and default params by id or slug, so you can review, explain or fork it.',
  inputSchema: ReadStrategyInputSchema,
  outputSchema: ReadStrategyOutputSchema,
  access: 'read-only',
  attachTo: ['canonical-chat', 'technical'],
  execute: async (input, ctx) => {
    const row = await getBacktestStrategy(ctx.userId, input.strategyId);
    if (!row) throw new Error(`Saved strategy "${input.strategyId}" was not found.`);
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      source: row.source,
      params: row.params,
      tags: row.tags,
    };
  },
};

const deleteStrategyTool: PluginToolRegistration<
  z.infer<typeof DeleteStrategyInputSchema>,
  z.infer<typeof OkOutputSchema>
> = {
  name: 'backtest_delete_strategy',
  description: 'Delete a strategy from the user’s Backtesting Lab library by id or slug.',
  inputSchema: DeleteStrategyInputSchema,
  outputSchema: OkOutputSchema,
  access: 'write',
  requiresConfirmation: false,
  attachTo: ['canonical-chat'],
  execute: async (input, ctx) => {
    const deleted = await deleteBacktestStrategy(ctx.userId, input.strategyId);
    return {
      ok: deleted,
      message: deleted ? 'Strategy deleted.' : 'No such strategy was found.',
    };
  },
};

export const strategyTools: readonly PluginToolRegistration[] = [
  saveStrategyTool,
  listStrategiesTool,
  readStrategyTool,
  deleteStrategyTool,
];
