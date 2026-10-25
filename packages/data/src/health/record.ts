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

// Sample recording: the fast in-memory path plus the transition-only DB write.

import { dbRecordFailure, dbRecordSuccess } from './db';
import { dbCache, s, trim } from './state';

export function recordSuccess(provider: string): void {
  const now = Date.now();
  const st = s(provider);
  const last = st.samples[st.samples.length - 1];
  const wasFailing = last !== undefined && !last.ok;
  st.samples.push({ t: now, ok: true });
  trim(st, now);

  // H1 — reset the cross-instance failure counter in the DB. Transition-only:
  // a success with no recorded failure streak has nothing to reset, so the
  // steady state performs zero DB writes per fetch (previously: one UPSERT
  // per provider call).
  if (wasFailing) {
    void dbRecordSuccess(provider);
  }

  // Keep the local DB cache consistent with the write so getScore() does not
  // read a stale failure count for the remainder of the 10s TTL.
  const cached = dbCache.get(provider);
  if (cached) {
    dbCache.set(provider, { ...cached, consecutiveFailures: 0 });
  }
}

export function recordFailure(provider: string): void {
  const now = Date.now();
  const st = s(provider);
  const last = st.samples[st.samples.length - 1];
  const wasFailing = last !== undefined && !last.ok;
  st.samples.push({ t: now, ok: false });
  trim(st, now);

  // H1 — bump the cross-instance failure counter in the DB. Transition-only:
  // the first failure of a streak is the signal other instances need;
  // subsequent failures in the same streak do not change the degraded state
  // (local scoring still weights every failure).
  if (!wasFailing) {
    void dbRecordFailure(provider);
  }

  const cached = dbCache.get(provider);
  if (cached) {
    dbCache.set(provider, {
      ...cached,
      consecutiveFailures: cached.consecutiveFailures + 1,
      lastFailureAt: now,
    });
  }
}
