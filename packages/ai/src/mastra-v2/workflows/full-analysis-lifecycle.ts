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

// Progress, heartbeat, terminal transition, retry, and recovery operations.

import {
  completeFullAnalysisQueue,
  failFullAnalysisQueue,
  getFullAnalysisQueueRow,
  heartbeatFullAnalysisQueue,
  purgeOldFullAnalysisQueueWithIds,
  recoverStaleFullAnalysisQueue,
  requeueFullAnalysisQueue,
  updateFullAnalysisQueueProgress,
} from '@kestrel/db';

import type { GenerationLedgerSnapshot } from '../../persistence/generation-ledger';
import { getDb } from '../../runtime/db';
import { committeeProgressSnapshot } from '../shared/progress';
import {
  flog,
  isFullAnalysisCancellation,
  isLeaseError,
  serializeError,
} from './full-analysis-payload';
import {
  projectQueueRow,
  projectTerminalSnapshot,
  workflowsStore,
} from './full-analysis-projection';
import {
  FULL_ANALYSIS_LEASE_MS,
  FULL_ANALYSIS_WORKFLOW_ID,
  FullAnalysisCancelledError,
  FullAnalysisHeartbeatError,
  FullAnalysisLeaseLostError,
  type MastraAnalysisMode,
} from './full-analysis-types';

export async function updateFullAnalysisProgress(
  runId: string,
  workerRunId: string,
  step: string,
  mode: MastraAnalysisMode = 'full',
): Promise<void> {
  try {
    const entry = {
      type: 'data-agent-progress',
      data: committeeProgressSnapshot(mode, step),
    };
    const row = await getFullAnalysisQueueRow(runId, undefined, getDb());
    const progress = [...(row?.progress ?? []), entry].slice(-50);
    await projectQueueRow(
      await updateFullAnalysisQueueProgress({
        runId,
        workerRunId,
        progress,
        entry,
        db: getDb(),
      }),
    );
  } catch (error) {
    if (isFullAnalysisCancellation(error)) throw new FullAnalysisCancelledError();
    if (isLeaseError(error)) throw new FullAnalysisLeaseLostError();
    throw error;
  }
}

export async function touchFullAnalysisRun(runId: string, workerRunId: string): Promise<void> {
  try {
    await projectQueueRow(
      await heartbeatFullAnalysisQueue({
        runId,
        workerRunId,
        leaseMs: FULL_ANALYSIS_LEASE_MS,
        db: getDb(),
      }),
    );
  } catch (error) {
    if (isFullAnalysisCancellation(error)) {
      throw new FullAnalysisCancelledError();
    }
    if (isLeaseError(error)) throw new FullAnalysisLeaseLostError();
    throw new FullAnalysisHeartbeatError('The Full-analysis heartbeat could not be persisted.', {
      cause: error,
    });
  }
}

export async function completeFullAnalysisRun(
  runId: string,
  workerRunId: string,
  result: Record<string, unknown>,
): Promise<void> {
  try {
    // B-07 (audit 2026-10-18): project the terminal snapshot BEFORE the Drizzle
    // completion. The previous order completed the queue row first, so a crash
    // between the two writes left a completed-but-invisible run (admin runs
    // viewer showed nothing). With the snapshot first, the worst crash window
    // leaves a visible-but-not-yet-completed run, which the worker retry
    // completes — and `reconcileFullAnalysisSnapshots()` backfills the inverse
    // crash window (completed row, missing/partial snapshot) on the sweep.
    await projectTerminalSnapshot(runId, result);
    await projectQueueRow(
      await completeFullAnalysisQueue({ runId, workerRunId, result, db: getDb() }),
    );
    flog.info('Completed full-analysis run', { runId });
  } catch (error) {
    if (isLeaseError(error)) throw new FullAnalysisLeaseLostError();
    throw error;
  }
}

/**
 * B-07 — persist a terminal `success` snapshot for a run before the queue row
 * transition lands. Reads the current row (owner-agnostic) and projects it
 * with the terminal result; a missing row or unavailable store is a no-op
 * (the authoritative projection still happens after the queue transition).
 */

export async function requeueFullAnalysisRun(
  runId: string,
  workerRunId: string,
  message: string,
  ledgerSnapshot?: GenerationLedgerSnapshot,
): Promise<void> {
  try {
    await projectQueueRow(
      await requeueFullAnalysisQueue({
        runId,
        workerRunId,
        error: message,
        ...(ledgerSnapshot
          ? {
              ledgerSnapshot: {
                entries: [...ledgerSnapshot.entries],
                totalCostUsd: ledgerSnapshot.totalCostUsd,
              },
            }
          : {}),
        db: getDb(),
      }),
    );
    flog.warn('Requeued full-analysis run', { runId, message });
  } catch (error) {
    if (isLeaseError(error)) throw new FullAnalysisLeaseLostError();
    throw error;
  }
}

export async function failFullAnalysisRun(
  runId: string,
  workerRunId: string,
  error: unknown,
): Promise<void> {
  try {
    await projectQueueRow(
      await failFullAnalysisQueue({
        runId,
        workerRunId,
        error: serializeError(error),
        db: getDb(),
      }),
    );
    flog.error('Failed full-analysis run', { runId, error: serializeError(error) });
  } catch (transitionError) {
    if (isLeaseError(transitionError)) throw new FullAnalysisLeaseLostError();
    throw transitionError;
  }
}

export async function recoverStaleFullAnalysisRuns(
  staleCutoff: Date,
  maxAttempts: number,
): Promise<{ requeued: number; failed: number }> {
  const db = getDb();
  const result = await recoverStaleFullAnalysisQueue(staleCutoff, maxAttempts, db);
  for (const runId of result.runIds) {
    const row = await getFullAnalysisQueueRow(runId, undefined, db);
    if (row) await projectQueueRow(row);
  }
  if (result.requeued > 0 || result.failed > 0)
    flog.warn('Recovered stale full-analysis runs', {
      requeued: result.requeued,
      failed: result.failed,
      maxAttempts,
    });
  return { requeued: result.requeued, failed: result.failed };
}

export async function purgeOldFullAnalysisRuns(retentionCutoff: Date): Promise<number> {
  const db = getDb();
  const deletedRunIds = await purgeOldFullAnalysisQueueWithIds(retentionCutoff, db);
  const store = await workflowsStore();
  if (store && deletedRunIds.length > 0) {
    try {
      for (const runId of deletedRunIds)
        await store.deleteWorkflowRunById({
          runId,
          workflowName: FULL_ANALYSIS_WORKFLOW_ID,
        });
    } catch (error) {
      flog.warn('Full-analysis Mastra retention projection failed', {
        error: serializeError(error),
      });
    }
  }
  return deletedRunIds.length;
}
