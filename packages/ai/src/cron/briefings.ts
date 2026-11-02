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

// Pre/post-event briefing fan-out. Shared by the worker `briefings` job and
// the `/api/cron/briefings` fallback route.
//
// Cross-tenant discovery runs on the admin (BYPASSRLS) connection; each user's
// prefetch + emits run inside that user's tenant GUC. Emits are idempotent at
// the (eventId, kind) primary key on `briefings_emitted`.

import { getActiveUserIds, withAdminDb, withUserTenant } from '@kestrel/db';

import { emitPostEvent, emitPreEvent } from '../briefings/generate';
import { findHighImpactEventsInWindow, listEmittedEventIds } from '../briefings/persistence';
import type { CronRunOptions } from '../runtime/cron-runner';

/** Pre-event: scan high-impact events happening in the next 2 hours. */
const PRE_WINDOW_MS = 2 * 60 * 60 * 1000;
/** Post-event catch-up: scan events that happened in the last 30 days. */
const POST_CATCHUP_MS = 30 * 24 * 60 * 60 * 1000;
/** Small offset to avoid picking up events that literally just fired. */
const POST_GRACE_MS = 5 * 60 * 1000;

export interface RunBriefingsFanoutArgs extends CronRunOptions {
  /** Restrict discovery to this worker partition's users (PF-23). */
  filterUserIds?: (userIds: string[]) => string[];
}

export interface BriefingsFanoutResult {
  processed: number;
  preCandidates: number;
  preEmitted: number;
  postCandidates: number;
  postEmitted: number;
  note: string;
}

export async function runBriefingsFanout(
  args: RunBriefingsFanoutArgs = {},
): Promise<BriefingsFanoutResult> {
  const { signal, log } = args;
  const allUserIds = await withAdminDb(() => getActiveUserIds());
  const userIds = args.filterUserIds ? args.filterUserIds(allUserIds) : allUserIds;
  if (userIds.length === 0) {
    return {
      processed: 0,
      preCandidates: 0,
      preEmitted: 0,
      postCandidates: 0,
      postEmitted: 0,
      note: 'no owned active users',
    };
  }

  const now = Date.now();
  const preCandidates = await findHighImpactEventsInWindow({
    fromMs: now,
    toMs: now + PRE_WINDOW_MS,
  });
  const postCandidates = await findHighImpactEventsInWindow({
    fromMs: now - POST_CATCHUP_MS,
    toMs: now - POST_GRACE_MS,
    requireActual: true,
  });
  const preEventIds = preCandidates.map((c) => c.id);
  const postEventIds = postCandidates.map((c) => c.id);

  let preEmitted = 0;
  let postEmitted = 0;

  for (const userId of userIds) {
    if (signal?.aborted) {
      log?.warn('briefings aborted', { phase: 'user-loop' });
      break;
    }

    try {
      await withUserTenant(userId, async () => {
        // One idempotency query per phase instead of one per (event, user)
        // pair. A failed prefetch falls back to empty sets — the per-pair
        // guard inside emitPreEvent still prevents duplicates.
        const preAlreadyEmitted = await listEmittedEventIds(userId, preEventIds, 'pre').catch(
          (err) => {
            log?.warn('briefings pre-idempotency prefetch failed', {
              userId,
              err: String(err),
            });
            return new Set<string>();
          },
        );

        for (const c of preCandidates) {
          if (signal?.aborted) break;
          if (preAlreadyEmitted.has(c.id)) continue;
          try {
            const r = await emitPreEvent(userId, c.id);
            if (r.emitted) preEmitted += 1;
          } catch (err) {
            log?.warn('emitPreEvent failed', { userId, eventId: c.id, err: String(err) });
          }
        }

        const postAlreadyEmitted = await listEmittedEventIds(userId, postEventIds, 'post').catch(
          (err) => {
            log?.warn('briefings post-idempotency prefetch failed', {
              userId,
              err: String(err),
            });
            return new Set<string>();
          },
        );

        for (const c of postCandidates) {
          if (signal?.aborted) break;
          if (postAlreadyEmitted.has(c.id)) continue;
          try {
            const r = await emitPostEvent(userId, c.id);
            if (r.emitted) postEmitted += 1;
          } catch (err) {
            log?.warn('emitPostEvent failed', { userId, eventId: c.id, err: String(err) });
          }
        }
      });
    } catch (err) {
      // Tenant resolution failed for this user — skip them without failing
      // the whole fan-out.
      log?.warn('briefings user failed', { userId, err: String(err) });
    }
  }

  return {
    processed: preCandidates.length + postCandidates.length,
    preCandidates: preCandidates.length,
    preEmitted,
    postCandidates: postCandidates.length,
    postEmitted,
    note: `pre=${preEmitted}/${preCandidates.length}, post=${postEmitted}/${postCandidates.length}`,
  };
}
