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

// SPDX-License-Identifier: Apache-2.0

// Thread-history backfill (pre-migration threads).

import {
  claimMemoryBackfill,
  completeMemoryBackfill,
  failMemoryBackfill,
  getMemoryBackfillState,
  markMemoryProjectionFailed,
  markMemoryProjectionProjected,
  type MemoryBackfillClaim,
} from '@kestrel/db';
import { AIV5Adapter } from '@mastra/core/agent/message-list';
import type { MastraDBMessage } from '@mastra/core/memory';
import type { Memory } from '@mastra/memory';

import { listMessages } from '../../persistence';
import { mlog } from './log';

/** Recent Drizzle history copied into Mastra storage on first use per thread. */
const BACKFILL_LIMIT = 40;

const BACKFILL_ROLES: ReadonlySet<string> = new Set(['user', 'assistant', 'system']);

function toMastraMessage(
  row: { id: string; role: string; content: string; createdAt: number; parts?: unknown },
  userId: string,
  threadId: string,
): MastraDBMessage {
  const role = (BACKFILL_ROLES.has(row.role) ? row.role : 'system') as MastraDBMessage['role'];
  // P2-04: carry the stored AI SDK v5 UI parts (tool invocations, data parts)
  // through the canonical Mastra conversion instead of collapsing every row to
  // plain text, so backfilled threads keep their tool context.
  const storedParts = Array.isArray(row.parts) ? row.parts : [];
  const uiParts = storedParts.length > 0 ? storedParts : [{ type: 'text', text: row.content }];
  try {
    const converted = AIV5Adapter.fromUIMessage({
      id: row.id,
      role,
      parts: uiParts,
    } as unknown as Parameters<typeof AIV5Adapter.fromUIMessage>[0]);
    return {
      ...converted,
      id: row.id,
      role,
      createdAt: new Date(row.createdAt),
      threadId,
      resourceId: userId,
    };
  } catch {
    // One malformed legacy row must never abort the migration; degrade it to
    // the plain-text shape this path used before.
    return {
      id: row.id,
      role,
      content: {
        format: 2,
        parts: [{ type: 'text', text: row.content }],
      },
      createdAt: new Date(row.createdAt),
      threadId,
      resourceId: userId,
    };
  }
}

/**
 * One-time, per-thread backfill: when a thread has no messages in Mastra
 * storage yet but Drizzle does (a pre-migration thread), copy the recent
 * window so `lastMessages` has context. Idempotent — checks Mastra storage
 * first; best-effort — failures degrade to empty context, never block the
 * turn.
 */
const backfillInFlight = new Map<string, Promise<number>>();

async function performThreadHistoryBackfill(args: {
  memory: Memory;
  userId: string;
  threadId: string;
  excludeMessageIdempotencyKey?: string;
}): Promise<number> {
  const { memory, userId, threadId, excludeMessageIdempotencyKey } = args;
  let durableClaim = false;
  let durableStateBeforeClaim: Awaited<ReturnType<typeof getMemoryBackfillState>>;
  try {
    // Read the marker before claiming so an already-populated native thread
    // remains untouched on first migration use, while an interrupted durable
    // migration can reconcile only the legacy message IDs it still lacks.
    try {
      durableStateBeforeClaim = await getMemoryBackfillState(userId, threadId);
    } catch {
      durableStateBeforeClaim = null;
    }

    // The durable claim is best effort for local/self-hosted deployments that
    // have not applied the migration yet. The process-local wrapper still
    // prevents duplicate work in that fallback mode.
    try {
      const claim: MemoryBackfillClaim = await claimMemoryBackfill(userId, threadId);
      if (!claim.claimed) return 0;
      durableClaim = true;
    } catch (stateError) {
      mlog.warn('Durable memory backfill state unavailable; using local guard', {
        threadId,
        error: stateError instanceof Error ? stateError.message : String(stateError),
      });
    }

    // The Drizzle history is authoritative for legacy threads. Create the
    // Mastra thread lazily after confirming there is history to migrate.
    const existingThread = await memory.getThreadById({ threadId, resourceId: userId });
    let existingMessageIds = new Set<string>();
    if (existingThread) {
      const existingMessages = await memory.recall({
        threadId,
        resourceId: userId,
        perPage: BACKFILL_LIMIT,
      });
      existingMessageIds = new Set(
        existingMessages.messages
          .map((message) => message.id)
          .filter((id): id is string => typeof id === 'string'),
      );
      // A pre-existing native thread was not created by this migration. Do
      // not duplicate its history. Only a durable prior claim is allowed to
      // enter the ID reconciliation path below after an interrupted copy.
      if (existingMessageIds.size > 0 && !durableStateBeforeClaim) {
        if (durableClaim) await completeMemoryBackfill(userId, threadId, 0, null);
        return 0;
      }
    }
    // The legacy Drizzle table is authoritative for the migration. Compare
    // IDs, rather than treating one existing message as proof of completion,
    // so a process killed during saveMessages can be repaired safely.
    const listedRows = await listMessages(userId, threadId, BACKFILL_LIMIT);
    const rows = (Array.isArray(listedRows) ? listedRows : []).filter(
      (row) =>
        (!excludeMessageIdempotencyKey || row.idempotencyKey !== excludeMessageIdempotencyKey) &&
        !existingMessageIds.has(row.id),
    );
    const allRows = (Array.isArray(listedRows) ? listedRows : []).filter(
      (row) => !excludeMessageIdempotencyKey || row.idempotencyKey !== excludeMessageIdempotencyKey,
    );

    if (allRows.length === 0) {
      if (durableClaim) await completeMemoryBackfill(userId, threadId, 0, null);
      return 0;
    }
    if (rows.length === 0) {
      if (durableClaim) {
        const latest = allRows.at(-1);
        await completeMemoryBackfill(
          userId,
          threadId,
          allRows.length,
          latest ? new Date(latest.createdAt) : null,
        );
      }
      return 0;
    }
    if (!existingThread) {
      await memory.createThread({ threadId, resourceId: userId, title: 'Kestrel thread' });
    }
    await memory.saveMessages({
      messages: rows.map((row) => toMastraMessage(row, userId, threadId)),
    });
    const projectedMessage = allRows.at(-1);
    if (projectedMessage) {
      try {
        await markMemoryProjectionProjected(userId, threadId, projectedMessage.id);
      } catch (projectionStateError) {
        mlog.warn('Could not persist memory projection checkpoint', {
          threadId,
          error:
            projectionStateError instanceof Error
              ? projectionStateError.message
              : String(projectionStateError),
        });
      }
    }
    const latest = allRows.at(-1);
    if (durableClaim) {
      await completeMemoryBackfill(
        userId,
        threadId,
        allRows.length,
        latest ? new Date(latest.createdAt) : null,
      );
    }
    mlog.info('Backfilled thread history into Mastra memory', {
      userId,
      threadId,
      count: rows.length,
    });
    return rows.length;
  } catch (error) {
    if (durableClaim) {
      try {
        await failMemoryBackfill(userId, threadId, error);
      } catch (stateError) {
        mlog.warn('Could not persist memory backfill failure state', {
          error: stateError instanceof Error ? stateError.message : String(stateError),
        });
      }
    }
    try {
      await markMemoryProjectionFailed(userId, threadId, error);
    } catch (projectionError) {
      mlog.warn('Could not persist memory projection failure state', {
        threadId,
        error: projectionError instanceof Error ? projectionError.message : String(projectionError),
      });
    }
    mlog.warn('Thread-history backfill skipped (non-fatal)', {
      threadId,
      error: error instanceof Error ? error.message : String(error),
    });
    // Do not let the wrapper confuse a transient storage failure with a
    // successful no-op. It must remain possible to retry on a later request.
    throw error;
  }
}

/**
 * Race-safe wrapper around the one-time backfill. Native Mastra storage
 * upserts message IDs, but the read-then-write check can still duplicate
 * work when two requests initialize the same legacy thread concurrently.
 * Serialize that check/write pair per user/thread within this process; the
 * durable claim in `performThreadHistoryBackfill` remains the cross-process
 * authority (Phase 9).
 */
export async function backfillThreadHistoryIfNeeded(args: {
  memory: Memory;
  userId: string;
  threadId: string;
  /** Do not copy the current request, already persisted in Drizzle. */
  excludeMessageIdempotencyKey?: string;
  /** Observability hook: backfill failed (degradation indicator). */
  onError?: (error: unknown) => void;
}): Promise<number> {
  const key = `${args.userId}:${args.threadId}`;
  const existing = backfillInFlight.get(key);
  if (existing) return existing;
  const operation = performThreadHistoryBackfill(args);
  backfillInFlight.set(key, operation);
  try {
    return await operation;
  } catch (error) {
    // Best effort: callers continue with native memory or explicit history.
    args.onError?.(error);
    return 0;
  } finally {
    // No second operation can be admitted while this lock is present, so an
    // unconditional delete cannot remove a newer lock and also avoids stale
    // locks when a storage implementation returns a wrapped Promise.
    backfillInFlight.delete(key);
  }
}
