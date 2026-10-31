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

// Audit 2026-10-31 (R1, R19) — the application role must actually enforce RLS.
//
// The sibling RLS suite proves PostgreSQL semantics on a probe table; this one
// proves Kestrel's own schema: a fresh database is migrated and every assertion
// below runs with the privileges of `kestrel_app` (the role created NOLOGIN by
// migration 0094 and used by the web app in a hardened deployment).
//
// The connection-level assertions use `SET LOCAL ROLE kestrel_app` inside a
// transaction rather than logging in as the role. Roles are cluster-scoped, so
// ALTERing its password would leak into every other database on the server and
// race a parallel suite. `SET LOCAL ROLE` drops superuser privileges for the
// duration of the transaction and is scoped to it — the same posture a
// deployment connects with.
//
// It fails if:
//   - the role can bypass RLS (someone connected the app as a superuser again),
//   - a table is missing grants (the 0097 → 0094 gap that made
//     provider_circuit_state unusable),
//   - tenant isolation regresses, or
//   - an unscoped query stops failing closed.
//
// Opt in with RUN_POSTGRES_RLS_TESTS=1 and TEST_POSTGRES_ADMIN_URL.

import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const enabled = process.env.RUN_POSTGRES_RLS_TESTS === '1';
const adminUrl = process.env.TEST_POSTGRES_ADMIN_URL;

const APP_ROLE = 'kestrel_app';
const USER_A = 'app-role-user-a';
const USER_B = 'app-role-user-b';
// The `user` insert trigger provisions a personal organization whose id equals
// the user id, so each user's tenant is their own id.
const TENANT_A = USER_A;
const TENANT_B = USER_B;

let admin: ReturnType<typeof postgres> | null = null;
let isolatedClient: ReturnType<typeof postgres> | null = null;
let databaseName = '';

async function applyMigrations(client: ReturnType<typeof postgres>): Promise<void> {
  const dir = join(process.cwd(), 'drizzle');
  const journal = JSON.parse(readFileSync(join(dir, 'meta/_journal.json'), 'utf-8'));
  for (const entry of journal.entries ?? []) {
    const file = readdirSync(dir).find((name: string) => name.startsWith(`${entry.tag}.sql`));
    if (!file) throw new Error(`Missing migration ${entry.tag}`);
    const statements = readFileSync(join(dir, file), 'utf-8').split('--> statement-breakpoint');
    for (const statement of statements) {
      const executable = statement
        .split('\n')
        .filter((line: string) => !line.trim().startsWith('--'))
        .join('\n')
        .trim();
      if (executable) await client.unsafe(executable);
    }
  }
}

/** Minimal shape of a transaction handle for the raw queries below. */
interface TxLike {
  unsafe<T = unknown[]>(query: string): Promise<T>;
}

/**
 * Run `fn` in a transaction whose current role is `kestrel_app`, optionally with
 * the tenant GUC set — i.e. exactly what `withTenantDbFresh` does for the app.
 */
async function asAppRole<T>(fn: (tx: TxLike) => Promise<T>, tenant?: string): Promise<T> {
  // postgres-js types `begin` as returning UnwrapPromiseArray<T>; the callback
  // here always resolves a value, so the cast is safe.
  const result = await isolatedClient!.begin<T>(async (tx) => {
    await tx.unsafe(`SET LOCAL ROLE ${APP_ROLE}`);
    if (tenant) await tx.unsafe(`SELECT set_config('app.current_tenant', '${tenant}', true)`);
    return fn(tx as unknown as TxLike);
  });
  return result as unknown as T;
}

describe.skipIf(!enabled || !adminUrl)('application role enforces RLS on the real schema', () => {
  beforeAll(async () => {
    admin = postgres(adminUrl!, { max: 2, prepare: false });
    databaseName = `kestrel_app_role_${randomUUID().replaceAll('-', '_')}`;
    await admin.unsafe(`CREATE DATABASE ${databaseName}`);

    const url = new URL(adminUrl!);
    url.pathname = `/${databaseName}`;
    const isolated = url.toString();

    const migrateClient = postgres(isolated, { max: 1, prepare: false });
    await migrateClient.unsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
    await migrateClient.unsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
      END
      $$;
    `);
    await applyMigrations(migrateClient);

    // Seed two users (their personal organizations are created by the trigger).
    await migrateClient.unsafe(
      `INSERT INTO "user" ("id","email") VALUES ('${USER_A}','app-role-a@example.com'),('${USER_B}','app-role-b@example.com')`,
    );
    await migrateClient.end({ timeout: 1 });

    // Every assertion below runs against the migrated database: `admin` stays
    // on the maintenance database so it can DROP this one during cleanup.
    isolatedClient = postgres(isolated, { max: 2, prepare: false });
  });

  afterAll(async () => {
    await isolatedClient?.end({ timeout: 2 });
    if (admin) {
      await admin.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
      await admin.end({ timeout: 2 });
    }
  });

  it('connects as a role that cannot bypass row level security', async () => {
    const [row] = await asAppRole(async (tx) =>
      tx.unsafe<{ role: string; is_super: boolean; bypasses: boolean }[]>(
        `SELECT current_user AS role,
                (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS is_super,
                (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypasses`,
      ),
    );

    expect(row?.role).toBe(APP_ROLE);
    expect(row?.is_super).toBe(false);
    expect(row?.bypasses).toBe(false);
  });

  it('has table privileges for every table in the schema (R19 regression guard)', async () => {
    const rows = await isolatedClient!.unsafe<{ tablename: string; privs: string | null }[]>(`
      SELECT t.tablename,
             (SELECT string_agg(g.privilege_type, ',' ORDER BY g.privilege_type)
                FROM information_schema.role_table_grants g
               WHERE g.grantee = '${APP_ROLE}' AND g.table_name = t.tablename) AS privs
        FROM pg_tables t
       WHERE t.schemaname = 'public'
       ORDER BY t.tablename
    `);

    expect(rows.length).toBeGreaterThan(50);

    const missing = rows.filter((r) => r.privs === null).map((r) => r.tablename);
    expect(missing, `tables without ${APP_ROLE} grants`).toEqual([]);

    const incomplete = rows
      .filter((r) => {
        const have = new Set((r.privs ?? '').split(','));
        return !['SELECT', 'INSERT', 'UPDATE', 'DELETE'].every((p) => have.has(p));
      })
      .map((r) => `${r.tablename}: ${r.privs}`);
    expect(incomplete, 'tables missing one of SELECT/INSERT/UPDATE/DELETE').toEqual([]);
  });

  it('resolves the tenant bootstrap before a tenant scope exists', async () => {
    const rows = await asAppRole((tx) =>
      tx.unsafe<{ org_id: string }[]>(
        `SELECT org_id FROM organization_member WHERE user_id = '${USER_A}'`,
      ),
    );
    expect(rows.map((r) => r.org_id)).toContain(TENANT_A);
  });

  it('reads only its own rows inside a tenant scope', async () => {
    await asAppRole(
      (tx) =>
        tx.unsafe(
          `INSERT INTO chat_threads (id, user_id, title, tenant_id, created_at, updated_at)
           VALUES (gen_random_uuid(), '${USER_A}', 'scoped thread', '${TENANT_A}', now(), now())`,
        ),
      TENANT_A,
    );

    const seenByB = await asAppRole((tx) => tx.unsafe(`SELECT id FROM chat_threads`), TENANT_B);
    expect(seenByB.length).toBe(0);
  });

  it('rejects a cross-tenant write', async () => {
    await expect(
      asAppRole(
        (tx) =>
          tx.unsafe(
            `INSERT INTO chat_threads (id, user_id, title, tenant_id, created_at, updated_at)
             VALUES (gen_random_uuid(), '${USER_B}', 'cross tenant', '${TENANT_A}', now(), now())`,
          ),
        TENANT_B,
      ),
    ).rejects.toThrow(/row-level security|violates/i);
  });

  it('fails closed for an unscoped read and an unscoped write', async () => {
    const unscopedRead = await asAppRole((tx) => tx.unsafe(`SELECT id FROM chat_threads`));
    expect(unscopedRead.length).toBe(0);

    await expect(
      asAppRole((tx) =>
        tx.unsafe(
          `INSERT INTO chat_threads (id, user_id, title, tenant_id, created_at, updated_at)
           VALUES (gen_random_uuid(), '${USER_A}', 'unscoped', '${TENANT_A}', now(), now())`,
        ),
      ),
    ).rejects.toThrow(/row-level security|violates/i);
  });

  it('can use the tables that migrations once forgot to grant', async () => {
    await asAppRole((tx) =>
      tx.unsafe(
        `INSERT INTO provider_circuit_state (model_id, consecutive_failures, opened_at, updated_at)
         VALUES ('probe/model', 0, now(), now())
         ON CONFLICT (model_id) DO UPDATE SET consecutive_failures = 0`,
      ),
    );
    const rows = await asAppRole((tx) => tx.unsafe(`SELECT model_id FROM provider_circuit_state`));
    expect(rows.length).toBeGreaterThan(0);
  });

  describe('withUserTenant gives RSC entry points a scope', () => {
    // A dedicated login role rather than the shared `kestrel_app`: roles are
    // cluster-scoped, so creating/altering a throwaway name keeps parallel
    // suites and other databases untouched.
    const probeRole = `kestrel_app_probe_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const probePassword = `pw_${randomUUID().replaceAll('-', '')}`;
    let probeUrl = '';
    let probeClient: ReturnType<typeof postgres> | null = null;

    beforeAll(async () => {
      await admin!.unsafe(
        `CREATE ROLE ${probeRole} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${probePassword}'`,
      );
      await isolatedClient!.unsafe(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${probeRole}`,
      );

      const url = new URL(adminUrl!);
      url.pathname = `/${databaseName}`;
      url.username = probeRole;
      url.password = probePassword;
      probeUrl = url.toString();
      probeClient = postgres(probeUrl, { max: 2, prepare: false });

      // The page helpers must see the app-side connection pool.
      process.env.DATABASE_URL = probeUrl;
      process.env.KESTREL_ENABLE_RLS = 'true';
      process.env.MULTI_USER_ENABLED = '1';
      process.env.DB_DISABLE_SSL = 'true';
      process.env.KESTREL_RUNTIME = 'web';

      await isolatedClient!.unsafe(
        `INSERT INTO user_settings (user_id, tenant_id, default_symbol)
         VALUES ('${USER_A}', '${TENANT_A}', 'XAUUSD') ON CONFLICT (user_id) DO NOTHING`,
      );
    });

    afterAll(async () => {
      await probeClient?.end({ timeout: 2 });
      await isolatedClient!.unsafe(`DROP OWNED BY ${probeRole}`);
      await admin!.unsafe(`DROP ROLE IF EXISTS ${probeRole}`);
    });

    it('returns no rows unscoped, then returns them inside withUserTenant', async () => {
      // Fresh module registry so the query layer builds its pool from the
      // app-role DATABASE_URL set above.
      vi.resetModules();
      const queries = await import('../src/queries/user-settings');
      const threads = await import('../src/queries/threads');
      const { withUserTenant } = await import('../src/with-user-tenant');
      const { closeDb } = await import('../src/client');

      try {
        // Entry points outside withAuth (RSC pages) used to read like this.
        expect(await queries.getOwnUserSettings(USER_A)).toBeNull();

        const scopedSettings = await withUserTenant(USER_A, () =>
          queries.getOwnUserSettings(USER_A),
        );
        expect(scopedSettings).not.toBeNull();
        expect(scopedSettings?.defaultSymbol).toBe('XAUUSD');

        const scopedThreads = await withUserTenant(USER_A, () => threads.listThreads(USER_A, 5));
        expect(scopedThreads.length).toBeGreaterThan(0);

        // The scope must not outlive the wrapper.
        expect(await queries.getOwnUserSettings(USER_A)).toBeNull();
      } finally {
        await closeDb();
      }
    });
  });
});
