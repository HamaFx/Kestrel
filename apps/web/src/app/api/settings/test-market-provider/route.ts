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

import { errorResponse, parseJsonBody, withAuth } from '@/lib/http/api';
import { marketDataProviders } from '@/lib/services/market';
import { withRateLimit } from '@/lib/services/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  provider: z.enum(['biquote', 'finnhub', 'live-ticks']),
  apiKey: z.string().max(8192).optional(),
});

/** Bound connection tests per user per minute (each one hits an upstream). */
const MARKET_PROVIDER_TEST_RATE_LIMIT = 10;

export const POST = withAuth<void>(async (req, { user }) => {
  const rate = await withRateLimit(
    user.userId,
    'market_provider_test',
    MARKET_PROVIDER_TEST_RATE_LIMIT,
  );
  if (!rate.allowed) {
    return Response.json(
      { ok: false, error: 'Too many connection tests. Try again in a minute.' },
      { status: 429 },
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = await parseJsonBody(req, BodySchema);
  } catch (err) {
    return errorResponse(err);
  }

  let providerInstance;
  try {
    providerInstance = marketDataProviders.get(body.provider);
  } catch {
    return Response.json(
      { ok: false, error: `Invalid provider: ${body.provider}` },
      { status: 400 },
    );
  }

  if (!providerInstance.testConnection) {
    return Response.json(
      { ok: false, error: `Provider "${body.provider}" does not support connection testing` },
      { status: 400 },
    );
  }

  // Audit 2026-10-31 (R12): this used to pass the caller's `apiKey` through as
  // `baseUrl`, so any authenticated user could make the server fetch an
  // arbitrary host (e.g. cloud metadata endpoints). A base URL is operator
  // configuration — it is never taken from the request.
  const result = await providerInstance.testConnection(
    body.apiKey ? { apiKey: body.apiKey } : undefined,
  );

  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.error ?? 'Connection test failed' },
      { status: 400 },
    );
  }
  return Response.json({ ok: true });
});
