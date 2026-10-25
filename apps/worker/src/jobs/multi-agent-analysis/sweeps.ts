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

// Throttled set-based sweeps that run after the full-analysis claim loop:
// stale-run recovery / Mastra snapshot reconciliation (once a minute) and
// retention purge (once an hour).

import {
  purgeOldFullAnalysisRuns,
  reconcileFullAnalysisSnapshots,
  recoverStaleFullAnalysisRuns,
} from '@kestrel/ai/mastra-v2';

import type { JobContext } from '../types.js';
import {
  MAX_ANALYSIS_ATTEMPTS,
  RECOVERY_INTERVAL_MS,
  RETENTION_INTERVAL_MS,
  RETENTION_WINDOW_MS,
  STALE_JOB_TIMEOUT_MS,
} from './constants.js';

let lastRecoveryAt = 0;
let lastRetentionAt = 0;

/** Test helper: clear the sweep throttle timestamps. */
export function _resetFullAnalysisSweepThrottles(): void {
  lastRecoveryAt = 0;
  lastRetentionAt = 0;
}

export async function maybeRunRecoverySweep(ctx: JobContext, now: number): Promise<void> {
  if (now - lastRecoveryAt < RECOVERY_INTERVAL_MS) return;
  lastRecoveryAt = now;

  const staleCutoff = new Date(now - STALE_JOB_TIMEOUT_MS);
  const staleRecovery = await recoverStaleFullAnalysisRuns(staleCutoff, MAX_ANALYSIS_ATTEMPTS);
  if (staleRecovery.requeued > 0 || staleRecovery.failed > 0) {
    ctx.log.warn('Recovered stale full-analysis runs', {
      requeued: staleRecovery.requeued,
      failed: staleRecovery.failed,
      maxAttempts: MAX_ANALYSIS_ATTEMPTS,
    });
  }
  // B-07 (audit 2026-10-18): backfill Mastra snapshots for terminal rows
  // whose projection never landed (crash window or storage outage). Runs on
  // the same sweep cadence so a worker restart reconciles immediately.
  try {
    const repaired = await reconcileFullAnalysisSnapshots({
      since: new Date(now - RETENTION_WINDOW_MS),
    });
    if (repaired > 0) {
      ctx.log.info('Reconciled full-analysis Mastra snapshots', { repaired });
    }
  } catch (error) {
    ctx.log.warn('Full-analysis snapshot reconciliation failed', { err: String(error) });
  }
}

export async function maybeRunRetentionSweep(ctx: JobContext, now: number): Promise<void> {
  if (now - lastRetentionAt < RETENTION_INTERVAL_MS) return;
  lastRetentionAt = now;

  const retentionCutoff = new Date(now - RETENTION_WINDOW_MS);
  try {
    const purged = await purgeOldFullAnalysisRuns(retentionCutoff);
    if (purged > 0) ctx.log.info('Purged old full-analysis runs', { purged });
  } catch (error) {
    ctx.log.warn('Full-analysis run retention cleanup failed', { err: String(error) });
  }
}
