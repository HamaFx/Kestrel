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

// R8 (audit 2026-10-31): the default `getCandles` must carry the
// stale-while-revalidate flag, and `getCandlesUnchecked` is the explicit
// opt-out that returns the bare array.

import type { Candle } from '@kestrel/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { candlesAgeSeconds, getCandles, getCandlesUnchecked } from '../src/adapters/candles';
import { setDefaultCache } from '../src/cache';
import { MemoryCache } from '../src/cache/memory';
import { marketDataProviders } from '../src/providers/provider-registry';

let stubFails = false;

function candles(count: number): Candle[] {
  const barMs = 60 * 60 * 1000;
  return Array.from({ length: count }, (_, index) => {
    const close = 2600 + index * 0.5;
    return {
      symbol: 'XAUUSD' as const,
      tf: '1h' as const,
      t: Date.now() - (count - index) * barMs,
      o: close - 0.2,
      h: close + 1,
      l: close - 1,
      c: close,
      v: 100,
      source: 'r8-stub',
      fetchedAt: Date.now(),
    };
  });
}

marketDataProviders.register({
  name: 'r8-stub',
  label: 'R8 test stub',
  pinned: true,
  supports: () => true,
  async fetchPrice() {
    return { price: 2600, provider: 'r8-stub', ageMs: 0 };
  },
  async fetchCandles() {
    if (stubFails) throw new Error('stub down');
    return candles(60);
  },
});

describe('candles adapter — freshness survives the default getter (R8)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-31T12:00:00Z'));
    setDefaultCache(new MemoryCache());
    stubFails = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('getCandles returns the window plus stale / producedAt', async () => {
    const result = await getCandles('XAUUSD', '1h', { count: 60 });

    expect(result.candles).toHaveLength(60);
    expect(result.stale).toBe(false);
    expect(result.producedAt).toBe(Date.now());
    expect(candlesAgeSeconds(result)).toBeLessThan(5);
  });

  it('flags a stale-while-revalidate fallback instead of hiding it', async () => {
    await getCandles('XAUUSD', '1h', { count: 60 });
    // Past the 30 s last-bar TTL, inside the 5 min SWR ceiling.
    vi.advanceTimersByTime(60_000);
    stubFails = true;

    const stale = await getCandles('XAUUSD', '1h', { count: 60 });

    expect(stale.stale).toBe(true);
    expect(stale.candles).toHaveLength(60);
    expect(candlesAgeSeconds(stale)).toBeGreaterThanOrEqual(60);
  });

  it('getCandlesUnchecked returns the bare array (explicit opt-out)', async () => {
    const result = await getCandlesUnchecked('XAUUSD', '1h', { count: 60 });

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(60);
  });
});
