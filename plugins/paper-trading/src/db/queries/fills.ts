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

// Paper Trading fill queries.
//
// Callers are always inside a tenant transaction (chat tool, plugin API,
// worker TickBus/job) and every query additionally filters by user_id.

import { getDb, requireTenantIdForUser } from '@kestrel/db';
import { and, desc, eq } from 'drizzle-orm';

import { paperFills, type PaperFillRow } from '../tables';

export interface InsertFillInput {
  userId: string;
  accountId: string;
  positionId: string | null;
  orderId: string | null;
  kind: string;
  price: number;
  quantity: number;
  pnl: number;
  fees: number;
  ts: Date;
  meta?: Record<string, unknown>;
}

export async function insertFill(input: InsertFillInput): Promise<PaperFillRow> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(input.userId, db);
  const rows = await db
    .insert(paperFills)
    .values({
      tenantId,
      userId: input.userId,
      accountId: input.accountId,
      positionId: input.positionId,
      orderId: input.orderId,
      kind: input.kind,
      price: input.price,
      quantity: input.quantity,
      pnl: input.pnl,
      fees: input.fees,
      ts: input.ts,
      meta: input.meta ?? {},
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error('[paper-trading] fill insert returned no row');
  return row;
}

export async function listFills(
  userId: string,
  opts: { accountId?: string; limit?: number } = {},
): Promise<PaperFillRow[]> {
  const db = getDb();
  const filters = [eq(paperFills.userId, userId)];
  if (opts.accountId) filters.push(eq(paperFills.accountId, opts.accountId));
  return db
    .select()
    .from(paperFills)
    .where(and(...filters))
    .orderBy(desc(paperFills.ts))
    .limit(Math.max(1, Math.min(opts.limit ?? 50, 200)));
}
