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

// User sessions query helpers — session management and revocation.

import { and, eq } from 'drizzle-orm';

import { getDb, schema } from '../client';
import { requireTenantIdForUser } from '../tenant';

/** A user session row (selective fields for display). */
export interface SessionRow {
  id: string;
  deviceName: string | null;
  ip: string | null;
  createdAt: Date;
  lastActiveAt: Date;
}

/**
 * List all sessions for a user, ordered by creation time.
 */
export async function listUserSessions(userId: string): Promise<SessionRow[]> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  return db
    .select({
      id: schema.userSessions.id,
      deviceName: schema.userSessions.deviceName,
      ip: schema.userSessions.ip,
      createdAt: schema.userSessions.createdAt,
      lastActiveAt: schema.userSessions.lastActiveAt,
    })
    .from(schema.userSessions)
    .where(
      and(
        eq(schema.userSessions.userId, userId),
        eq(schema.userSessions.tenantId, tenantId),
      ),
    )
    .orderBy(schema.userSessions.createdAt);
}

/**
 * Revoke a single session, scoped to the user.
 */
export async function revokeUserSession(sessionId: string, userId: string): Promise<void> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  await db.delete(schema.userSessions).where(
    and(
      eq(schema.userSessions.id, sessionId),
      eq(schema.userSessions.userId, userId),
      eq(schema.userSessions.tenantId, tenantId),
    ),
  );
}

/**
 * Delete all sessions for a user (sign-out-everywhere).
 */
export async function deleteUserSessions(userId: string): Promise<void> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  await db.delete(schema.userSessions).where(
    and(
      eq(schema.userSessions.userId, userId),
      eq(schema.userSessions.tenantId, tenantId),
    ),
  );
}
