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
 * N concurrent committee runs for the same symbol within 30s collect the
 * candles/price once instead of hammering the market-data providers.
 */

import { metrics, readFeatureFlag } from '@kestrel/shared';
import { createCategorizedLogger } from '@kestrel/shared/logger';

import {
  collectSymbolResearchPacket,
  SymbolResearchPacketSchema,
  type SymbolResearchPacket,
} from '../../mastra/symbol-research';

export { SymbolResearchPacketSchema } from '../../mastra/symbol-research';
import type { Symbol } from '@kestrel/shared';

const pclog = createCategorizedLogger('ai', { component: 'packet-cache' });

/** Q5 decision: 30s TTL, fresh-only. */
export const PACKET_CACHE_TTL_MS = 30_000;

/** Entry-budget for the in-process LRU (symbols × recent windows). */
const MAX_ENTRIES = 10_000;

interface CacheEntry {
  packet: SymbolResearchPacket;
  storedAt: number;
}

const store = new Map<string, CacheEntry>();

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

function cacheKey(symbol: string): string {
  // 15s bucket keys keep lookups stable within the 30s TTL window: at most
  // the current and previous bucket can hold a live entry.
  const bucket = Math.floor(Date.now() / 15_000);
  return `packet:${symbol}:${bucket}`;
}

function previousCacheKey(symbol: string): string {
  const bucket = Math.floor(Date.now() / 15_000) - 1;
  return `packet:${symbol}:${bucket}`;
}

/** A packet is cacheable only when every evidence piece was fresh (Q5). */
export function isFreshCacheablePacket(packet: SymbolResearchPacket): boolean {
  if (packet.status !== 'ready') return false;
  if (packet.missingData.length > 0 || packet.warnings.length > 0) return false;
  if (packet.dataQuality !== 'complete') return false;
  if (packet.price?.freshness !== 'fresh') return false;
  return packet.timeframes.every(
    (evidence) => evidence.freshness === 'fresh' && evidence.quality === 'complete',
  );
}

function lruSet(key: string, entry: CacheEntry): void {
  // Map preserves insertion order: re-insert to mark as recently used.
  store.delete(key);
  store.set(key, entry);
  if (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
}

function lruGet(key: string): CacheEntry | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.storedAt > PACKET_CACHE_TTL_MS) {
    store.delete(key);
    return null;
  }
  return entry;
}

async function get(symbol: Symbol): Promise<SymbolResearchPacket | null> {
  const current = lruGet(cacheKey(symbol));
  if (current) {
    metrics.increment('packet_cache_hit_total');
    return current.packet;
  }
  const previous = lruGet(previousCacheKey(symbol));
  if (previous) {
    metrics.increment('packet_cache_hit_total');
    return previous.packet;
  }
  const mirror = await getRedisMirror();
  if (mirror) {
    try {
      for (const key of [cacheKey(symbol), previousCacheKey(symbol)]) {
        const raw = await mirror.get(key);
        if (!raw) continue;
        const parsed = SymbolResearchPacketSchema.safeParse(JSON.parse(raw));
        if (parsed.success) {
          metrics.increment('packet_cache_hit_total');
          lruSet(key, { packet: parsed.data, storedAt: Date.now() });
          return parsed.data;
        }
      }
    } catch {
      // Redis read failures fall through to a fresh collection.
    }
  }
  metrics.increment('packet_cache_miss_total');
  return null;
}

async function set(packet: SymbolResearchPacket): Promise<void> {
  if (!isFreshCacheablePacket(packet)) return;
  const key = cacheKey(packet.symbol);
  lruSet(key, { packet, storedAt: Date.now() });
  const mirror = await getRedisMirror();
  if (mirror) {
    try {
      await mirror.set(key, JSON.stringify(packet), 'EX', Math.ceil(PACKET_CACHE_TTL_MS / 1000));
    } catch {
      // Mirror write failures never affect the request path.
    }
  }
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
  if (!readFeatureFlag('PHASE2_PACKET_CACHE')) {
    return collectSymbolResearchPacket(symbol, signal);
  }
  const cached = await get(symbol);
  if (cached) return cached;

  // In-flight dedup: the first caller collects; the rest await its result.
  const existing = inflight.get(symbol);
  if (existing) return existing;

  // §4.2: XAUUSD committee packets carry the macro extension (the bridge
  // that used to require the XAUUSD-only packet). Other symbols skip it.
  const collection = collectSymbolResearchPacket(symbol, signal, {
    ...(symbol === 'XAUUSD' ? { includeMacro: true } : {}),
  })
    .then(async (packet) => {
      await set(packet);
      return packet;
    })
    .finally(() => {
      inflight.delete(symbol);
    });
  inflight.set(symbol, collection);
  return collection;
}

const inflight = new Map<string, Promise<SymbolResearchPacket>>();

/** Test helper — clear the in-process LRU. */
export function _resetPacketCache(): void {
  store.clear();
  inflight.clear();
}
