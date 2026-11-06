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
//
// Queue names and policies live in `queue/definitions.ts`, the heartbeat
// helpers in `queue/heartbeat.ts`; both are re-exported here so callers keep
// the single `@kestrel/db/queue` entry point.

import { sql } from 'drizzle-orm';
import { fromDrizzle, PgBoss, type Job, type JobWithMetadata } from 'pg-boss';

import { getDb, getTenantDbScope } from '../client';
import { resolvePostgresSslOptions } from '../connection/supabase-ca';
import { DEAD_LETTER_QUEUE_OPTIONS, DEAD_LETTER_QUEUES, MANAGED_QUEUES } from './definitions';
import { runJobWithHeartbeat } from './heartbeat';

export * from './definitions';
export * from './heartbeat';

let bossInstance: PgBoss | null = null;
let starting: Promise<PgBoss> | null = null;

function queueConnectionString(): string {
  return (
    process.env['ADMIN_DATABASE_URL'] ??
    process.env['DATABASE_URL'] ??
    process.env['POSTGRES_URL'] ??
    process.env['POSTGRES_URL_NON_POOLING'] ??
    ''
  );
}

/**
 * pg (node-postgres) lets `sslmode` in the connection string override an
 * explicit `ssl` option — with pg-connection-string 8.x, `require` means
 * verify-full against the *system* trust store, so the pinned Supabase CA in
 * queueSslOptions() was silently ignored and every pg-boss connection failed
 * with "self-signed certificate in certificate chain" (confirmed by an A/B
 * repro on 2026-10-27: same URL with sslmode stripped + the CA connects).
 * TLS for the queue is therefore controlled exclusively via
 * resolvePostgresSslOptions(); the connection string passed to pg-boss
 * carries no TLS query params.
 */
function queueConnectionStringWithoutSslParams(): string {
  const url = queueConnectionString();
  if (!url) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('sslmode');
    parsed.searchParams.delete('ssl');
    return parsed.toString();
  } catch {
    return url.replace(/[?&](sslmode|ssl)=[^&]*/g, '').replace(/\?$/, '');
  }
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
      connectionString: queueConnectionStringWithoutSslParams(),
      schema: process.env['PGBOSS_SCHEMA'] ?? 'pgboss',
      max: 2,
      ssl: resolvePostgresSslOptions(queueConnectionString()),
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
    // DLQs first: pg-boss rejects a source queue whose deadLetter does not
    // exist (R16).
    for (const dlq of DEAD_LETTER_QUEUES) {
      await boss.createQueue(dlq, DEAD_LETTER_QUEUE_OPTIONS);
    }
    for (const queue of MANAGED_QUEUES) {
      await boss.createQueue(queue.name, { ...queue.options, deadLetter: queue.deadLetter });
      // `create_queue` is `ON CONFLICT DO NOTHING`, so a queue that already
      // existed before this deploy keeps its old config (no dead letter). Apply
      // the current definition explicitly so the DLQ wiring reaches upgrades.
      await boss.updateQueue(queue.name, {
        ...queue.options,
        deadLetter: queue.deadLetter,
      });
    }
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
 * its return value is stored as the job output. While a handler runs, its
 * claim is heartbeated (see `queue/heartbeat.ts`).
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
        const target = job as Job<Record<string, unknown>>;
        output = await runJobWithHeartbeat(boss, queue, target, handler, {
          onError: (error) =>
            console.error(
              `[queue] heartbeat failed for ${queue} job ${job.id}:`,
              error instanceof Error ? error.message : String(error),
            ),
        });
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
