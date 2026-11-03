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

// GET /api/calendar/refresh — the Calendar page's manual refresh action.
//
// Phase 1 (Task 1.3): `/api/cron/*` is scheduler-or-admin only, so the
// user-facing button no longer calls it. This route authenticates the session
// and applies a per-user rate limit to protect the shared provider quota.

import { withAuth } from '@/lib/http/api';
import { createScopedLoggerWithContext } from '@/lib/logger';
import { checkCalendarRefreshRateLimit, refreshCalendarService } from '@/lib/services/calendar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const GET = withAuth(async (_req, { user }) => {
  const limit = await checkCalendarRefreshRateLimit(user.userId);
  if (!limit.allowed) {
    return Response.json(
      {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many refresh requests. Try again in a minute.',
        },
      },
      { status: 429 },
    );
  }

  const log = createScopedLoggerWithContext({ component: 'calendar', job: 'manual-refresh' });
  const result = await refreshCalendarService(log);
  return Response.json({ ok: true, ...result });
});
