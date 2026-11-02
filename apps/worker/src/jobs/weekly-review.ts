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

// Phase 8 PR-14 — `weekly-review` heavy job, migrated from
// /api/cron/weekly-review on Vercel (route stays as manual fallback).
//
// Calls `emitWeeklyReview` exactly once per active user. Idempotent within
// an ISO week via the `briefings_emitted` PK on
// (`weekly_review:<isoWeek>`, 'weekly_review'). Schedule: Sunday 18:00 UTC.
//
// Audit 2026-10-31 (R1) — this job was missed when the tenant scoping fix
// landed on the web cron route. `getActiveUserIds` joins the RLS-protected
// `chat_threads` table and `emitWeeklyReview` reads journals and writes
// `briefings_emitted` / `chat_threads` / `chat_messages`, so discovery runs
// on the admin connection and each user's review runs inside
// `withUserTenant`.

import { emitWeeklyReview } from '@kestrel/ai';
import { getActiveUserIds, withAdminDb, withUserTenant } from '@kestrel/db';

import type { JobContext, JobResult } from './types.js';

export async function runWeeklyReview(ctx: JobContext): Promise<JobResult> {
  // Cross-tenant discovery on the admin (BYPASSRLS) connection.
  const allUserIds = await withAdminDb(() => getActiveUserIds());

  let emittedCount = 0;
  for (const userId of allUserIds) {
    if (ctx.signal?.aborted) break;
    // PF-23: Skip tenants that belong to another worker partition.
    if (!ctx.tenantRouter.isMyTenant(userId)) continue;
    try {
      await withUserTenant(userId, async () => {
        const r = await emitWeeklyReview(userId);
        if (r.emitted) emittedCount++;
      });
    } catch (err) {
      ctx.log.error('weekly-review failed for user', { userId, err: String(err) });
    }
  }

  ctx.log.info('weekly-review complete', {
    emitted: emittedCount,
  });
  return {
    processed: emittedCount,
  };
}
