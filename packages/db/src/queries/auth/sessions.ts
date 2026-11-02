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

// Auth query helpers — user session rows (JWT callback support).
//
// Audit 2026-10-31 (R1): `user_sessions` carries `tenant_isolation` RLS, so
// every statement here must run in the owning user's tenant scope. The JWT
// callback runs before any request scope exists, which is why
// `createUserSession` opens the scope itself; `findSession` /
// `updateSessionLastActive` take only a session id and therefore cannot
// resolve a tenant — they fail closed instead of silently matching no rows.

import { eq, sql } from 'drizzle-orm';

import { getDb, getTenantDbScope, schema } from '../../client';
import { requireTenantIdForUser } from '../../tenant';
import { withUserTenant } from '../../tenant/with-user-tenant';

function assertTenantScope(fn: string): void {
  if (!getTenantDbScope()) {
    throw new Error(
      `[db] ${fn} requires an active tenant scope: user_sessions is RLS-protected ` +
        'and a session id alone cannot resolve its tenant. Call it inside ' +
        'withUserTenant(userId, ...) / withTenantDb(tenantId, ...).',
    );
  }
}

/**
 * Check if a session still exists (not revoked).
 *
 * Requires an active tenant scope — under RLS an unscoped lookup returns no
 * rows, which would read as "revoked" for a healthy session.
 */
export async function findSession(sessionId: string): Promise<boolean> {
  assertTenantScope('findSession');
  const db = getDb();
  const [sess] = await db
    .select({ id: schema.userSessions.id })
    .from(schema.userSessions)
    .where(eq(schema.userSessions.id, sessionId))
    .limit(1);
  return !!sess;
}

/**
 * Update session last active time.
 *
 * Requires an active tenant scope — unscoped, the UPDATE matches no rows and
 * the write is silently lost.
 */
export async function updateSessionLastActive(sessionId: string): Promise<void> {
  assertTenantScope('updateSessionLastActive');
  const db = getDb();
  await db
    .update(schema.userSessions)
    .set({ lastActiveAt: new Date() })
    .where(eq(schema.userSessions.id, sessionId));
}

/**
 * Create a user session row (JWT callback).
 *
 * Runs in the user's tenant scope: the callback that calls it sits outside
 * any request transaction, and `user_sessions.tenant_id` must agree with the
 * `app.current_tenant` GUC or the RLS `WITH CHECK` rejects the INSERT.
 */
export async function createUserSession(
  sessionId: string,
  userId: string,
  deviceName: string | null,
  ip: string | null,
): Promise<void> {
  await withUserTenant(userId, async (db) => {
    // Short-circuits on the scope entered above; the explicit tenant also
    // matches the GUC by construction.
    const tenantId = await requireTenantIdForUser(userId, db);
    await db.execute(
      sql`INSERT INTO ${schema.userSessions} (id, user_id, tenant_id, device_name, ip)
          VALUES (${sessionId}, ${userId}, ${tenantId}, ${deviceName}, ${ip})`,
    );
  });
}
