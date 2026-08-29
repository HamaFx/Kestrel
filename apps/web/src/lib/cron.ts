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
// CRON_SECRET; operator-triggered invocations use the normal authenticated
// session. Legacy signed-cookie authentication is intentionally unsupported.

import { timingSafeEqual } from 'node:crypto';

import * as Sentry from '@sentry/nextjs';

import { getUserFromRequest } from './api';
import { getAuthEnv } from './env';
import { createScopedLoggerWithContext } from './logger';

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Authenticate and execute a cron handler.
 *
 * Bearer authentication is intended for schedulers. A normal authenticated
 * session is retained for operator-triggered dashboard refreshes; individual
 * sensitive routes should additionally require admin authorization.
 */
export async function withCronAuth(
  req: Request,
  fn: () => Promise<{ processed: number; note?: string }>,
  options: { requireAdminSession?: boolean } = {},
): Promise<Response> {
  const env = getAuthEnv();

  const header = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${env.CRON_SECRET}`;
  const hasBearerAuth = header.length > 0 && constantTimeEqual(header, expected);

  let hasSessionAuth = false;
  if (!hasBearerAuth) {
    hasSessionAuth = (await getUserFromRequest(req)) !== null;
  }

  // Sensitive maintenance jobs may be run by the scheduler, but a browser
  // session must belong to an administrator. Bearer scheduler credentials
  // remain valid because they are deployment-level credentials.
  if (options.requireAdminSession && !hasBearerAuth) {
    const { getAdminUser } = await import('./admin-auth');
    const admin = await getAdminUser();
    if (!admin.admin) {
      return Response.json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } }, { status: 403 });
    }
  }

  if (!hasBearerAuth && !hasSessionAuth) {
    return Response.json({ error: { code: 'AUTH', message: 'Unauthorized' } }, { status: 401 });
  }

  try {
    const result = await fn();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { component: 'cron', route: routeTag(req), kind: 'handler-error' },
    });
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
    Sentry.captureException(error, {
      tags: { component: 'cron', job: name, kind: 'job-error' },
    });
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
