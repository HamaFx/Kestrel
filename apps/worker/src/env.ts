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

// Worker environment validation.
//
// The worker validates only the runtime settings it consumes. Optional
// integrations remain no-ops when their credentials are absent.
//
// By default (`WORKER_ENABLE_TICK_STREAM=0`), the worker operates in
// 100% on-demand mode: it runs Mastra durable workflows and scheduled jobs
// without maintaining 24/7 SignalR/Binance DB write loops or requiring
// `BIQUOTE_PROXY_TOKEN`.

import { z } from 'zod';

const coerceEmptyToUndefined = z
  .string()
  .optional()
  .transform((v) => (v === '' ? undefined : v));
const optionalUrl = z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional());
const optionalNonEmpty = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.string().min(1).optional(),
);

const WorkerEnvSchema = z.object({
  /** Either DATABASE_URL or POSTGRES_URL is required. */
  DATABASE_URL: optionalUrl,
  POSTGRES_URL: optionalUrl,

  /** Optional override; defaults to https://biquote.io in the consumer. */
  BIQUOTE_BASE_URL: optionalUrl,
  /** Bearer token required by the health endpoint. */
  WORKER_HEALTH_TOKEN: optionalNonEmpty,
  /** Bearer token for the optional legacy BiQuote proxy (:8082). */
  BIQUOTE_PROXY_TOKEN: optionalNonEmpty,
  /**
   * Opt-in flag for the legacy 24/7 SignalR + Binance -> Postgres (`live_ticks` /
   * `candles_1m`) streaming pipeline. Defaults to `'0'` (100% on-demand BiQuote REST mode).
   */
  WORKER_ENABLE_TICK_STREAM: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['0', '1', 'true', 'false']).default('0'),
  ),
  /** 32-byte (64 hex chars) key required in production to decrypt user BYOK keys in worker jobs. */
  ENCRYPTION_SECRET: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_SECRET must be 64 hex characters (32 bytes)')
      .optional(),
  ),
  /** Bind address for the worker HTTP listener; keep private by default. */
  WORKER_HTTP_HOST: optionalNonEmpty,
  /** Port for the worker health listener. */
  WORKER_HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(8081),
  /** Port for the optional BiQuote proxy listener. */
  WORKER_PROXY_PORT: z.coerce.number().int().min(1).max(65535).default(8082),
  /** SignalR hub URL. Defaults to BiQuote's documented endpoint. */
  BIQUOTE_HUB_URL: z.string().url().default('https://biquote.io/hubs/tick'),

  /**
   * healthchecks.io UUIDs. Optional — when missing, healthchecks become
   * no-ops so local dev / tests work without configuration.
   */
  HC_SIGNALR_UUID: optionalNonEmpty,
  HC_BACKUP_DB_UUID: optionalNonEmpty,
  HC_BACKUP_JOURNAL_UUID: optionalNonEmpty,
  HC_VERIFY_RESTORE_UUID: optionalNonEmpty,
  HC_UPDATE_UUID: optionalNonEmpty,
  HC_JOB_EMBEDDING_BACKFILL_UUID: optionalNonEmpty,
  HC_JOB_BRIEFINGS_UUID: optionalNonEmpty,
  HC_JOB_SNAPSHOTS_UUID: optionalNonEmpty,
  HC_JOB_COT_UUID: optionalNonEmpty,
  HC_JOB_FRED_ACTUALS_UUID: optionalNonEmpty,
  HC_JOB_WEEKLY_REVIEW_UUID: optionalNonEmpty,
  HC_JOB_RESONANCE_SYNC_UUID: optionalNonEmpty,
  HC_JOB_ALERTS_UUID: optionalNonEmpty,
  HC_JOB_BUDGET_RECOVERY_UUID: optionalNonEmpty,
  HC_JOB_PERSISTENCE_RECOVERY_UUID: optionalNonEmpty,
  HC_JOB_RETENTION_UUID: optionalNonEmpty,
  HC_JOB_DATASET_EXPORT_UUID: optionalNonEmpty,
  HC_DISK_CHECK_UUID: optionalNonEmpty,
  HC_TENANT_DELETE_UUID: optionalNonEmpty,
  HC_TENANT_EXPORT_UUID: optionalNonEmpty,
  HC_CLEANUP_UPLOADS_UUID: optionalNonEmpty,
  HC_DOCKER_PRUNE_UUID: optionalNonEmpty,
  LANGFUSE_PUBLIC_KEY: optionalNonEmpty,
  LANGFUSE_SECRET_KEY: optionalNonEmpty,
  LANGFUSE_BASE_URL: optionalUrl,
  LANGFUSE_RELEASE: optionalNonEmpty,
  LANGFUSE_TRACING_ENVIRONMENT: optionalNonEmpty,
  LANGFUSE_RECORD_IO: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['0', '1', 'true', 'false']).default('0'),
  ),

  // Retention values are validated by @kestrel/db with bounded safe defaults.
  TELEMETRY_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
  TRACE_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
  RATE_LIMIT_RETENTION_HOURS: z.coerce.number().int().min(1).max(720).default(2),
  PROVIDER_DAILY_QUOTA_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(3),
  CRON_RUN_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
  ANALYSIS_JOB_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(7),
  BILLING_WEBHOOK_DLQ_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
  AI_EVALUATION_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
  PERSISTENCE_OUTBOX_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
  BUDGET_RESERVATION_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(90),

  DEPLOYED_SHA: coerceEmptyToUndefined.pipe(z.string().min(1).optional()).default('unknown'),

  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /**
   * 'systemd' relies on external cron for jobs.
   * 'docker' starts an internal node-cron scheduler.
   */
  WORKER_MODE: z.enum(['systemd', 'docker']).default('systemd'),

  JOB_TIMEOUT_MS: z.coerce.number().int().min(1000).max(3_600_000).default(120_000),
  WORKER_PARTITION: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.coerce.number().int().min(0).optional(),
  ),
  WORKER_PARTITIONS_TOTAL: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.coerce.number().int().min(1).optional(),
  ),

  BINANCE_CRYPTO_SYMBOLS: optionalNonEmpty,
  BINANCE_WS_URL: optionalUrl,
  DATASETS_DIR: optionalNonEmpty,
  EVAL_REPORTS_DIR: optionalNonEmpty,
});

export type WorkerEnv = z.infer<typeof WorkerEnvSchema>;

export function isWorkerTickStreamEnabled(env: Pick<WorkerEnv, 'WORKER_ENABLE_TICK_STREAM'>): boolean {
  return env.WORKER_ENABLE_TICK_STREAM === '1' || env.WORKER_ENABLE_TICK_STREAM === 'true';
}

/**
 * Parse `process.env` (or an injected map for tests) into a typed worker
 * env. Throws a readable error listing every missing/invalid variable.
 */
export function loadEnv(input: NodeJS.ProcessEnv = process.env): WorkerEnv {
  const result = WorkerEnvSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid worker environment:\n${issues}`);
  }
  if (result.data.NODE_ENV === 'production' && !result.data.WORKER_HEALTH_TOKEN) {
    throw new Error('WORKER_HEALTH_TOKEN must be set in production');
  }
  if (
    result.data.NODE_ENV === 'production' &&
    isWorkerTickStreamEnabled(result.data) &&
    !result.data.BIQUOTE_PROXY_TOKEN
  ) {
    throw new Error('BIQUOTE_PROXY_TOKEN must be set in production when WORKER_ENABLE_TICK_STREAM=1');
  }
  if (result.data.NODE_ENV === 'production' && !result.data.ENCRYPTION_SECRET) {
    throw new Error('ENCRYPTION_SECRET must be set in production');
  }
  if (!result.data.DATABASE_URL && !result.data.POSTGRES_URL) {
    throw new Error('Either DATABASE_URL or POSTGRES_URL must be set');
  }
  if (
    result.data.WORKER_PARTITION !== undefined &&
    result.data.WORKER_PARTITIONS_TOTAL !== undefined &&
    result.data.WORKER_PARTITION >= result.data.WORKER_PARTITIONS_TOTAL
  ) {
    throw new Error(
      `WORKER_PARTITION must be less than WORKER_PARTITIONS_TOTAL (got ${result.data.WORKER_PARTITION} >= ${result.data.WORKER_PARTITIONS_TOTAL})`,
    );
  }
  return result.data;
}

/** Resolve the active Postgres connection string, preferring DATABASE_URL. */
export function resolveDatabaseUrl(env: WorkerEnv): string {
  const url = env.DATABASE_URL || env.POSTGRES_URL;
  if (!url) throw new Error('Neither DATABASE_URL nor POSTGRES_URL is set');
  return url;
}
