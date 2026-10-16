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

// End-to-end tests for the price adapter using a URL-routed mock fetch.
// The price adapter now tries:
//   1. BiQuote REST on-demand (primary default when WORKER_ENABLE_TICK_STREAM=0)
//   2. Binance for canonical crypto pairs
//   3. Finnhub fallback
//   (live_ticks pseudo-provider is gated behind WORKER_ENABLE_TICK_STREAM=1)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getPrice, getPrices, getPriceWithMeta, getPricesWithMeta } from '../src/adapters/price';
import { setDefaultCache } from '../src/cache';
import { MemoryCache } from '../src/cache/memory';
import { _resetThrottle } from '../src/cache/throttle';
import { ProviderEmptyError } from '../src/errors';
import { _resetHealth } from '../src/health';
import { fetchLiveTick } from '../src/providers/live-ticks';

vi.mock('../src/providers/live-ticks', () => ({
  fetchLiveTick: vi.fn().mockImplementation(() => {
    throw new ProviderEmptyError('live-ticks', 'live_ticks not configured (test default)');
  }),
}));

const ORIGINAL_FETCH = globalThis.fetch;

interface MockResponse {
  status?: number;
  body?: unknown;
  raw?: string;
}

interface RouteHandler {
  match: (url: string) => boolean;
  respond: () => MockResponse;
}

/**
 * Build a fetch mock that dispatches to the first matching route, in
 * order. Route handlers may be one-shot (consumed once) or persistent.
 */
function createRoutedFetch(routes: RouteHandler[]): typeof fetch {
  return vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    for (const route of routes) {
      if (route.match(url)) {
        const r = route.respond();
        const body = r.raw !== undefined ? r.raw : JSON.stringify(r.body ?? null);
        return Promise.resolve(
          new Response(body, {
            status: r.status ?? 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }
    }
    return Promise.reject(new Error(`unmocked URL: ${url}`));
  }) as unknown as typeof fetch;
}

const VALID_BIQUOTE_TICK = (symbol: string, mid: number) => ({
  symbol,
  description: '',
  bid: mid - 0.05,
  ask: mid + 0.05,
  mid,
  last: 0,
  volume: 0,
  timestamp: '2026-05-27T18:35:01Z',
  source: 'MetaTrader 5 (Broker 1)',
  high: mid * 1.001,
  low: mid * 0.999,
  direction: 'FLAT',
  dayDiffPercent: 0,
  time: '2026.05.27 18:35:01',
  spread: 0.1,
});

beforeEach(() => {
  setDefaultCache(new MemoryCache());
  _resetThrottle();
  _resetHealth();
  delete process.env.WORKER_ENABLE_TICK_STREAM;
  vi.mocked(fetchLiveTick).mockImplementation(() => {
    throw new ProviderEmptyError('live-ticks', 'live_ticks not configured (test default)');
  });
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  delete process.env.WORKER_ENABLE_TICK_STREAM;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('getPrice — provider order (on-demand BiQuote REST primary, live_ticks skipped by default)', () => {
  it('returns a normalised Tick from biquote without querying live_ticks when WORKER_ENABLE_TICK_STREAM is unset', async () => {
    globalThis.fetch = createRoutedFetch([
      {
        match: (u) => u.includes('biquote.io/api/'),
        respond: () => ({
          body: {
            ...VALID_BIQUOTE_TICK('XAUUSD', 2345.678),
            marketState: 'closed',
            quoteAgeSeconds: 1800,
            dayDiffPercent: -0.25,
          },
        }),
      },
    ]);

    const res = await getPriceWithMeta('XAUUSD');
    expect(res.tick.source).toBe('biquote');
    expect(res.tick.mid).toBeCloseTo(2345.678);
    expect(res.tick.bid).toBe(res.tick.mid);
    expect(res.tick.ask).toBe(res.tick.mid);
    expect(res.tick.marketState).toBe('closed');
    expect(res.tick.quoteAgeSeconds).toBe(1800);
    expect(res.tick.dayDiffPercent).toBeNull();
    expect(res.ageMs).toBe(1_800_000);
    expect(fetchLiveTick).not.toHaveBeenCalled();
  });

  it('serves the second call from cache without hitting fetch again', async () => {
    const fetchSpy = createRoutedFetch([
      {
        match: (u) => u.includes('biquote.io/api/'),
        respond: () => ({ body: VALID_BIQUOTE_TICK('EURUSD', 1.085) }),
      },
    ]);
    globalThis.fetch = fetchSpy;

    await getPrice('EURUSD');
    await getPrice('EURUSD');
    // First call hits BiQuote; second is served from cache.
    expect(fetchSpy as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });

  it('falls over from biquote → finnhub', async () => {
    let biquoteCalls = 0;
    let finnhubCalls = 0;
    globalThis.fetch = createRoutedFetch([
      {
        match: (u) => u.includes('biquote.io/api/'),
        respond: () => {
          biquoteCalls += 1;
          return { status: 503, body: { message: 'down' } };
        },
      },
      {
        match: (u) => u.includes('finnhub.io'),
        respond: () => {
          finnhubCalls += 1;
          return {
            body: { c: 1.27, h: 1.28, l: 1.26, o: 1.27, pc: 1.265, t: 1700000000 },
          };
        },
      },
    ]);

    const tick = await getPrice('GBPUSD', {
      apiKeys: { finnhub: 'Y' },
    });
    expect(tick.source).toBe('finnhub');
    expect(tick.mid).toBe(1.27);
    expect(biquoteCalls).toBe(1);
    expect(finnhubCalls).toBe(1);
  });

  it('still works when only biquote is configured (no Twelve Data / Finnhub keys)', async () => {
    globalThis.fetch = createRoutedFetch([
      {
        match: (u) => u.includes('biquote.io/api/'),
        respond: () => ({ body: VALID_BIQUOTE_TICK('XAUUSD', 2400) }),
      },
    ]);
    const tick = await getPrice('XAUUSD');
    expect(tick.source).toBe('biquote');
  });
});

describe('getPricesWithMeta — multi-symbol batching', () => {
  it('batches multiple FX/Gold symbols into a single /api/latest request and populates per-symbol cache', async () => {
    let latestCalls = 0;
    let singleCalls = 0;
    globalThis.fetch = createRoutedFetch([
      {
        match: (u) => u.includes('biquote.io/api/latest'),
        respond: () => {
          latestCalls += 1;
          return {
            body: {
              XAUUSD: {
                ...VALID_BIQUOTE_TICK('XAUUSD', 2410.5),
                marketState: 'open',
                quoteAgeSeconds: 1,
                dayDiffPercent: 0.45,
              },
              EURUSD: {
                ...VALID_BIQUOTE_TICK('EURUSD', 1.086),
                marketState: 'closed',
                quoteAgeSeconds: 7200,
                dayDiffPercent: -0.1,
              },
            },
          };
        },
      },
      {
        match: (u) => u.includes('biquote.io/api/'),
        respond: () => {
          singleCalls += 1;
          return { body: VALID_BIQUOTE_TICK('XAUUSD', 2410.5) };
        },
      },
    ]);

    const results = await getPricesWithMeta(['XAUUSD', 'EURUSD']);
    expect(results).toHaveLength(2);
    expect(latestCalls).toBe(1);
    expect(singleCalls).toBe(0);
    expect(results[0]?.tick.marketState).toBe('open');
    expect(results[0]?.tick.dayDiffPercent).toBe(0.45);
    expect(results[1]?.tick.marketState).toBe('closed');
    expect(results[1]?.tick.dayDiffPercent).toBeNull();

    // Second call for XAUUSD alone hits the populated per-symbol cache (0 additional HTTP calls)
    const cachedSingle = await getPriceWithMeta('XAUUSD');
    expect(cachedSingle.tick.mid).toBeCloseTo(2410.5);
    expect(latestCalls).toBe(1);
    expect(singleCalls).toBe(0);

    const ticks = await getPrices(['XAUUSD', 'EURUSD']);
    expect(ticks).toHaveLength(2);
  });
});

describe('getPriceWithMeta — Phase 7a SWR (still works post-PR-4)', () => {
  it('returns stale=false on the fresh fetch and stale=true on a fallback read', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-26T00:00:00Z'));

    // First call: BiQuote succeeds.
    globalThis.fetch = createRoutedFetch([
      {
        match: (u) => u.includes('biquote.io/api/'),
        respond: () => ({ body: VALID_BIQUOTE_TICK('XAUUSD', 2345.6) }),
      },
    ]);

    const fresh = await getPriceWithMeta('XAUUSD');
    expect(fresh.stale).toBe(false);
    expect(fresh.tick.mid).toBeCloseTo(2345.6);

    // Past TTL (3s) but within SWR ceiling (30s).
    vi.advanceTimersByTime(5_000);

    // Now every upstream fails — the adapter must serve the cached tick.
    globalThis.fetch = createRoutedFetch([
      {
        match: () => true, // catch-all
        respond: () => ({ status: 503, raw: 'upstream down' }),
      },
    ]);

    const stale = await getPriceWithMeta('XAUUSD');
    expect(stale.stale).toBe(true);
    expect(stale.tick.mid).toBeCloseTo(2345.6);
  });
});

describe('getPrice — live_ticks pseudo-provider (opt-in via WORKER_ENABLE_TICK_STREAM=1)', () => {
  it('serves from live_ticks when WORKER_ENABLE_TICK_STREAM=1 and row is fresh, skipping every network provider', async () => {
    process.env.WORKER_ENABLE_TICK_STREAM = '1';
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    // Override the auto-mock to simulate a fresh live_ticks row.
    vi.mocked(fetchLiveTick).mockImplementationOnce(async () => ({
      price: 2390.5,
      provider: 'biquote-signalr',
      ts: Date.now(),
      ageMs: 250,
    }));

    const tick = await getPrice('XAUUSD');
    expect(tick.source).toBe('biquote-signalr');
    expect(tick.mid).toBe(2390.5);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('falls through to BiQuote REST when live_ticks is stale / missing', async () => {
    process.env.WORKER_ENABLE_TICK_STREAM = '1';
    globalThis.fetch = createRoutedFetch([
      {
        match: (u) => u.includes('biquote.io/api/'),
        respond: () => ({ body: VALID_BIQUOTE_TICK('XAUUSD', 2400) }),
      },
    ]);

    const tick = await getPrice('XAUUSD');
    expect(tick.source).toBe('biquote');
    expect(tick.mid).toBe(2400);
  });

  it('routes crypto to Binance without probing unsupported BiQuote or Finnhub providers', async () => {
    let biquoteCalls = 0;
    let finnhubCalls = 0;
    globalThis.fetch = createRoutedFetch([
      {
        match: (u) => u.includes('biquote.io/api/'),
        respond: () => {
          biquoteCalls += 1;
          return { status: 500, body: { message: 'BiQuote must not be called for crypto' } };
        },
      },
      {
        match: (u) => u.includes('finnhub.io'),
        respond: () => {
          finnhubCalls += 1;
          return {
            status: 500,
            body: { message: 'Finnhub must not be called after Binance succeeds' },
          };
        },
      },
      {
        match: (u) => u.includes('api.binance.com/api/v3/ticker/price'),
        respond: () => ({ body: { symbol: 'BTCUSDT', price: '65000.25' } }),
      },
    ]);

    const tick = await getPrice('BTCUSDT');

    expect(tick.source).toBe('binance');
    expect(tick.mid).toBe(65000.25);
    expect(biquoteCalls).toBe(0);
    expect(finnhubCalls).toBe(0);
  });
});
