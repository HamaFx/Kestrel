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

// Durable Postgres job queue (pg-boss).
//
// The queue lives in the same database as the rest of Kestrel, so enqueueing
// can share the caller's Drizzle transaction (`fromDrizzle`) and a rolled-back
// request never leaves an orphan job. The worker owns its own small pg pool;
// the web process only needs it to send.
//
// Multi-role deployments: pg-boss needs DDL on first start to create its
// schema. Set ADMIN_DATABASE_URL for the web process, or pre-create the
// `pgboss` schema with the owner role. Single-role/self-hosted deployments
// (the default) just use DATABASE_URL.

import { sql } from 'drizzle-orm';
import { fromDrizzle, PgBoss, type Job, type JobWithMetadata } from 'pg-boss';

import { getDb, getTenantDbScope } from './client';
import { SUPABASE_ROOT_CA_2021 } from './connection/supabase-ca';

export const BACKTEST_RUN_QUEUE = 'backtest-run';
export const BACKTEST_SWEEP_QUEUE = 'backtest-sweep';

let bossInstance: PgBoss | null = null;
let starting: Promise<PgBoss> | null = null;

function queueSslOptions(): false | { rejectUnauthorized: boolean; ca?: string } {
  if (process.env['DB_DISABLE_SSL'] === 'true') {
    if (
      process.env['NODE_ENV'] !== 'production' ||
      process.env['KESTREL_LOCAL_DOCKER'] === 'true'
    ) {
      return false;
    }
    throw new Error(
      '[queue] DB_DISABLE_SSL=true is only permitted with KESTREL_LOCAL_DOCKER=true; configure verified TLS for production databases.',
    );
  }

  const ca = process.env['SUPABASE_CA_CERT']?.replace(/\\n|\n/g, '\n').trim();
  if (ca) return { ca, rejectUnauthorized: true };

  const url = queueConnectionString();
  // Mirror the drizzle pool's behaviour: Supabase connections chain to the
  // pinned 2021 root CA, which is not in the system trust store. Omitting
  // this is what silently broke the backtest queue in production
  // (node-postgres: "self-signed certificate in certificate chain").
  if (url.includes('supabase.co') || url.includes('supabase.com')) {
    return { ca: SUPABASE_ROOT_CA_2021, rejectUnauthorized: true };
  }
  if (/@(?:localhost|127\.0\.0\.1)(?::|\/)/.test(url)) return false;
  return { rejectUnauthorized: process.env['NODE_ENV'] === 'production' };
}

function queueConnectionString(): string {
  return (
    process.env['ADMIN_DATABASE_URL'] ??
    process.env['DATABASE_URL'] ??
    process.env['POSTGRES_URL'] ??
    process.env['POSTGRES_URL_NON_POOLING'] ??
    ''
  );
}

/** True when a database URL is configured (does not start the queue). */
export function isQueueConfigured(): boolean {
  return queueConnectionString().length > 0;
}

/** Lazily start pg-boss and create the queues this build knows about. */
export async function getQueue(): Promise<PgBoss> {
  if (bossInstance) return bossInstance;
  if (starting) return starting;

  const connectionString = queueConnectionString();
  if (!connectionString) {
    throw new Error(
      'The background queue requires DATABASE_URL (or ADMIN_DATABASE_URL in multi-role deployments).',
    );
  }

  starting = (async () => {
    const boss = new PgBoss({
      connectionString,
      schema: process.env['PGBOSS_SCHEMA'] ?? 'pgboss',
      max: 2,
      ssl: queueSslOptions(),
      // The web process may be the first to touch the queue; migrations are
      // idempotent and cheap. Set PGBOSS_MIGRATE=false when the worker owns
      // schema creation and the web role is DML-only.
      migrate: process.env['PGBOSS_MIGRATE'] !== 'false',
      application_name: 'kestrel-queue',
    });
    boss.on('error', (err: unknown) => {
      console.error('[queue] pg-boss error', err instanceof Error ? err.message : String(err));
    });
    await boss.start();
    await boss.createQueue(BACKTEST_RUN_QUEUE, {
      retryLimit: 2,
      retryDelay: 15,
      retryBackoff: true,
      expireInSeconds: 600,
      retentionSeconds: 86_400,
      deleteAfterSeconds: 3_600,
    });
    await boss.createQueue(BACKTEST_SWEEP_QUEUE, {
      retryLimit: 1,
      retryDelay: 30,
      retryBackoff: true,
      expireInSeconds: 1_800,
      retentionSeconds: 86_400,
      deleteAfterSeconds: 3_600,
    });
    bossInstance = boss;
    return boss;
  })().finally(() => {
    starting = null;
  });

  return starting;
}

export interface EnqueueOptions {
  /** Dedupe/coalesce key (per queue policy). */
  singletonKey?: string;
  /** Delay, in seconds or an absolute date. */
  startAfter?: number | string | Date;
  priority?: number;
}

/**
 * Send a job. When called inside `withTenantDb`, the insert shares that
 * transaction via the Drizzle adapter.
 */
export async function enqueueJob(
  queue: string,
  data: Record<string, unknown>,
  options: EnqueueOptions = {},
): Promise<string | null> {
  const boss = await getQueue();
  const scope = getTenantDbScope();
  const db = scope?.db ?? getDb();
  return boss.send(queue, data, {
    ...options,
    db: fromDrizzle(
      db as unknown as { execute(query: unknown): Promise<{ rows: unknown[] }> },
      sql as unknown as {
        (strings: TemplateStringsArray, ...values: unknown[]): unknown;
        param(value: unknown): unknown;
      },
    ),
  });
}

export async function getQueueJob(
  queue: string,
  jobId: string,
): Promise<JobWithMetadata<Record<string, unknown>> | null> {
  const boss = await getQueue();
  return boss.getJobById<Record<string, unknown>>(queue, jobId);
}

export interface WorkQueueOptions {
  batchSize?: number;
  pollingIntervalSeconds?: number;
  localConcurrency?: number;
}

/**
 * Register a worker. The handler receives one job at a time (batchSize 1) and
 * its return value is stored as the job output.
 */
export async function workQueue(
  queue: string,
  handler: (job: Job<Record<string, unknown>>) => Promise<unknown>,
  options: WorkQueueOptions = {},
): Promise<string> {
  const boss = await getQueue();
  return boss.work(
    queue,
    {
      batchSize: 1,
      pollingIntervalSeconds: 2,
      ...options,
    },
    async (jobs) => {
      let output: unknown = null;
      for (const job of jobs) {
        output = await handler(job as Job<Record<string, unknown>>);
      }
      return output;
    },
  );
}

/** Gracefully stop the queue (worker shutdown / tests). */
export async function stopQueue(): Promise<void> {
  const boss = bossInstance;
  bossInstance = null;
  starting = null;
  if (!boss) return;
  await boss.stop({ graceful: true, timeout: 5_000 });
}
