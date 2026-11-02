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

// GET /api/cron/briefings — pre/post-event briefings.
//
// Phase 8 PR-10: this route is now a **manual-fallback path**. The
// scheduled invocation runs on the GCE worker via in-process scheduler.
// The route stays here so we can hand-trigger during a worker outage:
//
//   curl -H "Authorization: Bearer $CRON_SECRET" $URL/api/cron/briefings
//
// Scans `economic_events` twice on each invocation:
//   - pre-event:  events with `date` ∈ [now, now+2h]  → emit
//   - post-event: events with `date` ∈ [now-24h, now-5m] AND `actual IS NOT NULL` → emit
//
// Each emit is idempotent at the (eventId, kind) primary key on
// `briefings_emitted`.

import { getActiveUserIdsForCron, withCronAuth } from '@/lib/http/cron';
import { createScopedLoggerWithContext } from '@/lib/logger';
import {
  emitPostEvent,
  emitPreEvent,
  findHighImpactEventsInWindow,
  listEmittedEventIds,
} from '@/lib/services/alerts';
import { withUserTenant } from '@/lib/services/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Pre-event: scan high-impact events happening in the next 2 hours. */
const PRE_WINDOW_MS = 2 * 60 * 60 * 1000;
/** Post-event catch-up: scan events that happened in the last 30 days. */
const POST_CATCHUP_MS = 30 * 24 * 60 * 60 * 1000;
/** Small offset to avoid picking up events that literally just fired. */
const POST_GRACE_MS = 5 * 60 * 1000;

export async function GET(req: Request): Promise<Response> {
  const log = createScopedLoggerWithContext({ component: 'cron', job: 'briefings' });
  return withCronAuth(req, async () => {
    const now = Date.now();

    // --- Pre-event window: [now, now+2h] ---
    const preCandidates = await findHighImpactEventsInWindow({
      fromMs: now,
      toMs: now + PRE_WINDOW_MS,
    });

    let preEmitted = 0;
    const preEventIds = preCandidates.map((c) => c.id);
    // --- Post-event catch-up: [now-24h, now-5m] AND actual IS NOT NULL ---
    const postCandidates = await findHighImpactEventsInWindow({
      fromMs: now - POST_CATCHUP_MS,
      toMs: now - POST_GRACE_MS,
      requireActual: true,
    });
    const postEventIds = postCandidates.map((c) => c.id);

    let postEmitted = 0;

    // Audit 2026-10-31 (R1): the active-user scan joins `chat_threads`
    // (RLS) and must run cross-tenant on the admin connection, while each
    // user's emit writes briefings_emitted / chat_threads / chat_messages /
    // journal stats under that user's tenant GUC.
    const activeUsers = await getActiveUserIdsForCron();

    for (const userId of activeUsers) {
      try {
        await withUserTenant(userId, async () => {
          // Phase 3 Task 2 — parity with `apps/worker/src/jobs/briefings.ts`:
          // one idempotency query per phase replaces one per (event, user)
          // pair. A failed prefetch falls back to an empty set; the per-pair
          // guard inside emitPreEvent still prevents duplicates.
          const preAlreadyEmitted = await listEmittedEventIds(userId, preEventIds, 'pre').catch(
            (err) => {
              log.errorContext(err, 'briefings pre-idempotency prefetch', { userId });
              return new Set<string>();
            },
          );

          for (const c of preCandidates) {
            if (preAlreadyEmitted.has(c.id)) continue;
            try {
              const r = await emitPreEvent(userId, c.id);
              if (r.emitted) preEmitted += 1;
            } catch (err) {
              log.errorContext(err, 'emitPreEvent', { eventId: c.id, userId });
            }
          }

          const postAlreadyEmitted = await listEmittedEventIds(userId, postEventIds, 'post').catch(
            (err) => {
              log.errorContext(err, 'briefings post-idempotency prefetch', { userId });
              return new Set<string>();
            },
          );

          for (const c of postCandidates) {
            if (postAlreadyEmitted.has(c.id)) continue;
            try {
              const r = await emitPostEvent(userId, c.id);
              if (r.emitted) postEmitted += 1;
            } catch (err) {
              log.errorContext(err, 'emitPostEvent', { eventId: c.id, userId });
            }
          }
        });
      } catch (err) {
        // Tenant resolution failed for this user — skip them without
        // failing the whole fan-out.
        log.errorContext(err, 'withUserTenant', { userId });
      }
    }

    return {
      processed: preCandidates.length + postCandidates.length,
      note: `pre=${preEmitted}/${preCandidates.length}, post=${postEmitted}/${postCandidates.length}`,
    };
  });
}
