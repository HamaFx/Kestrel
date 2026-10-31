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

import { getTenantDbScope, schema, withTenantDb, type DbClient } from '../../client';
import { requireTenantIdForUser } from '../../tenant';
import type { PluginStorageScope, PluginStorageValue } from './types';

async function resolveTenant(scope: PluginStorageScope, db?: DbClient): Promise<string> {
  return scope.tenantId ?? requireTenantIdForUser(scope.userId, db);
}

/**
 * Run plugin-storage work on a tenant connection.
 *
 * Public plugin webhooks, worker jobs and streaming chat continuations execute
 * after the request transaction has closed. `plugin_storage` is FORCE ROW
 * LEVEL SECURITY, so an unscoped connection would read zero rows (breaking
 * idempotency ledgers) and reject inserts with SQLSTATE 42501. An explicitly
 * supplied handle is used as-is; an active tenant scope for the same
 * user/tenant is reused; anything else opens its own `withTenantDb` scope.
 */
async function withPluginStorageDb<T>(
  scope: PluginStorageScope,
  db: DbClient | undefined,
  fn: (db: DbClient, tenantId: string) => Promise<T>,
): Promise<T> {
  if (db) {
    return fn(db, await resolveTenant(scope, db));
  }

  const active = getTenantDbScope();
  const activeMatchesScope =
    active !== null &&
    (scope.tenantId === undefined || scope.tenantId === active.tenantId) &&
    (active.userId === undefined || active.userId === scope.userId);
  if (active && activeMatchesScope) {
    return fn(active.db, scope.tenantId ?? active.tenantId);
  }

  const tenantId = await resolveTenant(scope);
  return withTenantDb(tenantId, (scopedDb) => fn(scopedDb, tenantId), { userId: scope.userId });
}

export async function pluginStorageGet(
  scope: PluginStorageScope,
  collection: string,
  key: string,
  db?: DbClient,
): Promise<unknown | null> {
  return withPluginStorageDb(scope, db, async (queryDb, tenantId) => {
    const rows = await queryDb
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
  });
}

export async function pluginStorageSet(
  scope: PluginStorageScope,
  collection: string,
  key: string,
  value: unknown,
  db?: DbClient,
): Promise<void> {
  await withPluginStorageDb(scope, db, async (queryDb, tenantId) => {
    await queryDb
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
  });
}

export async function pluginStorageList(
  scope: PluginStorageScope,
  collection: string,
  db?: DbClient,
): Promise<PluginStorageValue[]> {
  return withPluginStorageDb(scope, db, async (queryDb, tenantId) => {
    const rows = await queryDb
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
  });
}

export async function pluginStorageDelete(
  scope: PluginStorageScope,
  collection: string,
  key: string,
  db?: DbClient,
): Promise<void> {
  await withPluginStorageDb(scope, db, async (queryDb, tenantId) => {
    await queryDb
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
  });
}

/** Delete a whole collection, or every document for the plugin when omitted. */
export async function pluginStorageClear(
  scope: PluginStorageScope,
  collection?: string,
  db?: DbClient,
): Promise<void> {
  await withPluginStorageDb(scope, db, async (queryDb, tenantId) => {
    await clearPluginStorageForTenant(tenantId, scope.userId, scope.pluginId, collection, queryDb);
  });
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
