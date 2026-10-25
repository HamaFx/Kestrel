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

// M4 (RELIABILITY_AUDIT_REPORT.md) — Per-model circuit breaker.
//
// When a model returns repeated failures (3 consecutive 5xx or timeout
// errors within a 60-second window), the circuit opens and the model is
// temporarily skipped during routing. The circuit auto-closes after
// 30 seconds, and a single success resets the failure counter immediately.
//
// Audit plan §1.6 (P1-4): the Map below is only an L1 cache now. The
// `provider_circuit_state` table is the cross-instance source of truth:
//  - every failure/success writes through (fire-and-forget, never blocks),
//  - `isCircuitOpen` triggers a throttled background refresh (5s TTL per
//    model) so state recorded by other isolates converges into L1,
//  - when the database is unavailable the breaker degrades to the previous
//    per-instance behavior instead of failing the call.
//
// Audit plan §1.4 (P0-4): the breaker is keyed by the resolved MODEL id
// (the qualified "<provider>/<model>" string) on every read and write —
// run outcomes are recorded from `finishMastraRun` in
// `mastra-v2/shared/run-telemetry.ts`, and the routing call sites check
// `isCircuitOpen(modelId)` for the specific model they would use. The DB
// row mirrors the L1 window semantics: failures inside the 60s window
// increment `consecutive_failures`, a failure after the window expired
// starts a fresh window at 1, a success resets the row to 0, and
// `opened_at` holds the circuit TRIP time (NULL until the threshold is
// reached) so the open duration is measured from the trip — not from the
// first failure, which could be up to a window earlier.

import { schema } from '@kestrel/db';
import { metrics } from '@kestrel/shared';
import { sql } from 'drizzle-orm';

import { getDb } from '../runtime/db';

interface CircuitState {
  consecutiveFailures: number;
  /** Start of the failure-counting window (ms epoch). */
  windowStart: number;
  /** When the circuit tripped (ms epoch); null while below threshold. */
  openedAt: number | null;
}

const circuits = new Map<string, CircuitState>();

/** Last L1 merge from the database per model (ms epoch). */
const lastDbRefresh = new Map<string, number>();

/** Number of consecutive failures before the circuit opens. */
const FAILURE_THRESHOLD = 3;

/** How long the circuit stays open (ms) before auto-closing. */
const OPEN_DURATION_MS = 30_000;

/** Window for counting consecutive failures (ms). */
const WINDOW_MS = 60_000;

/** Throttle for background DB refreshes per model (ms). */
const DB_REFRESH_TTL_MS = 5_000;

/** In-flight refresh guards so a slow DB never piles up queries. */
const refreshing = new Set<string>();

let dbWriteBroken = false;

async function writeThrough(
  operation: 'failure' | 'success',
  modelId: string,
  options?: { tripped?: boolean },
): Promise<void> {
  try {
    const db = getDb();
    if (operation === 'success') {
      await db
        .insert(schema.providerCircuitState)
        .values({ modelId, consecutiveFailures: 0, openedAt: null, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: schema.providerCircuitState.modelId,
          set: { consecutiveFailures: 0, openedAt: null, updatedAt: new Date() },
        });
    } else {
      const openedAt = new Date();
      const tripped = options?.tripped === true;
      // Audit plan §1.4 (P0-4) — mirror the L1 window semantics in the
      // shared row: failures inside the 60s window increment the counter
      // while keeping the window start in `updated_at`; a failure after the
      // window expired starts a fresh window at 1. `opened_at` stores the
      // TRIP time once the threshold is reached (NULL before), so readers
      // measure the open duration from the trip like L1 does. A success
      // write (above) resets the row to 0.
      const windowStart = new Date(openedAt.getTime() - WINDOW_MS);
      await db.execute(sql`
        INSERT INTO provider_circuit_state (model_id, consecutive_failures, opened_at, updated_at)
        VALUES (${modelId}, 1, ${tripped ? openedAt : null}, ${openedAt})
        ON CONFLICT (model_id) DO UPDATE
          SET consecutive_failures =
                CASE
                  WHEN provider_circuit_state.updated_at >= ${windowStart}
                    THEN provider_circuit_state.consecutive_failures + 1
                  ELSE 1
                END,
              opened_at =
                CASE
                  WHEN provider_circuit_state.updated_at >= ${windowStart}
                    AND provider_circuit_state.opened_at IS NOT NULL
                    THEN provider_circuit_state.opened_at
                  WHEN provider_circuit_state.updated_at >= ${windowStart}
                    AND provider_circuit_state.consecutive_failures + 1 >= ${FAILURE_THRESHOLD}
                    THEN ${openedAt}
                  WHEN ${tripped}
                    THEN ${openedAt}
                  ELSE NULL
                END,
              updated_at = ${openedAt}
      `);
    }
    dbWriteBroken = false;
  } catch (error) {
    // Fire-and-forget: an unavailable database degrades to per-instance
    // breaker state, exactly the pre-§1.6 behavior.
    if (!dbWriteBroken) {
      dbWriteBroken = true;
      metrics.increment('circuit_breaker_db_unavailable_total');
    }
    void error;
  }
}

async function refreshFromDb(modelId: string): Promise<void> {
  if (refreshing.has(modelId)) return;
  refreshing.add(modelId);
  try {
    const db = getDb();
    const rows = await db
      .select({
        consecutiveFailures: schema.providerCircuitState.consecutiveFailures,
        openedAt: schema.providerCircuitState.openedAt,
        updatedAt: schema.providerCircuitState.updatedAt,
      })
      .from(schema.providerCircuitState)
      .where(sql`${schema.providerCircuitState.modelId} = ${modelId}`)
      .limit(1);
    const row = rows[0];
    if (row) {
      circuits.set(modelId, {
        consecutiveFailures: row.consecutiveFailures,
        windowStart: row.updatedAt ? row.updatedAt.getTime() : Date.now(),
        openedAt: row.openedAt ? row.openedAt.getTime() : null,
      });
    }
    lastDbRefresh.set(modelId, Date.now());
  } catch {
    // Degrade to L1 silently; the next call retries after the TTL.
    lastDbRefresh.set(modelId, Date.now());
  } finally {
    refreshing.delete(modelId);
  }
}

function maybeRefreshFromDb(modelId: string): void {
  const last = lastDbRefresh.get(modelId) ?? 0;
  if (Date.now() - last < DB_REFRESH_TTL_MS) return;
  void refreshFromDb(modelId);
}

/**
 * Record a successful model call. Resets the circuit immediately.
 *
 * Transition-only write: a success with no recorded failure streak has
 * nothing to reset in the shared row, so the happy path (every normal
 * model call) performs zero DB writes.
 */
export function recordModelSuccess(modelId: string): void {
  const hadState = circuits.delete(modelId);
  if (hadState) {
    // Defer any DB refresh for one TTL window so the async success write can
    // land before a refresh could resurrect a stale open state from the table.
    lastDbRefresh.set(modelId, Date.now());
    void writeThrough('success', modelId);
  }
}

/**
 * Record a failed model call. Returns true if the circuit is open
 * and the model should be skipped for subsequent calls.
 */
export function recordModelFailure(modelId: string): boolean {
  const now = Date.now();
  let state = circuits.get(modelId);

  if (!state || now - state.windowStart > WINDOW_MS) {
    // Fresh state or old window expired — start a new window. Any previous
    // trip is discarded with the window.
    state = { consecutiveFailures: 1, windowStart: now, openedAt: null };
    circuits.set(modelId, state);
    void writeThrough('failure', modelId, { tripped: false });
    return false;
  }

  state.consecutiveFailures += 1;
  const tripped = state.consecutiveFailures >= FAILURE_THRESHOLD;
  const firstTrip = tripped && state.openedAt === null;
  if (firstTrip) {
    // The open duration is measured from here — the trip — not from the
    // first failure of the window (which can be up to 60s earlier).
    state.openedAt = now;
  }
  circuits.set(modelId, state);
  void writeThrough('failure', modelId, { tripped: state.openedAt !== null });

  if (firstTrip) {
    metrics.increment('circuit_open_total', { tags: { model: modelId } });
  }
  return tripped;
}

/**
 * Check whether a model's circuit is currently open (should be skipped).
 * Auto-closes if the open duration has elapsed since the TRIP. Cross-isolate
 * state converges into the L1 cache via a throttled background DB refresh.
 */
export function isCircuitOpen(modelId: string): boolean {
  maybeRefreshFromDb(modelId);
  const state = circuits.get(modelId);
  if (!state) return false;
  if (state.openedAt === null || state.consecutiveFailures < FAILURE_THRESHOLD) return false;

  const now = Date.now();
  if (now - state.openedAt > OPEN_DURATION_MS) {
    // Auto-close — the model gets another chance.
    circuits.delete(modelId);
    return false;
  }

  return true;
}

/** Test helper. */
export function _resetCircuits(): void {
  circuits.clear();
  lastDbRefresh.clear();
  refreshing.clear();
  dbWriteBroken = false;
}
