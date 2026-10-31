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

// Audit 2026-10-31 (R1) — tenant scope for entry points that are not the API
// boundary.
//
// `withAuth` opens a tenant transaction, so every service it calls already has
// `app.current_tenant` set. React Server Components, the layout, cron handlers
// and CLI paths start outside that boundary. Under the non-bypass application
// role (`kestrel_app`) an unscoped query does not error — it silently returns
// **no rows**, because `current_setting('app.current_tenant', true)` is NULL
// and every `tenant_isolation` policy evaluates to false. An unscoped read
// therefore looks like an empty account instead of a bug.
//
// `withUserTenant` is the fix at those entry points: it resolves the user's
// tenant (short-circuited when a matching scope is already active) and runs the
// callback inside `withTenantDb`, so nested helper calls inherit the scope.
//
// Lives in its own module rather than `connection/scope.ts` because it needs
// `requireTenantIdForUser` from `tenant.ts`, which already imports `client.ts`
// — importing it from scope.ts would close an import cycle.

import { withTenantDb, type DbClient } from './client';
import { requireTenantIdForUser } from './tenant';

/**
 * Run `work` with the given user's tenant scope active.
 *
 * @example
 *   const data = await withUserTenant(session.user.id, async (db) => {
 *     const settings = await getOwnUserSettings(session.user.id); // now in scope
 *     return db.select().from(schema.chatThreads).limit(10);
 *   });
 */
export async function withUserTenant<T>(
  userId: string,
  work: (db: DbClient) => Promise<T>,
): Promise<T> {
  const tenantId = await requireTenantIdForUser(userId);
  // withTenantDb reuses an existing same-tenant scope, so calling this inside a
  // route that already entered one is a no-op rather than a nested transaction.
  return withTenantDb(tenantId, work, { userId });
}
