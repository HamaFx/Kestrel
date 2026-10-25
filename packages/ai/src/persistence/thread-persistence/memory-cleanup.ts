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

// Memory cleanup that must happen when a thread is deleted.
//
// The Drizzle transaction below covers the derived rows Kestrel owns; the
// Mastra runtime rows are cleaned separately (see `deleteMastraThreadRows`).

import { schema } from '@kestrel/db';
import { createCategorizedLogger } from '@kestrel/shared/logger';
import { and, eq } from 'drizzle-orm';

import type { ThreadTx } from './types';

const tplog = createCategorizedLogger('ai', { component: 'thread-persistence' });

/**
 * P1-7 — thread-scoped memory rows that have no FK to `chat_threads`.
 *
 * `chat_messages` cascades via its FK, but the legacy→Mastra migration
 * checkpoints (`memory_backfill_state`, `memory_projection_state`) and the
 * `thread_synopsis` memory embeddings key on a plain-text thread id, so a
 * thread delete used to leave them orphaned — "deleted" conversation content
 * stayed queryable for the retention window. Deleting them in the same
 * transaction keeps the business row and its derived state consistent.
 */
export async function deleteThreadMemoryState(
  tx: ThreadTx,
  userId: string,
  tenantId: string,
  threadId: string,
): Promise<void> {
  await tx
    .delete(schema.memoryBackfillState)
    .where(
      and(
        eq(schema.memoryBackfillState.userId, userId),
        eq(schema.memoryBackfillState.tenantId, tenantId),
        eq(schema.memoryBackfillState.threadId, threadId),
      ),
    );
  await tx
    .delete(schema.memoryProjectionState)
    .where(
      and(
        eq(schema.memoryProjectionState.userId, userId),
        eq(schema.memoryProjectionState.tenantId, tenantId),
        eq(schema.memoryProjectionState.threadId, threadId),
      ),
    );
  // Thread synopses are embeddings derived from the thread's messages
  // (kind='thread_synopsis', sourceId=threadId) — also conversation content.
  await tx
    .delete(schema.memoryEmbeddings)
    .where(
      and(
        eq(schema.memoryEmbeddings.userId, userId),
        eq(schema.memoryEmbeddings.tenantId, tenantId),
        eq(schema.memoryEmbeddings.kind, 'thread_synopsis'),
        eq(schema.memoryEmbeddings.sourceId, threadId),
      ),
    );
}

/**
 * P1-7 — delete the Mastra runtime rows (thread, messages, per-thread
 * vectors) through the storage API.
 *
 * Mastra owns its namespaced runtime schema (`mastra` by default) and it is
 * deliberately outside the Drizzle migration chain, so these rows can neither
 * carry a Drizzle FK nor share the Drizzle delete transaction. The storage
 * adapter deletes thread + messages + thread vectors in its own transaction.
 *
 * Best-effort by design (mirrors `pruneMastraStorage`): a cleanup failure is
 * logged but never fails or resurrects the already-deleted business thread,
 * and the age-based retention prune still removes the rows later. Resource
 * rows are deliberately kept — they are user-scoped working memory shared by
 * every thread, not thread content, and the storage domain exposes no
 * resource deletion API.
 */
export async function deleteMastraThreadRows(threadIds: readonly string[]): Promise<void> {
  if (threadIds.length === 0) return;
  try {
    // Dynamic import: the Mastra instance pulls in the full tool registry;
    // keeping it off the static import graph avoids a persistence ↔
    // instance cycle and keeps this module cheap to import.
    const { getKestrelMastra } = await import('../../mastra-v2/instance');
    const storage = getKestrelMastra().instance.getStorage();
    if (!storage) return;
    const memory = await storage.getStore('memory');
    if (!memory || typeof memory.deleteThread !== 'function') return;
    for (const threadId of threadIds) {
      await memory.deleteThread({ threadId });
    }
  } catch (error) {
    tplog.warn('Mastra thread cleanup after delete failed (non-fatal)', {
      threadCount: threadIds.length,
      sampleThreadIds: threadIds.slice(0, 5).join(','),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
