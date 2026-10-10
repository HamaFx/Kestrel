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
// Requires an explicit role='admin' — there is no implicit admin fallback;
// all deployments are multi-user.

import { getDb } from '@kestrel/ai';
import { schema } from '@kestrel/db';
import { eq } from 'drizzle-orm';

import { auth } from '@/auth';

import { createRequestLogger } from './logger';
import { getRequestId } from './request-id';

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

  // Administration requires an explicit role='admin'. Promote an operator
  // with: psql "$DATABASE_URL" -c "UPDATE \"user\" SET role='admin' WHERE email='you@example.com'"
  if (user.role === 'admin') {
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
      const requestId = getRequestId(req);
      return Response.json(
        { error: { code, message, ...(requestId ? { requestId } : {}) } },
        { status, headers: requestId ? { 'x-request-id': requestId } : undefined },
      );
    }
    log.info('admin route accessed', { userId: admin.userId });
    return handler(req, { user: admin, params: ctx?.params ?? Promise.resolve({} as T) });
  };
}
