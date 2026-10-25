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

// Thread deletion (single + user-wide) including the derived memory state.

import { requireTenantIdForUser, schema } from '@kestrel/db';
import { and, eq } from 'drizzle-orm';

import { getDb } from '../../runtime/db';
import { deleteMastraThreadRows, deleteThreadMemoryState } from './memory-cleanup';

export async function deleteThread(userId: string, id: string): Promise<void> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const deletedIds = await db.transaction(async (tx) => {
    // Ownership-scoped: an id the user does not own deletes zero rows and
    // skips the Mastra cleanup below.
    const deletedThreads = await tx
      .delete(schema.chatThreads)
      .where(
        and(
          eq(schema.chatThreads.id, id),
          eq(schema.chatThreads.userId, userId),
          eq(schema.chatThreads.tenantId, tenantId),
        ),
      )
      .returning({ id: schema.chatThreads.id });
    await deleteThreadMemoryState(tx, userId, tenantId, id);
    return deletedThreads.map((row) => row.id);
  });
  await deleteMastraThreadRows(deletedIds);
}

export async function deleteAllThreads(userId: string): Promise<void> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const deletedIds = await db.transaction(async (tx) => {
    const deletedThreads = await tx
      .delete(schema.chatThreads)
      .where(and(eq(schema.chatThreads.userId, userId), eq(schema.chatThreads.tenantId, tenantId)))
      .returning({ id: schema.chatThreads.id });
    // Per-thread migration checkpoints and every thread synopsis for the user.
    await tx
      .delete(schema.memoryBackfillState)
      .where(
        and(
          eq(schema.memoryBackfillState.userId, userId),
          eq(schema.memoryBackfillState.tenantId, tenantId),
        ),
      );
    await tx
      .delete(schema.memoryProjectionState)
      .where(
        and(
          eq(schema.memoryProjectionState.userId, userId),
          eq(schema.memoryProjectionState.tenantId, tenantId),
        ),
      );
    await tx
      .delete(schema.memoryEmbeddings)
      .where(
        and(
          eq(schema.memoryEmbeddings.userId, userId),
          eq(schema.memoryEmbeddings.tenantId, tenantId),
          eq(schema.memoryEmbeddings.kind, 'thread_synopsis'),
        ),
      );
    return deletedThreads.map((row) => row.id);
  });
  await deleteMastraThreadRows(deletedIds);
}
