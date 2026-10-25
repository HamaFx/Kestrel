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

// Paper Trading deployed-strategy-run queries.
//
// Callers are always inside a tenant transaction (chat tool, plugin API,
// worker TickBus/job) and every query additionally filters by user_id.

import { getDb, requireTenantIdForUser } from '@kestrel/db';
import { and, desc, eq } from 'drizzle-orm';

import {
  paperStrategyRuns,
  type PaperStrategyRunInsert,
  type PaperStrategyRunRow,
} from '../tables';

export async function listStrategyRuns(
  userId: string,
  status?: 'active' | 'paused' | 'stopped' | 'error',
): Promise<PaperStrategyRunRow[]> {
  const db = getDb();
  const filters = [eq(paperStrategyRuns.userId, userId)];
  if (status) filters.push(eq(paperStrategyRuns.status, status));
  return db
    .select()
    .from(paperStrategyRuns)
    .where(and(...filters))
    .orderBy(desc(paperStrategyRuns.updatedAt));
}

export async function getStrategyRun(
  userId: string,
  strategyRunId: string,
): Promise<PaperStrategyRunRow | undefined> {
  const db = getDb();
  const rows = await db
    .select()
    .from(paperStrategyRuns)
    .where(and(eq(paperStrategyRuns.userId, userId), eq(paperStrategyRuns.id, strategyRunId)))
    .limit(1);
  return rows[0];
}

export async function insertStrategyRun(
  input: Omit<PaperStrategyRunInsert, 'tenantId'>,
): Promise<PaperStrategyRunRow> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(input.userId, db);
  const rows = await db
    .insert(paperStrategyRuns)
    .values({ ...input, tenantId })
    .returning();
  const row = rows[0];
  if (!row) throw new Error('[paper-trading] strategy run insert returned no row');
  return row;
}

export interface StrategyRunPatch {
  status?: 'active' | 'paused' | 'stopped' | 'error';
  lastBarTime?: Date | null;
  lastSignal?: string | null;
  lastSignalAt?: Date | null;
  positionId?: string | null;
  signalCount?: number;
  orderCount?: number;
  lastError?: string | null;
}

export async function updateStrategyRun(
  userId: string,
  strategyRunId: string,
  patch: StrategyRunPatch,
): Promise<PaperStrategyRunRow | undefined> {
  const db = getDb();
  const rows = await db
    .update(paperStrategyRuns)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(paperStrategyRuns.userId, userId), eq(paperStrategyRuns.id, strategyRunId)))
    .returning();
  return rows[0];
}

export async function deleteStrategyRun(userId: string, strategyRunId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .delete(paperStrategyRuns)
    .where(and(eq(paperStrategyRuns.userId, userId), eq(paperStrategyRuns.id, strategyRunId)))
    .returning({ id: paperStrategyRuns.id });
  return rows.length > 0;
}
