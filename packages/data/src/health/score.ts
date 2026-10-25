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

// Scoring and soft-circuit predicates consumed by `runWithFailover`.

import { getDbConsecutiveFailures } from './db';
import { consecutiveFailures, s, trim } from './state';

export interface HealthSnapshot {
  /** Number of samples in the current 5-minute window. */
  samples: number;
  /** Successes in window. */
  ok: number;
  /** Failures in window. */
  failed: number;
  /** Failure rate in window. 0 when no samples (= "unknown, treat as healthy"). */
  failureRate: number;
}

export function getHealth(provider: string): HealthSnapshot {
  const now = Date.now();
  const st = s(provider);
  trim(st, now);
  let ok = 0;
  let failed = 0;
  for (const e of st.samples) {
    if (e.ok) ok += 1;
    else failed += 1;
  }
  const total = ok + failed;
  return {
    samples: total,
    ok,
    failed,
    failureRate: total === 0 ? 0 : failed / total,
  };
}

/**
 * Soft-circuit predicate used by failover ordering: true when the provider
 * has at least `minConsecutive` trailing failures and the most recent one is
 * within `withinMs`. A provider that trips this is demoted below providers
 * whose failures are older (or which have no recent failures), so a
 * hard-down upstream is not attempted ahead of a plausible one — while
 * still remaining eligible as a last resort (fail-open).
 *
 * Uses per-instance samples only: cross-instance DB state is deliberately
 * excluded because it cannot express "recent" with the same granularity,
 * and skipping on stale shared data would be worse than one extra attempt.
 */
export function isHardDown(
  provider: string,
  options: { minConsecutive?: number; withinMs?: number } = {},
): boolean {
  const minConsecutive = options.minConsecutive ?? 2;
  const withinMs = options.withinMs ?? 60_000;
  const st = s(provider);
  const now = Date.now();
  trim(st, now);
  if (consecutiveFailures(st) < minConsecutive) return false;
  const last = st.samples[st.samples.length - 1];
  if (!last || last.ok) return false;
  return now - last.t <= withinMs;
}

/**
 * Score a provider for failover ordering. Higher = healthier.
 *
 * Merges in-memory samples (fast, per-instance) with cross-instance DB
 * state (H1 fix). Uses the maximum consecutive-failure count from either
 * source, so if ANY instance sees the provider failing, the score
 * reflects the worst case.
 *
 * Exponential decay: each consecutive trailing failure doubles its weight.
 *
 *  - Unknown (no samples, no DB): neutral 0.5 — give it a chance.
 *  - Mostly fresh successes: ~1.0.
 *  - Consecutive failures: drops toward 0 exponentially.
 */
export function getScore(provider: string): number {
  const st = s(provider);
  const now = Date.now();
  trim(st, now);

  // H1 — merge cross-instance failure count from the DB.
  const dbConsec = getDbConsecutiveFailures(provider);

  if (st.samples.length === 0) {
    // No local samples — use DB state if available.
    if (dbConsec === 0) return 0.5;
    // DB shows consecutive failures — compute score from that alone.
    const total = dbConsec;
    let weighted = 0;
    for (let i = 0; i < dbConsec; i++) {
      weighted += Math.pow(2, i);
    }
    return Math.max(0, 1 - weighted / total);
  }

  const localConsec = consecutiveFailures(st);
  // Take the worst of local and cross-instance.
  const consec = Math.max(localConsec, dbConsec);
  let weightedFailures = 0;
  let weightedTotal = 0;

  for (let idx = 0; idx < st.samples.length; idx++) {
    const sample = st.samples[idx]!;
    weightedTotal += 1;
    if (!sample.ok) {
      // Penalty is 2^{consecutive position from the end} so recent
      // consecutive failures dominate the score. A single isolated
      // failure counts as 1; 3 consecutive failures count as 1+2+4=7.
      const positionFromEnd = st.samples.length - 1 - idx;
      const distance = Math.max(0, consec - positionFromEnd - 1);
      weightedFailures += Math.pow(2, distance);
    }
  }

  const failureRate = weightedFailures / weightedTotal;
  return Math.max(0, 1 - failureRate);
}
