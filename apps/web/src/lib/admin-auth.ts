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

// SPDX-License-Identifier: Apache-2.0

// Wrapper that checks the authenticated user has admin privileges.
// In single-user deployments (no admin role set), the sole authenticated
// user is treated as admin. In multi-user deployments, requires role='admin'.

import { getDb } from '@kestrel/ai';
import { schema } from '@kestrel/db';
import { eq, sql } from 'drizzle-orm';

import { auth } from '@/auth';
import { getServerEnv } from '@/lib/env';

import { createRequestLogger } from './logger';

export interface AdminUser {
  userId: string;
  email: string;
  name: string | null;
}

export interface AdminAuthResult {
  admin: AdminUser | null;
  /** 'unauthenticated' when no session exists; 'forbidden' when session exists but not admin. */
  reason: 'authenticated' | 'unauthenticated' | 'forbidden';
}

export async function getAdminUser(): Promise<AdminAuthResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { admin: null, reason: 'unauthenticated' };
  }

  const db = getDb();
  const [user] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
    })
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id));

  if (!user) {
    return { admin: null, reason: 'forbidden' };
  }

  // Explicit admin roles are always accepted. Implicit admin access is only
  // available under the OSS single-user invariant; shared deployments must
  // provision an explicit admin role instead.
  if (user.role === 'admin') {
    return {
      admin: { userId: user.id, email: user.email, name: user.name },
      reason: 'authenticated',
    };
  }

  if (!getServerEnv().OSS_SINGLE_USER_MODE) {
    return { admin: null, reason: 'forbidden' };
  }

  // In the OSS single-user deployment, the sole account is the operator.
  // Single-user deployment check: only the sole account may be treated as
  // the implicit admin. Keep the count and role checks in one statement so a
  // second regular account cannot leave the earliest account privileged.
  // The database snapshot makes this decision atomic for each authorization
  // check; explicit admin roles remain the preferred production path.
  const [firstUserSingleQuery] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      sql`NOT EXISTS (SELECT 1 FROM ${schema.users} WHERE ${schema.users.role} = 'admin')
        AND (SELECT count(*) FROM ${schema.users}) = 1`,
    )
    .orderBy(schema.users.createdAt)
    .limit(1);

  if (firstUserSingleQuery && firstUserSingleQuery.id === user.id) {
    return {
      admin: { userId: user.id, email: user.email, name: user.name },
      reason: 'authenticated',
    };
  }

  return { admin: null, reason: 'forbidden' };
}

export function withAdminAuth<T = Record<string, never>>(
  handler: (req: Request, ctx: { user: AdminUser; params: Promise<T> }) => Promise<Response>,
): (req: Request, ctx?: { params: Promise<T> }) => Promise<Response> {
  return async (req: Request, ctx?: { params: Promise<T> }) => {
    const log = createRequestLogger(req);
    const { admin, reason } = await getAdminUser();
    if (!admin) {
      const status = reason === 'unauthenticated' ? 401 : 403;
      const code = reason === 'unauthenticated' ? 'UNAUTHORIZED' : 'FORBIDDEN';
      const message =
        reason === 'unauthenticated' ? 'Authentication required' : 'Admin access required';
      log.warn('admin route access denied', { reason });
      return Response.json({ error: { code, message } }, { status });
    }
    log.info('admin route accessed', { userId: admin.userId });
    return handler(req, { user: admin, params: ctx?.params ?? Promise.resolve({} as T) });
  };
}
