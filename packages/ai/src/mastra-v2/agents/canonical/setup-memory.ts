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

// Canonical-chat memory preparation. Runs concurrently with routing and
// degrades to explicit history instead of failing the turn.

import type { MastraMemory } from '@mastra/core/memory';

import { prepareKestrelMemory } from '../../context';
import {
  createKestrelMemory,
  kestrelMemoryOptions,
  type CreateKestrelMemoryArgs,
} from '../../memory';
import { mlog } from './log';
import type { RunMastraCanonicalChatArgs } from './types';

export function startCanonicalMemory(args: RunMastraCanonicalChatArgs) {
  return (async () => {
    try {
      const memoryInstance = createKestrelMemory({
        settings: {
          aiApiKeys: args.settings.aiApiKeys,
          embeddingModel: args.settings.embeddingModel ?? null,
        },
        env: args.env,
        options: kestrelMemoryOptions({
          env: args.env,
          ...(args.executionPlan
            ? { semanticRecall: args.executionPlan.memoryPolicy.semanticRecall }
            : {}),
        }),
      } satisfies CreateKestrelMemoryArgs);
      const prepared = await prepareKestrelMemory({
        memory: memoryInstance,
        userId: args.userId,
        threadId: args.threadId,
        settings: args.settings,
        backfill: true,
        ...(args.backfillExcludeMessageIdempotencyKey
          ? { excludeMessageIdempotencyKey: args.backfillExcludeMessageIdempotencyKey }
          : {}),
      });
      return { memory: memoryInstance as MastraMemory | null, prepared, memoryDegraded: false };
    } catch (error) {
      mlog.warn('Native memory prep failed; falling back to explicit history', {
        userId: args.userId,
        threadId: args.threadId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { memory: null as MastraMemory | null, prepared: null, memoryDegraded: true };
    }
  })();
}
