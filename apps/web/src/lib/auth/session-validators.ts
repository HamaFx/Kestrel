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

// Session-callback validators extracted from auth.ts so they can be
// unit-tested without booting NextAuth. The module keeps the same
// throttling semantics but combines the tokenVersion and session-row
// checks into one query to cut DB round-trips.

import { schema, type DbClient } from '@kestrel/db';
import { logErrorContext } from '@kestrel/shared/logger';
import { and, eq } from 'drizzle-orm';

const TV_CHECK_INTERVAL_SECONDS = 60;
const LAST_ACTIVE_INTERVAL_SECONDS = 900;
const SESSION_AGE_LIMIT_SECONDS = 86400;

/**
 * In-process throttle ledger.
 *
 * `token.tvCheckedAt` / `token.lastActiveUpdate` only survive when NextAuth
 * re-encodes the cookie (the /api/auth/session HTTP path). RSC `auth()`
 * calls discard the mutation, so without this ledger every navigation
 * re-ran the session SELECT and the last_active UPDATE forever — the
 * throttles below are the designed semantics, this map is what makes them
 * actually hold. Entries carry the same intervals, so revocation latency
 * is unchanged (<= 60s for tokenVersion/session checks).
 */
const throttles = new Map<string, { tvCheckedAt: number; lastActiveUpdate: number }>();

/** Test helper: clear the in-process throttle ledger. */
export function _resetSessionThrottles(): void {
  throttles.clear();
}

function readThrottle(key: string | null): { tvCheckedAt: number; lastActiveUpdate: number } {
  if (!key) return { tvCheckedAt: 0, lastActiveUpdate: 0 };
  const entry = throttles.get(key);
  return entry ?? { tvCheckedAt: 0, lastActiveUpdate: 0 };
}

function writeThrottle(
  key: string | null,
  patch: Partial<{ tvCheckedAt: number; lastActiveUpdate: number }>,
): void {
  if (!key) return;
  const current = readThrottle(key);
  throttles.set(key, { ...current, ...patch });
  // Bound the map: prune entries whose newest throttle has fully expired.
  if (throttles.size > 10_000) {
    const cutoff = Date.now() / 1000 - SESSION_AGE_LIMIT_SECONDS;
    for (const [k, v] of throttles) {
      if (v.tvCheckedAt < cutoff && v.lastActiveUpdate < cutoff) throttles.delete(k);
    }
  }
}

export interface SessionToken {
  id?: string | null;
  tokenVersion?: number | null;
  sessionId?: string | null;
  iat?: number | null;
  rememberMe?: boolean | null;
  tvCheckedAt?: number | null;
  lastActiveUpdate?: number | null;
}

interface ValidateOptions {
  /**
   * When true, DB errors during validation invalidate the session.
   * Defaults to true because revocation and token-version checks are
   * security controls, not optional metadata.
   */
  failClosed?: boolean;
}

function invalidatedSession(session: unknown) {
  return { ...(session as Record<string, unknown>), user: undefined, expires: '0' };
}

/**
 * Run the throttled session validations that used to live inline in
 * auth.ts. Returns `null` when the session is still valid (and mutates
 * the token timestamps), or an invalidated session object when the
 * session should be destroyed.
 */
export async function validateSession(
  db: DbClient,
  token: SessionToken,
  session: unknown,
  nowSeconds: number,
  opts: ValidateOptions = {},
): Promise<unknown | null> {
  const failClosed = opts.failClosed ?? true;

  // FEAT-04: Without rememberMe, invalidate sessions older than 24h.
  if (
    token.iat &&
    token.rememberMe !== true &&
    nowSeconds - token.iat > SESSION_AGE_LIMIT_SECONDS
  ) {
    return invalidatedSession(session);
  }

  const userId = token.id;
  if (!userId) {
    return invalidatedSession(session);
  }

  // The in-process ledger extends the token fields; the effective values are
  // the max of both so an HTTP-path re-encoded cookie and RSC calls agree.
  const throttleKey = token.sessionId ? `${token.sessionId}:${userId}` : null;
  const ledger = readThrottle(throttleKey);
  const effectiveTvCheckedAt = Math.max(token.tvCheckedAt ?? 0, ledger.tvCheckedAt);
  const effectiveLastActive = Math.max(token.lastActiveUpdate ?? 0, ledger.lastActiveUpdate);

  if (!effectiveTvCheckedAt || nowSeconds - effectiveTvCheckedAt > TV_CHECK_INTERVAL_SECONDS) {
    try {
      const sessionId = token.sessionId;

      const [row] = await db
        .select({
          tv: schema.users.tokenVersion,
          sessionId: schema.userSessions.id,
        })
        .from(schema.users)
        .leftJoin(
          schema.userSessions,
          and(eq(schema.userSessions.id, sessionId ?? ''), eq(schema.userSessions.userId, userId)),
        )
        .where(eq(schema.users.id, userId))
        .limit(1);

      if (!row) {
        return invalidatedSession(session);
      }

      if (row.tv !== token.tokenVersion) {
        return invalidatedSession(session);
      }

      if (!row.sessionId) {
        return invalidatedSession(session);
      }

      token.tvCheckedAt = nowSeconds;
      writeThrottle(throttleKey, { tvCheckedAt: nowSeconds });
    } catch (err) {
      logErrorContext(err, 'auth/session_validation', {}, 'auth');
      if (failClosed) {
        return invalidatedSession(session);
      }
    }
  }

  // FEAT-02: Track last active time every 15 min. Under the selected
  // fail-closed policy, this write is part of the session-security check:
  // if it cannot complete, do not keep serving an unchecked session.
  const sessionId = token.sessionId;
  if (
    sessionId &&
    (!effectiveLastActive || nowSeconds - effectiveLastActive > LAST_ACTIVE_INTERVAL_SECONDS)
  ) {
    try {
      await db
        .update(schema.userSessions)
        .set({ lastActiveAt: new Date() })
        .where(and(eq(schema.userSessions.id, sessionId), eq(schema.userSessions.userId, userId)));
      token.lastActiveUpdate = nowSeconds;
      writeThrottle(throttleKey, { lastActiveUpdate: nowSeconds });
    } catch (err) {
      logErrorContext(err, 'auth/last_active_update', {}, 'auth');
      if (failClosed) {
        return invalidatedSession(session);
      }
    }
  }

  return null;
}
