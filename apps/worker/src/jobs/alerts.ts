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

import { evaluateAlerts } from '@kestrel/ai';

import type { JobContext, JobResult } from './types.js';

/**
 * R10 (audit 2026-10-31) — the scheduler aborts a job at its configured
 * timeout (120s by default) and its `signal` is only advisory. The evaluator is
 * given a budget that sits below that window, so the run stops claiming new
 * work in time to release its delivery claims and report what it did not reach
 * instead of being killed mid-delivery with a claim held.
 */
const JOB_TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS) || 120_000;
const RUN_HEADROOM_MS = 30_000;
const RUN_BUDGET_MS = Math.max(30_000, JOB_TIMEOUT_MS - RUN_HEADROOM_MS);

export async function runAlerts(ctx: JobContext): Promise<JobResult> {
  const result = await evaluateAlerts({
    ...(ctx.signal ? { signal: ctx.signal } : {}),
    ownsTenant: (userId) => ctx.tenantRouter.isMyTenant(userId),
    budgetMs: RUN_BUDGET_MS,
  });

  ctx.log.info('alerts evaluated', {
    total: result.total,
    matched: result.matched,
    fired: result.fired,
    skipped: result.skipped,
    errors: result.errors.length,
    stopReason: result.stopReason,
    claimsReleased: result.claimsReleased,
  });

  const early = result.stopReason === 'complete' ? '' : `, stop=${result.stopReason}`;

  return {
    processed: result.total,
    note: `matched=${result.matched}, fired=${result.fired}, errors=${result.errors.length}${early}`,
  };
}
