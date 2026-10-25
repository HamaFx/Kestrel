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

// Durable full-analysis worker entry. The web writes a pending database queue
// row and a Mastra projection; this job atomically claims the DB row, executes
// the Full workflow under the runId, and projects terminal state after a lease-
// conditional queue transition. No stale worker may overwrite a requeued run.

import { getDb } from '@kestrel/ai';
import { claimNextFullAnalysisRun } from '@kestrel/ai/mastra-v2';

import type { JobContext, JobResult } from '../types.js';
import { MAX_JOBS_PER_RUN } from './constants.js';
import { processClaimedFullAnalysisRun } from './process-claimed-run.js';
import { maybeRunRecoverySweep, maybeRunRetentionSweep } from './sweeps.js';

/**
 * Application-level durable research boundary (Phase 2 target naming):
 * claim, execute, and settle one queued Full-mode workflow job.
 */
export function runDurableResearchJob(ctx: JobContext): Promise<JobResult> {
  return runMultiAgentAnalysis(ctx);
}

export async function runMultiAgentAnalysis(ctx: JobContext): Promise<JobResult> {
  const db = getDb();
  const workerRunId = `${process.env.HOSTNAME ?? 'worker'}-${crypto.randomUUID()}`;
  let processed = 0;

  for (let i = 0; i < MAX_JOBS_PER_RUN; i++) {
    if (ctx.signal?.aborted) {
      ctx.log.info('Full-analysis poll aborted by signal');
      break;
    }
    const claimed = await claimNextFullAnalysisRun(workerRunId, (tenantId) =>
      ctx.tenantRouter.isMyTenant(tenantId),
    );
    if (!claimed) {
      ctx.log.info('No pending full-analysis runs — done.');
      break;
    }
    const { runId, payload } = claimed;
    ctx.log.info('Claimed full-analysis run', {
      runId,
      userId: payload.userId,
      threadId: payload.threadId,
      traceId: payload.traceId,
      attempt: payload.attemptCount,
    });

    const outcome = await processClaimedFullAnalysisRun(ctx, db, workerRunId, claimed);
    if (outcome !== 'discarded') processed++;
  }

  const now = Date.now();
  await maybeRunRecoverySweep(ctx, now);
  await maybeRunRetentionSweep(ctx, now);

  ctx.log.info('Full-analysis poll complete', { processed });
  return { processed, note: `processed=${processed}` };
}
