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
 *   - constants.ts    — TTL/bucket math and entry budget
 *   - log.ts          — categorized logger
 *   - redis-mirror.ts — optional cross-instance mirror handle
 *   - factory.ts      — reusable LRU + mirror + dedup cache factory
 *   - freshness.ts    — Q5 fresh-only cacheability predicate
 *   - symbol-packet.ts— the symbol-research instance + collect entry points
 *   - reset.ts        — process-wide test reset
 */

export { SymbolResearchPacketSchema } from '../symbol-research';
export { PACKET_CACHE_TTL_MS } from './constants';
export { isFreshCacheablePacket } from './freshness';
export { createPacketCache, type PacketCache, type PacketCacheOptions } from './factory';
export { collectMultiSymbolPackets, collectSymbolResearchPacketCached } from './symbol-packet';
export { _resetPacketCache } from './reset';
