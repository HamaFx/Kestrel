// @vitest-environment node
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

// Audit 2026-10-31 (R1) — end-to-end proof that a settings server action is
// tenant-scoped when it runs as the application role.
//
// GATED, following the convention of packages/db/test/postgres-app-role.test.ts:
// runs only with RUN_POSTGRES_RLS_TESTS=1, TEST_POSTGRES_APP_URL (a
// `kestrel_app` login URL for a migrated scratch database) and
// TEST_POSTGRES_ADMIN_URL (a privileged URL for the same database).
//
// What it proves against a real PostgreSQL 16:
//   1. As `kestrel_app` (NOBYPASSRLS) an unscoped read of `user_settings`
//      returns zero rows, and an unscoped update matches zero rows — the
//      silent failure mode R1 describes.
//   2. `updateMarketDataProviderAction` still saves, because it opens its own
//      tenant scope, and the write is visible to a privileged reader.
//   3. `updateApiKeysAction` preserves the stored BYOK keys it read inside its
//      own scope while storing a newly submitted key.

import { eq } from 'drizzle-orm';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, Mock, vi } from 'vitest';

import { auth } from '@/auth';

const enabled = process.env.RUN_POSTGRES_RLS_TESTS === '1';
const appUrl = process.env.TEST_POSTGRES_APP_URL ?? '';
const adminUrl = process.env.TEST_POSTGRES_ADMIN_URL ?? '';
// Fixed BYOK key for the seeded vault rows; the action and the probe share it.
const PROBE_ENCRYPTION_SECRET = '0123456789abcdef'.repeat(4);

// Provider health checks are network calls; the vault round-trip is what this
// file is about.
const mockTestProviderKey = vi.hoisted(() => vi.fn());
vi.mock('@kestrel/ai', () => ({ testProviderKey: mockTestProviderKey }));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/http/action-errors', () => ({ logActionError: vi.fn() }));
vi.mock('@kestrel/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kestrel/db')>();
  return {
    ...actual,
    // Rate limiting has its own suite; this test is about the action's scope.
    withRateLimit: vi.fn(async () => ({ allowed: true, count: 1, limit: 10 })),
  };
});

const PROBE_USER = 'e2e-settings-scope-probe';
const PROBE_EMAIL = `${PROBE_USER}@example.test`;

describe.skipIf(!enabled || !appUrl || !adminUrl)(
  'settings actions run as the kestrel_app role',
  () => {
    let admin: Client;
    let marketActionModule: typeof import('../src/app/(app)/settings/_actions/api-keys-market');
    let apiKeysActionModule: typeof import('../src/app/(app)/settings/_actions/api-keys-save');
    let dbModule: typeof import('@kestrel/db');

    beforeAll(async () => {
      // The pool reads DATABASE_URL on first use, so the environment must be
      // set before any query — the actions and the probes below then connect
      // as the non-bypass application role.
      process.env.DATABASE_URL = appUrl;
      process.env.KESTREL_ENABLE_RLS = 'true';
      process.env.MULTI_USER_ENABLED = '1';
      process.env.DB_DISABLE_SSL = 'true';
      process.env.KESTREL_RUNTIME = 'web';
      process.env.ENCRYPTION_SECRET = PROBE_ENCRYPTION_SECRET;

      admin = new Client({ connectionString: adminUrl });
      await admin.connect();

      // The `user` insert trigger provisions a personal organization; the
      // explicit inserts cover databases where it does not.
      await admin.query(
        `INSERT INTO "user" (id, email, name) VALUES ($1, $2, 'Scope probe') ON CONFLICT (id) DO NOTHING`,
        [PROBE_USER, PROBE_EMAIL],
      );
      await admin.query(
        `INSERT INTO organization (id, name) VALUES ($1, 'Scope probe') ON CONFLICT (id) DO NOTHING`,
        [PROBE_USER],
      );
      await admin.query(
        `INSERT INTO organization_member (org_id, user_id, role) VALUES ($1, $1, 'owner') ON CONFLICT DO NOTHING`,
        [PROBE_USER],
      );
      await admin.query(
        `INSERT INTO user_settings (user_id, tenant_id, market_data_provider)
         VALUES ($1, $1, 'biquote')
         ON CONFLICT (user_id) DO UPDATE SET market_data_provider = 'biquote'`,
        [PROBE_USER],
      );

      const { encryptByok } = await import('@kestrel/shared/encryption');
      await admin.query(`UPDATE user_settings SET ai_api_keys = $2 WHERE user_id = $1`, [
        PROBE_USER,
        encryptByok({ google: 'old-g', opencode: 'oc-1' }),
      ]);

      mockTestProviderKey.mockResolvedValue({ ok: true });
      (auth as Mock).mockImplementation(async () => ({
        user: { id: PROBE_USER, email: PROBE_EMAIL },
        expires: new Date(Date.now() + 3_600_000).toISOString(),
      }));

      marketActionModule = await import('../src/app/(app)/settings/_actions/api-keys-market');
      apiKeysActionModule = await import('../src/app/(app)/settings/_actions/api-keys-save');
      dbModule = await import('@kestrel/db');
    });

    afterAll(async () => {
      try {
        if (admin) {
          await admin.query(`DELETE FROM user_settings WHERE user_id = $1`, [PROBE_USER]);
          await admin.query(`DELETE FROM organization_member WHERE user_id = $1`, [PROBE_USER]);
          await admin.query(`DELETE FROM organization WHERE id = $1`, [PROBE_USER]);
          await admin.query(`DELETE FROM "user" WHERE id = $1`, [PROBE_USER]);
        }
      } finally {
        await dbModule?.closeDb();
        await admin?.end();
      }
    });

    it('hides the settings row from an unscoped read and update as kestrel_app', async () => {
      const db = dbModule.getDb();
      const rows = await db
        .select()
        .from(dbModule.schema.userSettings)
        .where(eq(dbModule.schema.userSettings.userId, PROBE_USER));
      expect(rows).toEqual([]);

      // This is the pre-fix failure mode: an unscoped UPDATE does not raise —
      // the RLS `USING` predicate simply matches zero rows, so the action
      // returned `{ok: true}` while saving nothing.
      const updated = await db
        .update(dbModule.schema.userSettings)
        .set({ marketDataProvider: 'live-ticks' })
        .where(eq(dbModule.schema.userSettings.userId, PROBE_USER))
        .returning({ userId: dbModule.schema.userSettings.userId });
      expect(updated).toEqual([]);

      const { rows: after } = await admin.query<{ market_data_provider: string }>(
        `SELECT market_data_provider FROM user_settings WHERE user_id = $1`,
        [PROBE_USER],
      );
      expect(after[0]?.market_data_provider).toBe('biquote');
    });

    it('saves the market-data provider through the action inside its own scope', async () => {
      const formData = new FormData();
      formData.append('marketDataProvider', 'finnhub');

      const result = await marketActionModule.updateMarketDataProviderAction(formData);
      expect(result).toEqual({ ok: true });

      const { rows } = await admin.query<{ market_data_provider: string }>(
        `SELECT market_data_provider FROM user_settings WHERE user_id = $1`,
        [PROBE_USER],
      );
      expect(rows[0]?.market_data_provider).toBe('finnhub');
    });

    it('preserves stored BYOK keys while storing a newly submitted one', async () => {
      const { BYOK_KEY_KEEP } =
        await import('../src/app/(app)/settings/api-keys/_components/byok-key-sentinel');
      const formData = new FormData();
      formData.append('google', BYOK_KEY_KEEP);
      formData.append('openai', 'sk-new');

      const result = await apiKeysActionModule.updateApiKeysAction({ status: 'idle' }, formData);
      expect(result.ok).toBe(true);
      expect(mockTestProviderKey).toHaveBeenCalledWith('openai', 'sk-new');

      const { decryptByok } = await import('@kestrel/shared/encryption');
      const { rows } = await admin.query<{ ai_api_keys: string }>(
        `SELECT ai_api_keys FROM user_settings WHERE user_id = $1`,
        [PROBE_USER],
      );
      // The stored payload must contain the newly submitted key AND the keys
      // the form did not touch — before the R1 fix the read was invisible and
      // the write matched zero rows, so neither held.
      expect(decryptByok(rows[0]?.ai_api_keys)).toMatchObject({
        google: 'old-g',
        opencode: 'oc-1',
        openai: 'sk-new',
      });
    });
  },
);
