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

// BiQuote REST client tests. Direct `fetch` stubbing (same pattern as
// `price-adapter.test.ts`) — no MSW. Tests cover happy paths, error
// envelope handling, throttle / 429 backoff, and the bar-ordering invariant.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetThrottle } from '../src/cache/throttle';
import { ProviderError } from '../src/errors';
import {
  BIQUOTE_THROTTLE_LIMIT,
  fetchCalendar,
  fetchCalendarUpcoming,
  fetchLatest,
  fetchMarketNews,
  fetchOhlc,
  fetchTick,
} from '../src/providers/biquote/rest';

const ORIGINAL_FETCH = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const VALID_TICK = {
  symbol: 'XAUUSD',
  bid: 2390.12,
  ask: 2390.32,
  mid: 2390.22,
  last: 0,
  volume: 0,
  timestamp: '2026-05-27T18:35:01Z',
  source: 'MetaTrader 5 (Broker 1)',
  description: 'Gold vs US Dollar',
  time: '2026.05.27 18:35:01',
  high: 2392,
  low: 2388,
  direction: 'FLAT',
  dayDiffPercent: 0.4,
  spread: 0.2,
  marketState: 'open',
  stale: false,
  quoteAgeSeconds: 1,
  lastQuoteAt: '2026-05-27T18:35:01Z',
};

function bar(openTime: string, opts: Partial<{ isOpen: boolean }> = {}): unknown {
  return {
    openTime,
    open: 100,
    high: 101,
    low: 99,
    close: 100.5,
    volume: 0,
    tickVolume: 10,
    isOpen: opts.isOpen ?? false,
  };
}

/** Wrap an array of bars in BiQuote's current envelope: `{ symbol, interval, bars }`. */
function ohlcEnvelope(bars: unknown[], symbol = 'XAUUSD', interval = '1m'): unknown {
  return { symbol, interval, bars };
}

describe('biquote fetchTick', () => {
  beforeEach(() => {
    _resetThrottle();
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it('returns a parsed BiquoteTick for a happy 200 response including marketState', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(VALID_TICK));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const tick = await fetchTick('XAUUSD');
    expect(tick.symbol).toBe('XAUUSD');
    expect(tick.bid).toBeCloseTo(2390.12);
    expect(tick.source).toBe('MetaTrader 5 (Broker 1)');
    expect(tick.marketState).toBe('open');
    expect(tick.quoteAgeSeconds).toBe(1);

    // Verify URL shape: /api/XAUUSD against the default base.
    const url = String(fetchSpy.mock.calls[0]?.[0]);
    expect(url).toBe('https://biquote.io/api/XAUUSD');
  });

  it('honors BIQUOTE_BASE_URL via the baseUrl option', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(VALID_TICK));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await fetchTick('XAUUSD', { baseUrl: 'https://biquote.example' });
    const url = String(fetchSpy.mock.calls[0]?.[0]);
    expect(url).toBe('https://biquote.example/api/XAUUSD');
  });

  it('refuses to issue a request for an unsupported symbol (no fetch call)', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await expect(fetchTick('GARAN' as unknown as 'XAUUSD')).rejects.toThrow(/unsupported symbol/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("surfaces BiQuote's `{ message }` error envelope on 404", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ message: "No tick data available for 'XAUUSD'" }, 404),
      ) as unknown as typeof fetch;

    await expect(fetchTick('XAUUSD')).rejects.toMatchObject({
      provider: 'biquote',
      code: 'PROVIDER_HTTP_ERROR',
      status: 404,
      message: "No tick data available for 'XAUUSD'",
    });
  });

  it('classifies 429 as PROVIDER_QUOTA_EXCEEDED', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ message: 'rate limited' }, 429)) as unknown as typeof fetch;

    await expect(fetchTick('XAUUSD')).rejects.toMatchObject({
      code: 'PROVIDER_QUOTA_EXCEEDED',
      status: 429,
    });
  });

  it('throws PROVIDER_PARSE_ERROR on schema mismatch', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ unexpected: 'shape' })) as unknown as typeof fetch;

    await expect(fetchTick('XAUUSD')).rejects.toMatchObject({
      code: 'PROVIDER_PARSE_ERROR',
    });
  });
});

describe('biquote fetchLatest', () => {
  beforeEach(() => _resetThrottle());
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it('returns an empty array for an empty input without hitting fetch', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const out = await fetchLatest([]);
    expect(out).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('repeats the symbols query parameter (?symbols=XAUUSD&symbols=EURUSD) and parses symbol-keyed object responses', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      jsonResponse({
        XAUUSD: VALID_TICK,
        EURUSD: { ...VALID_TICK, symbol: 'EURUSD', mid: 1.085 },
      }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const ticks = await fetchLatest(['XAUUSD', 'EURUSD']);
    expect(ticks).toHaveLength(2);
    expect(ticks.map((t) => t.symbol)).toEqual(['XAUUSD', 'EURUSD']);

    const url = String(fetchSpy.mock.calls[0]?.[0]);
    expect(url).toBe('https://biquote.io/api/latest?symbols=XAUUSD&symbols=EURUSD');
    expect(url).not.toContain('%2C');
  });

  it('also accepts an array response envelope for backward compatibility', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(
        jsonResponse([VALID_TICK, { ...VALID_TICK, symbol: 'EURUSD', last: 1.085 }]),
      );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const ticks = await fetchLatest(['XAUUSD', 'EURUSD']);
    expect(ticks).toHaveLength(2);
    expect(ticks[1]?.symbol).toBe('EURUSD');
  });
});

describe('biquote fetchOhlc', () => {
  beforeEach(() => _resetThrottle());
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it('drops the live unfinished bar by default', async () => {
    // Note: BiQuote returns bars NEWEST-first (descending). Tests
    // mirror that and assert the adapter ascends + filters correctly.
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          ohlcEnvelope([
            bar('2026-05-27T18:02:00Z', { isOpen: true }),
            bar('2026-05-27T18:01:00Z'),
            bar('2026-05-27T18:00:00Z'),
          ]),
        ),
      ) as unknown as typeof fetch;

    const out = await fetchOhlc({ symbol: 'XAUUSD', tf: '1m', count: 100 });
    expect(out).toHaveLength(2);
    expect(out.every((b) => !b.isOpen)).toBe(true);
    // Returned ascending.
    expect(out[0]?.openTime).toBe('2026-05-27T18:00:00Z');
    expect(out[1]?.openTime).toBe('2026-05-27T18:01:00Z');
  });

  it('keeps the live bar when includeOpenBar=true', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          ohlcEnvelope([
            bar('2026-05-27T18:01:00Z', { isOpen: true }),
            bar('2026-05-27T18:00:00Z'),
          ]),
        ),
      ) as unknown as typeof fetch;

    const out = await fetchOhlc({
      symbol: 'XAUUSD',
      tf: '1m',
      count: 100,
      includeOpenBar: true,
    });
    expect(out).toHaveLength(2);
    expect(out[1]?.isOpen).toBe(true);
  });

  it('passes optional from and to ISO-8601 query params on fetchOhlc', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(jsonResponse(ohlcEnvelope([bar('2026-05-20T12:00:00Z')])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await fetchOhlc({
      symbol: 'XAUUSD',
      tf: '15m',
      count: 200,
      from: '2026-05-20T00:00:00.000Z',
      to: '2026-05-21T00:00:00.000Z',
    });

    const url = new URL(String(fetchSpy.mock.calls[0]?.[0]));
    expect(url.searchParams.get('interval')).toBe('15m');
    expect(url.searchParams.get('limit')).toBe('200');
    expect(url.searchParams.get('from')).toBe('2026-05-20T00:00:00.000Z');
    expect(url.searchParams.get('to')).toBe('2026-05-21T00:00:00.000Z');
  });

  it('refuses 1w because BiQuote does not provide weekly bars', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await expect(fetchOhlc({ symbol: 'XAUUSD', tf: '1w', count: 100 })).rejects.toThrow(
      /biquote does not provide weekly/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws on empty candle response (lets failover try the next provider)', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(ohlcEnvelope([]))) as unknown as typeof fetch;

    await expect(fetchOhlc({ symbol: 'XAUUSD', tf: '1m', count: 100 })).rejects.toMatchObject({
      code: 'PROVIDER_HTTP_ERROR',
    });
  });

  it('caps `count` at 1000 to match the documented BiQuote limit', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(jsonResponse(ohlcEnvelope([bar('2026-05-27T18:00:00Z')])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await fetchOhlc({ symbol: 'XAUUSD', tf: '1m', count: 99999 });
    const url = String(fetchSpy.mock.calls[0]?.[0]);
    expect(url).toContain('limit=1000');
  });
});

describe('biquote calendar & news REST endpoints', () => {
  beforeEach(() => _resetThrottle());
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it('fetches calendar and upcoming calendar events with countries and importance filters', async () => {
    const eventPayload = [
      {
        id: 'mql5:900001',
        eventId: 'mql5:840',
        time: '2026-08-07T12:30:00Z',
        countryCode: 'US',
        currency: 'USD',
        name: 'Nonfarm Payrolls',
        importance: 'high',
        unit: 'job',
        multiplier: 'thousands',
        actual: null,
        forecast: 150000,
        previous: 147000,
        revisedPrevious: 149000,
        source: 'mql5',
      },
    ];
    const fetchSpy = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(eventPayload)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const cal = await fetchCalendar({
      from: '2026-08-01T00:00:00Z',
      to: '2026-08-15T00:00:00Z',
      countries: 'US,EU,GB,JP',
      importance: 'high',
    });
    expect(cal).toHaveLength(1);
    expect(cal[0]?.actual).toBeNull();
    expect(cal[0]?.revisedPrevious).toBe(149000);

    const upcoming = await fetchCalendarUpcoming({ limit: 50, importance: 'high' });
    expect(upcoming).toHaveLength(1);
  });

  it('fetches market news articles via /api/news/market', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          title: 'Gold holds gains ahead of CPI',
          description: 'Spot XAUUSD steady near record highs.',
          url: 'https://example.com/news/1',
          publisher: 'Reuters',
          publishedDate: '2026-08-07T10:00:00Z',
          imageUrl: null,
          category: 'Commodities',
          language: 'en',
          country: 'US',
        },
      ]),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const news = await fetchMarketNews({ symbol: 'XAUUSD', maxResults: 10 });
    expect(news).toHaveLength(1);
    expect(news[0]?.publisher).toBe('Reuters');
    const url = new URL(String(fetchSpy.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/api/news/market');
    expect(url.searchParams.get('symbol')).toBe('XAUUSD');
    expect(url.searchParams.get('maxResults')).toBe('10');
  });
});

describe('biquote throttle', () => {
  beforeEach(() => _resetThrottle());
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it('throws PROVIDER_QUOTA_EXCEEDED after exceeding BIQUOTE_THROTTLE_LIMIT (1500/min) within the window', async () => {
    globalThis.fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse(VALID_TICK)),
      ) as unknown as typeof fetch;

    for (let i = 0; i < BIQUOTE_THROTTLE_LIMIT; i += 1) {
      await fetchTick('XAUUSD');
    }
    await expect(fetchTick('XAUUSD')).rejects.toBeInstanceOf(ProviderError);
  });
});
