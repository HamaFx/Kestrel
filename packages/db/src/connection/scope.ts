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

// Tenant/RLS scope resolution: request-scoped AsyncLocalStorage contexts,
// the tenant/admin client selection used by `getDb()`, and the
// `withTenantDb*` transaction wrappers.

import { AsyncLocalStorage } from 'node:async_hooks';

import { sql } from 'drizzle-orm';

import { getAdminDbPool, getPrimaryDb, getReplicaDb } from './pools';
import type { DbClient, TenantDbScopeOptions } from './types';

interface TenantDbScope {
  tenantId: string;
  db: DbClient;
  userId?: string;
}

// RLS context is request-scoped. The transaction client is carried through
// async work so repositories that call getDb() directly still use the tenant
// transaction established by the web boundary.
const tenantDbScope = new AsyncLocalStorage<TenantDbScope>();
const adminDbScope = new AsyncLocalStorage<DbClient>();

/**
 * Whether RLS is enabled. RLS is required in every supported deployment —
 * `withTenantDb*` sets the `app.current_tenant` GUC so RLS policies enforce
 * isolation. The check is kept (rather than hardcoded true) so tests can
 * stub it and a misconfigured instance fails closed at the call sites.
 *
 * `KESTREL_ENABLE_RLS` is the only accepted name; the pre-rebrand
 * `HAMAFX_ENABLE_RLS` alias was removed in 0.2.0.
 */
export function isRlsEnabled(): boolean {
  const value = process.env.KESTREL_ENABLE_RLS;
  return value === 'true' || value === '1';
}

function assertTenantIsolationConfig(): void {
  const multiUserEnabled =
    process.env.MULTI_USER_ENABLED === 'true' || process.env.MULTI_USER_ENABLED === '1';
  if (multiUserEnabled && !isRlsEnabled()) {
    throw new Error(
      '[db] MULTI_USER_ENABLED requires KESTREL_ENABLE_RLS=true; refusing to open a database connection without tenant isolation.',
    );
  }
}

/**
 * Lazy-initialised drizzle client for read-only replicas.
 * Uses `DATABASE_URL_REPLICA` when set; falls back to the primary
 * connection when no replica is configured (single-node deployments).
 */
export function getDbRO(): DbClient {
  const tenantScope = tenantDbScope.getStore();
  if (tenantScope) return tenantScope.db;
  const adminScope = adminDbScope.getStore();
  if (adminScope) return adminScope;
  assertTenantIsolationConfig();

  const replica = getReplicaDb();
  if (replica) return replica;
  return getDb();
}

export function getDb(): DbClient {
  assertTenantIsolationConfig();
  const tenantScope = tenantDbScope.getStore();
  if (tenantScope) return tenantScope.db;
  const adminScope = adminDbScope.getStore();
  if (adminScope) return adminScope;
  // Worker jobs are cross-tenant by design. They must never inherit the
  // web application's non-privileged connection when shared mode is active.
  if (process.env.KESTREL_RUNTIME === 'worker' && process.env.ADMIN_DATABASE_URL) {
    return getAdminDb();
  }
  return getPrimaryDb();
}

/**
 * Admin DB client that connects as the `kestrel_admin` role (BYPASSRLS).
 *
 * Used by the worker, cron jobs, and membership lookup before entering a
 * tenant transaction. Requires `ADMIN_DATABASE_URL`; there
 * is no fallback to the tenant-scoped connection.
 *
 * @throws if ADMIN_DATABASE_URL is not set while RLS is enabled.
 */
export function getAdminDb(): DbClient {
  assertTenantIsolationConfig();
  return getAdminDbPool();
}

export async function withAdminDb<T>(work: (db: DbClient) => Promise<T>): Promise<T> {
  assertTenantIsolationConfig();
  const db = getAdminDb();
  return adminDbScope.run(db, () => work(db));
}

/** Whether the current async execution context has a tenant transaction. */
export function hasTenantDbScope(): boolean {
  return tenantDbScope.getStore() !== undefined;
}

/** Return the current tenant transaction, if one is active. */
export function getTenantDbScope(): { tenantId: string; db: DbClient; userId?: string } | null {
  return tenantDbScope.getStore() ?? null;
}

/**
 * Run work inside a transaction that sets the current tenant GUC for
 * RLS-aware query paths.
 *
 * Always wraps work in a transaction — callers depend on this for
 * atomic multi-statement writes (e.g., inserting chat messages +
 * telemetry in one unit). RLS is always enabled in a supported
 * deployment; if it is somehow off, `assertTenantIsolationConfig` and
 * the schema-level checks fail closed rather than running unscoped.
 *
 * For read-only operations, prefer `withTenantDbRO`.
 */
export async function withTenantDbFresh<T>(
  tenantId: string,
  work: (db: DbClient) => Promise<T>,
  opts?: TenantDbScopeOptions,
): Promise<T> {
  assertTenantIsolationConfig();
  return getPrimaryDb().transaction(async (tx) => {
    const scopedDb = tx as unknown as DbClient;
    // RLS is enforced by the non-bypass connection role (`kestrel_app`, granted
    // in migration 0094). We deliberately do NOT `SET LOCAL ROLE authenticated`:
    // migration 0070 revoked every table and sequence privilege from that role,
    // so switching to it would fail with SQLSTATE 42501 on the first query.
    await tx.execute(sql`SELECT set_config('app.current_tenant', ${tenantId}, true)`);
    return tenantDbScope.run(
      { tenantId, db: scopedDb, ...(opts?.userId ? { userId: opts.userId } : {}) },
      () => work(scopedDb),
    );
  });
}

/**
 * Run work inside a tenant transaction, reusing an active same-tenant scope
 * when one exists. Use withTenantDbFresh for independent stream lifecycles.
 *
 * `opts.userId` is forwarded into the fresh scope so repository calls inside
 * `work` short-circuit their membership lookup (see getTenantIdForUser) — a
 * request that calls five repositories would otherwise repeat the
 * organization_member join five times.
 */
export async function withTenantDb<T>(
  tenantId: string,
  work: (db: DbClient) => Promise<T>,
  opts?: { userId?: string },
): Promise<T> {
  assertTenantIsolationConfig();
  const current = tenantDbScope.getStore();
  if (current?.tenantId === tenantId) return work(current.db);
  return withTenantDbFresh(tenantId, work, opts);
}

/**
 * Read-only variant of withTenantDb.
 *
 * Runs in a READ ONLY transaction with the tenant GUC set. Postgres can
 * optimise read-only transactions (no lock contention, no WAL writes).
 * RLS is always enabled in a supported deployment — there is no unscoped
 * read path.
 */
export async function withTenantDbRO<T>(
  tenantId: string,
  work: (db: DbClient) => Promise<T>,
  opts?: TenantDbScopeOptions,
): Promise<T> {
  const current = tenantDbScope.getStore();
  if (current?.tenantId === tenantId) return work(current.db);
  if (!isRlsEnabled()) {
    // PF-15: Use read replica when available
    return work(getDbRO());
  }
  const db = getDbRO();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION READ ONLY`);
    // No `SET LOCAL ROLE authenticated` — see withTenantDbFresh for why.
    await tx.execute(sql`SELECT set_config('app.current_tenant', ${tenantId}, true)`);
    const scopedDb = tx as unknown as DbClient;
    return tenantDbScope.run(
      { tenantId, db: scopedDb, ...(opts?.userId ? { userId: opts.userId } : {}) },
      () => work(scopedDb),
    );
  });
}
