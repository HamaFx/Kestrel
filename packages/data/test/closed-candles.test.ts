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
        fixedNow - 3_600_000, '50000', '51000', '49000', '50500', '100',
        fixedNow - 1000, '5050000', 10, '50', '2525000', '0',
      ],
      [
        fixedNow, '50500', '52000', '50000', '51500', '50',
        fixedNow + 3_600_000, '2575000', 5, '25', '1287500', '0',
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
