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

// Backtesting persistence helpers — saved strategy library.

import { getDb, requireTenantIdForUser } from '@kestrel/db';
import { and, count, desc, eq } from 'drizzle-orm';

import { backtestStrategies, type BacktestStrategyRow } from '../tables';

export interface UpsertStrategyInput {
  userId: string;
  name: string;
  slug: string;
  description: string;
  source: string;
  params: Record<string, unknown>;
  tags: string[];
  favorite?: boolean;
}

export async function listBacktestStrategies(
  userId: string,
  opts: { limit?: number } = {},
): Promise<BacktestStrategyRow[]> {
  const db = getDb();
  return db
    .select()
    .from(backtestStrategies)
    .where(eq(backtestStrategies.userId, userId))
    .orderBy(desc(backtestStrategies.favorite), desc(backtestStrategies.updatedAt))
    .limit(Math.max(1, Math.min(opts.limit ?? 50, 100)));
}

export async function countBacktestStrategies(userId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ value: count() })
    .from(backtestStrategies)
    .where(eq(backtestStrategies.userId, userId));
  return Number(rows[0]?.value ?? 0);
}

export async function getBacktestStrategy(
  userId: string,
  idOrSlug: string,
): Promise<BacktestStrategyRow | undefined> {
  const db = getDb();
  const rows = await db
    .select()
    .from(backtestStrategies)
    .where(eq(backtestStrategies.userId, userId));
  return rows.find((row) => row.id === idOrSlug || row.slug === idOrSlug);
}

export async function upsertBacktestStrategy(
  input: UpsertStrategyInput,
): Promise<BacktestStrategyRow> {
  const existing = await getBacktestStrategy(input.userId, input.slug);
  const db = getDb();

  if (existing) {
    const rows = await db
      .update(backtestStrategies)
      .set({
        name: input.name,
        description: input.description,
        source: input.source,
        params: input.params,
        tags: input.tags,
        favorite: input.favorite ?? existing.favorite,
        updatedAt: new Date(),
      })
      .where(
        and(eq(backtestStrategies.userId, input.userId), eq(backtestStrategies.id, existing.id)),
      )
      .returning();
    const row = rows[0];
    if (!row) throw new Error('[backtesting] strategy update returned no row');
    return row;
  }

  const tenantId = await requireTenantIdForUser(input.userId, db);
  const rows = await db
    .insert(backtestStrategies)
    .values({
      tenantId,
      userId: input.userId,
      name: input.name,
      slug: input.slug,
      description: input.description,
      source: input.source,
      params: input.params,
      tags: input.tags,
      favorite: input.favorite ?? false,
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error('[backtesting] strategy insert returned no row');
  return row;
}

export async function deleteBacktestStrategy(userId: string, idOrSlug: string): Promise<boolean> {
  const existing = await getBacktestStrategy(userId, idOrSlug);
  if (!existing) return false;
  const db = getDb();
  await db
    .delete(backtestStrategies)
    .where(and(eq(backtestStrategies.userId, userId), eq(backtestStrategies.id, existing.id)));
  return true;
}
