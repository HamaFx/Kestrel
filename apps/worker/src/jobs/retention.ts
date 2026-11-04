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

// DB-1: Retention cleanup job — runs daily to purge stale rows from
// operational tables (rate_limits, chat_telemetry, tool_telemetry,
// diagnostic_traces, provider_daily_quota, and recovery ledgers) and to
// release AI budget reservations left open by interrupted runs.

import { recoverStaleBudgetReservations } from '@kestrel/ai';
import { getKestrelMastra, pruneMastraStorage } from '@kestrel/ai/mastra-v2';
import { runRetentionCleanup, runVacuumAnalyze } from '@kestrel/db';

import type { JobContext, JobResult } from './types.js';

/** Reservations older than this are considered abandoned by their turn. */
const RESERVATION_STALE_MS = 15 * 60 * 1000;
const RECOVERY_BATCH_SIZE = 100;

export async function runRetention(ctx: JobContext): Promise<JobResult> {
  if (ctx.signal?.aborted) return { processed: 0, note: 'aborted' };

  // Absorbed from the retired `budget-recovery` job: release reservations
  // whose turn died before settling. Release is conditional on status, so a
  // concurrently finishing turn cannot be double-released.
  const cutoff = new Date(Date.now() - RESERVATION_STALE_MS);
  const budgetRecovery = await recoverStaleBudgetReservations(
    cutoff,
    RECOVERY_BATCH_SIZE,
    ctx.signal,
  );
  ctx.log.info('stale budget reservation recovery', {
    cutoff: cutoff.toISOString(),
    scanned: budgetRecovery.scanned,
    released: budgetRecovery.released,
    failed: budgetRecovery.failed,
  });

  const result = await runRetentionCleanup();
  // VACUUM is intentionally worker-only: it is not suitable for a Vercel
  // request and needs the persistent worker's longer statement timeout.
  if (!ctx.signal?.aborted) {
    await runVacuumAnalyze(ctx.signal);
  }

  ctx.log.info('retention cleanup completed', {
    telemetryDeleted: result.telemetryDeleted,
    toolTelemetryDeleted: result.toolTelemetryDeleted,
    tracesDeleted: result.tracesDeleted,
    rateLimitsDeleted: result.rateLimitsDeleted,
    providerDailyQuotaDeleted: result.providerDailyQuotaDeleted,
    cronRunsDeleted: result.cronRunsDeleted,
    candles1mDeleted: result.candles1mDeleted,
    verificationTokensDeleted: result.verificationTokensDeleted,
    budgetReservationsDeleted: result.budgetReservationsDeleted,
    sharedSnapshotsDeleted: result.sharedSnapshotsDeleted,
  });

  // Mastra runtime storage retention (messages 90d, threads 180d,
  // resources 365d, workflow snapshots 30d) — best-effort, never blocks the
  // job. Dormant `mastra_observational_memory` rows are pruned by
  // runRetentionCleanup above (Mastra's own prune() excludes that table);
  // their count is included in `result.note`.
  const mastraRetention = await pruneMastraStorage(
    getKestrelMastra().instance.getStorage() ?? undefined,
  );
  ctx.log.info('Mastra storage pruning', mastraRetention);

  const cleanupProcessed = Object.values(result)
    .filter((value): value is number => typeof value === 'number')
    .reduce((sum, value) => sum + value, 0);
  return {
    processed: cleanupProcessed + budgetRecovery.released,
    note: `${result.note}, budgetReleased=${budgetRecovery.released}`,
  };
}
