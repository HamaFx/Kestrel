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

// Per-user plugin install state and zero-migration plugin storage.
//
// Every user-facing helper resolves the caller's tenant and scopes writes by
// both `user_id` and `tenant_id`; RLS is the second line of defence.

import { and, asc, desc, eq } from 'drizzle-orm';

import { getDb, schema, type DbClient } from '../client';
import { requireTenantIdForUser } from '../tenant';

export type InstalledPluginRow = typeof schema.userInstalledPlugins.$inferSelect;

export interface InstallPluginInput {
  userId: string;
  pluginId: string;
  /** Already encrypted by `encryptPluginSettings` when the plugin has secrets. */
  settings?: Record<string, unknown>;
  onboardingCompleted?: boolean;
}

export interface PluginStorageScope {
  userId: string;
  pluginId: string;
  /** Optional cached tenant id; resolved from membership when omitted. */
  tenantId?: string;
}

export interface PluginStorageValue {
  key: string;
  value: unknown;
  updatedAt: Date;
}

async function resolveTenant(scope: PluginStorageScope, db: DbClient): Promise<string> {
  return scope.tenantId ?? requireTenantIdForUser(scope.userId, db);
}

// ── Installation state ───────────────────────────────────────────────────

export async function listInstalledPlugins(
  userId: string,
  db: DbClient = getDb(),
): Promise<InstalledPluginRow[]> {
  const tenantId = await requireTenantIdForUser(userId, db);
  return db
    .select()
    .from(schema.userInstalledPlugins)
    .where(
      and(
        eq(schema.userInstalledPlugins.userId, userId),
        eq(schema.userInstalledPlugins.tenantId, tenantId),
      ),
    )
    .orderBy(desc(schema.userInstalledPlugins.installedAt));
}

export async function getInstalledPlugin(
  userId: string,
  pluginId: string,
  db: DbClient = getDb(),
): Promise<InstalledPluginRow | undefined> {
  const tenantId = await requireTenantIdForUser(userId, db);
  const rows = await db
    .select()
    .from(schema.userInstalledPlugins)
    .where(
      and(
        eq(schema.userInstalledPlugins.userId, userId),
        eq(schema.userInstalledPlugins.tenantId, tenantId),
        eq(schema.userInstalledPlugins.pluginId, pluginId),
      ),
    )
    .limit(1);
  return rows[0];
}

export async function getInstalledPluginIdsForUser(
  userId: string,
  opts?: { enabledOnly?: boolean },
  db: DbClient = getDb(),
): Promise<string[]> {
  const rows = await listInstalledPlugins(userId, db);
  return rows
    .filter((row) => (opts?.enabledOnly === false ? true : row.enabled))
    .map((row) => row.pluginId);
}

/**
 * Install or re-enable a plugin. Idempotent: re-installing an existing plugin
 * preserves its data and replaces settings only when supplied.
 */
export async function installPlugin(
  input: InstallPluginInput,
  db: DbClient = getDb(),
): Promise<InstalledPluginRow> {
  const tenantId = await requireTenantIdForUser(input.userId, db);
  const rows = await db
    .insert(schema.userInstalledPlugins)
    .values({
      userId: input.userId,
      tenantId,
      pluginId: input.pluginId,
      enabled: true,
      settings: input.settings ?? {},
      onboardingCompleted: input.onboardingCompleted ?? false,
    })
    .onConflictDoUpdate({
      target: [schema.userInstalledPlugins.userId, schema.userInstalledPlugins.pluginId],
      set: {
        tenantId,
        enabled: true,
        // Re-installing must not wipe settings the caller did not supply.
        ...(input.settings !== undefined ? { settings: input.settings } : {}),
        ...(input.onboardingCompleted !== undefined
          ? { onboardingCompleted: input.onboardingCompleted }
          : {}),
        updatedAt: new Date(),
      },
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error(`[db] installPlugin returned no row for ${input.pluginId}`);
  return row;
}

export async function setPluginEnabled(
  userId: string,
  pluginId: string,
  enabled: boolean,
  db: DbClient = getDb(),
): Promise<InstalledPluginRow | undefined> {
  const tenantId = await requireTenantIdForUser(userId, db);
  const rows = await db
    .update(schema.userInstalledPlugins)
    .set({ enabled, updatedAt: new Date() })
    .where(
      and(
        eq(schema.userInstalledPlugins.userId, userId),
        eq(schema.userInstalledPlugins.tenantId, tenantId),
        eq(schema.userInstalledPlugins.pluginId, pluginId),
      ),
    )
    .returning();
  return rows[0];
}

export interface UpdatePluginSettingsInput {
  userId: string;
  pluginId: string;
  settings: Record<string, unknown>;
  onboardingCompleted?: boolean;
}

export async function updatePluginSettings(
  input: UpdatePluginSettingsInput,
  db: DbClient = getDb(),
): Promise<InstalledPluginRow | undefined> {
  const tenantId = await requireTenantIdForUser(input.userId, db);
  const rows = await db
    .update(schema.userInstalledPlugins)
    .set({
      settings: input.settings,
      ...(input.onboardingCompleted !== undefined
        ? { onboardingCompleted: input.onboardingCompleted }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.userInstalledPlugins.userId, input.userId),
        eq(schema.userInstalledPlugins.tenantId, tenantId),
        eq(schema.userInstalledPlugins.pluginId, input.pluginId),
      ),
    )
    .returning();
  return rows[0];
}

/**
 * Remove an installation. `wipeData` (default false) also deletes every
 * `plugin_storage` document for this user + plugin.
 */
export async function uninstallPlugin(
  input: { userId: string; pluginId: string; wipeData?: boolean },
  db: DbClient = getDb(),
): Promise<boolean> {
  const tenantId = await requireTenantIdForUser(input.userId, db);
  if (input.wipeData) {
    await clearPluginStorageForTenant(tenantId, input.userId, input.pluginId, undefined, db);
  }
  const rows = await db
    .delete(schema.userInstalledPlugins)
    .where(
      and(
        eq(schema.userInstalledPlugins.userId, input.userId),
        eq(schema.userInstalledPlugins.tenantId, tenantId),
        eq(schema.userInstalledPlugins.pluginId, input.pluginId),
      ),
    )
    .returning({ pluginId: schema.userInstalledPlugins.pluginId });
  return rows.length > 0;
}

/**
 * Cross-tenant lookup used by worker plugin jobs.
 *
 * MUST run on the admin connection (`ADMIN_DATABASE_URL`); the worker's
 * `getDb()` already selects it. Never call this from a user request.
 */
export async function listEnabledPluginUsers(
  pluginId: string,
  db: DbClient = getDb(),
): Promise<Array<{ userId: string; tenantId: string; settings: Record<string, unknown> }>> {
  const rows = await db
    .select({
      userId: schema.userInstalledPlugins.userId,
      tenantId: schema.userInstalledPlugins.tenantId,
      settings: schema.userInstalledPlugins.settings,
    })
    .from(schema.userInstalledPlugins)
    .where(
      and(
        eq(schema.userInstalledPlugins.pluginId, pluginId),
        eq(schema.userInstalledPlugins.enabled, true),
      ),
    )
    .orderBy(asc(schema.userInstalledPlugins.userId));
  return rows;
}

// ── Plugin storage ───────────────────────────────────────────────────────

export async function pluginStorageGet(
  scope: PluginStorageScope,
  collection: string,
  key: string,
  db: DbClient = getDb(),
): Promise<unknown | null> {
  const tenantId = await resolveTenant(scope, db);
  const rows = await db
    .select({ value: schema.pluginStorage.value })
    .from(schema.pluginStorage)
    .where(
      and(
        eq(schema.pluginStorage.tenantId, tenantId),
        eq(schema.pluginStorage.userId, scope.userId),
        eq(schema.pluginStorage.pluginId, scope.pluginId),
        eq(schema.pluginStorage.collection, collection),
        eq(schema.pluginStorage.key, key),
      ),
    )
    .limit(1);
  return rows[0]?.value ?? null;
}

export async function pluginStorageSet(
  scope: PluginStorageScope,
  collection: string,
  key: string,
  value: unknown,
  db: DbClient = getDb(),
): Promise<void> {
  const tenantId = await resolveTenant(scope, db);
  await db
    .insert(schema.pluginStorage)
    .values({
      tenantId,
      userId: scope.userId,
      pluginId: scope.pluginId,
      collection,
      key,
      value,
    })
    .onConflictDoUpdate({
      target: [
        schema.pluginStorage.tenantId,
        schema.pluginStorage.userId,
        schema.pluginStorage.pluginId,
        schema.pluginStorage.collection,
        schema.pluginStorage.key,
      ],
      set: { value, updatedAt: new Date() },
    });
}

export async function pluginStorageList(
  scope: PluginStorageScope,
  collection: string,
  db: DbClient = getDb(),
): Promise<PluginStorageValue[]> {
  const tenantId = await resolveTenant(scope, db);
  const rows = await db
    .select({
      key: schema.pluginStorage.key,
      value: schema.pluginStorage.value,
      updatedAt: schema.pluginStorage.updatedAt,
    })
    .from(schema.pluginStorage)
    .where(
      and(
        eq(schema.pluginStorage.tenantId, tenantId),
        eq(schema.pluginStorage.userId, scope.userId),
        eq(schema.pluginStorage.pluginId, scope.pluginId),
        eq(schema.pluginStorage.collection, collection),
      ),
    )
    .orderBy(asc(schema.pluginStorage.key));
  return rows;
}

export async function pluginStorageDelete(
  scope: PluginStorageScope,
  collection: string,
  key: string,
  db: DbClient = getDb(),
): Promise<void> {
  const tenantId = await resolveTenant(scope, db);
  await db
    .delete(schema.pluginStorage)
    .where(
      and(
        eq(schema.pluginStorage.tenantId, tenantId),
        eq(schema.pluginStorage.userId, scope.userId),
        eq(schema.pluginStorage.pluginId, scope.pluginId),
        eq(schema.pluginStorage.collection, collection),
        eq(schema.pluginStorage.key, key),
      ),
    );
}

/** Delete a whole collection, or every document for the plugin when omitted. */
export async function pluginStorageClear(
  scope: PluginStorageScope,
  collection?: string,
  db: DbClient = getDb(),
): Promise<void> {
  const tenantId = await resolveTenant(scope, db);
  await clearPluginStorageForTenant(tenantId, scope.userId, scope.pluginId, collection, db);
}

async function clearPluginStorageForTenant(
  tenantId: string,
  userId: string,
  pluginId: string,
  collection: string | undefined,
  db: DbClient,
): Promise<void> {
  const filters = [
    eq(schema.pluginStorage.tenantId, tenantId),
    eq(schema.pluginStorage.userId, userId),
    eq(schema.pluginStorage.pluginId, pluginId),
  ];
  if (collection !== undefined) {
    filters.push(eq(schema.pluginStorage.collection, collection));
  }
  await db.delete(schema.pluginStorage).where(and(...filters));
}
