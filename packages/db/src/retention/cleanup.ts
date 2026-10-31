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

// DB-1: Retention cleanup for high-write operational and recovery tables.
//
// Shared between the web cron route and the worker job. Cleanup is bounded
// per statement and only removes disposable/terminal records; pending work,
// active leases, retryable outbox rows, unresolved budget reservations,
// active Telegram deduplication rows, and unexpired share snapshots survive.
//
// Audit v2 §4.4 (P2-4): also covers the Mastra runtime observational-memory
// table. Mastra's own `prune()` cannot touch it — the table is excluded from
// the memory domain's retention tables — so the bounded delete lives here.
// Observational memory is OFF everywhere (owner decision Q8), so this is
// hygiene for rows left by earlier runs; the delete is guarded because the
// table lives in Mastra's runtime schema and may not exist at all
// (libsql dev setups, fresh installs).

import { getDb } from '../client';
import {
  BATCH_SIZE,
  deleteBatched,
  deleteBatchedWhere,
  MAX_BATCHES_PER_TABLE,
  pgTableExists,
} from './batch';
import {
  getRetentionConfigFromEnv,
  resolveRetention,
  type RetentionConfig,
  type RetentionResult,
} from './config';

function isoCutoff(now: Date, milliseconds: number): string {
  return new Date(now.getTime() - milliseconds).toISOString();
}

/**
 * Run retention cleanup for operational and recovery tables.
 *
 * Terminal-only rules:
 * - outbox: completed/dead rows only
 * - analysis jobs: complete/failed rows with a completion timestamp
 * - budget ledger: reconciled/released rows only
 * - share snapshots: expired rows only
 * - notification noise state: expired rows only
 * - Mastra observational memory: rows whose last write predates the cutoff
 */
export async function runRetentionCleanup(
  config: RetentionConfig = getRetentionConfigFromEnv(),
): Promise<RetentionResult> {
  const db = getDb();
  const now = new Date();
  const retention = resolveRetention(config);

  const telemetryCutoff = isoCutoff(now, retention.telemetryRetentionDays * 24 * 60 * 60 * 1_000);
  const traceCutoff = isoCutoff(now, retention.traceRetentionDays * 24 * 60 * 60 * 1_000);
  const rateLimitCutoff = isoCutoff(now, retention.rateLimitRetentionHours * 60 * 60 * 1_000);
  const providerQuotaCutoff = isoCutoff(
    now,
    retention.providerDailyQuotaRetentionDays * 24 * 60 * 60 * 1_000,
  ).slice(0, 10);
  const cronCutoff = isoCutoff(now, retention.cronRunRetentionDays * 24 * 60 * 60 * 1_000);
  const outboxCutoff = isoCutoff(now, retention.outboxRetentionDays * 24 * 60 * 60 * 1_000);
  const analysisJobCutoff = isoCutoff(
    now,
    retention.analysisJobRetentionDays * 24 * 60 * 60 * 1_000,
  );
  const budgetCutoff = isoCutoff(
    now,
    retention.budgetReservationRetentionDays * 24 * 60 * 60 * 1_000,
  );
  const observationalMemoryCutoff = isoCutoff(
    now,
    retention.observationalMemoryRetentionDays * 24 * 60 * 60 * 1_000,
  );

  const telemetryDeleted = await deleteBatched(db, 'chat_telemetry', 'created_at', telemetryCutoff);
  const toolTelemetryDeleted = await deleteBatched(
    db,
    'chat_tool_telemetry',
    'created_at',
    telemetryCutoff,
  );
  const tracesDeleted = await deleteBatched(db, 'diagnostic_traces', 'created_at', traceCutoff);
  const rateLimitsDeleted = await deleteBatched(db, 'rate_limits', 'window_start', rateLimitCutoff);
  const providerDailyQuotaDeleted = await deleteBatched(
    db,
    'provider_daily_quota',
    'day',
    providerQuotaCutoff,
  );
  const cronRunsDeleted = await deleteBatched(db, 'cron_runs', 'started_at', cronCutoff);
  const outboxDeleted = await deleteBatchedWhere(
    db,
    'persistence_outbox',
    `status IN ('completed', 'dead') AND updated_at < '${outboxCutoff}'`,
  );
  const fullAnalysisQueueDeleted = await deleteBatchedWhere(
    db,
    'full_analysis_queue',
    `status IN ('succeeded', 'failed', 'cancelled', 'blocked') AND completed_at IS NOT NULL AND completed_at < '${analysisJobCutoff}'`,
  );
  const budgetReservationsDeleted = await deleteBatchedWhere(
    db,
    'ai_budget_reservations',
    `status IN ('reconciled', 'released') AND resolved_at IS NOT NULL AND resolved_at < '${budgetCutoff}'`,
  );
  // Expired share links cannot pass token validation and their snapshots are
  // no longer reachable through the public share route.
  const sharedSnapshotsDeleted = await deleteBatchedWhere(
    db,
    'shared_snapshots',
    `expires_at < '${now.toISOString()}'`,
  );
  const notificationNoiseStateDeleted = await deleteBatched(
    db,
    'notification_noise_state',
    'expires_at',
    now.toISOString(),
  );
  // Audit v2 §4.4 (P2-4) — Mastra's observational-memory table is excluded
  // from the storage domain's own retention tables, so prune() can never
  // bound it. Rows whose last write predates the cutoff are dormant
  // observation state; the feature is OFF everywhere (Q8), so this is
  // hygiene for any rows left by earlier runs. The table lives in Mastra's
  // runtime schema and may not exist at all, so the delete is guarded by an
  // existence check rather than letting a missing relation fail the job.
  let mastraObservationalMemoryDeleted = 0;
  const mastraSchema = process.env.MASTRA_SCHEMA ?? 'mastra';
  if (await pgTableExists(db, mastraSchema, 'mastra_observational_memory')) {
    mastraObservationalMemoryDeleted = await deleteBatchedWhere(
      db,
      'mastra_observational_memory',
      `"updatedAt" < '${observationalMemoryCutoff}'`,
      BATCH_SIZE,
      MAX_BATCHES_PER_TABLE,
      mastraSchema,
    );
  }

  const counts = {
    telemetryDeleted,
    toolTelemetryDeleted,
    tracesDeleted,
    rateLimitsDeleted,
    providerDailyQuotaDeleted,
    cronRunsDeleted,
    outboxDeleted,
    fullAnalysisQueueDeleted,
    budgetReservationsDeleted,
    sharedSnapshotsDeleted,
    notificationNoiseStateDeleted,
    mastraObservationalMemoryDeleted,
  };

  return {
    ...counts,
    note: Object.entries(counts)
      .map(([key, value]) => `${key}=${value}`)
      .join(', '),
  };
}
