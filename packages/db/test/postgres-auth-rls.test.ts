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

// Audit 2026-10-31 (R1) — the auth/session helpers must work under RLS.
//
// Sibling of postgres-app-role.test.ts: a disposable database is migrated, the
// helpers under test run with a login role that has `NOBYPASSRLS` (granted the
// same table privileges as `kestrel_app`), and the raw assertions use
// `SET LOCAL ROLE kestrel_app` inside a transaction.
//
// What this pins:
//   - `withRateLimit` writes the pre-auth `__system__` bucket and an
//     authenticated user's bucket without an ambient scope (the login path),
//     resolving the user's membership org when it differs from the user id.
//   - `createUserSession` / `listUserSessions` / `revokeUserSession` /
//     `deleteUserSessions` see and mutate only the owner tenant's rows.
//   - `createAuditLog` writes a row the owner tenant can read and no other
//     tenant can.
//
// Opt in with RUN_POSTGRES_RLS_TESTS=1 and TEST_POSTGRES_ADMIN_URL.

import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { closeDb, type withTenantDbFresh } from '../src/client';
import type { deleteUserAccount } from '../src/queries/auth/account-deletion';
import type { createAuditLog } from '../src/queries/auth/audit';
import type {
  createUserSession,
  findSession,
  updateSessionLastActive,
} from '../src/queries/auth/sessions';
import type { createUserWithSettings } from '../src/queries/auth/users';
import type {
  deleteUserSessions,
  listUserSessions,
  revokeUserSession,
} from '../src/queries/user-sessions';
import type { withRateLimit } from '../src/rate-limit';

const enabled = process.env.RUN_POSTGRES_RLS_TESTS === '1';
const adminUrl = process.env.TEST_POSTGRES_ADMIN_URL;

const APP_ROLE = 'kestrel_app';
const USER_A = 'auth-rls-user-a';
const USER_B = 'auth-rls-user-b';
// USER_C's tenant deliberately differs from the user id (a shared workspace):
// the personal-organization trigger runs first, then the membership is moved.
const USER_C = 'auth-rls-user-c';
const SHARED_ORG = 'auth-rls-shared-org';

let admin: ReturnType<typeof postgres> | null = null;
let isolatedClient: ReturnType<typeof postgres> | null = null;
let probeRole = '';
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
 * Run `fn` in a transaction whose current role is `kestrel_app`, optionally
 * with the tenant GUC set — i.e. exactly what `withTenantDbFresh` does.
 */
async function asAppRole<T>(fn: (tx: TxLike) => Promise<T>, tenant?: string): Promise<T> {
  const result = await isolatedClient!.begin<T>(async (tx) => {
    await tx.unsafe(`SET LOCAL ROLE ${APP_ROLE}`);
    if (tenant) await tx.unsafe(`SELECT set_config('app.current_tenant', '${tenant}', true)`);
    return fn(tx as unknown as TxLike);
  });
  return result as unknown as T;
}

type AuthModules = {
  withRateLimit: typeof withRateLimit;
  createAuditLog: typeof createAuditLog;
  createUserSession: typeof createUserSession;
  findSession: typeof findSession;
  updateSessionLastActive: typeof updateSessionLastActive;
  createUserWithSettings: typeof createUserWithSettings;
  deleteUserAccount: typeof deleteUserAccount;
  listUserSessions: typeof listUserSessions;
  revokeUserSession: typeof revokeUserSession;
  deleteUserSessions: typeof deleteUserSessions;
  withTenantDbFresh: typeof withTenantDbFresh;
};

describe.skipIf(!enabled || !adminUrl)(
  'auth/session helpers enforce tenant scope under RLS',
  () => {
    let modules: AuthModules;
    const mutableEnv = process.env as Record<string, string | undefined>;
    const savedEnv: Record<string, string | undefined> = {};

    beforeAll(async () => {
      // A sibling test may have left a pool bound to another DATABASE_URL on
      // globalThis; start from a clean slate.
      await closeDb();

      admin = postgres(adminUrl!, { max: 2, prepare: false });
      databaseName = `kestrel_auth_rls_${randomUUID().replaceAll('-', '_')}`;
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

      // Seed three users. Their personal organizations are created by the
      // `user` insert trigger (id = user id).
      await migrateClient.unsafe(
        `INSERT INTO "user" ("id","email") VALUES
         ('${USER_A}','auth-rls-a@example.com'),
         ('${USER_B}','auth-rls-b@example.com'),
         ('${USER_C}','auth-rls-c@example.com')`,
      );
      // Move USER_C into a shared workspace so tenant_id !== user_id.
      await migrateClient.unsafe(
        `INSERT INTO organization (id, name) VALUES ('${SHARED_ORG}', 'Shared Workspace')`,
      );
      await migrateClient.unsafe(`DELETE FROM organization_member WHERE user_id = '${USER_C}'`);
      await migrateClient.unsafe(
        `INSERT INTO organization_member (org_id, user_id, role)
       VALUES ('${SHARED_ORG}', '${USER_C}', 'member')`,
      );
      // Seeded session rows (as the schema owner, RLS is bypassed).
      await migrateClient.unsafe(
        `INSERT INTO user_sessions (id, user_id, tenant_id) VALUES
         ('auth-rls-sess-a', '${USER_A}', '${USER_A}'),
         ('auth-rls-sess-b', '${USER_B}', '${USER_B}')`,
      );
      await migrateClient.end({ timeout: 1 });

      isolatedClient = postgres(isolated, { max: 2, prepare: false });

      // A dedicated login role rather than the shared `kestrel_app`: roles are
      // cluster-scoped, so a throwaway name keeps parallel suites and other
      // databases untouched. It mirrors the app role exactly (NOBYPASSRLS, DML
      // grants on every table).
      probeRole = `kestrel_auth_probe_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
      const probePassword = `pw_${randomUUID().replaceAll('-', '')}`;
      await admin.unsafe(
        `CREATE ROLE ${probeRole} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${probePassword}'`,
      );
      await isolatedClient.unsafe(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${probeRole}`,
      );

      const probeUrl = new URL(adminUrl!);
      probeUrl.pathname = `/${databaseName}`;
      probeUrl.username = probeRole;
      probeUrl.password = probePassword;

      for (const key of [
        'DATABASE_URL',
        'POSTGRES_URL',
        'KESTREL_ENABLE_RLS',
        'MULTI_USER_ENABLED',
        'DB_DISABLE_SSL',
        'KESTREL_RUNTIME',
        'ADMIN_DATABASE_URL',
      ]) {
        savedEnv[key] = mutableEnv[key];
      }
      mutableEnv.DATABASE_URL = probeUrl.toString();
      delete mutableEnv.POSTGRES_URL;
      mutableEnv.KESTREL_ENABLE_RLS = 'true';
      mutableEnv.MULTI_USER_ENABLED = '1';
      mutableEnv.DB_DISABLE_SSL = 'true';
      mutableEnv.KESTREL_RUNTIME = 'web';
      // The helpers under test must never fall back to the bypass role.
      delete mutableEnv.ADMIN_DATABASE_URL;

      // Fresh module registry so the query layer builds its pool from the
      // app-role DATABASE_URL set above.
      vi.resetModules();
      modules = {
        withRateLimit: (await import('../src/rate-limit')).withRateLimit,
        createAuditLog: (await import('../src/queries/auth/audit')).createAuditLog,
        createUserSession: (await import('../src/queries/auth/sessions')).createUserSession,
        findSession: (await import('../src/queries/auth/sessions')).findSession,
        updateSessionLastActive: (await import('../src/queries/auth/sessions'))
          .updateSessionLastActive,
        createUserWithSettings: (await import('../src/queries/auth/users')).createUserWithSettings,
        deleteUserAccount: (await import('../src/queries/auth/account-deletion')).deleteUserAccount,
        listUserSessions: (await import('../src/queries/user-sessions')).listUserSessions,
        revokeUserSession: (await import('../src/queries/user-sessions')).revokeUserSession,
        deleteUserSessions: (await import('../src/queries/user-sessions')).deleteUserSessions,
        withTenantDbFresh: (await import('../src/client')).withTenantDbFresh,
      };
    });

    afterAll(async () => {
      await closeDb();
      if (isolatedClient && probeRole) {
        await isolatedClient.unsafe(`DROP OWNED BY ${probeRole}`);
      }
      await isolatedClient?.end({ timeout: 2 });
      if (admin) {
        await admin.unsafe(`DROP ROLE IF EXISTS ${probeRole}`);
        await admin.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
        await admin.end({ timeout: 2 });
      }
      for (const [key, value] of Object.entries(savedEnv)) {
        if (value === undefined) delete mutableEnv[key];
        else mutableEnv[key] = value;
      }
    });

    it('writes a pre-auth (__system__) bucket inside the platform tenant', async () => {
      const first = await modules.withRateLimit('__system__', 'auth-rls-login-ip', 10);
      expect(first.allowed).toBe(true);
      expect(first.count).toBeGreaterThanOrEqual(1);

      const rows = await isolatedClient!.unsafe<{ tenant_id: string }[]>(
        `SELECT tenant_id FROM rate_limits
        WHERE user_id = '__system__' AND endpoint_group = 'auth-rls-login-ip'`,
      );
      expect(rows.length).toBeGreaterThanOrEqual(1);
      for (const row of rows) expect(row.tenant_id).toBe('__system__');

      const second = await modules.withRateLimit('__system__', 'auth-rls-login-ip', 10);
      // Either the same minute window (counter incremented) or a minute rollover.
      expect(second.count === first.count + 1 || second.count === 1).toBe(true);
    });

    it('resolves the membership tenant for an authenticated subject with no scope', async () => {
      const result = await modules.withRateLimit(USER_C, 'auth-rls-ai-chat', 10);
      expect(result.allowed).toBe(true);

      const rows = await isolatedClient!.unsafe<{ tenant_id: string }[]>(
        `SELECT tenant_id FROM rate_limits
        WHERE user_id = '${USER_C}' AND endpoint_group = 'auth-rls-ai-chat'`,
      );
      expect(rows.map((r) => r.tenant_id)).toEqual([SHARED_ORG]);
    });

    it('reuses an active tenant scope instead of opening a second connection', async () => {
      // The test pool is size 1 (NODE_ENV=test): a nested transaction would
      // deadlock instead of completing, so this also pins the reuse path.
      const result = await modules.withTenantDbFresh(
        USER_A,
        () => modules.withRateLimit(USER_A, 'auth-rls-scoped', 10),
        { userId: USER_A },
      );
      expect(result.allowed).toBe(true);

      const rows = await isolatedClient!.unsafe<{ tenant_id: string }[]>(
        `SELECT tenant_id FROM rate_limits
        WHERE user_id = '${USER_A}' AND endpoint_group = 'auth-rls-scoped'`,
      );
      expect(rows.map((r) => r.tenant_id)).toEqual([USER_A]);
    });

    it('creates a session row visible only inside the owner tenant', async () => {
      await modules.createUserSession('auth-rls-sess-a2', USER_A, 'probe', '127.0.0.1');

      const ownerRows = await asAppRole(
        (tx) => tx.unsafe(`SELECT id FROM user_sessions WHERE id = 'auth-rls-sess-a2'`),
        USER_A,
      );
      expect(ownerRows.length).toBe(1);

      const otherTenantRows = await asAppRole(
        (tx) => tx.unsafe(`SELECT id FROM user_sessions WHERE id = 'auth-rls-sess-a2'`),
        USER_B,
      );
      expect(otherTenantRows.length).toBe(0);

      const unscopedRows = await asAppRole((tx) =>
        tx.unsafe(`SELECT id FROM user_sessions WHERE id = 'auth-rls-sess-a2'`),
      );
      expect(unscopedRows.length).toBe(0);
    });

    it('looks up and updates only the seeded session of the calling user', async () => {
      // The two statements `validateSession` runs (SELECT join + last_active
      // UPDATE) succeed in the owner's scope and keep the other user's row
      // invisible.
      await modules.withTenantDbFresh(
        USER_A,
        async () => {
          expect(await modules.findSession('auth-rls-sess-a')).toBe(true);
          await modules.updateSessionLastActive('auth-rls-sess-a');
        },
        { userId: USER_A },
      );

      const updated = await asAppRole(
        (tx) =>
          tx.unsafe<{ n: number }[]>(
            `SELECT count(*)::int AS n FROM user_sessions
            WHERE id = 'auth-rls-sess-a' AND last_active_at > created_at`,
          ),
        USER_A,
      );
      expect(updated[0]?.n).toBe(1);

      // USER_B's seeded session stays invisible to USER_A's scope.
      const crossRows = await asAppRole(
        (tx) => tx.unsafe(`SELECT id FROM user_sessions WHERE id = 'auth-rls-sess-b'`),
        USER_A,
      );
      expect(crossRows.length).toBe(0);
    });

    it('fails closed for scope-less session lookups instead of reading empty', async () => {
      await expect(modules.findSession('auth-rls-sess-a')).rejects.toThrow(/tenant scope/i);
      await expect(modules.updateSessionLastActive('auth-rls-sess-a')).rejects.toThrow(
        /tenant scope/i,
      );
    });

    it('lists, revokes and deletes only the owner tenant sessions', async () => {
      const listed = await modules.listUserSessions(USER_A);
      const ids = listed.map((s) => s.id);
      expect(ids).toContain('auth-rls-sess-a');
      expect(ids).not.toContain('auth-rls-sess-b');

      await modules.revokeUserSession('auth-rls-sess-a2', USER_A);
      const revoked = await asAppRole(
        (tx) => tx.unsafe(`SELECT id FROM user_sessions WHERE id = 'auth-rls-sess-a2'`),
        USER_A,
      );
      expect(revoked.length).toBe(0);

      await modules.deleteUserSessions(USER_A);
      const remainingA = await asAppRole(
        (tx) => tx.unsafe(`SELECT id FROM user_sessions WHERE user_id = '${USER_A}'`),
        USER_A,
      );
      expect(remainingA.length).toBe(0);

      const remainingB = await asAppRole(
        (tx) => tx.unsafe(`SELECT id FROM user_sessions WHERE user_id = '${USER_B}'`),
        USER_B,
      );
      expect(remainingB.length).toBe(1);
    });

    it('writes an audit row no other tenant can see', async () => {
      await modules.createAuditLog(USER_A, 'auth-rls.test_event', { source: 'rls-suite' });

      const ownerRows = await asAppRole(
        (tx) => tx.unsafe(`SELECT id FROM audit_logs WHERE user_id = '${USER_A}'`),
        USER_A,
      );
      expect(ownerRows.length).toBe(1);

      const otherTenantRows = await asAppRole(
        (tx) => tx.unsafe(`SELECT id FROM audit_logs WHERE user_id = '${USER_A}'`),
        USER_B,
      );
      expect(otherTenantRows.length).toBe(0);

      const unscopedRows = await asAppRole((tx) => tx.unsafe(`SELECT id FROM audit_logs`));
      expect(unscopedRows.length).toBe(0);
    });

    it('registers a new account with its settings row in the personal tenant scope', async () => {
      const newUserId = 'auth-rls-registered-user';
      await modules.createUserWithSettings({
        id: newUserId,
        email: 'auth-rls-registered@example.com',
        name: 'Registered User',
        hashedPassword: 'not-a-real-hash',
      });

      const ownerRows = await asAppRole(
        (tx) =>
          tx.unsafe<{ user_id: string; tenant_id: string }[]>(
            `SELECT user_id, tenant_id FROM user_settings WHERE user_id = '${newUserId}'`,
          ),
        newUserId,
      );
      expect(ownerRows).toEqual([{ user_id: newUserId, tenant_id: newUserId }]);

      const otherTenantRows = await asAppRole(
        (tx) => tx.unsafe(`SELECT user_id FROM user_settings WHERE user_id = '${newUserId}'`),
        USER_B,
      );
      expect(otherTenantRows.length).toBe(0);
    });

    it('purges account data in the tenant scope instead of silently matching nothing', async () => {
      const doomedUser = 'auth-rls-doomed-user';
      await isolatedClient!.unsafe(
        `INSERT INTO "user" ("id","email") VALUES ('${doomedUser}','auth-rls-doomed@example.com')`,
      );
      await isolatedClient!.unsafe(
        `INSERT INTO user_sessions (id, user_id, tenant_id)
         VALUES ('auth-rls-doomed-session', '${doomedUser}', '${doomedUser}')`,
      );
      await isolatedClient!.unsafe(
        `INSERT INTO user_settings (user_id, tenant_id) VALUES ('${doomedUser}', '${doomedUser}')`,
      );

      await modules.deleteUserAccount(doomedUser);

      const settingsRows = await asAppRole(
        (tx) => tx.unsafe(`SELECT user_id FROM user_settings WHERE user_id = '${doomedUser}'`),
        doomedUser,
      );
      expect(settingsRows.length).toBe(0);
      const sessionRows = await asAppRole(
        (tx) => tx.unsafe(`SELECT id FROM user_sessions WHERE user_id = '${doomedUser}'`),
        doomedUser,
      );
      expect(sessionRows.length).toBe(0);
      const membershipRows = await isolatedClient!.unsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM organization_member WHERE user_id = '${doomedUser}'`,
      );
      expect(membershipRows[0]?.n).toBe(0);
      const tombstones = await isolatedClient!.unsafe<{ deleted: boolean }[]>(
        `SELECT "deletedAt" IS NOT NULL AS deleted FROM "user" WHERE id = '${doomedUser}'`,
      );
      expect(tombstones[0]?.deleted).toBe(true);

      // The other tenant's data is untouched by the purge.
      const otherSessions = await asAppRole(
        (tx) => tx.unsafe(`SELECT id FROM user_sessions WHERE user_id = '${USER_B}'`),
        USER_B,
      );
      expect(otherSessions.length).toBe(1);
    });
  },
);
