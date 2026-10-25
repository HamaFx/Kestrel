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

// Phase A auth helpers: getUserFromRequest() + withAuth() for multi-user
// scoping, plus the shared 401 envelope.

import { createHmac, timingSafeEqual } from 'node:crypto';

import { requireTenantIdForUser, withTenantDbFresh } from '@kestrel/db';

import { auth } from '@/auth';

import { recordAuthEvent } from '../../auth/auth-anomaly';
import {
  getSigningSecret,
  USER_ID_HEADER,
  USER_ID_SIG_HEADER,
} from '../../auth/signed-user-header';
import { REQUEST_ID_HEADER } from '../request-id';
import { errorResponse } from './errors';
import { readRequestId } from './request-context';

// ── Auth helpers (Phase A) ─────────────────────────────────────────────────

export interface RequestUser {
  userId: string;
  email?: string | null;
  name?: string | null;
}

/**
 * Extract the authenticated user from the request.
 *
 * Fast path: reads `x-user-id` header injected by proxy (no DB).
 * Slow path: calls `auth()` for defense-in-depth (Node, reads JWT cookie).
 *
 * Returns null when neither path resolves — caller should 401.
 */
export async function getUserFromRequest(req: Request): Promise<RequestUser | null> {
  // Fast path: middleware already validated the session and set the
  // signed header. Verify the HMAC before trusting it — a spoofed
  // x-user-id without a valid signature falls through to auth() below.
  // SEC-1: defense-in-depth against header impersonation.
  const headerId = req.headers.get(USER_ID_HEADER);
  if (headerId) {
    const sig = req.headers.get(USER_ID_SIG_HEADER);
    const secret = getSigningSecret();
    if (sig && secret) {
      const requestId = req.headers.get(REQUEST_ID_HEADER);
      if (requestId) {
        // Verify HMAC using node:crypto (Node.js runtime only).
        // Static import — api.ts is not used by the request proxy.
        const expected = createHmac('sha256', secret.slice(0, 128))
          .update(`${headerId}.${requestId}`)
          .digest('hex');
        if (
          expected.length === sig.length &&
          timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
        ) {
          return { userId: headerId };
        }
      }
      // Signature missing or invalid — treat as untrusted, fall through
      // to the auth() slow path below. Do NOT return the header value.
    }
    // If secret is missing or signature is absent, fall through to
    // the auth() slow path. This is safe: the header is untrusted
    // without a verifiable signature.
  }

  // Slow path: call NextAuth directly (admin routes, defense-in-depth)
  try {
    const session = await auth();
    if (session?.user?.id) {
      // Build the object conditionally to satisfy exactOptionalPropertyTypes:
      // RequestUser allows `string | null` but not `undefined` for optional
      // fields, so we omit email/name when they're missing entirely.
      return {
        userId: session.user.id,
        ...(session.user.email != null ? { email: session.user.email } : {}),
        ...(session.user.name != null ? { name: session.user.name } : {}),
      };
    }
  } catch {
    // auth() failed — treat as unauthenticated
  }

  // No authenticated user found — do NOT fall back to a system user.
  // Return null so withAuth() can properly reject the request with 401.
  return null;
}

/**
 * OBS-12 (Phase 5.4): Build the standard 401 envelope and track it for auth
 * anomaly detection.
 */
export function unauthorizedResponse(req: Request): Response {
  recordAuthEvent('unauthorized_401');
  const requestId = readRequestId(req);
  const headers: Record<string, string> = {};
  if (requestId) headers[REQUEST_ID_HEADER] = requestId;
  return Response.json(
    {
      error: {
        code: 'UNAUTHORIZED' as const,
        message: 'Authentication required',
        ...(requestId ? { requestId } : {}),
      },
    },
    { status: 401, headers },
  );
}

/**
 * Higher-order wrapper for route handlers that require authentication.
 *
 * Usage:
 *   export const GET = withAuth(async (req, { user }) => { ... });
 *
 * Returns 401 when the user is not authenticated, with the standard
 * error envelope and X-Request-Id propagation.
 */
export function withAuth<T>(
  handler: (req: Request, ctx: { params: Promise<T>; user: RequestUser }) => Promise<Response>,
): (req: Request, ctx: { params: Promise<T> }) => Promise<Response> {
  return async (req: Request, ctx: { params: Promise<T> }) => {
    const user = await getUserFromRequest(req);
    if (!user) {
      return unauthorizedResponse(req);
    }
    try {
      // Every authenticated request runs on a non-bypass connection with a
      // transaction-local tenant GUC. Resolve membership through the primary
      // connection, then keep all downstream repository and AI calls inside the
      // tenant transaction. There is no unscoped path.
      const tenantId = await requireTenantIdForUser(user.userId);
      return await withTenantDbFresh(tenantId, () => handler(req, { params: ctx.params, user }), {
        userId: user.userId,
      });
    } catch (err) {
      return errorResponse(err, req);
    }
  };
}
