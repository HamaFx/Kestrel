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

import { sql } from 'drizzle-orm';

import { getDb } from './client';

const MAX_RETENTION_DAYS = 3_650;
// A single invocation intentionally processes one bounded batch per table.
// The worker/cron schedule repeats daily, so large backlogs drain over time
// without allowing a serverless request to run unbounded DELETE loops.
const MAX_BATCHES_PER_TABLE = 1;
const BATCH_SIZE = 1_000;
const DEFAULT_RETENTION: Required<RetentionConfig> = {
  telemetryRetentionDays: 90,
  traceRetentionDays: 30,
  rateLimitRetentionHours: 2,
  providerDailyQuotaRetentionDays: 3,
  cronRunRetentionDays: 30,
  outboxRetentionDays: 30,
  analysisJobRetentionDays: 7,
  billingWebhookDlqRetentionDays: 90,
  aiEvaluationRetentionDays: 90,
  budgetReservationRetentionDays: 90,
};

export interface RetentionConfig {
  /** Retention window in days for chat_telemetry + tool_telemetry. */
  telemetryRetentionDays?: number;
  /** Retention window in days for diagnostic_traces. */
  traceRetentionDays?: number;
  /** Retention window in hours for rate-limit buckets. */
  rateLimitRetentionHours?: number;
  /** Retention window in days for provider_daily_quota. */
  providerDailyQuotaRetentionDays?: number;
  /** Retention window in days for cron_runs. */
  cronRunRetentionDays?: number;
  /** Retention window in days for completed/dead persistence outbox rows. */
  outboxRetentionDays?: number;
  /** Retention window in days for terminal Full-analysis queue rows. */
  analysisJobRetentionDays?: number;
  /** Retention window in days for successfully replayed billing DLQ rows. */
  billingWebhookDlqRetentionDays?: number;
  /** Retention window in days for terminal AI evaluation artifacts. */
  aiEvaluationRetentionDays?: number;
  /** Retention window in days for terminal budget reservation ledger rows. */
  budgetReservationRetentionDays?: number;
}

export interface RetentionResult {
  telemetryDeleted: number;
  toolTelemetryDeleted: number;
  tracesDeleted: number;
  rateLimitsDeleted: number;
  providerDailyQuotaDeleted: number;
  cronRunsDeleted: number;
  outboxDeleted: number;
  fullAnalysisQueueDeleted: number;
  billingWebhookDlqDeleted: number;
  aiShadowComparisonsDeleted: number;
  aiQualityResultsDeleted: number;
  budgetReservationsDeleted: number;
  telegramUpdatesDeleted: number;
  sharedSnapshotsDeleted: number;
  notificationNoiseStateDeleted: number;
  note: string;
}

function boundedDays(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value !== undefined && value >= 1 && value <= MAX_RETENTION_DAYS
    ? value
    : fallback;
}

function boundedHours(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value !== undefined && value >= 1 && value <= 24 * 30
    ? value
    : fallback;
}

function envDays(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return boundedDays(Number.isFinite(parsed) ? parsed : undefined, fallback);
}

/** Read operator retention settings without allowing unsafe negative/huge windows. */
export function getRetentionConfigFromEnv(): Required<RetentionConfig> {
  return {
    telemetryRetentionDays: envDays(
      'TELEMETRY_RETENTION_DAYS',
      DEFAULT_RETENTION.telemetryRetentionDays,
    ),
    traceRetentionDays: envDays('TRACE_RETENTION_DAYS', DEFAULT_RETENTION.traceRetentionDays),
    rateLimitRetentionHours: boundedHours(
      Number(process.env.RATE_LIMIT_RETENTION_HOURS),
      DEFAULT_RETENTION.rateLimitRetentionHours,
    ),
    providerDailyQuotaRetentionDays: envDays(
      'PROVIDER_DAILY_QUOTA_RETENTION_DAYS',
      DEFAULT_RETENTION.providerDailyQuotaRetentionDays,
    ),
    cronRunRetentionDays: envDays(
      'CRON_RUN_RETENTION_DAYS',
      DEFAULT_RETENTION.cronRunRetentionDays,
    ),
    outboxRetentionDays: envDays(
      'PERSISTENCE_OUTBOX_RETENTION_DAYS',
      DEFAULT_RETENTION.outboxRetentionDays,
    ),
    analysisJobRetentionDays: envDays(
      'ANALYSIS_JOB_RETENTION_DAYS',
      DEFAULT_RETENTION.analysisJobRetentionDays,
    ),
    billingWebhookDlqRetentionDays: envDays(
      'BILLING_WEBHOOK_DLQ_RETENTION_DAYS',
      DEFAULT_RETENTION.billingWebhookDlqRetentionDays,
    ),
    aiEvaluationRetentionDays: envDays(
      'AI_EVALUATION_RETENTION_DAYS',
      DEFAULT_RETENTION.aiEvaluationRetentionDays,
    ),
    budgetReservationRetentionDays: envDays(
      'BUDGET_RESERVATION_RETENTION_DAYS',
      DEFAULT_RETENTION.budgetReservationRetentionDays,
    ),
  };
}

function isoCutoff(now: Date, milliseconds: number): string {
  return new Date(now.getTime() - milliseconds).toISOString();
}

/**
 * Delete rows from a table in bounded batches. Table names and predicates are
 * internal constants only; callers must never pass user input here.
 */
async function deleteBatchedWhere(
  db: ReturnType<typeof getDb>,
  tableName: string,
  predicate: string,
  batchSize = BATCH_SIZE,
  maxBatches = MAX_BATCHES_PER_TABLE,
): Promise<number> {
  let total = 0;
  let batches = 0;
  while (batches < maxBatches) {
    const result = await db.execute(
      sql.raw(
        `DELETE FROM "${tableName}" WHERE ctid IN (SELECT ctid FROM "${tableName}" WHERE ${predicate} LIMIT ${batchSize})`,
      ),
    );
    const count = Number((result as { count?: number | string }).count ?? 0);
    total += count;
    batches += 1;
    if (count < batchSize) return total;
  }
  return total;
}

async function deleteBatched(
  db: ReturnType<typeof getDb>,
  tableName: string,
  whereColumn: string,
  cutoff: string,
  batchSize = BATCH_SIZE,
): Promise<number> {
  return deleteBatchedWhere(
    db,
    tableName,
    `"${whereColumn}" < '${cutoff}'`,
    batchSize,
    MAX_BATCHES_PER_TABLE,
  );
}

/**
 * Run retention cleanup for operational and recovery tables.
 *
 * Terminal-only rules:
 * - outbox: completed/dead rows only
 * - analysis jobs: complete/failed rows with a completion timestamp
 * - billing DLQ: replayed rows with a replay timestamp
 * - AI evaluations: terminal shadow/quality artifacts
 * - budget ledger: reconciled/released rows only
 * - Telegram deduplication: processed rows older than one hour
 * - share snapshots: expired rows only
 * - notification noise state: expired rows only
 */
export async function runRetentionCleanup(
  config: RetentionConfig = getRetentionConfigFromEnv(),
): Promise<RetentionResult> {
  const db = getDb();
  const now = new Date();
  const retention = {
    telemetryRetentionDays: boundedDays(
      config.telemetryRetentionDays,
      DEFAULT_RETENTION.telemetryRetentionDays,
    ),
    traceRetentionDays: boundedDays(
      config.traceRetentionDays,
      DEFAULT_RETENTION.traceRetentionDays,
    ),
    rateLimitRetentionHours: boundedHours(
      config.rateLimitRetentionHours,
      DEFAULT_RETENTION.rateLimitRetentionHours,
    ),
    providerDailyQuotaRetentionDays: boundedDays(
      config.providerDailyQuotaRetentionDays,
      DEFAULT_RETENTION.providerDailyQuotaRetentionDays,
    ),
    cronRunRetentionDays: boundedDays(
      config.cronRunRetentionDays,
      DEFAULT_RETENTION.cronRunRetentionDays,
    ),
    outboxRetentionDays: boundedDays(
      config.outboxRetentionDays,
      DEFAULT_RETENTION.outboxRetentionDays,
    ),
    analysisJobRetentionDays: boundedDays(
      config.analysisJobRetentionDays,
      DEFAULT_RETENTION.analysisJobRetentionDays,
    ),
    billingWebhookDlqRetentionDays: boundedDays(
      config.billingWebhookDlqRetentionDays,
      DEFAULT_RETENTION.billingWebhookDlqRetentionDays,
    ),
    aiEvaluationRetentionDays: boundedDays(
      config.aiEvaluationRetentionDays,
      DEFAULT_RETENTION.aiEvaluationRetentionDays,
    ),
    budgetReservationRetentionDays: boundedDays(
      config.budgetReservationRetentionDays,
      DEFAULT_RETENTION.budgetReservationRetentionDays,
    ),
  };

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
  const billingWebhookDlqCutoff = isoCutoff(
    now,
    retention.billingWebhookDlqRetentionDays * 24 * 60 * 60 * 1_000,
  );
  const aiEvaluationCutoff = isoCutoff(
    now,
    retention.aiEvaluationRetentionDays * 24 * 60 * 60 * 1_000,
  );
  const budgetCutoff = isoCutoff(
    now,
    retention.budgetReservationRetentionDays * 24 * 60 * 60 * 1_000,
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
  const billingWebhookDlqDeleted = await deleteBatchedWhere(
    db,
    'billing_webhook_dlq',
    `status = 'replayed' AND replayed_at IS NOT NULL AND replayed_at < '${billingWebhookDlqCutoff}'`,
  );
  const aiShadowComparisonsDeleted = await deleteBatched(
    db,
    'ai_shadow_comparisons',
    'created_at',
    aiEvaluationCutoff,
  );
  const aiQualityResultsDeleted = await deleteBatched(
    db,
    'ai_quality_results',
    'created_at',
    aiEvaluationCutoff,
  );
  const budgetReservationsDeleted = await deleteBatchedWhere(
    db,
    'ai_budget_reservations',
    `status IN ('reconciled', 'released') AND resolved_at IS NOT NULL AND resolved_at < '${budgetCutoff}'`,
  );
  // Telegram retries are expected within roughly 24 hours; the schema's
  // one-hour deduplication window makes older processed IDs disposable.
  const telegramUpdatesDeleted = await deleteBatched(
    db,
    'telegram_updates',
    'processed_at',
    rateLimitCutoff,
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

  const counts = {
    telemetryDeleted,
    toolTelemetryDeleted,
    tracesDeleted,
    rateLimitsDeleted,
    providerDailyQuotaDeleted,
    cronRunsDeleted,
    outboxDeleted,
    fullAnalysisQueueDeleted,
    billingWebhookDlqDeleted,
    aiShadowComparisonsDeleted,
    aiQualityResultsDeleted,
    budgetReservationsDeleted,
    telegramUpdatesDeleted,
    sharedSnapshotsDeleted,
    notificationNoiseStateDeleted,
  };

  return {
    ...counts,
    note: Object.entries(counts)
      .map(([key, value]) => `${key}=${value}`)
      .join(', '),
  };
}

/** Run VACUUM ANALYZE on the highest-churn operational tables. */
export async function runVacuumAnalyze(): Promise<void> {
  const db = getDb();
  const tables = [
    'chat_telemetry',
    'chat_tool_telemetry',
    'rate_limits',
    'provider_daily_quota',
    'diagnostic_traces',
    'persistence_outbox',
    'ai_budget_reservations',
    'chat_messages',
  ];
  for (const table of tables) {
    await db.execute(sql.raw(`VACUUM ANALYZE "${table}"`));
  }
}
