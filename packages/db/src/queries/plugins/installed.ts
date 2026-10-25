/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Per-user plugin installation state.
//
// Every user-facing helper resolves the caller's tenant and scopes writes by
// both `user_id` and `tenant_id`; RLS is the second line of defence.

import { and, asc, desc, eq } from 'drizzle-orm';

import { getDb, schema, type DbClient } from '../../client';
import { requireTenantIdForUser } from '../../tenant';
import { clearPluginStorageForTenant } from './storage';
import type { InstalledPluginRow, InstallPluginInput, UpdatePluginSettingsInput } from './types';

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
