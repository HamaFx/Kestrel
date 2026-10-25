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

// The symbol-research packet cache instance and its collection entry points.

import { readFeatureFlag, SymbolSchema, type Symbol } from '@kestrel/shared';

import { MAX_COMPARISON_SYMBOLS } from '../../shared/constants';
import {
  collectSymbolResearchPacket,
  SymbolResearchPacketSchema,
  type CollectSymbolResearchPacketOptions,
  type SymbolResearchPacket,
} from '../symbol-research';
import { createPacketCache } from './factory';
import { isFreshCacheablePacket } from './freshness';

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
 * used to require the XAUUSD-only packet). M-02: non-gold symbols request the
 * generic macro extension when `ENABLE_GENERIC_MACRO` is on; `=0` restores
 * the candle-only packet for them. Shared by the cached path and the
 * `PHASE2_PACKET_CACHE=0` rollback path so the flag can never silently change
 * what a packet contains (P1-9).
 */
function macroOptions(symbol: Symbol): CollectSymbolResearchPacketOptions {
  if (symbol === 'XAUUSD') return { includeMacro: true };
  return readFeatureFlag('ENABLE_GENERIC_MACRO') ? { includeMacro: true } : {};
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
