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

// Lease ownership and terminal settlement for one claimed Full-analysis run.
// The heartbeat observes cancellation/lease-loss, the run body executes in
// `./execute-run.ts`, and settlement only commits through the live lease.

import {
  clearFullAnalysisWorkflowState,
  failFullAnalysisRun,
  FullAnalysisCancelledError,
  FullAnalysisHeartbeatError,
  FullAnalysisLeaseLostError,
  fullAnalysisRetryAction,
  requeueFullAnalysisRun,
  touchFullAnalysisRun,
  type FullAnalysisClaim,
} from '@kestrel/ai/mastra-v2';
import type { DbClient } from '@kestrel/db';
import { traceIdStorage } from '@kestrel/shared/logger';

import type { JobContext } from '../types.js';
import { HEARTBEAT_MS, MAX_ANALYSIS_ATTEMPTS } from './constants.js';
import { executeClaimedFullAnalysisRun, type AttemptState } from './execute-run.js';

export type ClaimedRunOutcome = 'processed' | 'cancelled' | 'discarded' | 'failed';

/**
 * Runs one claimed durable Full-analysis job end to end: lease heartbeat,
 * workflow execution, terminal projection, and retry/lease-loss settlement.
 * Returns the settlement outcome so the caller can count processed runs
 * without duplicating the queue logic.
 */
export async function processClaimedFullAnalysisRun(
  ctx: JobContext,
  db: DbClient,
  workerRunId: string,
  claimed: FullAnalysisClaim,
): Promise<ClaimedRunOutcome> {
  const { runId, tenantId, payload } = claimed;

  const state: AttemptState = {
    leaseLost: false,
    cancelled: false,
    retryLedgerSnapshot: null,
  };
  const leaseAbort = new AbortController();
  const leaseHeartbeat = setInterval(() => {
    void touchFullAnalysisRun(runId, workerRunId).catch((error) => {
      if (error instanceof FullAnalysisCancelledError) {
        state.cancelled = true;
        leaseAbort.abort(error);
        ctx.log.info('Full-analysis job cancelled', { runId });
      } else if (error instanceof FullAnalysisLeaseLostError) {
        state.leaseLost = true;
        leaseAbort.abort(error);
        ctx.log.error('Full-analysis lease ownership lost', { err: String(error) });
      } else if (error instanceof FullAnalysisHeartbeatError) {
        ctx.log.warn('Full-analysis heartbeat infrastructure failure', { err: String(error) });
      } else {
        ctx.log.warn('Full-analysis heartbeat failed', { err: String(error) });
      }
    });
  }, HEARTBEAT_MS);
  leaseHeartbeat.unref();

  const processRun = () =>
    executeClaimedFullAnalysisRun({
      ctx,
      db,
      workerRunId,
      runId,
      tenantId,
      payload,
      state,
      leaseAbort,
    });

  try {
    try {
      if (payload.traceId) await traceIdStorage.run(payload.traceId, processRun);
      else await processRun();
    } catch (error) {
      if (state.cancelled || error instanceof FullAnalysisCancelledError) {
        ctx.log.info('Full-analysis job discarded after cancellation', { runId });
        return 'cancelled';
      }
      const decision = fullAnalysisRetryAction(error, {
        attemptCount: payload.attemptCount,
        maxAttempts: MAX_ANALYSIS_ATTEMPTS,
      });
      if (decision.action === 'discard') {
        ctx.log.warn('Full-analysis result discarded after lease loss', { runId });
        return 'discarded';
      }
      const message = error instanceof Error ? error.message : String(error);
      ctx.log.error('Full analysis job failed', {
        runId,
        err: message,
        category: decision.category,
        retryable: decision.action === 'requeue',
        attempt: payload.attemptCount,
      });
      if (decision.category === 'quota') {
        ctx.log.warn('Full-analysis run rejected by daily budget', {
          runId,
          spent: (error as { spent?: unknown }).spent,
          max: (error as { max?: unknown }).max,
        });
      }
      if (decision.action === 'requeue') {
        // The retry must start a fresh committee run: resuming the failed
        // attempt's durable snapshot reuses its failed specialist results and
        // turns every retry into an instant strict failure. (Crash recovery
        // without a requeue keeps its snapshot for legitimate resumption.)
        await clearFullAnalysisWorkflowState(runId);
        await requeueFullAnalysisRun(
          runId,
          workerRunId,
          `Attempt ${payload.attemptCount}/${MAX_ANALYSIS_ATTEMPTS} failed; retrying automatically.`,
          state.retryLedgerSnapshot ?? undefined,
        );
      } else {
        await failFullAnalysisRun(runId, workerRunId, error);
      }
      return 'failed';
    }
  } finally {
    clearInterval(leaseHeartbeat);
    leaseAbort.abort();
  }

  return 'processed';
}
