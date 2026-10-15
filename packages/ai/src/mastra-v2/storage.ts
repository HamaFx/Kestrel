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

/**
 * Mastra runtime storage for the Kestrel Mastra instance (Phase 0).
 *
 * Mastra owns a namespaced set of runtime tables (threads, messages, workflow
 * snapshots, scores, datasets, experiments, background tasks, schedule
 * triggers, thread state) that live beside Kestrel's Drizzle business schema.
 * They are intentionally NOT part of the Drizzle migration chain: Mastra
 * initializes its own schema on first use (idempotent DDL), and PostgresStore
 * supports a `schemaName` so every runtime table stays under one `mastra`
 * namespace and can never collide with or be dropped by Drizzle migrations.
 *
 * Selection (first match wins):
 * - `MASTRA_STORAGE=postgres` → PostgresStore against the direct (non-pooling)
 *   connection string (DIRECT_URL → POSTGRES_URL_NON_POOLING → DATABASE_URL →
 *   POSTGRES_URL). The direct connection avoids Supabase's transaction-mode
 *   pooler, which can silently drop DDL during first-use table creation —
 *   same rule as the Drizzle migration scripts.
 * - `MASTRA_STORAGE=libsql`   → LibSQLStore backed by a file (default
 *   `file:./.kestrel/mastra.db`) so local development stays zero-setup.
 *   Note: libsql `:memory:` databases are per-connection, so multi-connection
 *   workflows (schema init vs. domain writes) would see different databases —
 *   never use `:memory:` here.
 * - unset → postgres when a connection string exists, otherwise libsql.
 *
 * Observability is deliberately NOT routed to this storage: Kestrel exports
 * traces to Langfuse (see `./instrumentation.ts`), so the high-volume
 * `observability` domain is not backed by Postgres.
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { createCategorizedLogger } from '@kestrel/shared/logger';
import type { MastraCompositeStore, RetentionConfig } from '@mastra/core/storage';
import { LibSQLStore } from '@mastra/libsql';
import { PostgresStore } from '@mastra/pg';

const mlog = createCategorizedLogger('ai', { component: 'mastra-storage' });

export type MastraStorageKind = 'postgres' | 'libsql';

export interface MastraStorageResult {
  storage: MastraCompositeStore;
  kind: MastraStorageKind;
}

/** Direct (non-pooling) connection string in the same order as the migration scripts. */
export function mastraDirectConnectionString(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string | null {
  const e = env as Record<string, string | undefined>;
  return firstNonEmpty(
    e.DIRECT_URL,
    e.POSTGRES_URL_NON_POOLING,
    e.POSTGRES_PRISMA_URL,
    e.DATABASE_URL,
    e.POSTGRES_URL,
    process.env.DIRECT_URL,
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.POSTGRES_PRISMA_URL,
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
  );
}

function firstNonEmpty(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

/**
 * Pooled (PgBouncer transaction-mode) connection string for *runtime* Mastra
 * storage and vector queries.
 *
 * DDL/schema initialization legitimately needs the direct connection, but
 * routing steady-state runtime traffic over `DIRECT_URL` bypasses the pooler
 * and opens one un-pooled Postgres socket per serverless instance. A fleet of
 * instances plus the worker then exhausts `max_connections`. Runtime callers
 * use this pooled string; only explicit DDL paths use the direct one.
 */
export function mastraRuntimeConnectionString(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string | null {
  const e = env as Record<string, string | undefined>;
  return firstNonEmpty(
    e.MASTRA_DATABASE_URL,
    e.DATABASE_URL,
    e.POSTGRES_URL,
    e.DIRECT_URL,
    e.POSTGRES_URL_NON_POOLING,
    process.env.MASTRA_DATABASE_URL,
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.DIRECT_URL,
    process.env.POSTGRES_URL_NON_POOLING,
  );
}

/**
 * Mirror of the `@kestrel/db` TLS policy (`packages/db/src/client.ts`,
 * `resolveSslOptions`). Mastra's Postgres client must not be allowed to
 * downgrade TLS in production.
 */
export function mastraSslOptions(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean | { rejectUnauthorized: boolean; ca?: string } {
  const e = env as Record<string, string | undefined>;
  const dbDisableSsl = e.DB_DISABLE_SSL ?? process.env.DB_DISABLE_SSL;
  if (dbDisableSsl === 'true') {
    const localDocker =
      (e.KESTREL_LOCAL_DOCKER ?? process.env.KESTREL_LOCAL_DOCKER) === 'true';
    const nodeEnv = e.NODE_ENV ?? process.env.NODE_ENV;
    if (nodeEnv !== 'production' || localDocker) return false;
    throw new Error(
      '[mastra] DB_DISABLE_SSL=true is only permitted with KESTREL_LOCAL_DOCKER=true; ' +
        'configure verified TLS for production databases.',
    );
  }
  const rawCa = e.SUPABASE_CA_CERT ?? process.env.SUPABASE_CA_CERT;
  const ca = rawCa
    ? rawCa
        .split(/\\n|\n/)
        .join('\n')
        .trim()
    : undefined;
  if (ca) return { ca, rejectUnauthorized: true };
  const nodeEnv = e.NODE_ENV ?? process.env.NODE_ENV;
  if (nodeEnv === 'production') return { rejectUnauthorized: true };
  return { rejectUnauthorized: false };
}

/**
 * Retention policies for growth tables (age-based; applied by
 * `storage.prune()` from a maintenance job — not yet wired in Phase 0).
 * Keys are validated against `DomainRetentionTables` at compile time.
 */
function mastraRetention(): RetentionConfig {
  return {
    memory: {
      messages: { maxAge: '90d' },
      threads: { maxAge: '180d' },
      // Audit v2 §4.4 (P2-4) — resources are user-scoped working memory, so
      // they get the longest age window rather than thread-lifetime pruning.
      resources: { maxAge: '365d' },
    },
    workflows: {
      workflowSnapshot: { maxAge: '30d' },
    },
    backgroundTasks: {
      backgroundTasks: { maxAge: '30d' },
    },
    schedules: {
      triggers: { maxAge: '90d' },
    },
  };
}

function libsqlUrl(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string {
  const e = env as Record<string, string | undefined>;
  const configured = e.MASTRA_LIBSQL_URL ?? process.env.MASTRA_LIBSQL_URL;
  if (configured && configured.length > 0) return configured;
  return 'file:./.kestrel/mastra.db';
}

export function resolveMastraStorageKind(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): MastraStorageKind {
  const e = env as Record<string, string | undefined>;
  const configured = e.MASTRA_STORAGE ?? process.env.MASTRA_STORAGE;
  return configured === 'postgres'
    ? 'postgres'
    : configured === 'libsql'
      ? 'libsql'
      : mastraDirectConnectionString(env) !== null
        ? 'postgres'
        : 'libsql';
}

export function ensureLibsqlParent(url: string): void {
  if (url === ':memory:' || !url.startsWith('file:')) return;
  const path = url.slice('file:'.length);
  if (!path || path === ':memory:') return;
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch (error) {
    mlog.warn('Could not create LibSQL storage directory (non-fatal)', {
      path: dirname(path),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Create the Mastra runtime store for the current environment.
 *
 * Constructing the store does not connect or create tables; Mastra
 * initializes its schema lazily on first use. Callers that need the schema
 * up front (server boot, worker boot) should await
 * `initializeMastraStorage(result)`.
 */
export function createMastraStorage(env: NodeJS.ProcessEnv = process.env): MastraStorageResult {
  const kind: MastraStorageKind = resolveMastraStorageKind(env);

  if (kind === 'postgres') {
    // Runtime storage uses the pooled URL; DDL/schema init still uses the
    // direct connection (see `initializeMastraStorage` callers with
    // `mastraDirectConnectionString`).
    const connectionString = mastraRuntimeConnectionString(env);
    if (!connectionString) {
      throw new Error(
        '[mastra] MASTRA_STORAGE=postgres requires DATABASE_URL, POSTGRES_URL, DIRECT_URL, ' +
          'or POSTGRES_URL_NON_POOLING to be set.',
      );
    }
    const schemaName = env.MASTRA_SCHEMA ?? 'mastra';
    const poolMax = Number(env.MASTRA_DB_POOL_MAX ?? env.MASTRA_STORAGE_POOL_MAX ?? '5');
    mlog.debug('Creating Mastra Postgres storage', {
      schemaName,
      poolMax: Number.isFinite(poolMax) && poolMax > 0 ? Math.floor(poolMax) : 5,
      ssl: env.NODE_ENV === 'production' ? 'verify' : 'insecure-dev',
    });
    return {
      storage: new PostgresStore({
        id: 'kestrel-mastra',
        connectionString,
        schemaName,
        ssl: mastraSslOptions(env),
        max: Number.isFinite(poolMax) && poolMax > 0 ? Math.floor(poolMax) : 5,
        idleTimeoutMillis: 20_000,
        retention: mastraRetention(),
      }),
      kind,
    };
  }

  const url = libsqlUrl(env);
  ensureLibsqlParent(url);
  mlog.debug('Creating Mastra LibSQL storage', { url });
  return { storage: new LibSQLStore({ id: 'kestrel-mastra', url }), kind };
}

/**
 * Process-wide cached storage for maintenance / pruning jobs (Audit v3 Phase 7,
 * fixes P1-6). Anchored on `globalThis` (Phase 2, P1-03) so Next.js HMR
 * re-evaluations reuse the live pool instead of stranding a 5-connection
 * `pg.Pool`.
 */
const globalForMastraStorage = globalThis as unknown as {
  __kestrelMastraStorageCache?: { key: string; result: MastraStorageResult } | null;
};

function storageCacheKey(env: NodeJS.ProcessEnv = process.env): string {
  const kind = resolveMastraStorageKind(env);
  if (kind === 'postgres') {
    const conn = mastraRuntimeConnectionString(env) ?? '';
    const schema = env.MASTRA_SCHEMA ?? 'mastra';
    return `postgres:${conn}:${schema}`;
  }
  return `libsql:${libsqlUrl(env)}`;
}

function isMockConstructorCleared(fn: unknown): boolean {
  if (typeof fn !== 'function' || !('mock' in fn)) return false;
  const mockObj = (fn as { mock?: { calls?: unknown[] } }).mock;
  return Array.isArray(mockObj?.calls) && mockObj.calls.length === 0;
}

export function getSharedMastraStorage(env: NodeJS.ProcessEnv = process.env): MastraStorageResult {
  const key = storageCacheKey(env);
  const cached = globalForMastraStorage.__kestrelMastraStorageCache ?? null;
  const mockCleared =
    isMockConstructorCleared(PostgresStore) && isMockConstructorCleared(LibSQLStore);
  if (cached && cached.key === key && !mockCleared) {
    return cached.result;
  }
  const result = createMastraStorage(env);
  globalForMastraStorage.__kestrelMastraStorageCache = { key, result };
  return result;
}

export function _resetMastraStorageCache(): void {
  globalForMastraStorage.__kestrelMastraStorageCache = null;
}

/** Close the shared Mastra storage pool (graceful shutdown / tests). */
export async function closeMastraStorage(): Promise<void> {
  const cached = globalForMastraStorage.__kestrelMastraStorageCache ?? null;
  if (!cached) return;
  const store = cached.result.storage as MastraCompositeStore & {
    close?: () => Promise<void>;
  };
  if (typeof store.close === 'function') {
    await store.close();
    mlog.info('Mastra storage pool closed', { kind: cached.result.kind });
  }
  globalForMastraStorage.__kestrelMastraStorageCache = null;
}

/** Explicitly initialize the storage schema (idempotent). Safe to call at boot. */
export async function initializeMastraStorage(result: MastraStorageResult): Promise<void> {
  const store = result.storage as MastraCompositeStore & { init?: () => Promise<void> };
  if (typeof store.init === 'function') {
    await store.init();
    mlog.info('Mastra storage initialized', { kind: result.kind });
  }
}

/**
 * Run Mastra's age-based retention pruning (Phase 0 config, wired here).
 * Reuses `getSharedMastraStorage` so cron runs never leak Postgres connection pools.
 *
 * Accepts either the full `MastraStorageResult` wrapper or a raw
 * `MastraCompositeStore` (e.g. `getKestrelMastra().instance.getStorage()`),
 * so the worker can prune through the instance's existing pool instead of
 * spinning up a second `PostgresStore` just for retention (Phase 2, P1-02).
 *
 * Best-effort: logs failures, never throws.
 */
export async function pruneMastraStorage(
  existingStorage?: MastraStorageResult | MastraCompositeStore,
): Promise<{
  pruned: boolean;
  error?: string;
}> {
  try {
    const result: MastraStorageResult | undefined =
      existingStorage === undefined
        ? getSharedMastraStorage(process.env)
        : 'storage' in existingStorage
          ? (existingStorage as MastraStorageResult)
          : { storage: existingStorage, kind: 'postgres' };
    if (!result) return { pruned: false, error: 'no storage configured' };
    const store = result.storage as MastraCompositeStore & { prune?: () => Promise<void> };
    if (typeof store.prune === 'function') {
      await store.prune();
      mlog.info('Mastra storage retention pruning completed', { kind: result.kind });
      return { pruned: true };
    }
    mlog.debug('Mastra storage does not expose prune(); skipping retention', { kind: result.kind });
    return { pruned: false, error: 'storage.prune() not available' };
  } catch (error) {
    mlog.warn('Mastra storage retention pruning failed (non-fatal)', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { pruned: false, error: error instanceof Error ? error.message : String(error) };
  }
}
