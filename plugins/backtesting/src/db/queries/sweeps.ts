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

// Backtesting persistence helpers — parameter sweeps.

import { getDb, requireTenantIdForUser } from '@kestrel/db';
import { and, desc, eq, inArray } from 'drizzle-orm';

import { backtestSweeps, type BacktestSweepInsert, type BacktestSweepRow } from '../tables';

export async function createBacktestSweep(
  input: Omit<BacktestSweepInsert, 'tenantId'>,
): Promise<BacktestSweepRow> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(input.userId, db);
  const rows = await db
    .insert(backtestSweeps)
    .values({ ...input, tenantId })
    .returning();
  const row = rows[0];
  if (!row) throw new Error('[backtesting] sweep insert returned no row');
  return row;
}

export async function updateBacktestSweep(
  userId: string,
  sweepId: string,
  patch: Partial<
    Pick<
      BacktestSweepRow,
      | 'status'
      | 'total'
      | 'completed'
      | 'bestParams'
      | 'bestMetrics'
      | 'bestScore'
      | 'results'
      | 'error'
    >
  >,
): Promise<BacktestSweepRow | undefined> {
  const db = getDb();
  const rows = await db
    .update(backtestSweeps)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(backtestSweeps.userId, userId), eq(backtestSweeps.id, sweepId)))
    .returning();
  return rows[0];
}

export async function getBacktestSweep(
  userId: string,
  sweepId: string,
): Promise<BacktestSweepRow | undefined> {
  const db = getDb();
  const rows = await db
    .select()
    .from(backtestSweeps)
    .where(and(eq(backtestSweeps.userId, userId), eq(backtestSweeps.id, sweepId)))
    .limit(1);
  return rows[0];
}

export async function listBacktestSweeps(userId: string, limit = 20): Promise<BacktestSweepRow[]> {
  const db = getDb();
  return db
    .select()
    .from(backtestSweeps)
    .where(eq(backtestSweeps.userId, userId))
    .orderBy(desc(backtestSweeps.createdAt))
    .limit(Math.max(1, Math.min(50, limit)));
}

export async function deleteBacktestSweep(userId: string, sweepId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .delete(backtestSweeps)
    .where(and(eq(backtestSweeps.userId, userId), eq(backtestSweeps.id, sweepId)))
    .returning({ id: backtestSweeps.id });
  return rows.length > 0;
}

export async function requestBacktestSweepCancel(
  userId: string,
  sweepId: string,
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .update(backtestSweeps)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(
      and(
        eq(backtestSweeps.userId, userId),
        eq(backtestSweeps.id, sweepId),
        inArray(backtestSweeps.status, ['queued', 'running']),
      ),
    )
    .returning({ id: backtestSweeps.id });
  return rows.length > 0;
}
