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

// Paper Trading account seed/reset queries.
//
// Callers are always inside a tenant transaction (chat tool, plugin API,
// worker TickBus/job) and every query additionally filters by user_id.

import { getDb, requireTenantIdForUser } from '@kestrel/db';
import { and, eq } from 'drizzle-orm';

import type { AccountMode } from '../../domain';
import {
  paperAccounts,
  paperFills,
  paperOrders,
  paperPositions,
  paperStrategyRuns,
  type PaperAccountRow,
} from '../tables';
import { findAccountByMode, getAccount, setAccountBalance } from './accounts';

export interface SeedAccountInput {
  userId: string;
  name: string;
  mode: AccountMode;
  initialBalance: number;
  leverage: number;
  riskPerTradePct: number;
}

/** Idempotent seed: an existing account for the mode is never overwritten. */
export async function seedAccount(input: SeedAccountInput): Promise<PaperAccountRow> {
  const existing = await findAccountByMode(input.userId, input.mode);
  if (existing) return existing;

  const db = getDb();
  const tenantId = await requireTenantIdForUser(input.userId, db);
  const rows = await db
    .insert(paperAccounts)
    .values({
      tenantId,
      userId: input.userId,
      name: input.name,
      mode: input.mode,
      currency: 'USD',
      initialBalance: input.initialBalance,
      balance: input.initialBalance,
      leverage: input.leverage,
      riskPerTradePct: input.riskPerTradePct,
      status: 'active',
      seeded: true,
    })
    .onConflictDoNothing()
    .returning();
  if (rows[0]) return rows[0];

  const raced = await findAccountByMode(input.userId, input.mode);
  if (!raced) throw new Error('[paper-trading] account seed conflicted without a row');
  return raced;
}

/** Wipe the account ledger and restore the initial balance. */
export async function resetAccount(
  userId: string,
  accountId: string,
): Promise<PaperAccountRow | undefined> {
  const account = await getAccount(userId, accountId);
  if (!account) return undefined;
  const db = getDb();
  await db
    .delete(paperFills)
    .where(and(eq(paperFills.userId, userId), eq(paperFills.accountId, accountId)));
  await db
    .delete(paperOrders)
    .where(and(eq(paperOrders.userId, userId), eq(paperOrders.accountId, accountId)));
  await db
    .delete(paperPositions)
    .where(and(eq(paperPositions.userId, userId), eq(paperPositions.accountId, accountId)));
  return setAccountBalance(userId, accountId, account.initialBalance);
}

/** Uninstall + wipe: remove every row owned by this user. */
export async function deleteAllPaperData(userId: string): Promise<void> {
  const db = getDb();
  await db.delete(paperStrategyRuns).where(eq(paperStrategyRuns.userId, userId));
  await db.delete(paperFills).where(eq(paperFills.userId, userId));
  await db.delete(paperOrders).where(eq(paperOrders.userId, userId));
  await db.delete(paperPositions).where(eq(paperPositions.userId, userId));
  await db.delete(paperAccounts).where(eq(paperAccounts.userId, userId));
}
