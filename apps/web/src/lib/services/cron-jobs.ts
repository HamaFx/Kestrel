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

// Route-facing cron runners.
//
// The worker jobs and the `/api/cron/*` fallbacks call the same shared runners
// in `@kestrel/ai/cron`. This module owns the per-job logger and the response
// shape, so the routes stay one-line controllers and the manual and scheduled
// paths cannot drift in logging or note formatting.

import 'server-only';

import { recoverStaleBudgetReservations } from '@kestrel/ai';
import {
  runBriefingsFanout,
  runCotIngestion,
  runFredActualsRefresh,
  runSnapshotRefresh,
  runWeeklyReviewFanout,
} from '@kestrel/ai/cron';
import { pruneMastraStorage } from '@kestrel/ai/mastra-v2';
import { withAdminDb } from '@kestrel/db';
import { createTenantRouterFromEnv } from '@kestrel/shared/tenant-partition';

import { getServerEnv } from '@/lib/env';
import { createScopedLoggerWithContext } from '@/lib/logger';
import { runRetentionCleanupAcrossTenants } from '@/lib/services/admin';

export interface CronJobResult {
  processed: number;
  note?: string;
}

/** Reservations older than this are considered abandoned by their turn. */
const RESERVATION_STALE_MS = 15 * 60 * 1000;
const RECOVERY_BATCH_SIZE = 100;

function loggerFor(job: string) {
  return createScopedLoggerWithContext({ component: 'cron', job });
}

export async function runBriefingsCronService(): Promise<CronJobResult> {
  // Parity with the worker: on a partitioned deployment, the web fallback must
  // not brief another worker partition's tenants a second time.
  const router = createTenantRouterFromEnv();
  const result = await runBriefingsFanout({
    log: loggerFor('briefings'),
    filterUserIds: (userIds) => userIds.filter((userId) => router.isMyTenant(userId)),
  });
  return { processed: result.processed, note: result.note };
}

/**
 * Daily cleanup fallback. Mirrors the worker `retention` job: telemetry and
 * operational retention, stale AI budget reservations, and Mastra storage
 * pruning. VACUUM stays worker-only because serverless requests cannot hold
 * its statement for long enough.
 */
export async function runCleanupTelemetryCronService(): Promise<CronJobResult> {
  const log = loggerFor('cleanup-telemetry');
  const cutoff = new Date(Date.now() - RESERVATION_STALE_MS);
  const { result, budgetRecovery, mastraRetention } = await withAdminDb(async () => {
    const budgetRecovery = await recoverStaleBudgetReservations(cutoff, RECOVERY_BATCH_SIZE);
    const result = await runRetentionCleanupAcrossTenants();
    const mastraRetention = await pruneMastraStorage();
    return { result, budgetRecovery, mastraRetention };
  });

  log.info('retention cleanup completed', {
    telemetryDeleted: result.telemetryDeleted,
    toolTelemetryDeleted: result.toolTelemetryDeleted,
    tracesDeleted: result.tracesDeleted,
    rateLimitsDeleted: result.rateLimitsDeleted,
    providerDailyQuotaDeleted: result.providerDailyQuotaDeleted,
    cronRunsDeleted: result.cronRunsDeleted,
    verificationTokensDeleted: result.verificationTokensDeleted,
    budgetReservationsDeleted: result.budgetReservationsDeleted,
    sharedSnapshotsDeleted: result.sharedSnapshotsDeleted,
    budgetReleased: budgetRecovery.released,
    mastraPruned: mastraRetention.pruned,
  });

  const cleanupProcessed = Object.values(result)
    .filter((value): value is number => typeof value === 'number')
    .reduce((sum, value) => sum + value, 0);
  return {
    processed: cleanupProcessed + budgetRecovery.released,
    note: `${result.note}, budgetReleased=${budgetRecovery.released}, mastraPruned=${mastraRetention.pruned}`,
  };
}

export async function runCotCronService(): Promise<CronJobResult> {
  const result = await runCotIngestion({ log: loggerFor('cot') });
  return { processed: result.processed, note: result.note };
}

export async function runSnapshotsCronService(): Promise<CronJobResult> {
  const result = await runSnapshotRefresh({ log: loggerFor('snapshots') });
  return { processed: result.processed, note: result.note };
}

export async function runWeeklyReviewCronService(): Promise<CronJobResult> {
  const result = await runWeeklyReviewFanout({ log: loggerFor('weekly-review') });
  return {
    processed: result.processed,
    ...(result.reasons.length > 0 ? { note: result.reasons.join(', ') } : {}),
  };
}

export async function runFredActualsCronService(): Promise<CronJobResult> {
  const env = getServerEnv();
  const result = await runFredActualsRefresh({
    fredApiKey: env.FRED_API_KEY ?? null,
    log: loggerFor('fred-actuals'),
  });
  return { processed: result.processed, note: result.note };
}
