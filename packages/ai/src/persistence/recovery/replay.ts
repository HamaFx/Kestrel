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

// Phase 5 — bounded persistence outbox replay loop (DEC-05 split of
// recovery.ts).

import { createCategorizedLogger } from '@kestrel/shared/logger';

import { claimOne, markCompleted, markFailed } from './claim';
import { replayOne } from './handlers';

const rlog = createCategorizedLogger('ai', { component: 'persistence-recovery' });

/** Process at most `limit` replay records and return terminal counters. */
export async function replayPersistenceFailures(
  limit = 25,
  signal?: AbortSignal,
): Promise<{
  claimed: number;
  completed: number;
  failed: number;
  dead: number;
}> {
  const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  let claimed = 0;
  let completed = 0;
  let failed = 0;
  let dead = 0;

  for (let i = 0; i < boundedLimit; i++) {
    if (signal?.aborted) break;
    const item = await claimOne();
    if (!item) break;
    claimed += 1;
    try {
      await replayOne(item);
      await markCompleted(item);
      completed += 1;
    } catch (err) {
      await markFailed(item, err);
      if (
        item.attemptCount >= item.maxAttempts ||
        (err instanceof Error && err.message.startsWith('Invalid '))
      )
        dead += 1;
      else failed += 1;
      rlog.error('persistence outbox replay failed', {
        outboxId: item.id,
        operation: item.operation,
        attempt: item.attemptCount,
        maxAttempts: item.maxAttempts,
        err: String(err),
      });
    }
  }

  return { claimed, completed, failed, dead };
}
