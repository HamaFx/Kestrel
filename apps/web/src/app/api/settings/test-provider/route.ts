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

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { errorResponse, parseJsonBody, withAuth } from '@/lib/http/api';
import {
  decryptByok,
  getDb,
  PROVIDER_IDS,
  requireTenantIdForUser,
  schema,
  testProviderKey,
  validateProviderConfig,
  withRateLimit,
  type ProviderId,
} from '@/lib/services/api-boundary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Max 8 KB covers every realistic API key size.
const BodySchema = z.object({
  provider: z.enum(PROVIDER_IDS as readonly [ProviderId, ...ProviderId[]]),
  // Audit 2026-10-31 (R5): the settings page is write-only, so a user testing
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

  const db = getDb();
  const tenantId = await requireTenantIdForUser(user.userId, db);

  let apiKey = body.apiKey;
  if (!apiKey) {
    const [row] = await db
      .select({ aiApiKeys: schema.userSettings.aiApiKeys })
      .from(schema.userSettings)
      .where(
        and(
          eq(schema.userSettings.userId, user.userId),
          eq(schema.userSettings.tenantId, tenantId),
        ),
      );
    const stored = row?.aiApiKeys ? decryptByok(row.aiApiKeys) : null;
    apiKey = stored?.[body.provider];
    if (!apiKey) {
      return Response.json(
        { ok: false, error: 'No stored key for this provider' },
        { status: 400 },
      );
    }
  }

  const validation = validateProviderConfig(body.provider, apiKey);
  if (!validation.ok) {
    return Response.json({ ok: false, error: validation.reason }, { status: 400 });
  }

  const result = await testProviderKey(body.provider, apiKey);

  // Phase A — UX_UPGRADE_PLAN.md item 7. Upsert the latest test
  // result for this (user, provider). Idempotent: re-testing
  // overwrites the previous row rather than accumulating history.
  // The health badge on /settings/api-keys reads from this table.
  const testedAt = new Date();
  await db
    .delete(schema.providerTests)
    .where(
      and(
        eq(schema.providerTests.userId, user.userId),
        eq(schema.providerTests.tenantId, tenantId),
        eq(schema.providerTests.providerId, body.provider),
      ),
    );
  await db.insert(schema.providerTests).values({
    userId: user.userId,
    tenantId,
    providerId: body.provider,
    ok: result.ok,
    error: result.ok ? null : (result.error ?? 'unknown error'),
    testedAt: testedAt.toISOString(),
    rateLimit: result.ok
      ? ((result as Record<string, unknown>).rateLimit as {
          remainingRequests?: number;
          remainingTokens?: number;
          resetRequests?: string;
          resetTokens?: string;
        } | null)
      : undefined,
  });

  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: 400 });
  }
  return Response.json({ ok: true });
});
