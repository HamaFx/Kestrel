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

// Weekly-review fan-out. Executed by the `/api/cron/weekly-review` route.
//
// Cross-tenant discovery runs on the admin (BYPASSRLS) connection; each user's
// review runs inside that user's tenant GUC. `emitWeeklyReview` is idempotent
// within an ISO week via the `briefings_emitted` primary key.

import { getActiveUserIds, withAdminDb, withUserTenant } from '@kestrel/db';

import { emitWeeklyReview } from '../briefings/generate';
import type { CronRunOptions } from '../runtime/cron-runner';

export interface RunWeeklyReviewFanoutArgs extends CronRunOptions {
  /** Restrict discovery to this worker partition's users (PF-23). */
  filterUserIds?: (userIds: string[]) => string[];
}

export interface WeeklyReviewFanoutResult {
  processed: number;
  /** Per-user reasons (already-emitted, failure), in discovery order. */
  reasons: string[];
}

export async function runWeeklyReviewFanout(
  args: RunWeeklyReviewFanoutArgs = {},
): Promise<WeeklyReviewFanoutResult> {
  const { signal, log } = args;
  const allUserIds = await withAdminDb(() => getActiveUserIds());
  const userIds = args.filterUserIds ? args.filterUserIds(allUserIds) : allUserIds;

  let emittedCount = 0;
  const reasons: string[] = [];

  for (const userId of userIds) {
    if (signal?.aborted) break;
    try {
      await withUserTenant(userId, async () => {
        const r = await emitWeeklyReview(userId);
        if (r.emitted) emittedCount += 1;
        if (r.reason) reasons.push(`[${userId}]: ${r.reason}`);
      });
    } catch (err) {
      log?.warn('weekly-review failed for user', { userId, err: String(err) });
      reasons.push(`[${userId}]: error`);
    }
  }

  return { processed: emittedCount, reasons };
}
