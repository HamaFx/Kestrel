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

// Combined per-request memory preparation.

import type { AgentMemoryOption } from '@mastra/core/agent';
import type { Memory } from '@mastra/memory';

import { backfillThreadHistoryIfNeeded } from './backfill';
import { memoryCallOptions } from './call-options';
import { seedWorkingMemoryFromSettings, type WorkingMemorySeedArgs } from './working-memory-seed';

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
