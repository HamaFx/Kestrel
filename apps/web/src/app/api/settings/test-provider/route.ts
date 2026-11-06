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

import type { ProviderId } from '@kestrel/shared';
import { PROVIDER_IDS } from '@kestrel/shared/encryption';
import { z } from 'zod';

import { errorResponse, parseJsonBody, withAuth } from '@/lib/http/api';
import { testProviderService } from '@/lib/services/providers';
import { withRateLimit } from '@/lib/services/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Max 8 KB covers every realistic API key size.
const BodySchema = z.object({
  provider: z.enum(PROVIDER_IDS as readonly [ProviderId, ...ProviderId[]]),
  // the settings page is write-only, so a user testing
  // an already-stored key sends no plaintext — the route resolves it from the
  // server-side vault instead.
  apiKey: z.string().min(8).max(8192).optional(),
});

/** Bound provider-test calls per user per minute (each one hits an upstream). */
const PROVIDER_TEST_RATE_LIMIT = 10;

export const POST = withAuth<void>(async (req, { user }) => {
  const rate = await withRateLimit(user.userId, 'provider_test', PROVIDER_TEST_RATE_LIMIT);
  if (!rate.allowed) {
    return Response.json(
      { ok: false, error: 'Too many provider tests. Try again in a minute.' },
      { status: 429 },
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = await parseJsonBody(req, BodySchema);
  } catch (err) {
    return errorResponse(err);
  }

  const result = await testProviderService(user.userId, body.provider, body.apiKey);
  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: result.statusCode });
  }
  return Response.json({ ok: true });
});
