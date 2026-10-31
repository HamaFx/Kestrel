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
// proves Kestrel's own schema: a fresh database is migrated, `kestrel_app`
// (created NOLOGIN by migration 0094) is given LOGIN, and every assertion below
// runs over a connection authenticated as that role.
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
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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
let app: ReturnType<typeof postgres> | null = null;
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

describe.skipIf(!enabled || !adminUrl)('application role enforces RLS on the real schema', () => {
  beforeAll(async () => {
    admin = postgres(adminUrl!, { max: 1, prepare: false });
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

    // Deployment provisioning gives the role LOGIN + a credential. Migrations
    // deliberately do not carry a password.
    const password = `pw_${randomUUID().replaceAll('-', '')}`;
    await admin.unsafe(`ALTER ROLE ${APP_ROLE} WITH LOGIN PASSWORD '${password}'`);

    const appUrl = new URL(isolated);
    appUrl.username = APP_ROLE;
    appUrl.password = password;
    app = postgres(appUrl.toString(), { max: 2, prepare: false });
  });

  afterAll(async () => {
    await app?.end({ timeout: 2 });
    if (admin) {
      await admin.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
      await admin.end({ timeout: 2 });
    }
  });

  it('connects as a role that cannot bypass row level security', async () => {
    const [row] = await app!.unsafe<{ role: string; is_super: boolean; bypasses: boolean }[]>(
      `SELECT current_user AS role,
              (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS is_super,
              (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypasses`,
    );

    expect(row?.role).toBe(APP_ROLE);
    expect(row?.is_super).toBe(false);
    expect(row?.bypasses).toBe(false);
  });

  it('has table privileges for every table in the schema (R19 regression guard)', async () => {
    const rows = await admin!.unsafe<{ tablename: string; privs: string | null }[]>(`
      SELECT t.tablename,
             (SELECT string_agg(g.privilege_type, ',' ORDER BY g.privilege_type)
                FROM information_schema.role_table_grants g
               WHERE g.grantee = '${APP_ROLE}' AND g.table_name = t.tablename) AS privs
        FROM pg_tables t
       WHERE t.schemaname = 'public'
         AND t.tablename <> '__none__'
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
    const rows = await app!.unsafe<{ org_id: string }[]>(
      `SELECT org_id FROM organization_member WHERE user_id = '${USER_A}'`,
    );
    expect(rows.map((r) => r.org_id)).toContain(TENANT_A);
  });

  it('reads only its own rows inside a tenant scope', async () => {
    await app!.begin(async (tx) => {
      await tx.unsafe(`SELECT set_config('app.current_tenant', '${TENANT_A}', true)`);
      await tx.unsafe(
        `INSERT INTO chat_threads (id, user_id, title, tenant_id, created_at, updated_at)
         VALUES (gen_random_uuid(), '${USER_A}', 'scoped thread', '${TENANT_A}', now(), now())`,
      );
    });

    const seenByB = await app!.begin(async (tx) => {
      await tx.unsafe(`SELECT set_config('app.current_tenant', '${TENANT_B}', true)`);
      return tx.unsafe(`SELECT id FROM chat_threads`);
    });

    expect(seenByB.length).toBe(0);
  });

  it('rejects a cross-tenant write', async () => {
    await expect(
      app!.begin(async (tx) => {
        await tx.unsafe(`SELECT set_config('app.current_tenant', '${TENANT_B}', true)`);
        return tx.unsafe(
          `INSERT INTO chat_threads (id, user_id, title, tenant_id, created_at, updated_at)
           VALUES (gen_random_uuid(), '${USER_B}', 'cross tenant', '${TENANT_A}', now(), now())`,
        );
      }),
    ).rejects.toThrow(/row-level security|violates/i);
  });

  it('fails closed for an unscoped read and an unscoped write', async () => {
    const unscopedRead = await app!.unsafe(`SELECT id FROM chat_threads`);
    expect(unscopedRead.length).toBe(0);

    await expect(
      app!.unsafe(
        `INSERT INTO chat_threads (id, user_id, title, tenant_id, created_at, updated_at)
         VALUES (gen_random_uuid(), '${USER_A}', 'unscoped', '${TENANT_A}', now(), now())`,
      ),
    ).rejects.toThrow(/row-level security|violates/i);
  });

  it('can use the tables that migrations once forgot to grant', async () => {
    await app!.unsafe(
      `INSERT INTO provider_circuit_state (model_id, consecutive_failures, opened_at, updated_at)
       VALUES ('probe/model', 0, now(), now())
       ON CONFLICT (model_id) DO UPDATE SET consecutive_failures = 0`,
    );
    const rows = await app!.unsafe(`SELECT model_id FROM provider_circuit_state`);
    expect(rows.length).toBeGreaterThan(0);
  });
});
