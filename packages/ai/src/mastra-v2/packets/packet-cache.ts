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

/**
 * Symbol-research packet cache (audit plan §2.1, Q5 decision).
 *
 * 30-second TTL, **fresh-only**: a packet is cached only when every piece of
 * evidence was served fresh and the packet is `ready`; stale or degraded
 * packets are never cached, so quality can never regress through the cache
 * (Q1: quality over cost). The default store is an in-process LRU; when
 * `REDIS_URL` is set and `ioredis` is importable, entries are additionally
 * mirrored to Redis so burst traffic deduplicates across instances.
 *
 * The cache exists for one purpose: burst deduplication at market open —
 * N concurrent runs for the same symbol within 30s collect the
 * candles/price once instead of hammering the market-data providers.
 *
 * §2.1/P1-10 — the machinery is a reusable factory (`createPacketCache`): the
 * committee's `SymbolResearchPacket` and the XAUUSD verified packet (Q6: its
 * own schema, shared collection) each get an instance with a disjoint key
 * namespace but the same TTL, LRU, in-flight dedup, Redis mirror, and
 * `PHASE2_PACKET_CACHE` rollback semantics.
 *
 * P2 (Redis mirror off the request path) — mirror **writes** are
 * fire-and-forget: they are kicked off inside a detached promise with their
 * own error handling and are never awaited by a caller, so an unreachable or
 * lazy-connected Redis can never stall or fail a request. Mirror **reads**
 * stay on the request path; reads are the point of the mirror.
 */

import { metrics, readFeatureFlag, SymbolSchema, type Symbol } from '@kestrel/shared';
import { createCategorizedLogger } from '@kestrel/shared/logger';

import { MAX_COMPARISON_SYMBOLS, PACKET_CACHE_TTL_MS } from '../shared/constants';
import {
  collectSymbolResearchPacket,
  SymbolResearchPacketSchema,
  type CollectSymbolResearchPacketOptions,
  type SymbolResearchPacket,
} from './symbol-research';

export { SymbolResearchPacketSchema } from './symbol-research';

const pclog = createCategorizedLogger('ai', { component: 'mastra:packet-cache' });

/** Q5 decision: 30s TTL, fresh-only. Defined in shared constants (P-05). */
export { PACKET_CACHE_TTL_MS };

/** Entry-budget for the in-process LRU (symbols × recent windows). */
const MAX_ENTRIES = 10_000;

/** 15s bucket keys keep lookups stable within the 30s TTL window. */
const CACHE_BUCKET_MS = 15_000;

/**
 * B-04 (audit 2026-10-18) — number of buckets a live entry can occupy. With a
 * 30s TTL and 15s buckets, an entry stored at the end of bucket `n` is still
 * within TTL when the clock reaches bucket `n+2` (age < 30s), so reads must
 * probe `current, current-1, current-2` instead of only the two newest
 * buckets. Probing one bucket short created an unnecessary re-collection
 * burst at every second bucket rollover.
 */
const CACHE_PROBE_DEPTH = 3;

interface CacheEntry<T> {
  packet: T;
  storedAt: number;
}

/** Redis mirror handle — populated lazily when REDIS_URL is set. */
type RedisLike = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', ttlSeconds: number): Promise<unknown>;
};
let redis: RedisLike | null = null;
let redisAttempted = false;
let redisBroken = false;

async function getRedisMirror(): Promise<RedisLike | null> {
  const url = process.env.REDIS_URL;
  if (!url || redisBroken) return null;
  if (redis) return redis;
  if (redisAttempted) return null;
  redisAttempted = true;
  try {
    // ioredis is optional infrastructure (docker-compose.observability.yml);
    // a missing package degrades the cache to in-process only. The non-literal
    // specifier keeps this a genuinely optional dependency for tsc too.
    const moduleId = 'ioredis' as string;
    const mod = (await import(moduleId)) as unknown as {
      default: new (
        url: string,
        opts: { lazyConnect: boolean; maxRetriesPerRequest: number },
      ) => RedisLike;
    };
    const client = new mod.default(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
    redis = client;
    pclog.info('Packet cache Redis mirror enabled');
    return redis;
  } catch (error) {
    redisBroken = true;
    pclog.warn('Packet cache Redis mirror unavailable; using in-process LRU only', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function currentBucket(): number {
  return Math.floor(Date.now() / CACHE_BUCKET_MS);
}

/**
 * Q5 (fresh-only) cacheability for the generalized packet. A packet is
 * cacheable only when every evidence piece was fresh.
 */
export function isFreshCacheablePacket(packet: SymbolResearchPacket): boolean {
  if (packet.status !== 'ready') return false;
  if (packet.missingData.length > 0 || packet.warnings.length > 0) return false;
  if (packet.dataQuality !== 'complete') return false;
  if (packet.price?.freshness !== 'fresh') return false;
  return packet.timeframes.every(
    (evidence) => evidence.freshness === 'fresh' && evidence.quality === 'complete',
  );
}

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
const cacheRegistry: Array<{ reset(): void }> = [];

export function createPacketCache<T>(opts: PacketCacheOptions<T>): PacketCache<T> {
  const store = new Map<string, CacheEntry<T>>();
  const inflight = new Map<string, Promise<T>>();

  function keyFor(id: string, bucket: number): string {
    // 15s bucket keys keep lookups stable within the 30s TTL window. An entry
    // stored near a bucket's end can still be within TTL in bucket +2, so
    // reads probe CACHE_PROBE_DEPTH buckets (B-04).
    return `${opts.namespace}:${id}:${bucket}`;
  }

  /** Bucket keys to probe newest-first: current, current-1, current-2. */
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
        for (const key of probeKeys(id, bucket)) {
          const raw = await mirror.get(key);
          if (!raw) continue;
          const revived = opts.revive(raw);
          if (revived) {
            metrics.increment('packet_cache_hit_total');
            lruSet(key, { packet: revived, storedAt: Date.now() });
            metrics.observe('mastra_setup_latency_ms', Date.now() - lookupStartedAt, {
              tags: { phase: 'packet', cached: 'true' },
            });
            return revived;
          }
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
    const key = keyFor(id, currentBucket());
    lruSet(key, { packet, storedAt: Date.now() });
    // P2 (mirror off the request path): the write is fire-and-forget.
    // Everything mirror-related — including handle acquisition — happens
    // inside a detached promise with its own error handling, so a rejected
    // or never-settling mirror write can never delay or fail the caller
    // and can never surface as an unhandled rejection.
    void getRedisMirror()
      .then((mirror) =>
        mirror
          ? mirror.set(key, JSON.stringify(packet), 'EX', Math.ceil(PACKET_CACHE_TTL_MS / 1000))
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

const symbolPacketCache = createPacketCache<SymbolResearchPacket>({
  namespace: 'packet',
  isCacheable: isFreshCacheablePacket,
  revive: (raw) => {
    const parsed = SymbolResearchPacketSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  },
});

/**
 * §4.2: XAUUSD committee packets carry the macro extension (the bridge that
 * used to require the XAUUSD-only packet). Other symbols skip it. Shared by
 * the cached path and the `PHASE2_PACKET_CACHE=0` rollback path so the flag
 * can never silently change what a packet contains (P1-9).
 */
function macroOptions(symbol: Symbol): CollectSymbolResearchPacketOptions {
  return symbol === 'XAUUSD' ? { includeMacro: true } : {};
}

/**
 * Cache-wrapped packet collection (audit plan §2.1). Concurrent callers for
 * the same symbol share one in-flight collection so market-open bursts hit
 * the providers once. Set `PHASE2_PACKET_CACHE=0` to roll back to uncached
 * collection.
 */
export async function collectSymbolResearchPacketCached(
  symbol: Symbol,
  signal?: AbortSignal,
): Promise<SymbolResearchPacket> {
  return symbolPacketCache.collect(
    symbol,
    (sig) => collectSymbolResearchPacket(symbol, sig, macroOptions(symbol)),
    signal,
  );
}

/**
 * A-01 (audit 2026-10-18, B-01/B-08) — bounded cross-symbol comparison
 * collection. Every symbol resolves through the same 30s fresh-only cache
 * (`collectSymbolResearchPacketCached`), so a comparison adds no new
 * concurrency primitive and burst-deduplicates per symbol like any other run.
 *
 * The comparison cap is enforced here as well as at the routing boundary: the
 * collector is the fail-closed backstop against an unbounded fan-out.
 */
export async function collectMultiSymbolPackets(
  symbols: readonly Symbol[],
  signal?: AbortSignal,
): Promise<Map<Symbol, SymbolResearchPacket>> {
  const unique = [...new Set(symbols.map((symbol) => SymbolSchema.parse(symbol)))];
  if (unique.length === 0) {
    throw new Error('Multi-symbol collection requires at least one symbol.');
  }
  if (unique.length > MAX_COMPARISON_SYMBOLS) {
    throw new Error(
      `Cannot compare more than ${MAX_COMPARISON_SYMBOLS} symbols in one run; received ${unique.length}.`,
    );
  }
  const packets = await Promise.all(
    unique.map((symbol) => collectSymbolResearchPacketCached(symbol, signal)),
  );
  return new Map(unique.map((symbol, index) => [symbol, packets[index]!]));
}

/** Test helper — clear the in-process LRU. */
export function _resetPacketCache(): void {
  for (const cache of cacheRegistry) cache.reset();
  // Mirror state too, so each test case re-resolves its own REDIS_URL/mock.
  redis = null;
  redisAttempted = false;
  redisBroken = false;
}
