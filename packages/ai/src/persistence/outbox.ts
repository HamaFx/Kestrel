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

// Phase 5 — durable persistence failure enqueueing.

import { schema } from '@kestrel/db';
import type { PersistenceOutboxOperation } from '@kestrel/db/schema';
import { createCategorizedLogger } from '@kestrel/shared/logger';
import { sql } from 'drizzle-orm';

import { redactSecrets } from '../diagnostics/redact';
import { getDb } from '../runtime/db';

const olog = createCategorizedLogger('ai', { component: 'persistence-outbox' });

export interface EnqueuePersistenceFailureArgs {
  userId: string;
  operation: PersistenceOutboxOperation;
  dedupeKey: string;
  payload: Record<string, unknown>;
  threadId?: string | null | undefined;
  messageId?: string | null | undefined;
  traceId?: string | null | undefined;
  runId?: string | null | undefined;
  jobId?: string | null | undefined;
  error?: unknown;
}

/**
 * Enqueue a failed write without allowing the recovery mechanism to become
 * another source of request failure. The unique dedupe key makes repeated
 * catches for the same logical write collapse into one replay item.
 *
 * Returns `true` when a replay item is queued (fresh insert or re-armed
 * pending/failed row) and `false` when the conflict guard suppressed the
 * update because the row is already `processing` (claimed by the recovery
 * worker) or has reached a terminal `completed` state — a replay must never
 * clobber either (P1-6).
 */
export async function enqueuePersistenceFailure(
  args: EnqueuePersistenceFailureArgs,
): Promise<boolean> {
  const errorText =
    args.error instanceof Error ? args.error.message : args.error ? String(args.error) : null;
  try {
    const queued = await getDb()
      .insert(schema.persistenceOutbox)
      .values({
        userId: args.userId,
        operation: args.operation,
        status: 'pending',
        dedupeKey: args.dedupeKey,
        threadId: args.threadId ?? null,
        messageId: args.messageId ?? null,
        traceId: args.traceId ?? null,
        runId: args.runId ?? null,
        jobId: args.jobId ?? null,
        payload: redactSecrets(args.payload) as Record<string, unknown>,
        lastError: errorText,
      })
      .onConflictDoUpdate({
        target: [schema.persistenceOutbox.tenantId, schema.persistenceOutbox.dedupeKey],
        set: {
          status: 'pending',
          nextAttemptAt: new Date(),
          updatedAt: new Date(),
          lastError: errorText,
        },
        // P1-6 — a replay cannot clobber a row the recovery worker has
        // claimed ('processing') or already finished ('completed'). The
        // previous CASE-based status dance let a late re-catch flip both
        // back to 'pending', corrupting terminal/in-flight state. Rows in
        // 'pending' | 'failed' | 'dead' re-arm to 'pending' as before.
        where: sql`${schema.persistenceOutbox.status} NOT IN ('processing', 'completed')`,
      })
      .returning({ id: schema.persistenceOutbox.id });
    return queued.length > 0;
  } catch (enqueueError) {
    // At this point the primary sink and the recovery sink are both down.
    // Keep the event visible in structured logs with its correlation IDs;
    // never recursively enqueue this failure.
    olog.error('persistence failure could not be queued', {
      operation: args.operation,
      dedupeKey: args.dedupeKey,
      traceId: args.traceId ?? null,
      runId: args.runId ?? null,
      jobId: args.jobId ?? null,
      err: String(enqueueError),
    });
    return false;
  }
}
