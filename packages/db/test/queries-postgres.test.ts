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

// Real PostgreSQL integration coverage for the query layer.
//
// The query modules are consumed by the worker/AI packages through mocks, so
// this suite is the DB package's own direct proof that the SQL they emit
// actually runs: migrations, ownership/lease transitions, idempotency keys,
// tenant scoping, recovery semantics and row mapping. Opt in with
// RUN_POSTGRES_RLS_TESTS=1 and TEST_POSTGRES_ADMIN_URL (same gate as the RLS
// isolation suite); it provisions a disposable database, applies the real
// Drizzle migrations and drops everything afterwards.

import { createMigratedTestDatabase, type MigratedTestDatabase } from '@kestrel/test-utils';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDb } from '../src/client';
import {
  addUserSymbol,
  countUserSymbols,
  listDistinctSymbols,
  listUserSymbols,
  removeUserSymbol,
} from '../src/queries/user-symbols';
import * as schema from '../src/schema';

const enabled = process.env.RUN_POSTGRES_RLS_TESTS === '1';
const adminUrl = process.env.TEST_POSTGRES_ADMIN_URL;

const USER_ID = 'queries-user-1';
// The user-table trigger provisions a personal organization whose id equals
// the user id, so the membership tenant for each seeded user is the user id.
const TENANT_ID = USER_ID;
const OTHER_USER_ID = 'queries-user-2';

type TestDb = ReturnType<typeof drizzle<typeof schema>>;

let raw: ReturnType<typeof postgres> | null = null;
let db: TestDb | null = null;
let testDb: MigratedTestDatabase | null = null;
const previousDatabaseUrl = process.env.DATABASE_URL;

describe.skipIf(!enabled || !adminUrl)('query layer — real PostgreSQL integration', () => {
  beforeAll(async () => {
    testDb = await createMigratedTestDatabase(adminUrl!, 'kestrel_queries');
    const isolatedUrl = testDb.connectionString;

    raw = postgres(isolatedUrl, { max: 1, prepare: false });
    await raw.unsafe(
      `INSERT INTO "user" ("id","email") VALUES ('${USER_ID}','queries-1@example.com'),('${OTHER_USER_ID}','queries-2@example.com')`,
    );
    await raw.unsafe(
      `INSERT INTO "symbol_catalog" ("symbol","name","category") VALUES ('XAUUSD','Gold','gold'),('EURUSD','Euro / US Dollar','forex') ON CONFLICT ("symbol") DO NOTHING`,
    );

    db = drizzle(raw, { schema });
    // Modules that call getDb() implicitly resolve this isolated database.
    // DB_DISABLE_SSL requires a non-production NODE_ENV (test) and keeps the
    // plain-TCP disposable container reachable.
    process.env.DATABASE_URL = isolatedUrl;
    process.env.DB_DISABLE_SSL = 'true';
  });

  beforeEach(async () => {
    await db!.delete(schema.journalEntries);
    await db!.delete(schema.userSymbols);
  });

  afterAll(async () => {
    await closeDb();
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    delete process.env.DB_DISABLE_SSL;
    await raw?.end({ timeout: 5 });
    await testDb?.drop();
  });

  it('maintains per-user watchlists with catalog-aware distinct symbol listing', async () => {
    await addUserSymbol(USER_ID, 'XAUUSD');
    await addUserSymbol(USER_ID, 'EURUSD');
    const rows = await listUserSymbols(USER_ID);
    expect(rows.map((row) => row.symbol)).toEqual(['XAUUSD', 'EURUSD']);
    expect(rows.map((row) => row.displayOrder)).toEqual([0, 1]);
    expect(await countUserSymbols(USER_ID)).toBe(2);
    expect(await listDistinctSymbols()).toEqual(expect.arrayContaining(['XAUUSD', 'EURUSD']));

    // Duplicate additions are idempotent; explicit order skips allocation.
    await addUserSymbol(USER_ID, 'XAUUSD');
    await addUserSymbol(USER_ID, 'GBPUSD', 7);
    expect(await countUserSymbols(USER_ID)).toBe(3);
    const reordered = await listUserSymbols(USER_ID);
    expect(reordered.at(-1)).toMatchObject({ symbol: 'GBPUSD', displayOrder: 7 });

    await removeUserSymbol(USER_ID, 'XAUUSD');
    expect(await countUserSymbols(USER_ID)).toBe(2);
    await expect(listUserSymbols(OTHER_USER_ID)).resolves.toEqual([]);
  });

  it('lists per-user watchlists with tenant scoping', async () => {
    await addUserSymbol(USER_ID, 'XAUUSD');
    const rows = await listUserSymbols(USER_ID);
    expect(rows.map((row) => row.symbol)).toEqual(['XAUUSD']);
    await expect(listUserSymbols(OTHER_USER_ID)).resolves.toEqual([]);
  });

  // 0117 regression — POST /login returned 500 (React #441, digest 1876515799)
  // because rate_limits.tenant_id defaulted to an EMPTY `app.current_tenant`
  // GUC and the tenant trigger only replaced NULLs, so the insert violated
  // rate_limits_tenant_id_fkey before credentials were checked.
  describe('tenant resolution with an empty app.current_tenant GUC', () => {
    it('falls back to the user/platform tenant instead of persisting an empty tenant_id', async () => {
      // Simulate the production condition: the GUC is present but empty
      // (role/database-level default or pooled-session state).
      await raw!.unsafe(`SELECT set_config('app.current_tenant', '', false)`);
      try {
        // The resolver must treat '' exactly like an unset GUC.
        const resolved = await raw!.unsafe<{ tenant: string }[]>(
          `SELECT hamafx_resolve_tenant_id('${USER_ID}') AS tenant`,
        );
        expect(resolved[0]?.tenant).toBe(TENANT_ID);

        // The pre-auth bucket keys on the platform subject; the tenant trigger
        // must seed a real organization id (never '').
        await raw!.unsafe(
          `INSERT INTO "rate_limits" ("user_id","endpoint_group","window_start","request_count")
           VALUES ('__system__','regression:login-ip',date_trunc('minute', now()),1)
           ON CONFLICT ("user_id","endpoint_group","window_start")
           DO UPDATE SET "request_count" = "rate_limits"."request_count" + 1`,
        );
        const rows = await raw!.unsafe<{ tenant_id: string }[]>(
          `SELECT tenant_id FROM "rate_limits" WHERE endpoint_group = 'regression:login-ip'`,
        );
        expect(rows).toHaveLength(1);
        expect(rows[0]?.tenant_id).toBe('__system__');

        // A real user's session insert resolves through the same fallback.
        await raw!.unsafe(
          `INSERT INTO "user_sessions" ("id","user_id","device_name","ip")
           VALUES ('regression-session','${USER_ID}','regression',NULL)`,
        );
        const session = await raw!.unsafe<{ tenant_id: string }[]>(
          `SELECT tenant_id FROM "user_sessions" WHERE id = 'regression-session'`,
        );
        expect(session[0]?.tenant_id).toBe(TENANT_ID);
      } finally {
        await raw!.unsafe(`DELETE FROM "rate_limits" WHERE endpoint_group = 'regression:login-ip'`);
        await raw!.unsafe(`DELETE FROM "user_sessions" WHERE id = 'regression-session'`);
        await raw!.unsafe(`SELECT set_config('app.current_tenant', '', false)`);
      }
    });
  });
});
