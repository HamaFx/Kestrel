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

// Audit plan §2.1 (Q5 decision) — 30s fresh-only packet cache. Fresh, complete
// packets are served from the LRU and burst-deduplicated; stale, degraded,
// and blocked packets are never cached.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { metrics } from '@kestrel/shared';

const mocks = vi.hoisted(() => ({
  collectSymbolResearchPacket: vi.fn(),
}));

vi.mock('../src/mastra/symbol-research', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../src/mastra/symbol-research');
  return { ...actual, collectSymbolResearchPacket: mocks.collectSymbolResearchPacket };
});

import {
  _resetPacketCache,
  collectSymbolResearchPacketCached,
  isFreshCacheablePacket,
  PACKET_CACHE_TTL_MS,
} from '../src/mastra/packet-cache';
import { SymbolResearchPacketSchema, XauusdExtensionSchema } from '../src/mastra/symbol-research';
import type { SymbolResearchPacket } from '../src/mastra/symbol-research';

const freshPacket = {
  packetId: 'packet-fresh',
  kind: 'symbol_research_packet' as const,
  symbol: 'XAUUSD',
  generatedAt: '2026-10-10T12:00:00.000Z',
  status: 'ready' as const,
  dataQuality: 'complete' as const,
  price: {
    evidenceId: 'price-1',
    symbol: 'XAUUSD',
    source: 'biquote',
    fetchedAt: '2026-10-10T12:00:00.000Z',
    dataAsOf: '2026-10-10T12:00:00.000Z',
    freshness: 'fresh' as const,
    quality: 'complete' as const,
    warnings: [],
    tick: { symbol: 'XAUUSD', bid: 2648.2, ask: 2648.4, mid: 2648.3, ts: 1, source: 'biquote' },
  },
  timeframes: [
    {
      evidenceId: 'research-1',
      symbol: 'XAUUSD',
      timeframe: '1h' as const,
      source: 'biquote',
      fetchedAt: '2026-10-10T12:00:00.000Z',
      dataAsOf: '2026-10-10T12:00:00.000Z',
      freshness: 'fresh' as const,
      quality: 'complete' as const,
      warnings: [],
      candles: [
        {
          symbol: 'XAUUSD',
          tf: '1h' as const,
          t: 1760000000000,
          o: 2647.1,
          h: 2649.9,
          l: 2646,
          c: 2648.2,
          v: 100,
          source: 'biquote',
          fetchedAt: 1760000000000,
        },
      ],
      indicators: [
        { symbol: 'XAUUSD', tf: '1h' as const, kind: 'rsi' as const, params: { period: 14 }, values: [61.4], fetchedAt: 1760000000000 },
      ],
    },
  ],
  optionalContext: { available: false, reason: 'not configured' },
  missingData: [],
  warnings: [],
} as unknown as SymbolResearchPacket;

const stalePacket = {
  ...freshPacket,
  packetId: 'packet-stale',
  timeframes: [
    { ...freshPacket.timeframes[0]!, evidenceId: 'research-stale', freshness: 'stale' as const },
  ],
} as unknown as SymbolResearchPacket;

const blockedPacket = {
  ...freshPacket,
  packetId: 'packet-blocked',
  status: 'blocked' as const,
  dataQuality: 'degraded' as const,
  missingData: ['Current XAUUSD price is unavailable.'],
} as unknown as SymbolResearchPacket;

beforeEach(() => {
  vi.clearAllMocks();
  metrics.reset();
  _resetPacketCache();
  delete process.env.PHASE2_PACKET_CACHE;
});

describe('packet cache (§2.1, Q5)', () => {
  it('serves a 30s TTL by design', () => {
    expect(PACKET_CACHE_TTL_MS).toBe(30_000);
  });

  it('caches only fresh, complete, warning-free packets', () => {
    expect(isFreshCacheablePacket(freshPacket)).toBe(true);
    expect(isFreshCacheablePacket(stalePacket)).toBe(false);
    expect(isFreshCacheablePacket(blockedPacket)).toBe(false);
  });

  it('serves a cached fresh packet without recollecting', async () => {
    mocks.collectSymbolResearchPacket.mockResolvedValue(freshPacket);

    const first = await collectSymbolResearchPacketCached('XAUUSD');
    const second = await collectSymbolResearchPacketCached('XAUUSD');

    expect(first.packetId).toBe('packet-fresh');
    expect(second.packetId).toBe('packet-fresh');
    expect(mocks.collectSymbolResearchPacket).toHaveBeenCalledTimes(1);
    expect(metrics.snapshot().counters['packet_cache_hit_total']).toBe(1);
  });

  it('never caches stale or blocked packets', async () => {
    mocks.collectSymbolResearchPacket.mockResolvedValueOnce(stalePacket).mockResolvedValueOnce(blockedPacket);

    await collectSymbolResearchPacketCached('XAUUSD');
    await collectSymbolResearchPacketCached('XAUUSD');

    expect(mocks.collectSymbolResearchPacket).toHaveBeenCalledTimes(2);
    expect(metrics.snapshot().counters['packet_cache_miss_total']).toBe(2);
  });

  it('deduplicates concurrent collections for the same symbol (burst)', async () => {
    let release!: (value: SymbolResearchPacket) => void;
    mocks.collectSymbolResearchPacket.mockImplementation(
      () =>
        new Promise<SymbolResearchPacket>((resolve) => {
          release = resolve;
        }),
    );

    const first = collectSymbolResearchPacketCached('XAUUSD');
    // Let the first caller reach its in-flight collection before the second
    // caller joins it (the cache lookup awaits a microtask first).
    await vi.waitFor(() => expect(mocks.collectSymbolResearchPacket).toHaveBeenCalled());
    const second = collectSymbolResearchPacketCached('XAUUSD');
    release(freshPacket);
    const [a, b] = await Promise.all([first, second]);

    expect(a.packetId).toBe('packet-fresh');
    expect(b.packetId).toBe('packet-fresh');
    expect(mocks.collectSymbolResearchPacket).toHaveBeenCalledTimes(1);
  });

  it('expires entries after the 30s TTL', async () => {
    vi.useFakeTimers();
    try {
      mocks.collectSymbolResearchPacket.mockResolvedValue(freshPacket);
      await collectSymbolResearchPacketCached('XAUUSD');
      vi.advanceTimersByTime(31_000);
      await collectSymbolResearchPacketCached('XAUUSD');
      expect(mocks.collectSymbolResearchPacket).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('requests the §4.2 XAUUSD macro extension for gold committee packets', async () => {
    mocks.collectSymbolResearchPacket.mockResolvedValue(freshPacket);
    await collectSymbolResearchPacketCached('XAUUSD');
    expect(mocks.collectSymbolResearchPacket).toHaveBeenCalledWith(
      'XAUUSD',
      undefined,
      expect.objectContaining({ includeMacro: true }),
    );
    // Non-gold symbols skip the macro fetch entirely.
    mocks.collectSymbolResearchPacket.mockClear();
    await collectSymbolResearchPacketCached('EURUSD');
    expect(mocks.collectSymbolResearchPacket).toHaveBeenCalledWith(
      'EURUSD',
      undefined,
      expect.objectContaining({}),
    );
    expect(mocks.collectSymbolResearchPacket).not.toHaveBeenCalledWith(
      'EURUSD',
      undefined,
      expect.objectContaining({ includeMacro: true }),
    );
  });

  it('accepts the xauusdExtension on the packet schema (§4.2)', () => {
    const extension = XauusdExtensionSchema.parse({
      evidenceId: 'macro-1',
      dollarIndex: [{ asOf: '2026-10-01', value: 100.5 }],
      realYields: [{ asOf: '2026-10-01', value: 1.9 }],
      breakevenInflation: [],
      events: [{ name: 'CPI', actual: 2.4, forecast: 2.3, previous: 2.1 }],
      newsCount: 5,
      warnings: [],
    });
    const packet = SymbolResearchPacketSchema.parse({
      ...freshPacket,
      xauusdExtension: extension,
    });
    expect(packet.xauusdExtension?.dollarIndex[0]?.value).toBe(100.5);
    // Packets without the extension remain valid (other symbols).
    expect(SymbolResearchPacketSchema.safeParse(freshPacket).success).toBe(true);
  });

  it('bypasses the cache entirely when PHASE2_PACKET_CACHE=0 (rollback flag)', async () => {
    process.env.PHASE2_PACKET_CACHE = '0';
    mocks.collectSymbolResearchPacket.mockResolvedValue(freshPacket);

    await collectSymbolResearchPacketCached('XAUUSD');
    await collectSymbolResearchPacketCached('XAUUSD');

    expect(mocks.collectSymbolResearchPacket).toHaveBeenCalledTimes(2);
  });
});
