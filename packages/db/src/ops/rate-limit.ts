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

// Phase B — Postgres-backed per-user rate limiter.
//
// Usage in a Next.js route handler:
//   const allowed = await withRateLimit(user.userId, 'ai_chat', 30);
//   if (!allowed) return new Response('Too Many Requests', { status: 429 });
//
// Window is fixed at 1 minute (the rate_limits PK is keyed on a
// minute-aligned timestamp). For longer windows you'd run a separate
// aggregator — outside the scope of this helper.
//
// The implementation uses `INSERT … ON CONFLICT DO UPDATE` so the
// counter is incremented atomically under concurrent requests for the
// same user. The query returns the new count; if it exceeds `limit`
// we reject the request.
//
// `rate_limits` carries `tenant_isolation` RLS
// (`tenant_id = current_setting('app.current_tenant', true)`), so an
// unscoped INSERT is rejected outright under the non-bypass application
// role — login, registration, password reset and 2FA rate limiting all
// died on it. This helper now opens the scope the row belongs to before
// the single statement:
//
//   - an active same-tenant scope is reused (pre-auth callers running
//     inside a request scope, and the common route/action case),
//   - pre-auth buckets (`__system__` subject) scope to the platform
//     `__system__` tenant,
//   - an explicit `opts.tenantId` scopes to that tenant,
//   - an authenticated subject with no active scope resolves its
//     membership and runs in the user's tenant scope (fail closed when
//     membership is missing — never an unscoped write).
//
// The scope is always a real transaction because the tenant GUC is
// transaction-local; the cost is one BEGIN/SET_CONFIG/COMMIT around a
// statement that already existed.

import { sql } from 'drizzle-orm';

import { getTenantDbScope, schema, withTenantDb, type DbClient } from '../client';
import { withUserTenant } from '../tenant/with-user-tenant';

export interface RateLimitResult {
  /** True iff the request is within the limit. */
  allowed: boolean;
  /** Current count in this minute window (after this increment). */
  count: number;
  /** Configured ceiling for context (e.g. for the `X-RateLimit-Limit` header). */
  limit: number;
}

export interface RateLimitOptions {
  /**
   * Tenant that owns the bucket. Defaults to the active tenant transaction's
   * tenant, then to the platform tenant for the pre-auth `__system__` subject.
   * `undefined` leaves the column to the database default.
   */
  tenantId?: string;
}

/** Platform subject used for unauthenticated buckets (login, register, reset). */
export const SYSTEM_RATE_LIMIT_USER_ID = '__system__';

/** Platform tenant that owns those buckets (seeded by migrations 0009/0035/0117). */
export const SYSTEM_RATE_LIMIT_TENANT_ID = '__system__';

/**
 * Tenant that owns a rate-limit row.
 *
 * Pre-auth buckets key on `__system__`; resolving their tenant explicitly keeps
 * the insert independent of `app.current_tenant` session state. A connection
 * whose GUC was present but empty historically produced `tenant_id = ''`,
 * violating `rate_limits_tenant_id_fkey` and turning POST /login into a 500
 * (digest 1876515799, React #441). Authenticated callers keep the tenant
 * transaction's tenant (or `undefined` so `withRateLimit` resolves membership).
 */
export function resolveRateLimitTenant(userId: string, tenantId?: string): string | undefined {
  if (tenantId) return tenantId;
  const scoped = getTenantDbScope()?.tenantId;
  if (scoped) return scoped;
  return userId === SYSTEM_RATE_LIMIT_USER_ID ? SYSTEM_RATE_LIMIT_TENANT_ID : undefined;
}

/**
 * Increment the per-user per-group counter for the current minute window.
 * Returns `{ allowed: true }` when the post-increment count is ≤ limit,
 * `{ allowed: false }` otherwise (but the counter is still incremented —
 * we want to count rejected attempts so a brute-force can't retry
 * without consequence).
 */
export async function withRateLimit(
  userId: string,
  endpointGroup: string,
  limit: number,
  opts: RateLimitOptions = {},
): Promise<RateLimitResult> {
  const activeScope = getTenantDbScope();
  const tenantId = resolveRateLimitTenant(userId, opts.tenantId);

  // Fixed 1-minute window — the rate_limits PK is keyed on a minute-aligned
  // window_start. Longer/shorter windows require a schema change.
  const record = async (
    db: DbClient,
    rowTenantId: string | undefined,
  ): Promise<RateLimitResult> => {
    // `date_trunc('minute', now())` is evaluated by Postgres so every instance
    // shares the server clock instead of drifting with local time.
    const [row] = await db
      .insert(schema.rateLimits)
      .values({
        userId,
        ...(rowTenantId ? { tenantId: rowTenantId } : {}),
        endpointGroup,
        windowStart: sql`date_trunc('minute', now())`,
        requestCount: 1,
      })
      .onConflictDoUpdate({
        target: [
          schema.rateLimits.userId,
          schema.rateLimits.endpointGroup,
          schema.rateLimits.windowStart,
        ],
        set: {
          requestCount: sql`${schema.rateLimits.requestCount} + 1`,
        },
      })
      .comment('kestrel.rate_limit.upsert')
      .returning({ requestCount: schema.rateLimits.requestCount });

    const count = Number(row?.requestCount ?? 0);

    return {
      allowed: count <= limit,
      count,
      limit,
    };
  };

  // Fast path: the active scope already carries the row's tenant GUC, so the
  // single statement can run on the caller's transaction with no extra work.
  if (activeScope && tenantId === activeScope.tenantId) {
    return record(activeScope.db, tenantId);
  }

  // Explicit or platform (`__system__`) tenant: open a scope for it (reuses an
  // active same-tenant scope when there is one) and write the row there.
  if (tenantId) {
    return withTenantDb(tenantId, (db) => record(db, tenantId));
  }

  // Authenticated subject outside any scope (2FA verification, cron calls):
  // resolve the user's tenant and run in that scope. `withUserTenant` is
  // fail-closed — no membership, no counter, no request. The row tenant is
  // read back from the scope so the column and the GUC can never disagree.
  return withUserTenant(userId, (db) => record(db, getTenantDbScope()?.tenantId));
}
