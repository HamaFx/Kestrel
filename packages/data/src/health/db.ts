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

// H1 (RELIABILITY_AUDIT_REPORT.md) — Cross-instance health sharing.
//
// The in-memory samples track per-instance state (fast path). On failure,
// we also write to a lightweight Postgres-backed `provider_health` table
// so *other* Vercel instances can see that a provider is degraded. The
// DB write is fire-and-forget — no caller blocks on health telemetry.
// `getScore()` merges in-memory and DB state, taking the worst-case
// consecutive-failure count across all instances.
//
// DB reads are guarded behind a short cache (10s) so the fast path (single
// in-memory lookup) is preserved for the steady state.

import { getDb, schema } from '@kestrel/db';
import { eq, sql } from 'drizzle-orm';

import { DB_CACHE_MS, dbCache, WINDOW_MS } from './state';

const { providerHealth } = schema;

export async function dbRecordSuccess(provider: string): Promise<void> {
  try {
    const db = getDb();
    await db
      .insert(providerHealth)
      .values({
        provider,
        lastSuccessAt: sql`now()`,
        consecutiveFailures: 0,
      })
      .onConflictDoUpdate({
        target: providerHealth.provider,
        set: {
          lastSuccessAt: sql`now()`,
          consecutiveFailures: 0,
        },
      });
  } catch {
    // Best-effort — DB may be unavailable. In-memory state is authoritative
    // for this instance.
  }
}

export async function dbRecordFailure(provider: string): Promise<void> {
  try {
    const db = getDb();
    await db
      .insert(providerHealth)
      .values({
        provider,
        lastFailureAt: sql`now()`,
        consecutiveFailures: 1,
      })
      .onConflictDoUpdate({
        target: providerHealth.provider,
        set: {
          lastFailureAt: sql`now()`,
          consecutiveFailures: sql`${providerHealth.consecutiveFailures} + 1`,
        },
      });
  } catch {
    // Best-effort.
  }
}

/** Read the cross-instance state from the DB, cached for DB_CACHE_MS. */
export function getDbConsecutiveFailures(provider: string): number {
  const cached = dbCache.get(provider);
  const now = Date.now();
  if (cached && now - cached.readAt < DB_CACHE_MS) {
    // Check freshness: if the cached last_failure is older than the window,
    // treat as zero (provider has recovered).
    if (cached.lastFailureAt > 0 && now - cached.lastFailureAt > WINDOW_MS) {
      return 0;
    }
    return cached.consecutiveFailures;
  }

  // Cold cache — fire a best-effort DB read. On the very first call for
  // a provider, we return 0 (fail-open, no penalty) while the async read
  // populates the cache for the next call. This avoids blocking failover
  // ordering on DB latency while still getting cross-instance state within
  // one scoring cycle.
  void populateDbCache(provider, now);

  // Return cached value (possibly zero for first call) while the async read
  // is in flight. This is fail-open: an uninitialised cache returns 0,
  // which is the neutral/no-penalty position.
  if (cached) return cached.consecutiveFailures;
  return 0;
}

async function populateDbCache(provider: string, readAt: number): Promise<void> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        consecutiveFailures: providerHealth.consecutiveFailures,
        lastFailureAt: providerHealth.lastFailureAt,
      })
      .from(providerHealth)
      .where(eq(providerHealth.provider, provider))
      .limit(1);

    const row = rows[0];
    const lastMs = row?.lastFailureAt ? row.lastFailureAt.getTime() : 0;
    dbCache.set(provider, {
      readAt,
      consecutiveFailures: row?.consecutiveFailures ?? 0,
      lastFailureAt: lastMs,
    });
  } catch {
    // Best-effort — cache stays stale until next attempt.
  }
}
