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

// Helpers for Vercel-Cron-triggered route handlers. Scheduler invocations use
// CRON_SECRET; browser-session invocations are admin-only unless a route
// explicitly opts into `session: 'any'` (content-refresh routes the UI calls
// directly, e.g. news/calendar — those must also declare a per-user rate
// limit). Legacy signed-cookie authentication is intentionally unsupported.
//
// Audit 2026-10-31 (R4): the previous default allowed *any* authenticated
// session to run any cron job. The default is now the conservative one, and a
// missing/empty CRON_SECRET fails closed instead of matching `Bearer `.

import { timingSafeEqual } from 'node:crypto';

import { getAuthEnv } from '../env';
import { createScopedLoggerWithContext } from '../logger';
import { getUserFromRequest } from './api';
import { getRequestId } from './request-id';

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** How a browser session is allowed to invoke a cron route. */
export type CronSessionPolicy = 'admin' | 'any';

/** Identity that satisfied `withCronAuth`, handed to the handler. */
export interface CronAuthContext {
  /** 'bearer' = scheduler credential; 'session' = signed-in browser. */
  via: 'bearer' | 'session';
  /** Session user id, or null for bearer invocations. */
  userId: string | null;
}

export interface CronAuthOptions {
  /**
   * `admin` (default) — a browser session must belong to an administrator.
   * `any` — any authenticated session may run this job. Reserved for
   * content-refresh routes the UI calls directly.
   */
  session?: CronSessionPolicy;
  /**
   * Per-user request limit applied to browser-session invocations only;
   * scheduler (bearer) invocations are exempt. Routes that opt into
   * `session: 'any'` must set this so one account cannot hammer a global
   * refresh (and the shared provider quota behind it).
   */
  sessionRateLimit?: { group: string; perMinute: number };
}

/**
 * Authenticate and execute a cron handler.
 *
 * Bearer authentication (CRON_SECRET) is intended for schedulers. A browser
 * session is accepted only from an administrator unless the route opts into
 * `session: 'any'`.
 */
export async function withCronAuth(
  req: Request,
  fn: (ctx: CronAuthContext) => Promise<{ processed: number; note?: string }>,
  options: CronAuthOptions = {},
): Promise<Response> {
  const env = getAuthEnv();
  const requestId = getRequestId(req);
  const responseOptions = requestId ? { headers: { 'x-request-id': requestId } } : undefined;
  const sessionPolicy = options.session ?? 'admin';

  const header = req.headers.get('authorization') ?? '';
  // Fail closed when the deployment secret is missing or empty: comparing
  // against the literal `Bearer ` (or `Bearer undefined`) would otherwise let
  // any caller authenticate with the same empty value.
  const secret = env.CRON_SECRET?.trim() ?? '';
  const hasBearerAuth = secret.length > 0 && constantTimeEqual(header, `Bearer ${secret}`);

  let sessionUserId: string | null = null;
  if (!hasBearerAuth) {
    sessionUserId = (await getUserFromRequest(req))?.userId ?? null;
  }
  const hasSessionAuth = sessionUserId !== null;

  // Sensitive maintenance jobs may be run by the scheduler, but by default a
  // browser session must belong to an administrator. Bearer scheduler
  // credentials remain valid because they are deployment-level credentials.
  if (sessionPolicy === 'admin' && !hasBearerAuth && hasSessionAuth) {
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

  if (!hasBearerAuth && !hasSessionAuth) {
    return Response.json(
      { error: { code: 'AUTH', message: 'Unauthorized', ...(requestId ? { requestId } : {}) } },
      { status: 401, ...(responseOptions ?? {}) },
    );
  }

  if (!hasBearerAuth && sessionUserId && options.sessionRateLimit) {
    const { withRateLimit } = await import('@kestrel/db');
    const rate = await withRateLimit(
      sessionUserId,
      options.sessionRateLimit.group,
      options.sessionRateLimit.perMinute,
    );
    if (!rate.allowed) {
      return Response.json(
        {
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many refresh requests. Try again in a minute.',
            ...(requestId ? { requestId } : {}),
          },
        },
        { status: 429, ...(responseOptions ?? {}) },
      );
    }
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

/**
 * Active user ids for a cron fan-out job, read on the admin connection.
 *
 * `getActiveUserIds` joins `chat_threads`, which is RLS-protected. Because
 * `withCronAuth` opens no database scope, calling it on the non-bypass
 * application role silently returns zero rows (`app.current_tenant` is NULL,
 * so every tenant policy evaluates false) and the fan-out becomes a
 * successful no-op. Cross-tenant discovery is exactly what the admin
 * (BYPASSRLS) connection is for.
 *
 * Audit 2026-10-31 (R1): use this in cron handlers that then scope each
 * user's work with `withUserTenant(userId, …)`.
 */
export async function getActiveUserIdsForCron(): Promise<string[]> {
  const { getActiveUserIds, withAdminDb } = await import('@kestrel/db');
  return withAdminDb(() => getActiveUserIds());
}

export async function runCronJob(
  name: string,
  fn: () => Promise<void>,
  options: { timeout?: number } = {},
): Promise<Response> {
  const startTime = Date.now();
  try {
    const timeout = options.timeout ?? 30_000;
    await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Cron job ${name} timed out`)), timeout),
      ),
    ]);
    return Response.json({ ok: true, duration: Date.now() - startTime });
  } catch (error) {
    createScopedLoggerWithContext({ component: 'cron', job: name }).error(
      { err: String(error) },
      `cron job ${name} failed`,
    );
    return Response.json(
      { error: { code: 'INTERNAL', message: 'Internal error' } },
      { status: 500 },
    );
  }
}
