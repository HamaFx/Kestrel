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

import { metrics } from '@kestrel/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as IndicatorsModule from '@kestrel/indicators';

import { _resetPacketCache } from '../src/mastra-v2/packets/packet-cache';
import { XAUUSD_RESEARCH_WINDOWS } from '../src/mastra-v2/packets/research-config';
import { collectXauusdResearchPacket } from '../src/mastra-v2/packets/research-packet';
import { SYMBOL_RESEARCH_TIMEFRAMES } from '../src/mastra-v2/packets/symbol-research';

const mocks = vi.hoisted(() => ({
  getPriceWithMeta: vi.fn(),
  getCandlesWithMeta: vi.fn(),
  fetchNews: vi.fn(),
  fetchUpcomingEvents: vi.fn(),
  fetchObservations: vi.fn(),
  fetchResonanceInputs: vi.fn(),
  computeIndicator: vi.fn(),
  recordStep: vi.fn(),
  completeStep: vi.fn(),
  logErrorContext: vi.fn(),
}));

vi.mock('@kestrel/data', () => ({
  getPriceWithMeta: mocks.getPriceWithMeta,
  getCandlesWithMeta: mocks.getCandlesWithMeta,
  fetchNews: mocks.fetchNews,
  fetchUpcomingEvents: mocks.fetchUpcomingEvents,
}));
vi.mock('@kestrel/data/providers/fred', () => ({
  fetchObservations: mocks.fetchObservations,
  fetchResonanceInputs: mocks.fetchResonanceInputs,
}));
// §2.1/P1-10 — spy on the pure indicator compute while keeping the real
// implementation, so tests can assert memoization across collections.
vi.mock('@kestrel/indicators', async () => {
  const actual = await vi.importActual<typeof IndicatorsModule>('@kestrel/indicators');
  return {
    ...actual,
    computeIndicator: mocks.computeIndicator.mockImplementation(actual.computeIndicator),
  };
});
vi.mock('../src/diagnostics', () => ({
  recordStep: mocks.recordStep,
  completeStep: mocks.completeStep,
}));
vi.mock('@kestrel/shared/logger', () => ({
  createCategorizedLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  logErrorContext: mocks.logErrorContext,
}));

function candlesFor(tf: string, count = 40) {
  return Array.from({ length: count }, (_, index) => ({
    symbol: 'XAUUSD',
    tf,
    t: 1_700_000_000_000 + index * 60_000,
    o: 2_000 + index,
    h: 2_005 + index,
    l: 1_995 + index,
    c: 2_002 + index,
    v: null,
    source: 'fixture-provider',
    fetchedAt: 1_700_000_000_000,
  }));
}

function configureSuccessfulData() {
  const now = Date.now();
  mocks.getPriceWithMeta.mockResolvedValue({
    tick: {
      symbol: 'XAUUSD',
      bid: 2_345,
      ask: 2_345.2,
      mid: 2_345.1,
      ts: now - 100,
      source: 'fixture-provider',
    },
    stale: false,
    producedAt: now,
    ageMs: 100,
  });
  mocks.getCandlesWithMeta.mockImplementation(async (_symbol: string, tf: string) => ({
    candles: candlesFor(tf),
    stale: false,
    producedAt: now,
  }));
}

/**
 * §2.1/P1-10 — a fully fresh, complete fixture (unified 160-candle windows,
 * all macro providers up) so the packet satisfies the Q5 fresh-only
 * cacheability predicate and is actually served from the packet cache.
 */
function configureCompleteData() {
  const now = Date.now();
  const counts = Object.fromEntries(
    SYMBOL_RESEARCH_TIMEFRAMES.map(({ timeframe, count }) => [timeframe, count]),
  ) as Record<string, number>;
  mocks.getPriceWithMeta.mockResolvedValue({
    tick: {
      symbol: 'XAUUSD',
      bid: 2_345,
      ask: 2_345.2,
      mid: 2_345.1,
      ts: now - 100,
      source: 'fixture-provider',
    },
    stale: false,
    producedAt: now,
    ageMs: 100,
  });
  mocks.getCandlesWithMeta.mockImplementation(async (_symbol: string, tf: string) => ({
    candles: candlesFor(tf, counts[tf] ?? 160),
    stale: false,
    producedAt: now,
  }));
  process.env.FRED_API_KEY = 'test-key';
  mocks.fetchObservations.mockResolvedValue([{ date: '2026-10-01', value: 100.5 }]);
  mocks.fetchResonanceInputs.mockResolvedValue({ realYields: [], breakevenInflation: [] });
}

describe('bounded XAUUSD research packet', () => {
  beforeEach(() => {
    metrics.reset();
    _resetPacketCache();
    delete process.env.FRED_API_KEY;
    mocks.getPriceWithMeta.mockReset();
    mocks.getCandlesWithMeta.mockReset();
    mocks.fetchNews.mockReset().mockResolvedValue([]);
    mocks.fetchUpcomingEvents.mockReset().mockResolvedValue([]);
    mocks.fetchObservations.mockReset();
    mocks.fetchResonanceInputs.mockReset();
    // Keep the real compute implementation installed by the module mock;
    // only the call history is cleared between cases.
    mocks.computeIndicator.mockClear();
    mocks.recordStep.mockReset();
    mocks.completeStep.mockReset();
    mocks.logErrorContext.mockReset();
  });

  it('collects the fixed multi-timeframe scope and computes indicators in code', async () => {
    configureSuccessfulData();

    const packet = await collectXauusdResearchPacket();

    expect(packet).toMatchObject({
      kind: 'research_packet',
      symbol: 'XAUUSD',
      status: 'ready',
      dataQuality: 'partial',
      timeframes: ['1d', '4h', '1h', '15m'],
      price: { kind: 'price', source: 'fixture-provider' },
    });
    expect(packet.candles).toHaveLength(4);
    expect(packet.indicators).toHaveLength(4);
    expect(packet.indicators[0]?.data.results).toHaveLength(6);
    expect(packet.missingData).toEqual(
      expect.arrayContaining([
        'Dollar-strength data is unavailable.',
        'US real-yield and inflation-expectation data is unavailable.',
        'No macro evidence was returned by the configured providers.',
      ]),
    );
    expect(mocks.getPriceWithMeta).toHaveBeenCalledOnce();
    expect(mocks.getCandlesWithMeta).toHaveBeenCalledTimes(4);
    expect(
      metrics.snapshot().counters['mastra_research_packet_total{status=ready,symbol=XAUUSD}'],
    ).toBe(1);
  });

  it('blocks the packet when one required timeframe is unavailable', async () => {
    configureSuccessfulData();
    mocks.getCandlesWithMeta.mockReset().mockImplementation(async (_symbol: string, tf: string) => {
      if (tf === '1h') throw new Error('provider unavailable');
      return { candles: candlesFor(tf), stale: false, producedAt: Date.now() };
    });

    const packet = await collectXauusdResearchPacket();

    expect(packet.status).toBe('blocked');
    expect(packet.dataQuality).toBe('degraded');
    expect(packet.missingData).toContain('1h candle data is unavailable.');
    expect(packet.indicators.some((evidence) => evidence.timeframe === '1h')).toBe(false);
    expect(mocks.logErrorContext).toHaveBeenCalledWith(
      expect.any(Error),
      'mastra_xauusd_research.candles.1h',
      expect.objectContaining({ timeframe: '1h' }),
      'ai',
    );
    expect(metrics.snapshot().counters['mastra_research_packet_blocked_total{symbol=XAUUSD}']).toBe(
      1,
    );
  });

  it('propagates cancellation instead of returning a misleading packet', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(collectXauusdResearchPacket(controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(mocks.getPriceWithMeta).not.toHaveBeenCalled();
    expect(mocks.getCandlesWithMeta).not.toHaveBeenCalled();
  });

  it('keeps the XAUUSD research windows aligned with the shared collector windows (§2.1/P1-10)', () => {
    // Drift guard: both pipelines must request identical (symbol, tf, count)
    // windows so they share the data-layer candle cache instead of issuing
    // parallel provider fetches per turn.
    expect(
      XAUUSD_RESEARCH_WINDOWS.map(({ timeframe, candleCount }) => ({
        timeframe,
        count: candleCount,
      })),
    ).toEqual(
      SYMBOL_RESEARCH_TIMEFRAMES.map(({ timeframe, count }) => ({ timeframe, count })),
    );
  });

  it('collects with the unified windows so both pipelines hit the same data-layer cache entries (§2.1/P1-10)', async () => {
    configureCompleteData();

    await collectXauusdResearchPacket();

    const requested = mocks.getCandlesWithMeta.mock.calls.map((call) => ({
      timeframe: call[1],
      count: (call[2] as { count?: number }).count,
    }));
    expect(requested).toEqual(
      SYMBOL_RESEARCH_TIMEFRAMES.map(({ timeframe, count }) => ({ timeframe, count })),
    );
  });

  it('serves repeat XAUUSD collection from the shared 30s packet cache so conversation/report bursts share one collection (§2.1/P1-10)', async () => {
    configureCompleteData();

    const first = await collectXauusdResearchPacket();
    const second = await collectXauusdResearchPacket();

    expect(first.status).toBe('ready');
    expect(first.dataQuality).toBe('complete');
    expect(second.packetId).toBe(first.packetId);
    // One provider burst: the cached collection did not re-hit the providers.
    expect(mocks.getPriceWithMeta).toHaveBeenCalledOnce();
    expect(mocks.getCandlesWithMeta).toHaveBeenCalledTimes(4);
    expect(metrics.snapshot().counters['packet_cache_hit_total']).toBe(1);
  });

  it('never caches blocked, degraded, or partial XAUUSD packets (fresh-only, Q5)', async () => {
    // configureSuccessfulData leaves the macro providers down → missingData
    // is populated → the packet is partial and must never be cached.
    configureSuccessfulData();

    const first = await collectXauusdResearchPacket();
    const second = await collectXauusdResearchPacket();

    expect(first.dataQuality).toBe('partial');
    expect(second.packetId).not.toBe(first.packetId);
    expect(mocks.getPriceWithMeta).toHaveBeenCalledTimes(2);
  });

  it('bypasses the packet cache when PHASE2_PACKET_CACHE=0 and collects identical packets (rollback)', async () => {
    process.env.PHASE2_PACKET_CACHE = '0';
    configureCompleteData();

    const first = await collectXauusdResearchPacket();
    const second = await collectXauusdResearchPacket();

    // No caching on the rollback path: both turns collect fresh.
    expect(second.packetId).not.toBe(first.packetId);
    expect(mocks.getPriceWithMeta).toHaveBeenCalledTimes(2);
    expect(metrics.snapshot().counters['packet_cache_hit_total'] ?? 0).toBe(0);
  });

  it('memoizes indicator computation so repeated collections over identical candles never recompute (§2.1/P1-10)', async () => {
    configureSuccessfulData();

    await collectXauusdResearchPacket();
    const callsAfterFirst = mocks.computeIndicator.mock.calls.length;

    // The partial packet above is not cacheable, so this re-collects (fresh
    // provider fetches) — but every indicator is served from the shared memo
    // because the candle windows are identical.
    await collectXauusdResearchPacket();

    expect(mocks.getPriceWithMeta).toHaveBeenCalledTimes(2);
    expect(mocks.computeIndicator.mock.calls.length).toBe(callsAfterFirst);
  });
});
