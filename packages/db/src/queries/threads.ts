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

// PF-01 — Thread bulk-delete query.
//
// Single-thread and message persistence (get/list/create/update/delete,
// append with idempotency keys, Mastra memory cleanup) is owned by
// `@kestrel/ai/persistence` (`src/persistence/thread-persistence/*`).
// Only the bulk-delete helper that the batch-delete route needs lives here.

import { and, eq, inArray } from 'drizzle-orm';

import { getDb, schema } from '../client';
import { requireTenantIdForUser } from '../tenant';

/**
 * Batch-delete multiple threads for a user. Returns the deleted thread IDs.
 * Threads not belonging to the user are silently skipped.
 */
export async function batchDeleteThreads(userId: string, ids: string[]): Promise<{ id: string }[]> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  return db
    .delete(schema.chatThreads)
    .where(
      and(
        eq(schema.chatThreads.userId, userId),
        eq(schema.chatThreads.tenantId, tenantId),
        inArray(schema.chatThreads.id, ids),
      ),
    )
    .returning({ id: schema.chatThreads.id });
}
