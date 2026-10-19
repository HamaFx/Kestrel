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

// Read-side credit ledger helpers.

import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';

import { getDb, schema } from '../client';
import { requireTenantIdForUser } from '../tenant';

export interface LedgerPage {
  rows: Array<typeof schema.creditLedger.$inferSelect>;
  nextCursor: string | null;
}

/** Keyset-paginated ledger, newest first. Cursor is the last ISO timestamp. */
export async function listLedger(
  userId: string,
  opts: { cursor?: string | null; limit?: number; kind?: string | null } = {},
): Promise<LedgerPage> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const limit = Math.max(1, Math.min(100, Math.floor(opts.limit ?? 25)));

  const conditions = [
    eq(schema.creditLedger.userId, userId),
    eq(schema.creditLedger.tenantId, tenantId),
    // Shadow rows are analytics-only; the user-facing ledger shows real money.
    eq(schema.creditLedger.shadow, false),
  ];
  if (opts.cursor) {
    const cursorDate = new Date(opts.cursor);
    if (!Number.isNaN(cursorDate.getTime())) {
      conditions.push(lt(schema.creditLedger.createdAt, cursorDate));
    }
  }
  if (opts.kind) {
    conditions.push(eq(schema.creditLedger.kind, opts.kind as never));
  }

  const rows = await db
    .select()
    .from(schema.creditLedger)
    .where(and(...conditions))
    .orderBy(desc(schema.creditLedger.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page.at(-1);
  return {
    rows: page,
    nextCursor: hasMore && last ? last.createdAt.toISOString() : null,
  };
}

export interface CreditDayBucket {
  date: string;
  credits: number;
}

/**
 * Net credit burn per UTC day.
 *
 * Reservation (−) + reconcile (±) + release (+) + direct consumption sum to
 * the real consumed amount; pre-authorisations that were released cancel out.
 */
export async function getCreditUsageDaily(
  userId: string,
  days = 7,
  now = new Date(),
): Promise<CreditDayBucket[]> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const boundedDays = Math.max(1, Math.min(31, Math.floor(days)));
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (boundedDays - 1)),
  );
  const rows = await db
    .select({
      date: sql<string>`to_char(${schema.creditLedger.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
      credits: sql<string>`coalesce(sum(-${schema.creditLedger.amountCredits}), 0)::text`,
    })
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.userId, userId),
        eq(schema.creditLedger.tenantId, tenantId),
        gte(schema.creditLedger.createdAt, start),
        // Grants/top-ups are not burn. Reservation + reconcile + release net
        // to the actual consumed amount; direct consumption has no reserve.
        inArray(schema.creditLedger.kind, [
          'reservation',
          'reconcile',
          'release',
          'consumption',
        ] as const),
      ),
    )
    .groupBy(sql`to_char(${schema.creditLedger.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`);

  const byDate = new Map(rows.map((row) => [row.date, Number(row.credits ?? 0)]));
  const out: CreditDayBucket[] = [];
  for (let i = 0; i < boundedDays; i += 1) {
    const date = new Date(start.getTime() + i * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    out.push({ date, credits: Math.max(0, byDate.get(date) ?? 0) });
  }
  return out;
}

/** Look up one ledger row by idempotency key (admin/replay diagnostics). */
export async function getLedgerByIdempotency(tenantId: string, key: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.creditLedger)
    .where(
      and(eq(schema.creditLedger.tenantId, tenantId), eq(schema.creditLedger.idempotencyKey, key)),
    )
    .limit(1);
  return row ?? null;
}
