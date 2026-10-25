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

// Plugin platform tables.
//
// `user_installed_plugins` is the per-user install state (D-01: no plans, no
// billing gates). `plugin_storage` gives plugins zero-migration JSON
// persistence isolated by tenant + user + plugin.

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  jsonb,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  type PgColumnBuilderBase,
} from 'drizzle-orm/pg-core';

import { organization, users } from '../core/auth';

const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const PLUGIN_TABLE_PART_PATTERN = /^[a-z][a-z0-9_]*$/;

function tenantIsolation() {
  return pgPolicy('tenant_isolation', {
    for: 'all',
    using: sql`tenant_id = current_setting('app.current_tenant', true)`,
    withCheck: sql`tenant_id = current_setting('app.current_tenant', true)`,
  });
}

function tenantColumn() {
  return text('tenant_id')
    .notNull()
    .default(sql`current_setting('app.current_tenant', true)`)
    .references(() => organization.id, { onDelete: 'cascade' });
}

// ── Per-user installation state ──────────────────────────────────────────

export const userInstalledPlugins = pgTable(
  'user_installed_plugins',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: tenantColumn(),
    pluginId: text('plugin_id').notNull(),
    /** Disabled keeps settings/data but hides every capability. */
    enabled: boolean('enabled').notNull().default(true),
    /**
     * Per-user settings. Fields declared `.meta({ secret: true })` on the
     * plugin's `settingsSchema` are AES-256-GCM encrypted by the caller.
     */
    settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
    onboardingCompleted: boolean('onboarding_completed').notNull().default(false),
    installedAt: timestamp('installed_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.pluginId], name: 'user_installed_plugins_pkey' }),
    index('user_installed_plugins_tenant_idx').on(t.tenantId),
    index('user_installed_plugins_plugin_enabled_idx').on(t.pluginId, t.enabled),
    check(
      'user_installed_plugins_plugin_id_format',
      sql`${t.pluginId} ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'`,
    ),
    tenantIsolation(),
  ],
).enableRLS();

export type UserInstalledPluginRow = typeof userInstalledPlugins.$inferSelect;
export type UserInstalledPluginInsert = typeof userInstalledPlugins.$inferInsert;

// ── Zero-migration plugin storage ────────────────────────────────────────

export const pluginStorage = pgTable(
  'plugin_storage',
  {
    tenantId: tenantColumn(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    pluginId: text('plugin_id').notNull(),
    collection: text('collection').notNull(),
    key: text('key').notNull(),
    value: jsonb('value').$type<unknown>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    primaryKey({
      columns: [t.tenantId, t.userId, t.pluginId, t.collection, t.key],
      name: 'plugin_storage_pkey',
    }),
    index('plugin_storage_lookup_idx').on(t.pluginId, t.userId, t.collection),
    check('plugin_storage_plugin_id_format', sql`${t.pluginId} ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'`),
    check('plugin_storage_collection_length', sql`char_length(${t.collection}) BETWEEN 1 AND 64`),
    check('plugin_storage_key_length', sql`char_length(${t.key}) BETWEEN 1 AND 128`),
    tenantIsolation(),
  ],
).enableRLS();

export type PluginStorageRow = typeof pluginStorage.$inferSelect;
export type PluginStorageInsert = typeof pluginStorage.$inferInsert;

// ── High-volume plugin tables ────────────────────────────────────────────

/**
 * Build a tenant-isolated table for a plugin that needs relational storage
 * (backtest runs, paper orders, …).
 *
 * The physical name is automatically prefixed `plg_<pluginId>_<tableName>`
 * and the table receives `tenant_id`, `user_id`, timestamps, an index and the
 * standard RLS policy. High-volume plugins still ship one SQL migration; this
 * helper guarantees the security-critical columns cannot be forgotten.
 */
export function createPluginTable(
  pluginId: string,
  tableName: string,
  columns: Record<string, PgColumnBuilderBase>,
) {
  if (!PLUGIN_ID_PATTERN.test(pluginId)) {
    throw new Error(`[db] createPluginTable: invalid plugin id "${pluginId}"`);
  }
  if (!PLUGIN_TABLE_PART_PATTERN.test(tableName)) {
    throw new Error(`[db] createPluginTable: invalid table name "${tableName}"`);
  }
  const physicalName = `plg_${pluginId.replaceAll('-', '_')}_${tableName}`;
  if (physicalName.length > 63) {
    throw new Error(
      `[db] createPluginTable: physical table name "${physicalName}" exceeds PostgreSQL's 63-character limit`,
    );
  }
  const table = pgTable(
    physicalName,
    {
      id: uuid('id').primaryKey().defaultRandom(),
      tenantId: tenantColumn(),
      userId: text('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
      createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
      updatedAt: timestamp('updated_at', { withTimezone: true })
        .defaultNow()
        .notNull()
        .$onUpdate(() => new Date()),
      ...columns,
    },
    (t) => [index(`${physicalName}_tenant_user_idx`).on(t.tenantId, t.userId), tenantIsolation()],
  );
  return table.enableRLS();
}
