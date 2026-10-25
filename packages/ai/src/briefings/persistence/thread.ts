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

// The dedicated `Briefings_Thread`: locate or create it, never more than one.
//
// We keep ONE Briefings_Thread for life: the cron handlers always reuse it,
// and the chat sidebar pins it to the top via the `is_briefings` column.
//
// Briefings are scoped to the authenticated user. The partial unique index
// guarantees one dedicated briefing thread per user.

import { requireTenantIdForUser, schema } from '@kestrel/db';
import { and, eq } from 'drizzle-orm';

import type { DbThread } from '../../persistence';
import { getDb } from '../../runtime/db';

/**
 * Returns the singleton `Briefings_Thread`, creating one if absent. Cron
 * handlers call this once per invocation; on a fresh DB it inserts the
 * first row, on subsequent invocations it returns the same row.
 *
 * Phase 2 hardening — a partial unique index enforces the singleton at
 * the database boundary, while the insert conflict fallback makes
 * concurrent cron runners converge on the same winner.
 */
export async function getOrCreateBriefingsThread(userId: string): Promise<DbThread> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const existing = await db
    .select()
    .from(schema.chatThreads)
    .where(
      and(
        eq(schema.chatThreads.isBriefings, true),
        eq(schema.chatThreads.userId, userId),
        eq(schema.chatThreads.tenantId, tenantId),
      ),
    )
    .limit(1);

  const found = existing[0];
  if (found) return rowToBriefingsThread(found);

  // The partial unique index on (user_id) for briefing rows is the
  // concurrency boundary. If another cron runner wins the insert, this
  // statement returns no row and the follow-up SELECT retrieves its row.
  const inserted = await db
    .insert(schema.chatThreads)
    .values({
      userId,
      tenantId,
      title: 'Briefings',
      titleSource: 'llm',
      isBriefings: true,
      pinnedSymbol: null,
      modelOverride: null,
      analysisMode: null,
    })
    .onConflictDoNothing()
    .returning();
  const created = inserted[0];
  if (created) return rowToBriefingsThread(created);

  const raced = await db
    .select()
    .from(schema.chatThreads)
    .where(
      and(
        eq(schema.chatThreads.isBriefings, true),
        eq(schema.chatThreads.userId, userId),
        eq(schema.chatThreads.tenantId, tenantId),
      ),
    )
    .limit(1);
  const winner = raced[0];
  if (!winner) throw new Error(`failed to create or find briefings thread for user ${userId}`);
  return rowToBriefingsThread(winner);
}

function rowToBriefingsThread(row: typeof schema.chatThreads.$inferSelect): DbThread {
  return {
    id: row.id,
    title: row.title,
    titleSource:
      row.titleSource === 'llm' || row.titleSource === 'fallback' ? row.titleSource : null,
    pinnedSymbol: row.pinnedSymbol as DbThread['pinnedSymbol'],
    modelOverride: row.modelOverride,
    analysisMode: row.analysisMode,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}
