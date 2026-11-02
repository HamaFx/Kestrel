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

// GET /api/cron/weekly-review — Sunday 18:00 UTC.
//
// Manual-fallback path for the scheduled worker `weekly-review` job; both call
// the same shared `runWeeklyReviewFanout` runner. Idempotent within an ISO week
// via the `briefings_emitted` primary key.

import { withCronAuth } from '@/lib/http/cron';
import { createScopedLoggerWithContext } from '@/lib/logger';
import { runWeeklyReviewFanout } from '@/lib/services/cron-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const log = createScopedLoggerWithContext({ component: 'cron', job: 'weekly-review' });
  return withCronAuth(req, async () => {
    const result = await runWeeklyReviewFanout({ log });
    return {
      processed: result.processed,
      ...(result.reasons.length > 0 ? { note: result.reasons.join(', ') } : {}),
    };
  });
}
