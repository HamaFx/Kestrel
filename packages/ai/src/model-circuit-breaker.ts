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

import { sql } from 'drizzle-orm';

import { schema } from '@kestrel/db';
import { metrics } from '@kestrel/shared';

import { getDb } from './db';

interface CircuitState {
  consecutiveFailures: number;
  openedAt: number;
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

async function writeThrough(operation: 'failure' | 'success', modelId: string): Promise<void> {
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
      await db.execute(sql`
        INSERT INTO provider_circuit_state (model_id, consecutive_failures, opened_at, updated_at)
        VALUES (${modelId}, 1, ${openedAt}, ${openedAt})
        ON CONFLICT (model_id) DO UPDATE
          SET consecutive_failures = provider_circuit_state.consecutive_failures + 1,
              opened_at = ${openedAt},
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
      })
      .from(schema.providerCircuitState)
      .where(sql`${schema.providerCircuitState.modelId} = ${modelId}`)
      .limit(1);
    const row = rows[0];
    if (row) {
      circuits.set(modelId, {
        consecutiveFailures: row.consecutiveFailures,
        openedAt: row.openedAt ? row.openedAt.getTime() : Date.now(),
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
 */
export function recordModelSuccess(modelId: string): void {
  circuits.delete(modelId);
  // Defer any DB refresh for one TTL window so the async success write can
  // land before a refresh could resurrect a stale open state from the table.
  lastDbRefresh.set(modelId, Date.now());
  void writeThrough('success', modelId);
}

/**
 * Record a failed model call. Returns true if the circuit is now open
 * and the model should be skipped for subsequent calls.
 */
export function recordModelFailure(modelId: string): boolean {
  const now = Date.now();
  let state = circuits.get(modelId);

  if (!state || now - state.openedAt > WINDOW_MS) {
    // Fresh state or old state expired — start a new window.
    state = { consecutiveFailures: 1, openedAt: now };
    circuits.set(modelId, state);
    void writeThrough('failure', modelId);
    return false;
  }

  state.consecutiveFailures += 1;
  void writeThrough('failure', modelId);

  if (state.consecutiveFailures >= FAILURE_THRESHOLD) {
    // Circuit opens — the caller should skip this model.
    metrics.increment('circuit_open_total', { tags: { model: modelId } });
    return true;
  }

  return false;
}

/**
 * Check whether a model's circuit is currently open (should be skipped).
 * Auto-closes if the open duration has elapsed. Cross-isolate state
 * converges into the L1 cache via a throttled background DB refresh.
 */
export function isCircuitOpen(modelId: string): boolean {
  maybeRefreshFromDb(modelId);
  const state = circuits.get(modelId);
  if (!state) return false;
  if (state.consecutiveFailures < FAILURE_THRESHOLD) return false;

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
