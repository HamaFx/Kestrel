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

// Thread CRUD, scoped to the authenticated user and tenant.

import { requireTenantIdForUser, schema } from '@kestrel/db';
import type { Symbol } from '@kestrel/shared';
import { and, desc, eq, lt, or, sql } from 'drizzle-orm';

import { getDb } from '../../runtime/db';
import { decodeThreadCursor, encodeThreadCursor } from './cursor';
import { rowToThread } from './rows';
import type { DbThread } from './types';

export async function listThreads(
  userId: string,
  limit = 50,
  beforeCursor?: string | number | null,
): Promise<{ threads: DbThread[]; nextCursor: string | null }> {
  const boundedLimit = Math.max(1, Math.min(Math.trunc(limit) || 50, 100));
  const cursor = decodeThreadCursor(beforeCursor);
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const userFilter = and(
    eq(schema.chatThreads.userId, userId),
    eq(schema.chatThreads.tenantId, tenantId),
  );
  // PostgreSQL timestamps have microsecond precision while JavaScript Dates
  // have milliseconds. Paginate on the same millisecond bucket that is
  // encoded in the cursor, then use the UUID tie-breaker within that bucket.
  const updatedAtBucket = sql`date_trunc('milliseconds', ${schema.chatThreads.updatedAt})`;
  const cursorFilter = cursor
    ? cursor.id
      ? or(
          lt(updatedAtBucket, new Date(cursor.updatedAt)),
          and(
            eq(updatedAtBucket, new Date(cursor.updatedAt)),
            lt(schema.chatThreads.id, cursor.id),
          ),
        )
      : lt(updatedAtBucket, new Date(cursor.updatedAt))
    : undefined;

  const query = db
    .select()
    .from(schema.chatThreads)
    .where(cursorFilter ? and(userFilter, cursorFilter) : userFilter)
    .orderBy(desc(updatedAtBucket), desc(schema.chatThreads.id))
    .limit(boundedLimit + 1);

  const rows = await query;
  const hasMore = rows.length > boundedLimit;
  const pageRows = hasMore ? rows.slice(0, boundedLimit) : rows;
  const threads = pageRows.map(rowToThread);
  const last = threads[threads.length - 1];
  const nextCursor =
    hasMore && last ? encodeThreadCursor({ updatedAt: last.updatedAt, id: last.id }) : null;
  return { threads, nextCursor };
}

export async function getThread(userId: string, id: string): Promise<DbThread | null> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const rows = await db
    .select()
    .from(schema.chatThreads)
    .where(
      and(
        eq(schema.chatThreads.id, id),
        eq(schema.chatThreads.userId, userId),
        eq(schema.chatThreads.tenantId, tenantId),
      ),
    )
    .limit(1);
  const row = rows[0];
  return row ? rowToThread(row) : null;
}

export async function createThread(
  userId: string,
  opts: { pinnedSymbol?: Symbol | null } = {},
): Promise<DbThread> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const inserted = await db
    .insert(schema.chatThreads)
    .values({
      userId,
      tenantId,
      title: null,
      pinnedSymbol: opts.pinnedSymbol ?? null,
      modelOverride: null,
      // Null means use the user's saved default mode. Existing rows with
      // `single` retain their legacy behavior until explicitly changed.
      analysisMode: null,
    })
    .returning();
  const row = inserted[0]!;
  return rowToThread(row);
}

export async function updateThreadTitle(
  userId: string,
  id: string,
  title: string,
  source: 'llm' | 'fallback',
): Promise<boolean> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const updated = await db
    .update(schema.chatThreads)
    .set({ title, titleSource: source, updatedAt: new Date() })
    .where(
      and(
        eq(schema.chatThreads.id, id),
        eq(schema.chatThreads.userId, userId),
        eq(schema.chatThreads.tenantId, tenantId),
      ),
    )
    .returning({ id: schema.chatThreads.id });
  return updated.length > 0;
}

export async function updateThreadPinnedSymbol(
  userId: string,
  id: string,
  pinnedSymbol: Symbol | null,
): Promise<boolean> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const updated = await db
    .update(schema.chatThreads)
    .set({ pinnedSymbol, updatedAt: new Date() })
    .where(
      and(
        eq(schema.chatThreads.id, id),
        eq(schema.chatThreads.userId, userId),
        eq(schema.chatThreads.tenantId, tenantId),
      ),
    )
    .returning({ id: schema.chatThreads.id });
  return updated.length > 0;
}

export async function updateThreadAnalysisMode(
  userId: string,
  id: string,
  analysisMode: string | null,
): Promise<boolean> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const updated = await db
    .update(schema.chatThreads)
    .set({ analysisMode, updatedAt: new Date() })
    .where(
      and(
        eq(schema.chatThreads.id, id),
        eq(schema.chatThreads.userId, userId),
        eq(schema.chatThreads.tenantId, tenantId),
      ),
    )
    .returning({ id: schema.chatThreads.id });
  return updated.length > 0;
}
