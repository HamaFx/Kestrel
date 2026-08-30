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

// POST /api/push/subscribe
//
// Persists a browser-issued PushSubscription. Idempotent on `endpoint`
// (re-subscribing from the same browser overwrites `p256dh`/`auth`).
//
// Gated by the request proxy auth gate. Returns:
//   200 { id }                       on success
//   400 { error: 'invalid_body' }    on schema parse failure
//   401 { error: 'unauthorized' }    when the session cookie is missing/invalid
//   503 { missing: string[] }        when VAPID keys are not configured

import { z } from 'zod';

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';
import {
  AppError,
  conflict,
  PushSubscriptionConflictError,
  savePushSubscription,
  withRateLimit,
} from '@/lib/services/api-boundary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export const POST = withAuth<void>(async (req, { user }) => {
  // STAB-12: Rate limit — 10 subscribe attempts per user per minute.
  const rl = await withRateLimit(user.userId, 'push_subscribe', 10);
  if (!rl.allowed) {
    return errorResponse(new AppError('RATE_LIMITED', 'Too many requests', 429), req);
  }

  const missing: string[] = [];
  if (!process.env.VAPID_PUBLIC_KEY) missing.push('VAPID_PUBLIC_KEY');
  if (!process.env.VAPID_PRIVATE_KEY) missing.push('VAPID_PRIVATE_KEY');
  if (missing.length > 0) {
    return Response.json({ missing }, { status: 503 });
  }

  let parsed: z.infer<typeof BodySchema>;
  try {
    parsed = await parseJsonBody(req, BodySchema);
  } catch {
    return errorResponse(new AppError('VALIDATION', 'Invalid request body', 400), req);
  }
  const userAgent = req.headers.get('user-agent') ?? null;
  let row: Awaited<ReturnType<typeof savePushSubscription>>;
  try {
    row = await savePushSubscription({
      userId: user.userId,
      endpoint: parsed.endpoint,
      p256dh: parsed.keys.p256dh,
      auth: parsed.keys.auth,
      userAgent,
    });
  } catch (error) {
    if (error instanceof PushSubscriptionConflictError) {
      return errorResponse(
        conflict('This push endpoint is already registered to another user.'),
        req,
      );
    }
    throw error;
  }

  return Response.json({ id: row.id }, { status: 200 });
});
