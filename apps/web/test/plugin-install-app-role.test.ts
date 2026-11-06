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

// End-to-end proof that the Paper Trading install lifecycle works under RLS
// as the non-bypass `kestrel_app` role.
//
// GATED, following the sibling `settings-actions-app-role.test.ts` convention:
// RUN_POSTGRES_RLS_TESTS=1, TEST_POSTGRES_APP_URL and TEST_POSTGRES_ADMIN_URL.
//
// Covers the regression from the preview runtime findings:
//   1. The plugin's own install hook seeds both accounts even when it has no
//      inherited AsyncLocalStorage tenant scope (the bundled-module case).
//   2. `installPluginForUser` succeeds through the same request-style tenant
//      transaction `withAuth` opens.
//   3. Uninstall without `wipeData` keeps account data; uninstall with
//      `wipeData` removes it.

import type * as DbModule from '@kestrel/db';
import type { PluginUserLifecycleContext } from '@kestrel/plugin-sdk';
import type * as PaperPluginModule from '@kestrel/plugin-paper-trading';
import type * as PluginsModule from '@kestrel/plugins';
import type * as PluginManageModule from '../src/lib/services/plugin-manage';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const enabled = process.env.RUN_POSTGRES_RLS_TESTS === '1';
const appUrl = process.env.TEST_POSTGRES_APP_URL ?? '';
const adminUrl = process.env.TEST_POSTGRES_ADMIN_URL ?? '';

const PROBE_USER = 'e2e-plugin-install-probe';
const PROBE_EMAIL = `${PROBE_USER}@example.test`;
const PLUGIN_ID = 'paper-trading';

describe.skipIf(!enabled || !appUrl || !adminUrl)(
  'paper trading plugin install runs as the kestrel_app role',
  () => {
    let admin: Client;
    let dbModule: typeof DbModule;
    let pluginModule: typeof PaperPluginModule;
    let manageModule: typeof PluginManageModule;
    let ensureBundledPluginsRegistered: typeof PluginsModule.ensureBundledPluginsRegistered;

    async function deletePluginRows(): Promise<void> {
      for (const table of [
        'plg_paper_trading_fills',
        'plg_paper_trading_orders',
        'plg_paper_trading_positions',
        'plg_paper_trading_strategy_runs',
        'plg_paper_trading_accounts',
        'plugin_storage',
        'user_installed_plugins',
      ]) {
        await admin.query(`DELETE FROM ${table} WHERE user_id = $1`, [PROBE_USER]);
      }
    }

    async function accountNames(): Promise<string[]> {
      const { rows } = await admin.query<{ name: string }>(
        `SELECT name FROM plg_paper_trading_accounts WHERE user_id = $1 ORDER BY name`,
        [PROBE_USER],
      );
      return rows.map((row) => row.name);
    }

    async function installRows(): Promise<number> {
      const { rows } = await admin.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM user_installed_plugins
         WHERE user_id = $1 AND plugin_id = $2`,
        [PROBE_USER, PLUGIN_ID],
      );
      return Number(rows[0]?.count ?? '0');
    }

    beforeAll(async () => {
      // The pool reads DATABASE_URL on first use; set the app-role URL before
      // importing any module that reaches for it.
      process.env.DATABASE_URL = appUrl;
      process.env.KESTREL_ENABLE_RLS = 'true';
      process.env.MULTI_USER_ENABLED = '1';
      process.env.DB_DISABLE_SSL = 'true';
      process.env.KESTREL_RUNTIME = 'web';
      process.env.NODE_ENV = 'test';

      admin = new Client({ connectionString: adminUrl });
      await admin.connect();

      await admin.query(
        `INSERT INTO "user" (id, email, name) VALUES ($1, $2, 'Plugin probe')
         ON CONFLICT (id) DO NOTHING`,
        [PROBE_USER, PROBE_EMAIL],
      );
      await admin.query(
        `INSERT INTO organization (id, name) VALUES ($1, 'Plugin probe')
         ON CONFLICT (id) DO NOTHING`,
        [PROBE_USER],
      );
      await admin.query(
        `INSERT INTO organization_member (org_id, user_id, role) VALUES ($1, $1, 'owner')
         ON CONFLICT DO NOTHING`,
        [PROBE_USER],
      );
      await deletePluginRows();

      dbModule = await import('@kestrel/db');
      ({ ensureBundledPluginsRegistered } = await import('@kestrel/plugins'));
      ensureBundledPluginsRegistered();
      manageModule = await import('../src/lib/services/plugin-manage');
      pluginModule = await import('@kestrel/plugin-paper-trading');
    }, 120_000);

    afterAll(async () => {
      try {
        if (admin) {
          await deletePluginRows();
          await admin.query(`DELETE FROM organization_member WHERE user_id = $1`, [PROBE_USER]);
          await admin.query(`DELETE FROM organization WHERE id = $1`, [PROBE_USER]);
          await admin.query(`DELETE FROM "user" WHERE id = $1`, [PROBE_USER]);
        }
      } finally {
        await dbModule?.closeDb();
        await admin?.end();
      }
    }, 60_000);

    it('seeds both accounts when the hook has no inherited tenant scope', async () => {
      const hook = pluginModule.default.onUserInstall;
      expect(hook).toBeDefined();

      await hook?.({
        userId: PROBE_USER,
        tenantId: PROBE_USER,
        pluginId: PLUGIN_ID,
        settings: {},
        onboardingCompleted: true,
      } as unknown as PluginUserLifecycleContext);

      expect(await accountNames()).toEqual(['AI Agent Sandbox', 'Personal Demo']);
    });

    it('installs, keeps data on uninstall, then wipes on the final uninstall', async () => {
      await deletePluginRows();

      const installed = await dbModule.withTenantDbFresh(
        PROBE_USER,
        () =>
          manageModule.installPluginForUser(PROBE_USER, { action: 'install', pluginId: PLUGIN_ID }),
        { userId: PROBE_USER },
      );
      expect(installed.installed).toBe(true);
      expect(await installRows()).toBe(1);
      expect(await accountNames()).toEqual(['AI Agent Sandbox', 'Personal Demo']);

      const kept = await dbModule.withTenantDbFresh(
        PROBE_USER,
        () =>
          manageModule.uninstallPluginForUser(PROBE_USER, {
            action: 'uninstall',
            pluginId: PLUGIN_ID,
            wipeData: false,
          }),
        { userId: PROBE_USER },
      );
      expect(kept.installed).toBe(false);
      expect(await installRows()).toBe(0);
      expect(await accountNames()).toEqual(['AI Agent Sandbox', 'Personal Demo']);

      await dbModule.withTenantDbFresh(
        PROBE_USER,
        () =>
          manageModule.installPluginForUser(PROBE_USER, { action: 'install', pluginId: PLUGIN_ID }),
        { userId: PROBE_USER },
      );

      const wiped = await dbModule.withTenantDbFresh(
        PROBE_USER,
        () =>
          manageModule.uninstallPluginForUser(PROBE_USER, {
            action: 'uninstall',
            pluginId: PLUGIN_ID,
            wipeData: true,
          }),
        { userId: PROBE_USER },
      );
      expect(wiped.installed).toBe(false);
      expect(await installRows()).toBe(0);
      expect(await accountNames()).toEqual([]);
    });
  },
);
