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

// Zero-migration plugin storage documents, always scoped by
// (tenant, user, plugin) so RLS and the query predicate agree.

import { and, asc, eq } from 'drizzle-orm';

import { getDb, schema, type DbClient } from '../../client';
import { requireTenantIdForUser } from '../../tenant';
import type { PluginStorageScope, PluginStorageValue } from './types';

async function resolveTenant(scope: PluginStorageScope, db: DbClient): Promise<string> {
  return scope.tenantId ?? requireTenantIdForUser(scope.userId, db);
}

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

/** Internal helper shared with `uninstallPlugin({ wipeData: true })`. */
export async function clearPluginStorageForTenant(
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
