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

import { metrics } from '@kestrel/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _resetPacketCache,
  collectMultiSymbolPackets,
  collectSymbolResearchPacketCached,
  isFreshCacheablePacket,
  PACKET_CACHE_TTL_MS,
} from '../src/mastra-v2/packets/packet-cache';
import {
  computeIndicatorMemo,
  SymbolResearchPacketSchema,
  XauusdExtensionSchema,
  type SymbolResearchPacket,
} from '../src/mastra-v2/packets/symbol-research';

const mocks = vi.hoisted(() => ({
  collectSymbolResearchPacket: vi.fn(),
}));

const mirrorMocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../src/mastra-v2/packets/symbol-research', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '../src/mastra-v2/packets/symbol-research',
  );
  return { ...actual, collectSymbolResearchPacket: mocks.collectSymbolResearchPacket };
});

// §2.2 — the Redis mirror is optional infrastructure instantiated via a
// dynamic `import('ioredis')`; a fake client lets the tests observe mirror
// interactions without a live Redis.
vi.mock('ioredis', () => ({
  default: class FakeRedisMirror {
    get = mirrorMocks.get;
    set = mirrorMocks.set;

    constructor(_url: string, _opts: { lazyConnect: boolean; maxRetriesPerRequest: number }) {}
  },
}));

vi.mock('@kestrel/shared/logger', () => ({
  createCategorizedLogger: () => ({
    info: loggerMocks.info,
    warn: loggerMocks.warn,
    error: loggerMocks.error,
  }),
}));

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
        {
          symbol: 'XAUUSD',
          tf: '1h' as const,
          kind: 'rsi' as const,
          params: { period: 14 },
          values: [61.4],
          fetchedAt: 1760000000000,
        },
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
  delete process.env.REDIS_URL;
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
    mocks.collectSymbolResearchPacket
      .mockResolvedValueOnce(stalePacket)
      .mockResolvedValueOnce(blockedPacket);

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

  it('serves a cached packet across two bucket rollovers (B-04)', async () => {
    vi.useFakeTimers();
    try {
      // Store near the end of the first 15s bucket…
      vi.setSystemTime(14_900);
      mocks.collectSymbolResearchPacket.mockResolvedValue(freshPacket);
      await collectSymbolResearchPacketCached('XAUUSD');

      // …and read at 30.1s: the entry (bucket 0) is 15.2s old — inside the
      // 30s TTL but two bucket rollovers back — so it must still be served.
      vi.setSystemTime(30_100);
      const second = await collectSymbolResearchPacketCached('XAUUSD');

      expect(second.packetId).toBe('packet-fresh');
      expect(mocks.collectSymbolResearchPacket).toHaveBeenCalledTimes(1);
      expect(metrics.snapshot().counters['packet_cache_hit_total']).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('still expires entries beyond the 30s TTL after a rollover (B-04)', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(14_900);
      mocks.collectSymbolResearchPacket.mockResolvedValue(freshPacket);
      await collectSymbolResearchPacketCached('XAUUSD');

      // 30.001s of age: the extra probe must not resurrect expired entries.
      vi.setSystemTime(44_901);
      await collectSymbolResearchPacketCached('XAUUSD');

      expect(mocks.collectSymbolResearchPacket).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('memoizes indicator computations per staleness bit (B-06)', () => {
    const candle = freshPacket.timeframes[0]!.candles[0]!;
    const candles = [
      { ...candle, t: candle.t - 3_600_000, fetchedAt: candle.fetchedAt - 3_600_000 },
      candle,
    ];
    const base = {
      symbol: 'XAUUSD' as const,
      tf: '1h' as const,
      kind: 'rsi' as const,
      params: { period: 14 },
      candles,
    };

    const fresh = computeIndicatorMemo({ ...base, stale: false });
    // Same length + last timestamp, different staleness → a distinct entry,
    // so a stale computation is never reused as fresh after a failover.
    const stale = computeIndicatorMemo({ ...base, stale: true });
    expect(stale).not.toBe(fresh);

    // The fresh entry is still memoized for identical fresh calls.
    expect(computeIndicatorMemo({ ...base, stale: false })).toBe(fresh);
  });

  it('recomputes when a re-produced candle payload shares length/last-t but not closes (I-01)', () => {
    // A realistic open-bar series: the last candle's close moves within the
    // bar while its open timestamp (and the bar count) stays identical.
    const candles = Array.from({ length: 24 }, (_, index) => {
      const c = 2600 + Math.round(Math.sin(index / 3) * 30) + (index % 2);
      return {
        symbol: 'XAUUSD' as const,
        tf: '1h' as const,
        t: 1_760_000_000_000 - (23 - index) * 3_600_000,
        o: c - 1,
        h: c + 2,
        l: c - 2,
        c,
        v: 100,
        source: 'biquote',
        fetchedAt: 1_760_000_000_000,
      };
    });
    const base = {
      symbol: 'XAUUSD' as const,
      tf: '1h' as const,
      kind: 'rsi' as const,
      params: { period: 14 },
      stale: false,
    };

    const first = computeIndicatorMemo({ ...base, candles, producedAt: 1_000 });
    // Before I-01 the memo key ignored the re-production and returned the
    // earlier computation, shipping stale indicator values for the whole bar.
    const reProduced = computeIndicatorMemo({
      ...base,
      candles: [...candles.slice(0, -1), { ...candles.at(-1)!, c: candles.at(-1)!.c + 5 }],
      producedAt: 2_000,
    });
    expect(reProduced.values).not.toEqual(first.values);

    // Identical candles with the same production time still memoize.
    expect(computeIndicatorMemo({ ...base, candles, producedAt: 1_000 })).toBe(first);
  });

  it('requests the §4.2 XAUUSD macro extension and the M-02 generic macro for other symbols', async () => {
    mocks.collectSymbolResearchPacket.mockResolvedValue(freshPacket);
    await collectSymbolResearchPacketCached('XAUUSD');
    expect(mocks.collectSymbolResearchPacket).toHaveBeenCalledWith(
      'XAUUSD',
      undefined,
      expect.objectContaining({ includeMacro: true }),
    );

    // M-02: with the rollout flag on, non-gold committee packets request the
    // generic macro extension too.
    mocks.collectSymbolResearchPacket.mockClear();
    await collectSymbolResearchPacketCached('EURUSD');
    expect(mocks.collectSymbolResearchPacket).toHaveBeenCalledWith(
      'EURUSD',
      undefined,
      expect.objectContaining({ includeMacro: true }),
    );

    // ENABLE_GENERIC_MACRO=0 restores the candle-only request.
    process.env.ENABLE_GENERIC_MACRO = '0';
    try {
      mocks.collectSymbolResearchPacket.mockClear();
      await collectSymbolResearchPacketCached('EURUSD');
      expect(mocks.collectSymbolResearchPacket).not.toHaveBeenCalledWith(
        'EURUSD',
        undefined,
        expect.objectContaining({ includeMacro: true }),
      );
    } finally {
      delete process.env.ENABLE_GENERIC_MACRO;
    }
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

  it('keeps the §4.2 XAUUSD macro extension on the PHASE2_PACKET_CACHE=0 rollback path (P1-9)', async () => {
    process.env.PHASE2_PACKET_CACHE = '0';
    mocks.collectSymbolResearchPacket.mockResolvedValue(freshPacket);

    await collectSymbolResearchPacketCached('XAUUSD');

    expect(mocks.collectSymbolResearchPacket).toHaveBeenCalledWith(
      'XAUUSD',
      undefined,
      expect.objectContaining({ includeMacro: true }),
    );

    // M-02: the non-gold request mirrors the cached path exactly on the
    // rollback path too (same flag, same includeMacro semantics).
    mocks.collectSymbolResearchPacket.mockClear();
    await collectSymbolResearchPacketCached('EURUSD');
    expect(mocks.collectSymbolResearchPacket).toHaveBeenCalledWith(
      'EURUSD',
      undefined,
      expect.objectContaining({ includeMacro: true }),
    );
  });

  it('never awaits the Redis mirror write on the cache-miss path (§2.2, fire-and-forget)', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    mirrorMocks.get.mockResolvedValue(null);
    // A mirror write that never settles must not stall the request path; the
    // pre-§2.2 code awaited mirror.set and would hang forever on this mock.
    mirrorMocks.set.mockReturnValue(new Promise<unknown>(() => {}));

    mocks.collectSymbolResearchPacket.mockResolvedValue(freshPacket);
    const collected = await collectSymbolResearchPacketCached('XAUUSD');

    expect(collected.packetId).toBe('packet-fresh');
    await vi.waitFor(() => expect(mirrorMocks.set).toHaveBeenCalled());
    expect(mirrorMocks.set).toHaveBeenCalledWith(
      expect.stringMatching(/^packet:XAUUSD:\d+$/),
      expect.any(String),
      'EX',
      Math.ceil(PACKET_CACHE_TTL_MS / 1000),
    );
    // The mirror READ stays on the request path: the miss lookup queried it.
    expect(mirrorMocks.get).toHaveBeenCalled();
  });

  it('a rejected mirror write never rejects the cache path and logs a warning (§2.2)', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    mirrorMocks.get.mockResolvedValue(null);
    mirrorMocks.set.mockRejectedValue(new Error('mirror is down'));

    mocks.collectSymbolResearchPacket.mockResolvedValue(freshPacket);
    const first = await collectSymbolResearchPacketCached('XAUUSD');
    expect(first.packetId).toBe('packet-fresh');

    await vi.waitFor(() => expect(mirrorMocks.set).toHaveBeenCalled());
    // The detached rejection is caught and warn-logged, never surfaced as an
    // unhandled rejection or a failed cache path.
    await vi.waitFor(() => expect(loggerMocks.warn).toHaveBeenCalled());
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.stringContaining('mirror write failed'),
      expect.objectContaining({ error: 'mirror is down' }),
    );

    // The in-process LRU still cached the packet; the mirror failure is inert.
    const second = await collectSymbolResearchPacketCached('XAUUSD');
    expect(second.packetId).toBe('packet-fresh');
    expect(mocks.collectSymbolResearchPacket).toHaveBeenCalledTimes(1);
  });

  it('preserves the no-REDIS_URL behavior: no mirror interaction at all', async () => {
    mocks.collectSymbolResearchPacket.mockResolvedValue(freshPacket);

    const collected = await collectSymbolResearchPacketCached('XAUUSD');

    expect(collected.packetId).toBe('packet-fresh');
    expect(mirrorMocks.get).not.toHaveBeenCalled();
    expect(mirrorMocks.set).not.toHaveBeenCalled();
  });
});

describe('collectMultiSymbolPackets (A-01 / B-01)', () => {
  it('returns one cached packet per compared symbol, in prompt order', async () => {
    mocks.collectSymbolResearchPacket.mockImplementation(async (symbol: string) => ({
      ...freshPacket,
      packetId: `packet-${symbol}`,
      symbol,
    }));

    const packets = await collectMultiSymbolPackets(['XAUUSD', 'EURUSD']);

    expect([...packets.keys()]).toEqual(['XAUUSD', 'EURUSD']);
    expect(packets.get('XAUUSD')?.packetId).toBe('packet-XAUUSD');
    expect(packets.get('EURUSD')?.packetId).toBe('packet-EURUSD');
    expect(mocks.collectSymbolResearchPacket).toHaveBeenCalledTimes(2);

    // A second call within the 30s TTL is served entirely from the cache.
    mocks.collectSymbolResearchPacket.mockClear();
    const cached = await collectMultiSymbolPackets(['XAUUSD', 'EURUSD']);
    expect([...cached.keys()]).toEqual(['XAUUSD', 'EURUSD']);
    expect(mocks.collectSymbolResearchPacket).not.toHaveBeenCalled();
  });

  it('deduplicates repeated symbols before collecting', async () => {
    mocks.collectSymbolResearchPacket.mockResolvedValue(freshPacket);

    const packets = await collectMultiSymbolPackets(['XAUUSD', 'XAUUSD']);

    expect([...packets.keys()]).toEqual(['XAUUSD']);
    expect(mocks.collectSymbolResearchPacket).toHaveBeenCalledTimes(1);
  });

  it('fails closed on an unbounded comparison fan-out', async () => {
    await expect(
      collectMultiSymbolPackets(['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY']),
    ).rejects.toThrow(/more than 3 symbols/);
    expect(mocks.collectSymbolResearchPacket).not.toHaveBeenCalled();
  });

  it('rejects empty comparison inputs', async () => {
    await expect(collectMultiSymbolPackets([])).rejects.toThrow(/at least one symbol/);
    expect(mocks.collectSymbolResearchPacket).not.toHaveBeenCalled();
  });
});
