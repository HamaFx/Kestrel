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

// Per-provider rolling health snapshot — process-local storage.
//
// `runWithFailover` consults this so it doesn't always retry a provider that
// has been failing for the last few minutes. The data structure is a tiny
// circular buffer per provider — no allocations on the hot path, no upstream
// dep, fits the personal-mode "no Upstash" rule.
//
// Health windows are short (5 min default) so a single bad minute doesn't
// permanently sideline a provider — it self-heals on the next success.
//
// The maps below are module-level singletons; importing any helper from the
// `./health` barrel shares the same instance.

export const WINDOW_MS = 5 * 60 * 1000;

/** Minimum interval between DB cross-instance reads for the same provider. */
export const DB_CACHE_MS = 10_000;

export interface Sample {
  /** ms epoch UTC. */
  t: number;
  ok: boolean;
}

export interface State {
  samples: Sample[];
}

export interface DbCacheEntry {
  /** Epoch ms when the DB was last read for this provider. */
  readAt: number;
  /** Cached `consecutive_failures` from the DB. */
  consecutiveFailures: number;
  /** Cached `last_failure_at` epoch ms from the DB. */
  lastFailureAt: number;
}

export const state = new Map<string, State>();
export const dbCache = new Map<string, DbCacheEntry>();

export function s(provider: string): State {
  let st = state.get(provider);
  if (!st) {
    st = { samples: [] };
    state.set(provider, st);
  }
  return st;
}

export function trim(st: State, now: number): void {
  const cutoff = now - WINDOW_MS;
  // The list is appended chronologically; drop the head until first in-window.
  let i = 0;
  while (i < st.samples.length && st.samples[i]!.t < cutoff) i += 1;
  if (i > 0) st.samples.splice(0, i);
}

/**
 * Count consecutive trailing failures. Returns 0 when the last sample
 * is a success or there are no samples.
 */
export function consecutiveFailures(st: State): number {
  let count = 0;
  for (let i = st.samples.length - 1; i >= 0; i--) {
    if (!st.samples[i]!.ok) count += 1;
    else break;
  }
  return count;
}

/** Test helper. */
export function _resetHealth(): void {
  state.clear();
  dbCache.clear();
}
