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

// GET /api/cron/calendar — pulls upcoming FRED release dates and upserts
// economic_events. The provider-error "skip this tick" policy lives in
// `refreshCalendarService`, shared with the user-facing refresh route.

import { withCronAuth } from '@/lib/http/cron';
import { createScopedLoggerWithContext } from '@/lib/logger';
import { refreshCalendarService } from '@/lib/services/calendar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  const log = createScopedLoggerWithContext({ component: 'cron', job: 'calendar' });
  return withCronAuth(req, async () => refreshCalendarService(log));
}
