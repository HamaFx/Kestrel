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

// Auth for scheduler-triggered route handlers.
//
// Two identities may invoke a `/api/cron/*` route:
//
//   1. the scheduler, with `Authorization: Bearer $CRON_SECRET` (the secret
//      must be at least 16 characters, compared in constant time), or
//   2. a signed-in administrator opening the route in a browser.
//
// Audit 2026-10-31 (R4) removed the default allowance for any authenticated
// session. Phase 1 (Task 1.3) removes the per-route `session: 'any'` escape
// hatch entirely: user-facing refresh buttons call the ordinary `/api/*`
// routes, which authenticate the session and rate-limit per user. A
// non-admin browser session always receives 403 here.

import { timingSafeEqual } from 'node:crypto';

import { getAuthEnv } from '../env';
import { createScopedLoggerWithContext } from '../logger';
import { getUserFromRequest } from './api';
import { getRequestId } from './request-id';

const MIN_CRON_SECRET_LENGTH = 16;

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Identity that satisfied `withCronAuth`, handed to the handler. */
export interface CronAuthContext {
  /** 'bearer' = scheduler credential; 'session' = signed-in browser. */
  via: 'bearer' | 'session';
  /** Session user id, or null for bearer invocations. */
  userId: string | null;
}

/**
 * Authenticate and execute a cron handler.
 *
 * Bearer authentication (CRON_SECRET) is intended for schedulers. A browser
 * session is accepted only from an administrator.
 */
export async function withCronAuth(
  req: Request,
  fn: (ctx: CronAuthContext) => Promise<{ processed: number; note?: string }>,
): Promise<Response> {
  const env = getAuthEnv();
  const requestId = getRequestId(req);
  const responseOptions = requestId ? { headers: { 'x-request-id': requestId } } : undefined;

  const header = req.headers.get('authorization') ?? '';
  // Fail closed when the deployment secret is missing, too short, or empty:
  // comparing against `Bearer ` (or `Bearer undefined`) would otherwise let any
  // caller authenticate with the same value.
  const secret = env.CRON_SECRET?.trim() ?? '';
  const hasBearerAuth =
    secret.length >= MIN_CRON_SECRET_LENGTH && constantTimeEqual(header, `Bearer ${secret}`);

  const sessionUserId = hasBearerAuth ? null : ((await getUserFromRequest(req))?.userId ?? null);

  if (!hasBearerAuth && sessionUserId) {
    const { getAdminUser } = await import('../auth/admin-auth');
    const admin = await getAdminUser();
    if (!admin.admin) {
      return Response.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'Admin access required',
            ...(requestId ? { requestId } : {}),
          },
        },
        { status: 403, ...(responseOptions ?? {}) },
      );
    }
  }

  if (!hasBearerAuth && !sessionUserId) {
    return Response.json(
      { error: { code: 'AUTH', message: 'Unauthorized', ...(requestId ? { requestId } : {}) } },
      { status: 401, ...(responseOptions ?? {}) },
    );
  }

  try {
    const result = await fn({
      via: hasBearerAuth ? 'bearer' : 'session',
      userId: sessionUserId,
    });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    createScopedLoggerWithContext({ component: 'cron', route: routeTag(req) }).error(
      { err: String(err) },
      'cron handler error',
    );
    return Response.json(
      { error: { code: 'INTERNAL', message: 'Internal error' } },
      { status: 500 },
    );
  }
}

function routeTag(req: Request): string {
  try {
    return new URL(req.url).pathname;
  } catch {
    return 'unknown';
  }
}
