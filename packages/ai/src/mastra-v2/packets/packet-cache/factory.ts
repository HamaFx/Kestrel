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

// Reusable packet-cache factory: LRU → Redis mirror → in-flight dedup →
// underlying collect. The committee's `SymbolResearchPacket` and the XAUUSD
// verified packet each get an instance with a disjoint key namespace but the
// same TTL, LRU, dedup, and `PHASE2_PACKET_CACHE` rollback semantics.

import { metrics, readFeatureFlag, safeParseJson } from '@kestrel/shared';

import {
  bucketStartedAt,
  CACHE_MIRROR_TTL_SECONDS,
  CACHE_PROBE_DEPTH,
  currentBucket,
  MAX_ENTRIES,
  PACKET_CACHE_TTL_MS,
  type CacheEntry,
} from './constants';
import { pclog } from './log';
import { getRedisMirror } from './redis-mirror';

export interface PacketCacheOptions<T> {
  /**
   * Mirror-key namespace (e.g. `packet`, `xauusd-packet`). Keeps stores for
   * different packet shapes disjoint while sharing one TTL and one mirror.
   */
  namespace: string;
  /** Q5 fresh-only predicate: stale, degraded, or blocked values are never cached. */
  isCacheable: (packet: T) => boolean;
  /** Validate a Redis-mirror payload before it is trusted as a cache hit. */
  revive: (raw: string) => T | null;
}

export interface PacketCache<T> {
  /**
   * Cache-wrapped collection: LRU → Redis mirror read → in-flight dedup →
   * underlying collect. `PHASE2_PACKET_CACHE=0` rolls back to uncached
   * collection (contents identical; only caching is bypassed).
   */
  collect(
    id: string,
    collect: (signal?: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T>;
  /** Test helper — clear this cache's in-process LRU and in-flight map. */
  reset(): void;
}

/** Reset hooks for every cache created in this process (test support). */
export const cacheRegistry: Array<{ reset(): void }> = [];

export function createPacketCache<T>(opts: PacketCacheOptions<T>): PacketCache<T> {
  const store = new Map<string, CacheEntry<T>>();
  const inflight = new Map<string, Promise<T>>();

  function keyFor(id: string, bucket: number): string {
    return `${opts.namespace}:${id}:${bucket}`;
  }

  /**
   * Reachability keys, newest first. Depth 2 (B-02): the current bucket and
   * the previous one. Entries are *written* under their current and next
   * bucket (see `set`), so this probe set still spans the full 30s TTL.
   */
  function probeKeys(id: string, bucket: number): string[] {
    const keys: string[] = [];
    for (let offset = 0; offset < CACHE_PROBE_DEPTH; offset += 1) {
      keys.push(keyFor(id, bucket - offset));
    }
    return keys;
  }

  function lruSet(key: string, entry: CacheEntry<T>): void {
    // Map preserves insertion order: re-insert to mark as recently used.
    store.delete(key);
    store.set(key, entry);
    if (store.size > MAX_ENTRIES) {
      const oldest = store.keys().next().value;
      if (oldest !== undefined) store.delete(oldest);
    }
  }

  function lruGet(key: string): CacheEntry<T> | null {
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.storedAt > PACKET_CACHE_TTL_MS) {
      store.delete(key);
      return null;
    }
    return entry;
  }

  /**
   * Revive one mirrored payload. New payloads are `{ storedAt, packet }`
   * envelopes so the consume path can enforce the TTL on the true write time
   * (B-02); payloads written by a pre-envelope deploy fall back to the
   * bucket start, a conservative lower bound on the write time — the derived
   * age is never underestimated, so a legacy entry can expire earlier, never
   * later, than its true TTL.
   */
  function reviveMirrorEntry(raw: string, keyBucket: number): CacheEntry<T> | null {
    const parsed = safeParseJson<unknown>(raw, null);
    if (parsed === null) return null;
    if (parsed !== null && typeof parsed === 'object' && 'packet' in parsed) {
      const envelope = parsed as { storedAt?: unknown; packet: unknown };
      const packet = opts.revive(JSON.stringify(envelope.packet));
      if (!packet) return null;
      const storedAt =
        typeof envelope.storedAt === 'number' && Number.isFinite(envelope.storedAt)
          ? envelope.storedAt
          : bucketStartedAt(keyBucket);
      return { packet, storedAt };
    }
    const packet = opts.revive(raw);
    return packet ? { packet, storedAt: bucketStartedAt(keyBucket) } : null;
  }

  async function get(id: string): Promise<T | null> {
    const lookupStartedAt = Date.now();
    const bucket = currentBucket();
    for (const key of probeKeys(id, bucket)) {
      const entry = lruGet(key);
      if (entry) {
        metrics.increment('packet_cache_hit_total');
        // I-06 (audit 2026-10-18): the hit-rate is visible from setup latency
        // alone — `phase=packet, cached=true` without chasing Redis logs.
        metrics.observe('mastra_setup_latency_ms', Date.now() - lookupStartedAt, {
          tags: { phase: 'packet', cached: 'true' },
        });
        return entry.packet;
      }
    }
    const mirror = await getRedisMirror();
    if (mirror) {
      try {
        const keys = probeKeys(id, bucket);
        for (let offset = 0; offset < keys.length; offset += 1) {
          const key = keys[offset]!;
          const raw = await mirror.get(key);
          if (!raw) continue;
          const entry = reviveMirrorEntry(raw, bucket - offset);
          if (!entry) continue;
          // B-02: TTL is the only freshness gate. A mirrored entry older than
          // the TTL is discarded even when its Redis key is still alive and
          // its bucket is still probe-reachable.
          if (Date.now() - entry.storedAt > PACKET_CACHE_TTL_MS) continue;
          metrics.increment('packet_cache_hit_total');
          lruSet(key, entry);
          metrics.observe('mastra_setup_latency_ms', Date.now() - lookupStartedAt, {
            tags: { phase: 'packet', cached: 'true' },
          });
          return entry.packet;
        }
      } catch {
        // Redis read failures fall through to a fresh collection.
      }
    }
    metrics.increment('packet_cache_miss_total');
    return null;
  }

  function set(id: string, packet: T): void {
    if (!opts.isCacheable(packet)) return;
    const bucket = currentBucket();
    const entry: CacheEntry<T> = { packet, storedAt: Date.now() };
    // B-02/B-04 balance: the entry is mirrored under its own bucket and the
    // next bucket, so the depth-2 probe still reaches it for its whole TTL
    // (no early re-collection), while no probe sequence can reach an entry
    // more than a TTL after `storedAt`.
    const keys = [keyFor(id, bucket), keyFor(id, bucket + 1)];
    for (const key of keys) lruSet(key, entry);
    // P2 (mirror off the request path): the write is fire-and-forget.
    // Everything mirror-related — including handle acquisition — happens
    // inside a detached promise with its own error handling, so a rejected
    // or never-settling mirror write can never delay or fail the caller
    // and can never surface as an unhandled rejection.
    void getRedisMirror()
      .then((mirror) =>
        mirror
          ? Promise.all(
              keys.map((key) =>
                mirror.set(
                  key,
                  JSON.stringify({ storedAt: entry.storedAt, packet }),
                  'EX',
                  CACHE_MIRROR_TTL_SECONDS,
                ),
              ),
            )
          : undefined,
      )
      .catch((error: unknown) => {
        pclog.warn(
          'Packet cache Redis mirror write failed; the in-process LRU still serves the packet',
          {
            error: error instanceof Error ? error.message : String(error),
          },
        );
      });
  }

  async function collect(
    id: string,
    collect: (signal?: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    if (!readFeatureFlag('PHASE2_PACKET_CACHE')) {
      // Rollback path: same collection, no caching.
      return collect(signal);
    }
    const cached = await get(id);
    if (cached) return cached;

    // In-flight dedup: the first caller collects; the rest await its result.
    const existing = inflight.get(id);
    if (existing) return existing;

    const collectionStartedAt = Date.now();
    const collection = collect(signal)
      .then((packet) => {
        set(id, packet);
        // I-06: fresh collections are tagged `cached=false` so the packet
        // hit-rate is computable from one metric family.
        metrics.observe('mastra_setup_latency_ms', Date.now() - collectionStartedAt, {
          tags: { phase: 'packet', cached: 'false' },
        });
        return packet;
      })
      .finally(() => {
        inflight.delete(id);
      });
    inflight.set(id, collection);
    return collection;
  }

  function reset(): void {
    store.clear();
    inflight.clear();
  }

  cacheRegistry.push({ reset });
  return { collect, reset };
}
