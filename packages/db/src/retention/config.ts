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
  candles1mRetentionDays: 14,
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
  /** Retention window in days for candles_1m (keep the chart window small). */
  candles1mRetentionDays?: number;
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
  candles1mDeleted: number;
  verificationTokensDeleted: number;
  budgetReservationsDeleted: number;
  sharedSnapshotsDeleted: number;
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
    candles1mRetentionDays: boundedDays(
      config.candles1mRetentionDays,
      DEFAULT_RETENTION.candles1mRetentionDays,
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
    candles1mRetentionDays: envDays(
      'CANDLES_1M_RETENTION_DAYS',
      DEFAULT_RETENTION.candles1mRetentionDays,
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
