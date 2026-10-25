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

// Packet-cache constants and bucket math.
//
// Freshness contract (B-02, audit 2026-10-18): `PACKET_CACHE_TTL_MS` is the
// only freshness gate on every path. Bucket keys (current + next at write,
// current + previous at read) decide reachability only; an entry older than
// the TTL is never served, from the LRU or the Redis mirror.

import { PACKET_CACHE_TTL_MS } from '../../shared/constants';

/** Q5 decision: 30s TTL, fresh-only. Defined in shared constants (P-05). */
export { PACKET_CACHE_TTL_MS };

/** Entry-budget for the in-process LRU (symbols × recent windows). */
export const MAX_ENTRIES = 10_000;

/** 15s bucket keys keep lookups stable within the 30s TTL window. */
export const CACHE_BUCKET_MS = 15_000;

/**
 * B-02 (audit 2026-10-18) — probe depth 2: current bucket + previous bucket.
 *
 * The invariant is **freshness is TTL, not bucket**. Bucket probing only
 * decides *reachability*; `PACKET_CACHE_TTL_MS` decides freshness on every
 * path (local LRU reads and Redis-mirror revives alike). An entry is
 * therefore never served once it is older than the TTL, and the read path
 * performs at most two mirror probes.
 *
 * Because a 15s write bucket can sit anywhere inside the 30s TTL, `set`
 * mirrors each entry under its own bucket AND the next bucket. That keeps a
 * packet written early in a bucket reachable — without early re-collection —
 * until its TTL expires (B-04), while depth 2 still guarantees no probe can
 * reach past `storedAt + TTL` (B-02).
 */
export const CACHE_PROBE_DEPTH = 2;

/** Redis EX ceiling for mirrored entries — never longer than the TTL. */
export const CACHE_MIRROR_TTL_SECONDS = Math.ceil(PACKET_CACHE_TTL_MS / 1000);

export interface CacheEntry<T> {
  packet: T;
  storedAt: number;
}

export function bucketStartedAt(bucket: number): number {
  return bucket * CACHE_BUCKET_MS;
}

export function currentBucket(): number {
  return Math.floor(Date.now() / CACHE_BUCKET_MS);
}
