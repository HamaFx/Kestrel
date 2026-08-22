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

import { z } from 'zod';

import { withAdminAuth } from '@/lib/admin-auth';
import { parseJsonBody } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const flushSchema = z.object({
  target: z.enum(['cache', 'sessions', 'cron_locks', 'all']),
});

export const POST = withAdminAuth(async (req) => {
  if (process.env.NODE_ENV === 'production') {
    return Response.json(
      { error: { code: 'FORBIDDEN', message: 'Flush is dev-only' } },
      { status: 403 },
    );
  }

  const { target } = await parseJsonBody(req, flushSchema);
  const results: Array<{
    target: string;
    status: 'flushed' | 'unsupported';
    reason?: string;
    affected?: number;
  }> = [];

  if (target === 'cron_locks' || target === 'all') {
    // cron_runs is history, not a lock table. Never delete it from a
    // maintenance action labelled "cron locks"; there is no supported
    // lock-flush operation in this deployment.
    results.push({
      target: 'cron_locks',
      status: 'unsupported',
      reason: 'Cron locks are not stored separately; cron history was left unchanged',
    });
  }

  if (target === 'cache' || target === 'all') {
    // In-memory caches are per-instance; there is no way to flush them
    // globally. Signal that this target is unsupported.
    results.push({
      target: 'cache',
      status: 'unsupported',
      reason: 'In-memory caches are per-instance and cannot be flushed remotely',
    });
  }

  if (target === 'sessions' || target === 'all') {
    // Sessions are JWT-based; we can't globally invalidate without rotating
    // secrets. Direct operators to the "sign out everywhere" / tokenVersion
    // bump path instead.
    results.push({
      target: 'sessions',
      status: 'unsupported',
      reason: 'JWT sessions are stateless; use tokenVersion bump or sign-out-everywhere',
    });
  }

  return Response.json({ results });
});
