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

import { eq, sql } from 'drizzle-orm';

import { getDb, schema } from '../../client';
import { requireTenantIdForUser } from '../../tenant';

/**
 * Check if a session still exists (not revoked).
 */
export async function findSession(sessionId: string): Promise<boolean> {
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
 */
export async function updateSessionLastActive(sessionId: string): Promise<void> {
  const db = getDb();
  await db
    .update(schema.userSessions)
    .set({ lastActiveAt: new Date() })
    .where(eq(schema.userSessions.id, sessionId));
}

/**
 * Create a user session row (JWT callback).
 */
export async function createUserSession(
  sessionId: string,
  userId: string,
  deviceName: string | null,
  ip: string | null,
): Promise<void> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  await db.execute(
    sql`INSERT INTO ${schema.userSessions} (id, user_id, tenant_id, device_name, ip)
        VALUES (${sessionId}, ${userId}, ${tenantId}, ${deviceName}, ${ip})`,
  );
}
