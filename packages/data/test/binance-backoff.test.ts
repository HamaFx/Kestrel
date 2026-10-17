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

import { fetchTickerPrice } from '../src/providers/binance/rest';
import { fetchLatestRows } from '../src/providers/cftc/rest';
import { finnhubProvider } from '../src/providers/provider-adapters';
import * as throttle from '../src/cache/throttle';

describe('upstream throttling and backoff (F-06, F-07)', () => {
  const originalFetch = globalThis.fetch;
  const originalFinnhubKey = process.env.FINNHUB_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalFinnhubKey !== undefined) {
      process.env.FINNHUB_API_KEY = originalFinnhubKey;
    } else {
      delete process.env.FINNHUB_API_KEY;
    }
  });

  it('binance fetchTickerPrice checks self-throttle and notes backoff on HTTP 429', async () => {
    const tryReserveSpy = vi.spyOn(throttle, 'tryReserve').mockResolvedValue(true);
    const noteBackoffSpy = vi.spyOn(throttle, 'noteBackoff').mockResolvedValue();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    });

    await expect(fetchTickerPrice('BTCUSDT')).rejects.toThrow();

    expect(tryReserveSpy).toHaveBeenCalledWith('binance', expect.anything());
    expect(noteBackoffSpy).toHaveBeenCalledWith('binance', expect.anything());
  });

  it('cftc fetchLatestRows notes backoff on HTTP 429', async () => {
    const noteBackoffSpy = vi.spyOn(throttle, 'noteBackoff').mockResolvedValue();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    });

    await expect(
      fetchLatestRows({ commodityName: 'GOLD - COMMODITY EXCHANGE INC.' }),
    ).rejects.toThrow();

    expect(noteBackoffSpy).toHaveBeenCalledWith('cftc', expect.anything());
  });

  it('finnhubProvider supports() returns false when FINNHUB_API_KEY is unset', () => {
    delete process.env.FINNHUB_API_KEY;
    expect(finnhubProvider.supports('XAUUSD', '1h')).toBe(false);

    process.env.FINNHUB_API_KEY = 'test-key';
    expect(finnhubProvider.supports('XAUUSD', '1h')).toBe(true);
  });
});
