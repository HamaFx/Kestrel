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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as binance from '../src/providers/binance/rest';
import * as finnhub from '../src/providers/finnhub/rest';

describe('unclosed candle filtering (F-14)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('binance fetchCandles excludes in-progress candle when includeOpenBar is false / omitted', async () => {
    const fixedNow = 1_700_000_000_000;
    // Bar 1: closed before fixedNow (closeTime = fixedNow - 1000)
    // Bar 2: in-progress (closeTime = fixedNow + 3_600_000)
    const mockKlines = [
      [
        fixedNow - 3_600_000,
        '50000',
        '51000',
        '49000',
        '50500',
        '100',
        fixedNow - 1000,
        '5050000',
        10,
        '50',
        '2525000',
        '0',
      ],
      [
        fixedNow,
        '50500',
        '52000',
        '50000',
        '51500',
        '50',
        fixedNow + 3_600_000,
        '2575000',
        5,
        '25',
        '1287500',
        '0',
      ],
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockKlines,
    });

    const closedOnly = await binance.fetchCandles('BTCUSDT', '1h', 1, {
      skipThrottle: true,
      now: fixedNow,
      includeOpenBar: false,
    });

    expect(closedOnly).toHaveLength(1);
    expect(closedOnly[0]!.c).toBe(50500);
    expect(closedOnly[0]!.closeTime).toBe(fixedNow - 1000);

    const withOpen = await binance.fetchCandles('BTCUSDT', '1h', 2, {
      skipThrottle: true,
      now: fixedNow,
      includeOpenBar: true,
    });

    expect(withOpen).toHaveLength(2);
    expect(withOpen[1]!.c).toBe(51500);
  });

  it('finnhub fetchCandles excludes in-progress candle when includeOpenBar is false / omitted', async () => {
    const fixedNowMs = 1_700_000_000_000;
    const fixedNowSec = Math.floor(fixedNowMs / 1000);

    // Bar 1: t = fixedNowSec - 3600 (closed at fixedNowSec)
    // Bar 2: t = fixedNowSec (closes at fixedNowSec + 3600, i.e., in progress)
    const mockFhCandles = {
      s: 'ok',
      t: [fixedNowSec - 3600, fixedNowSec],
      o: [1.08, 1.085],
      h: [1.085, 1.09],
      l: [1.075, 1.082],
      c: [1.082, 1.088],
      v: [100, 50],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockFhCandles,
    });

    const closedOnly = await finnhub.fetchCandles({
      symbol: 'EURUSD',
      tf: '1h',
      count: 1,
      apiKey: 'test-key',
      skipThrottle: true,
      now: fixedNowMs,
      includeOpenBar: false,
    });

    expect(closedOnly).toHaveLength(1);
    expect(closedOnly[0]!.c).toBe(1.082);

    const withOpen = await finnhub.fetchCandles({
      symbol: 'EURUSD',
      tf: '1h',
      count: 2,
      apiKey: 'test-key',
      skipThrottle: true,
      now: fixedNowMs,
      includeOpenBar: true,
    });

    expect(withOpen).toHaveLength(2);
    expect(withOpen[1]!.c).toBe(1.088);
  });
});

describe('binance OHLC pagination', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('pages backward with endTime when count > 1000 and returns ascending bars', async () => {
    const baseMs = Date.UTC(2026, 0, 1, 0, 0, 0);
    const times = Array.from({ length: 2500 }, (_, i) => baseMs + i * 3_600_000);
    let calls = 0;
    globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      calls += 1;
      const url = new URL(String(input));
      const limit = Number(url.searchParams.get('limit') ?? '1000');
      const endTime = url.searchParams.get('endTime');
      const endMs = endTime ? Number(endTime) : Number.POSITIVE_INFINITY;
      const eligible = times.filter((t) => t <= endMs).slice(-limit);
      const page = eligible.map((t) => [
        t,
        '100',
        '101',
        '99',
        '100.5',
        '10',
        t + 3_599_999,
        '1000',
        5,
        '5',
        '500',
        '0',
      ]);
      return Promise.resolve({ ok: true, status: 200, json: async () => page });
    }) as unknown as typeof fetch;

    const candles = await binance.fetchCandles('BTCUSDT', '1h', 1500, {
      skipThrottle: true,
      now: Number.MAX_SAFE_INTEGER,
    });

    expect(candles).toHaveLength(1500);
    expect(candles[0]!.t).toBeLessThan(candles[1499]!.t);
    expect(calls).toBe(2);
  });
});
