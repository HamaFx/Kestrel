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

// Retention windows: defaults, operator config from env, and the bounded
// value helpers shared by the cleanup job.

const MAX_RETENTION_DAYS = 3_650;

const DEFAULT_RETENTION: Required<RetentionConfig> = {
  telemetryRetentionDays: 90,
  traceRetentionDays: 30,
  rateLimitRetentionHours: 2,
  providerDailyQuotaRetentionDays: 3,
  cronRunRetentionDays: 30,
  outboxRetentionDays: 30,
  analysisJobRetentionDays: 7,
  aiEvaluationRetentionDays: 90,
  budgetReservationRetentionDays: 90,
  observationalMemoryRetentionDays: 90,
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
  /** Retention window in days for terminal AI evaluation artifacts. */
  aiEvaluationRetentionDays?: number;
  /** Retention window in days for terminal budget reservation ledger rows. */
  budgetReservationRetentionDays?: number;
  /**
   * Retention window in days for dormant Mastra observational-memory rows
   * (audit v2 §4.4). Rows whose last write predates the cutoff are deleted.
   */
  observationalMemoryRetentionDays?: number;
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
  aiShadowComparisonsDeleted: number;
  aiQualityResultsDeleted: number;
  budgetReservationsDeleted: number;
  sharedSnapshotsDeleted: number;
  notificationNoiseStateDeleted: number;
  mastraObservationalMemoryDeleted: number;
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

/** Clamp every window in a caller-supplied config to safe bounds. */
export function resolveRetention(config: RetentionConfig): Required<RetentionConfig> {
  return {
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
    aiEvaluationRetentionDays: boundedDays(
      config.aiEvaluationRetentionDays,
      DEFAULT_RETENTION.aiEvaluationRetentionDays,
    ),
    budgetReservationRetentionDays: boundedDays(
      config.budgetReservationRetentionDays,
      DEFAULT_RETENTION.budgetReservationRetentionDays,
    ),
    observationalMemoryRetentionDays: boundedDays(
      config.observationalMemoryRetentionDays,
      DEFAULT_RETENTION.observationalMemoryRetentionDays,
    ),
  };
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
    aiEvaluationRetentionDays: envDays(
      'AI_EVALUATION_RETENTION_DAYS',
      DEFAULT_RETENTION.aiEvaluationRetentionDays,
    ),
    budgetReservationRetentionDays: envDays(
      'BUDGET_RESERVATION_RETENTION_DAYS',
      DEFAULT_RETENTION.budgetReservationRetentionDays,
    ),
    observationalMemoryRetentionDays: envDays(
      'OBSERVATIONAL_MEMORY_RETENTION_DAYS',
      DEFAULT_RETENTION.observationalMemoryRetentionDays,
    ),
  };
}

export { DEFAULT_RETENTION };
