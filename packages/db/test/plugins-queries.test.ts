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

// Schema-level guarantees for the plugin platform. These are the two
// invariants the query layer relies on: every table is RLS-protected and
// scoped by (tenant, user, plugin), and generated plugin tables cannot omit
// the tenant columns.

import { getTableConfig, text } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { createPluginTable, pluginStorage, userInstalledPlugins } from '../src/schema/plugins';

describe('plugin schema', () => {
  it('keys installations by (user_id, plugin_id) and enables RLS', () => {
    const config = getTableConfig(userInstalledPlugins);
    expect(config.name).toBe('user_installed_plugins');
    expect(config.enableRLS).toBe(true);
    expect(config.primaryKeys[0]?.columns.map((c) => c.name)).toEqual(['user_id', 'plugin_id']);
    expect(config.policies.map((policy) => policy.name)).toContain('tenant_isolation');
    expect(config.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(['tenant_id', 'settings', 'enabled', 'onboarding_completed']),
    );
  });

  it('scopes plugin storage by tenant, user, plugin, collection and key', () => {
    const config = getTableConfig(pluginStorage);
    expect(config.name).toBe('plugin_storage');
    expect(config.enableRLS).toBe(true);
    expect(config.primaryKeys[0]?.columns.map((c) => c.name)).toEqual([
      'tenant_id',
      'user_id',
      'plugin_id',
      'collection',
      'key',
    ]);
    expect(config.policies.map((policy) => policy.name)).toContain('tenant_isolation');
  });

  it('prefixes generated plugin tables and injects the isolation columns', () => {
    const table = createPluginTable('paper-trading', 'orders', {
      symbol: text('symbol').notNull(),
    });
    const config = getTableConfig(table);
    expect(config.name).toBe('plg_paper_trading_orders');
    expect(config.enableRLS).toBe(true);
    expect(config.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(['id', 'tenant_id', 'user_id', 'symbol', 'created_at']),
    );
    expect(config.columns.find((column) => column.name === 'id')?.primary).toBe(true);
    expect(config.policies.map((policy) => policy.name)).toContain('tenant_isolation');
  });

  it('rejects unsafe plugin ids and table names', () => {
    expect(() => createPluginTable('PaperTrading', 'orders', {})).toThrow(/invalid plugin id/);
    expect(() => createPluginTable('paper-trading', 'orders; drop table user', {})).toThrow(
      /invalid table name/,
    );
  });
});
