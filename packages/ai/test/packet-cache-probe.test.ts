// SPDX-License-Identifier: Apache-2.0

// B-02 (audit 2026-10-18) — the packet cache must never serve an entry older
// than PACKET_CACHE_TTL_MS, from the in-process LRU or the Redis mirror, and
// the read path must probe exactly the current + previous bucket. The tests
// below fail against the previous depth-3/`storedAt = now` implementation:
// a mirrored entry older than the TTL was revived with a fresh TTL, and the
// probe set was three keys wide.

import { metrics } from '@kestrel/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _resetPacketCache,
  collectSymbolResearchPacketCached,
  PACKET_CACHE_TTL_MS,
} from '../src/mastra-v2/packets/packet-cache';
import type { SymbolResearchPacket } from '../src/mastra-v2/packets/symbol-research';

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

beforeEach(() => {
  vi.clearAllMocks();
  metrics.reset();
  _resetPacketCache();
  delete process.env.PHASE2_PACKET_CACHE;
  delete process.env.REDIS_URL;
});

describe('packet cache probe depth + freshness (B-02)', () => {
  it('serves exactly at the TTL boundary and re-collects one millisecond later', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      mocks.collectSymbolResearchPacket.mockResolvedValue(freshPacket);
      await collectSymbolResearchPacketCached('XAUUSD');

      // Age == TTL: still fresh (`> TTL` rejects). The entry was written in
      // bucket 0 under buckets 0+1, so the depth-2 probe at 30s still reaches
      // it — depth alone must not shorten the TTL window.
      vi.setSystemTime(PACKET_CACHE_TTL_MS);
      const atTtl = await collectSymbolResearchPacketCached('XAUUSD');
      expect(atTtl.packetId).toBe('packet-fresh');
      expect(mocks.collectSymbolResearchPacket).toHaveBeenCalledTimes(1);

      // Age == TTL + 1ms: never served, even though the entry is still
      // reachable through the bucket probe.
      vi.setSystemTime(PACKET_CACHE_TTL_MS + 1);
      await collectSymbolResearchPacketCached('XAUUSD');
      expect(mocks.collectSymbolResearchPacket).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('probes exactly the current and previous bucket and mirrors the entry into the next bucket', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    mirrorMocks.get.mockResolvedValue(null);
    mirrorMocks.set.mockResolvedValue('OK');
    vi.useFakeTimers();
    try {
      vi.setSystemTime(30_100); // bucket 2
      mocks.collectSymbolResearchPacket.mockResolvedValue(freshPacket);
      await collectSymbolResearchPacketCached('XAUUSD');

      // Reads: current + previous — depth 2, no third probe.
      expect(mirrorMocks.get.mock.calls.map((call) => call[0])).toEqual([
        'packet:XAUUSD:2',
        'packet:XAUUSD:1',
      ]);
      // Writes: current + next bucket, so a depth-2 probe keeps the entry
      // reachable for its whole TTL instead of one rollover early (B-04).
      await vi.waitFor(() => expect(mirrorMocks.set).toHaveBeenCalledTimes(2));
      expect(mirrorMocks.set.mock.calls.map((call) => call[0])).toEqual([
        'packet:XAUUSD:2',
        'packet:XAUUSD:3',
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a mirrored entry older than the TTL instead of reviving it with a fresh TTL', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000_000);
      mocks.collectSymbolResearchPacket.mockResolvedValue(freshPacket);

      // The mirror still holds an entry written TTL+1ms ago (its Redis key
      // has not been GC'd yet). Before B-02 the revive reset `storedAt` to
      // now and this stale packet was served as a hit.
      mirrorMocks.get.mockResolvedValue(
        JSON.stringify({
          storedAt: 1_000_000 - PACKET_CACHE_TTL_MS - 1,
          packet: freshPacket,
        }),
      );
      await collectSymbolResearchPacketCached('XAUUSD');
      expect(mocks.collectSymbolResearchPacket).toHaveBeenCalledTimes(1);

      // Within the TTL the same envelope is a valid cross-instance hit.
      mocks.collectSymbolResearchPacket.mockClear();
      _resetPacketCache();
      mirrorMocks.get.mockResolvedValue(
        JSON.stringify({
          storedAt: 1_000_000 - PACKET_CACHE_TTL_MS + 1,
          packet: freshPacket,
        }),
      );
      const served = await collectSymbolResearchPacketCached('XAUUSD');
      expect(served.packetId).toBe('packet-fresh');
      expect(mocks.collectSymbolResearchPacket).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('accepts a pre-envelope mirror payload for one deploy window', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000_000);
      mocks.collectSymbolResearchPacket.mockResolvedValue(freshPacket);
      // Legacy shape (raw packet JSON, no storedAt envelope).
      mirrorMocks.get.mockResolvedValue(JSON.stringify(freshPacket));

      const served = await collectSymbolResearchPacketCached('XAUUSD');
      expect(served.packetId).toBe('packet-fresh');
      expect(mocks.collectSymbolResearchPacket).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
