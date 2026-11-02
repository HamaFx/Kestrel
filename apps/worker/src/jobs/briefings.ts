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

// Phase 8 PR-10 — `briefings` heavy job, migrated from
// /api/cron/briefings on Vercel (route stays as manual fallback).
//
// On every invocation, scan `economic_events` twice:
//   - pre-event:  events with date ∈ [now, now+2h]  → emitPreEvent
//   - post-event: events with date ∈ [now-30d, now-5m] AND actual IS NOT NULL → emitPostEvent
//
// Each emit is idempotent at the (eventId, kind) primary key on
// briefings_emitted, so any cadence (with possible drift) is safe to re-run.
//
// Audit 2026-10-31 (R1) — this job was missed when the tenant scoping fix
// landed on the web cron route. `getActiveUserIds` joins the RLS-protected
// `chat_threads` table, and every emit writes `briefings_emitted` /
// `chat_threads` / `chat_messages`. Under the non-bypass `kestrel_app` role
// the unscoped reads silently returned zero rows and the writes failed RLS,
// so discovery now runs on the admin connection and each user's work runs
// inside `withUserTenant`.

import {
  emitPostEvent,
  emitPreEvent,
  findHighImpactEventsInWindow,
  listEmittedEventIds,
} from '@kestrel/ai';
import { getActiveUserIds, withAdminDb, withUserTenant } from '@kestrel/db';

import type { JobContext, JobResult } from './types.js';

/** Pre-event: scan high-impact events happening in the next 2 hours. */
const PRE_WINDOW_MS = 2 * 60 * 60 * 1000;
/** Post-event catch-up: scan events that happened in the last 30 days. */
const POST_CATCHUP_MS = 30 * 24 * 60 * 60 * 1000;
/** Small offset to avoid picking up events that literally just fired. */
const POST_GRACE_MS = 5 * 60 * 1000;

export async function runBriefings(ctx: JobContext): Promise<JobResult> {
  const now = Date.now();
  const log = ctx.log;

  // Cross-tenant discovery on the admin (BYPASSRLS) connection.
  const allUserIds = await withAdminDb(() => getActiveUserIds());
  const userIds = allUserIds.filter((userId) => ctx.tenantRouter.isMyTenant(userId));
  if (userIds.length === 0) {
    return { processed: 0, note: 'no owned active users' };
  }

  // --- Pre-event window: [now, now+2h] ---
  const preCandidates = await findHighImpactEventsInWindow({
    fromMs: now,
    toMs: now + PRE_WINDOW_MS,
  });
  const preEventIds = preCandidates.map((c) => c.id);

  // --- Post-event catch-up: [now-30d, now-5m] AND actual IS NOT NULL ---
  const postCandidates = await findHighImpactEventsInWindow({
    fromMs: now - POST_CATCHUP_MS,
    toMs: now - POST_GRACE_MS,
    requireActual: true,
  });
  const postEventIds = postCandidates.map((c) => c.id);

  let preEmitted = 0;
  let postEmitted = 0;

  for (const userId of userIds) {
    if (ctx.signal?.aborted) {
      log.warn('briefings aborted', { phase: 'user-loop' });
      break;
    }

    try {
      await withUserTenant(userId, async () => {
        // One idempotency query per phase instead of one per (event, user)
        // pair. A failed prefetch falls back to empty sets — the per-pair
        // guard inside emitPreEvent still prevents duplicates.
        const preAlreadyEmitted = await listEmittedEventIds(userId, preEventIds, 'pre').catch(
          (err) => {
            log.warn('briefings pre-idempotency prefetch failed', {
              userId,
              err: String(err),
            });
            return new Set<string>();
          },
        );

        for (const c of preCandidates) {
          if (ctx.signal?.aborted) break;
          if (preAlreadyEmitted.has(c.id)) continue;
          try {
            const r = await emitPreEvent(userId, c.id);
            if (r.emitted) preEmitted += 1;
          } catch (err) {
            log.error('emitPreEvent failed', { userId, eventId: c.id, err: String(err) });
          }
        }

        const postAlreadyEmitted = await listEmittedEventIds(userId, postEventIds, 'post').catch(
          (err) => {
            log.warn('briefings post-idempotency prefetch failed', {
              userId,
              err: String(err),
            });
            return new Set<string>();
          },
        );

        for (const c of postCandidates) {
          if (ctx.signal?.aborted) break;
          if (postAlreadyEmitted.has(c.id)) continue;
          try {
            const r = await emitPostEvent(userId, c.id);
            if (r.emitted) postEmitted += 1;
          } catch (err) {
            log.error('emitPostEvent failed', { userId, eventId: c.id, err: String(err) });
          }
        }
      });
    } catch (err) {
      // Tenant resolution failed for this user — skip them without failing
      // the whole fan-out.
      log.error('briefings user failed', { userId, err: String(err) });
    }
  }

  log.info('briefings complete', {
    preCandidates: preCandidates.length,
    preEmitted,
    postCandidates: postCandidates.length,
    postEmitted,
  });

  return {
    processed: preCandidates.length + postCandidates.length,
    note: `pre=${preEmitted}/${preCandidates.length}, post=${postEmitted}/${postCandidates.length}`,
  };
}
