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

// Physical postgres-js pools and their config resolution (pool size,
// statement timeout, TLS). Node runtime only — postgres-js does not work on
// Edge; routes that touch this module must export `runtime = 'nodejs'`.

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schema/index';
import { SUPABASE_ROOT_CA_2021 } from './supabase-ca';
import type { DbClient } from './types';

// HMR-safe pool singletons. Next.js App Router re-evaluates module scope on
// hot reload, which would strand the previous `postgres()` pools until their
// idle timers expire. Anchoring them on `globalThis` lets every re-evaluated
// module instance reuse the live pools.
interface KestrelDbPools {
  primarySql: ReturnType<typeof postgres> | null;
  primaryClient: DbClient | null;
  replicaSql: ReturnType<typeof postgres> | null;
  replicaClient: DbClient | null;
  adminSql: ReturnType<typeof postgres> | null;
  adminClient: DbClient | null;
}

const globalForDb = globalThis as unknown as { __kestrelDbPools?: KestrelDbPools };

const pools: KestrelDbPools = (globalForDb.__kestrelDbPools ??= {
  primarySql: null,
  primaryClient: null,
  replicaSql: null,
  replicaClient: null,
  adminSql: null,
  adminClient: null,
});

/**
 * Default per-runtime pool size.
 *
 * Web (Vercel): a chat turn fans out into 4 tool calls + a budget
 * reservation + telemetry + message persistence. Pool size 1 serialised
 * all of those, which dragged streaming p95 well above p50. Raise to 5
 * — Vercel's typical concurrent-invocation count per instance — and let
 * Postgres do real concurrency. Multiplied by 25 instances that's still
 * 125 conns, but Supabase's transaction pooler aggregates well below
 * that ceiling because most slots are idle most of the time.
 *
 * Worker: persistent process, fewer concurrent queries (mostly a single
 * tick-flush every second + occasional one-shot job inserts). 3 is
 * plenty.
 *
 * Override either with `DB_POOL_MAX` (web) or `WORKER_DB_POOL_MAX`
 * (worker) for ad-hoc tuning without redeploying.
 */
const DEFAULT_WEB_POOL_MAX = 5;
const DEFAULT_WORKER_POOL_MAX = 3;

function resolvePoolMax(): number {
  // Limit pool to 1 during test execution to prevent exhausting transaction poolers
  if (process.env.NODE_ENV === 'test') return 1;

  // Workers set `KESTREL_RUNTIME=worker` in the systemd unit's
  // environment file so we can pick the right default without
  // pulling Vercel-specific env vars into @kestrel/db.
  const isWorker = process.env.KESTREL_RUNTIME === 'worker';
  const envOverride = isWorker ? process.env.WORKER_DB_POOL_MAX : process.env.DB_POOL_MAX;
  if (envOverride) {
    const n = Number(envOverride);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return isWorker ? DEFAULT_WORKER_POOL_MAX : DEFAULT_WEB_POOL_MAX;
}

/**
 * Default per-runtime statement timeout in milliseconds.
 *
 * Web (Vercel): 8 seconds — Vercel Hobby plan has a 10s function timeout
 * and Pro has 60s. A query that takes 7s+ will already consume most of the
 * function budget; failing at 8s ensures the function can still return a
 * structured error to the client instead of being killed mid-query.
 *
 * Worker: 30 seconds — the worker is a persistent process with no
 * function-timeout pressure. Long-running analytics queries (e.g. daily
 * spend rollups, journal stats) are legitimate here.
 */
const DEFAULT_WEB_STATEMENT_TIMEOUT = 8000;
const DEFAULT_WORKER_STATEMENT_TIMEOUT = 30000;

function resolveStatementTimeout(): number {
  if (process.env.NODE_ENV === 'test') return 30000;
  const isWorker = process.env.KESTREL_RUNTIME === 'worker';
  return isWorker ? DEFAULT_WORKER_STATEMENT_TIMEOUT : DEFAULT_WEB_STATEMENT_TIMEOUT;
}

function resolveSslOptions(): false | { rejectUnauthorized: boolean; ca?: string } {
  // DB_DISABLE_SSL is permitted only for the bundled plain-TCP Docker
  // database (or non-production test/dev). A production deployment outside
  // that explicit local boundary must fail closed rather than silently
  // disabling database TLS.
  if (process.env.DB_DISABLE_SSL === 'true') {
    if (process.env.NODE_ENV !== 'production' || process.env.KESTREL_LOCAL_DOCKER === 'true') {
      return false;
    }
    throw new Error(
      '[db] DB_DISABLE_SSL=true is only permitted with KESTREL_LOCAL_DOCKER=true; ' +
        'configure verified TLS for production databases.',
    );
  }

  const rawCa = process.env.SUPABASE_CA_CERT;
  const ca = rawCa
    ? rawCa
        .split(/\\n|\n/)
        .join('\n')
        .trim()
    : undefined;
  if (ca) {
    return {
      ca,
      rejectUnauthorized: true,
    };
  }

  const anyDbUrl =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.DIRECT_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    '';
  if (anyDbUrl.includes('supabase.co') || anyDbUrl.includes('supabase.com')) {
    return {
      ca: SUPABASE_ROOT_CA_2021,
      rejectUnauthorized: true,
    };
  }

  // H-9: In production, TLS verification is mandatory. The
  // DB_ALLOW_INSECURE_TLS escape hatch has been removed — it
  // was a security risk that could leave database traffic
  // unencrypted in production deployments.
  //
  // Supabase pooler rejects non-TLS connections automatically.
  // Self-hosted Postgres should configure TLS; Docker Compose
  // deployments can set DB_DISABLE_SSL=true (which disables
  // TLS entirely) or supply a CA cert via SUPABASE_CA_CERT.
  if (process.env.NODE_ENV === 'production') {
    // Use Node's system CA store when no provider-specific bundle is
    // supplied. Never silently downgrade a production DB connection to
    // rejectUnauthorized=false.
    return { rejectUnauthorized: true };
  }

  return { rejectUnauthorized: false };
}

/**
 * Lazy-initialised drizzle client. We use a module-scope singleton so cold
 * Vercel functions reuse the same connection pool across invocations within
 * the same Node process.
 */
export function getPrimaryDb(): DbClient {
  if (pools.primaryClient) return pools.primaryClient;

  // Accept DATABASE_URL or POSTGRES_URL (the Supabase Vercel integration
  // provisions POSTGRES_URL on the transaction pooler).
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    throw new Error(
      'Neither DATABASE_URL nor POSTGRES_URL is set — getDb() called without env config',
    );
  }

  // Supabase pooler in transaction mode requires `prepare: false`. The pooler
  // doesn't support prepared statements; postgres-js otherwise tries to use them.
  //
  // DB-2: TLS verification is mandatory for non-local production deployments.
  // Local Compose explicitly opts out through KESTREL_LOCAL_DOCKER=true and
  // DB_DISABLE_SSL=true.
  pools.primarySql = postgres(url, {
    prepare: false,
    max: resolvePoolMax(),
    idle_timeout: 20,
    connect_timeout: 10,
    max_lifetime: 60 * 30,
    ssl: resolveSslOptions(),
    connection: {
      statement_timeout: resolveStatementTimeout(),
    },
  });

  pools.primaryClient = drizzle(pools.primarySql, { schema });
  return pools.primaryClient;
}

// PF-15 — read-replica client. Initialised lazily, separate pool.
// The replica pool also lives on `globalThis` for the same HMR reasons as
// the primary pool above.

/**
 * Lazy-initialised drizzle client for read-only replicas.
 * Uses `DATABASE_URL_REPLICA` when set; returns `null` when no replica is
 * configured so the caller can fall back to the primary connection.
 */
export function getReplicaDb(): DbClient | null {
  if (pools.replicaClient) return pools.replicaClient;

  const url = process.env.DATABASE_URL_REPLICA;
  if (!url) {
    // No replica configured — caller falls back to the primary pool
    return null;
  }

  pools.replicaSql = postgres(url, {
    prepare: false,
    max: Math.min(resolvePoolMax(), 3), // replica pool is smaller
    idle_timeout: 20,
    connect_timeout: 10,
    max_lifetime: 60 * 30,
    ssl: resolveSslOptions(),
    connection: {
      statement_timeout: resolveStatementTimeout(),
    },
  });

  pools.replicaClient = drizzle(pools.replicaSql, { schema });
  return pools.replicaClient;
}

/**
 * Admin DB pool that connects as the `kestrel_admin` role (BYPASSRLS).
 *
 * Used by the worker, cron jobs, and membership lookup before entering a
 * tenant transaction. Requires `ADMIN_DATABASE_URL`; there
 * is no fallback to the tenant-scoped connection.
 *
 * @throws if ADMIN_DATABASE_URL is not set.
 */
export function getAdminDbPool(): DbClient {
  if (pools.adminClient) return pools.adminClient;

  const adminUrl = process.env.ADMIN_DATABASE_URL;
  if (!adminUrl) {
    throw new Error(
      '[db] ADMIN_DATABASE_URL is required for worker/admin operations; refusing to fall back to a tenant-scoped connection.',
    );
  }

  pools.adminSql = postgres(adminUrl, {
    prepare: false,
    max: resolvePoolMax(),
    idle_timeout: 20,
    connect_timeout: 10,
    max_lifetime: 60 * 30,
    ssl: resolveSslOptions(),
    connection: {
      statement_timeout: resolveStatementTimeout(),
    },
  });

  pools.adminClient = drizzle(pools.adminSql, { schema });
  return pools.adminClient;
}

/** For tests / scripts only — closes the replica pool. */
export async function closeReplicaDb(): Promise<void> {
  if (pools.replicaSql) {
    await pools.replicaSql.end({ timeout: 5 });
    pools.replicaSql = null;
    pools.replicaClient = null;
  }
}

/** For tests / scripts only — closes the admin pool. */
export async function closeAdminDb(): Promise<void> {
  if (pools.adminSql) {
    await pools.adminSql.end({ timeout: 5 });
    pools.adminSql = null;
    pools.adminClient = null;
  }
}

/** For tests / scripts only — closes the underlying pool(s). */
export async function closeDb(): Promise<void> {
  if (pools.primarySql) {
    await pools.primarySql.end({ timeout: 5 });
    pools.primarySql = null;
    pools.primaryClient = null;
  }
  await closeReplicaDb();
  await closeAdminDb();
}
