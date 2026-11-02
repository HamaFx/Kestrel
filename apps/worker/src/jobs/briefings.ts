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

// Pre/post-event briefing fan-out. The runner is shared with the
// `/api/cron/briefings` fallback route via `@kestrel/ai/cron`; the worker adds
// only its tenant-partition filter (PF-23) and SIGTERM signal.

import { runBriefingsFanout } from '@kestrel/ai/cron';

import type { JobContext, JobResult } from './types.js';

export async function runBriefings(ctx: JobContext): Promise<JobResult> {
  const result = await runBriefingsFanout({
    signal: ctx.signal,
    log: ctx.log,
    filterUserIds: (userIds) => userIds.filter((userId) => ctx.tenantRouter.isMyTenant(userId)),
  });
  ctx.log.info('briefings complete', {
    preCandidates: result.preCandidates,
    preEmitted: result.preEmitted,
    postCandidates: result.postCandidates,
    postEmitted: result.postEmitted,
  });
  return { processed: result.processed, note: result.note };
}
