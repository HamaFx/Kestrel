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

/**
 * Per-call memory wiring for Kestrel Mastra agents (Phase 1).
 *
 * - `memoryCallOptions()` — the per-call `memory: { thread, resource }` shape
 *   (resource = userId, strict user scoping).
 * - `seedWorkingMemoryFromSettings()` — one-time migration that writes
 *   Drizzle userSettings (defaultSymbol, language, timezone, chat model,
 *   per-domain default models, embedding model) into Mastra working memory.
 *   Idempotent: only writes when no working memory exists yet.
 * - `backfillThreadHistoryIfNeeded()` — one-time, per-thread copy of recent
 *   Drizzle chat history into Mastra storage so threads that predate the
 *   migration keep their context when the agent loads `lastMessages`.
 *
 * The old `loadMastraMemoryContext`/`serializeMastraMemoryContext` path in
 * `mastra/memory-context.ts` is replaced by native Mastra memory.
 */

import {
  claimMemoryBackfill,
  completeMemoryBackfill,
  failMemoryBackfill,
  getMemoryBackfillState,
  markMemoryProjectionFailed,
  markMemoryProjectionProjected,
  type MemoryBackfillClaim,
} from '@kestrel/db';
import type { UserSettingsRow } from '@kestrel/db/schema';
import { createCategorizedLogger } from '@kestrel/shared/logger';
import type { AgentMemoryOption } from '@mastra/core/agent';
import type { MastraDBMessage, StorageThreadType } from '@mastra/core/memory';
import type { Memory } from '@mastra/memory';

import { listMessages } from '../persistence';

const mlog = createCategorizedLogger('ai', { component: 'mastra-memory-context' });

/** Recent Drizzle history copied into Mastra storage on first use per thread. */
const BACKFILL_LIMIT = 40;

export interface MemoryCallOptionsArgs {
  userId: string;
  threadId: string;
  /** Optional thread title metadata (kept minimal; Kestrel owns titles). */
  title?: string;
}

/**
 * The per-call `memory` option: thread = conversation, resource = user.
 * Strict `resource = userId` prevents any cross-user leakage.
 */
export function memoryCallOptions(args: MemoryCallOptionsArgs): AgentMemoryOption {
  return {
    thread: args.title
      ? ({ id: args.threadId, title: args.title } as Partial<StorageThreadType> & {
          id: string;
        })
      : { id: args.threadId },
    resource: args.userId,
  };
}

// ---------------------------------------------------------------------------
// Working-memory seed migration
// ---------------------------------------------------------------------------

export interface WorkingMemorySeedArgs {
  memory: Memory;
  userId: string;
  threadId: string;
  /**
   * Model-visible user preferences only. Runtime configuration (model pick,
   * provider, budget, limits) is never seeded into model-visible memory.
   * Nullable: research-context callers pass row fields that Postgres may
   * surface as null (Phase 9); null falls back to the template default.
   */
  settings: Partial<{
    defaultSymbol: UserSettingsRow['defaultSymbol'] | null;
    language: UserSettingsRow['language'] | null;
    timezone: UserSettingsRow['timezone'] | null;
  }>;
}

export interface WorkingMemorySeedResult {
  /** Working memory now reflects the Drizzle user preferences. */
  seeded: boolean;
  /** False when the seed could not be read or written (memory degraded). */
  healthy: boolean;
}

function workingMemoryMarkdown(settings: WorkingMemorySeedArgs['settings']): string {
  return `# User Preferences
- **Default symbol**: ${settings.defaultSymbol ?? 'XAUUSD'}
- **Language**: ${settings.language ?? 'en'}
- **Timezone**: ${settings.timezone ?? 'UTC'}
`;
}

/**
 * One-time working-memory seed from Drizzle user preferences. Resource-scoped,
 * so it is written once per user and preserved across threads; the agent then
 * owns updates.
 *
 * Idempotency is content-addressed (Phase 9): if the stored working memory
 * already equals this seed exactly, it is a successful no-op; an existing
 * agent-maintained memory block is never clobbered. Two processes racing on an
 * empty store both write identical deterministic content, so the final state
 * is the same regardless of who wins.
 */
export async function seedWorkingMemoryFromSettings(
  args: WorkingMemorySeedArgs,
): Promise<WorkingMemorySeedResult> {
  const { memory, userId, threadId, settings } = args;
  const seed = workingMemoryMarkdown(settings);
  try {
    const existing = await memory.getWorkingMemory({ threadId, resourceId: userId });
    if (existing === seed) return { seeded: true, healthy: true };
    // A non-null, different block is agent-maintained memory — never
    // overwrite runtime configuration that the agent has evolved.
    if (existing !== null) return { seeded: false, healthy: true };
    await memory.updateWorkingMemory({
      threadId,
      resourceId: userId,
      workingMemory: seed,
    });
    mlog.info('Seeded working memory from Drizzle preferences', { userId });
    return { seeded: true, healthy: true };
  } catch (error) {
    // Memory is a context aid, never a hard dependency: degrade gracefully
    // and signal the degradation to telemetry/metadata callers.
    mlog.warn('Working-memory seed skipped (non-fatal)', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { seeded: false, healthy: false };
  }
}

// ---------------------------------------------------------------------------
// Thread-history backfill (pre-migration threads)
// ---------------------------------------------------------------------------

const BACKFILL_ROLES: ReadonlySet<string> = new Set(['user', 'assistant', 'system']);

function toMastraMessage(
  row: { id: string; role: string; content: string; createdAt: number },
  userId: string,
  threadId: string,
): MastraDBMessage {
  return {
    id: row.id,
    role: (BACKFILL_ROLES.has(row.role) ? row.role : 'system') as MastraDBMessage['role'],
    content: {
      format: 2,
      parts: [{ type: 'text', text: row.content }],
    },
    createdAt: new Date(row.createdAt),
    threadId,
    resourceId: userId,
  };
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
  let durableStateBeforeClaim: Awaited<ReturnType<typeof getMemoryBackfillState>> = null;
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

// ---------------------------------------------------------------------------
// Combined per-request preparation
// ---------------------------------------------------------------------------

export interface PrepareKestrelMemoryArgs {
  memory: Memory;
  userId: string;
  threadId: string;
  settings: WorkingMemorySeedArgs['settings'];
  /** Do not copy the current request, already persisted in Drizzle. */
  excludeMessageIdempotencyKey?: string;
  /** When true, also backfill pre-migration thread history. */
  backfill?: boolean;
}

export interface PreparedKestrelMemory {
  callOptions: AgentMemoryOption;
  seededWorkingMemory: boolean;
  /** Whether this preparation attempted the legacy Drizzle-to-Mastra backfill. */
  backfillAttempted: boolean;
  backfilledMessages: number;
  /**
   * Memory preparation partially failed (seed or requested backfill errored).
   * Answer semantics are unchanged, but callers must surface this in run
   * metadata/telemetry so degraded memory is never invisible (Phase 9).
   */
  memoryDegraded: boolean;
}

/**
 * Prepare everything a request needs for native Mastra memory in one call:
 * per-call options + one-time working-memory seed + optional thread backfill.
 * All steps are idempotent and degrade gracefully; degradation is reported
 * through `memoryDegraded` so it is never silent.
 */
export async function prepareKestrelMemory(
  args: PrepareKestrelMemoryArgs,
): Promise<PreparedKestrelMemory> {
  const callOptions = memoryCallOptions({ userId: args.userId, threadId: args.threadId });
  const seed = await seedWorkingMemoryFromSettings({
    memory: args.memory,
    userId: args.userId,
    threadId: args.threadId,
    settings: args.settings,
  });
  let backfillFailed = false;
  const backfilledMessages =
    args.backfill === true
      ? await backfillThreadHistoryIfNeeded({
          memory: args.memory,
          userId: args.userId,
          threadId: args.threadId,
          ...(args.excludeMessageIdempotencyKey
            ? { excludeMessageIdempotencyKey: args.excludeMessageIdempotencyKey }
            : {}),
          onError: () => {
            backfillFailed = true;
          },
        })
      : 0;
  return {
    callOptions,
    seededWorkingMemory: seed.seeded,
    backfillAttempted: args.backfill === true,
    backfilledMessages,
    memoryDegraded: !seed.healthy || backfillFailed,
  };
}
