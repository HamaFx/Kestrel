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

// Paper Trading account queries.
//
// Callers are always inside a tenant transaction (chat tool, plugin API,
// worker TickBus/job) and every query additionally filters by user_id.

import { getDb } from '@kestrel/db';
import { and, desc, eq } from 'drizzle-orm';

import type { AccountMode } from '../../domain';
import { paperAccounts, type PaperAccountRow } from '../tables';

export async function listAccounts(userId: string): Promise<PaperAccountRow[]> {
  const db = getDb();
  return db
    .select()
    .from(paperAccounts)
    .where(eq(paperAccounts.userId, userId))
    .orderBy(desc(paperAccounts.createdAt));
}

export async function getAccount(
  userId: string,
  accountId: string,
): Promise<PaperAccountRow | undefined> {
  const db = getDb();
  const rows = await db
    .select()
    .from(paperAccounts)
    .where(and(eq(paperAccounts.userId, userId), eq(paperAccounts.id, accountId)))
    .limit(1);
  return rows[0];
}

export async function findAccountByMode(
  userId: string,
  mode: AccountMode,
): Promise<PaperAccountRow | undefined> {
  const db = getDb();
  const rows = await db
    .select()
    .from(paperAccounts)
    .where(and(eq(paperAccounts.userId, userId), eq(paperAccounts.mode, mode)))
    .limit(1);
  return rows[0];
}

export interface AccountSettingsPatch {
  riskPerTradePct?: number;
  leverage?: number;
}

export async function updateAccountSettings(
  userId: string,
  accountId: string,
  patch: AccountSettingsPatch,
): Promise<PaperAccountRow | undefined> {
  const db = getDb();
  const values: Partial<typeof paperAccounts.$inferInsert> = {};
  if (patch.riskPerTradePct !== undefined) values.riskPerTradePct = patch.riskPerTradePct;
  if (patch.leverage !== undefined) values.leverage = patch.leverage;
  if (Object.keys(values).length === 0) return getAccount(userId, accountId);
  values.updatedAt = new Date();
  const rows = await db
    .update(paperAccounts)
    .set(values)
    .where(and(eq(paperAccounts.userId, userId), eq(paperAccounts.id, accountId)))
    .returning();
  return rows[0];
}

/** Set the realised cash balance (after a close/reset). */
export async function setAccountBalance(
  userId: string,
  accountId: string,
  balance: number,
): Promise<PaperAccountRow | undefined> {
  const db = getDb();
  const rows = await db
    .update(paperAccounts)
    .set({ balance, updatedAt: new Date() })
    .where(and(eq(paperAccounts.userId, userId), eq(paperAccounts.id, accountId)))
    .returning();
  return rows[0];
}
