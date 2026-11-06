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

// The backtest market-data gate. Assertions target the refusal/warning
// contract and key facts rather than full operator prose.

import type * as KestrelData from '@kestrel/data';
import type { Candle } from '@kestrel/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadBacktestCandleWindow, staleWindowWarning } from '../src/services/market-data-gate';

const { getCandlesSpy } = vi.hoisted(() => ({ getCandlesSpy: vi.fn() }));

vi.mock('@kestrel/data', async (importOriginal) => {
  const actual = await importOriginal<typeof KestrelData>();
  return { ...actual, getCandles: getCandlesSpy };
});

function candle(): Candle {
  return {
    symbol: 'XAUUSD',
    tf: '1h',
    t: Date.now() - 2 * 3_600_000,
    o: 2600,
    h: 2605,
    l: 2595,
    c: 2602,
    v: 100,
    source: 'test',
    fetchedAt: Date.now(),
  };
}

describe('market-data-gate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-31T12:00:00Z'));
    getCandlesSpy.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refuses a stale window with a message naming the symbol, age, and override', async () => {
    getCandlesSpy.mockResolvedValue({ candles: [], stale: true, producedAt: Date.now() - 45_000 });

    const err = await loadBacktestCandleWindow({
      symbol: 'XAUUSD',
      timeframe: '1h',
      count: 120,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    const message = (err as Error).message;
    expect(message).toContain('XAUUSD 1h');
    expect(message).toContain('stale cache');
    expect(message).toContain('age 45s');
    expect(message).toContain('allowStaleData: true');
  });

  it('accepts a stale window with allowStaleData and returns the age', async () => {
    getCandlesSpy.mockResolvedValue({
      candles: [candle()],
      stale: true,
      producedAt: Date.now() - 45_000,
    });

    const window = await loadBacktestCandleWindow({
      symbol: 'XAUUSD',
      timeframe: '1h',
      count: 120,
      allowStaleData: true,
    });

    expect(window.staleWindowSeconds).toBe(45);
    expect(window.candles).toHaveLength(1);
  });

  it('renders a warning for an accepted stale window', () => {
    const warning = staleWindowWarning(45);
    expect(warning).toContain('stale');
    expect(warning).toContain('age 45s');
    expect(warning).toContain('allowStaleData');
  });

  it('reports null age for a fresh window', async () => {
    getCandlesSpy.mockResolvedValue({
      candles: [candle()],
      stale: false,
      producedAt: Date.now(),
    });

    const window = await loadBacktestCandleWindow({
      symbol: 'XAUUSD',
      timeframe: '1h',
      count: 120,
    });

    expect(window.staleWindowSeconds).toBeNull();
    expect(window.candles).toHaveLength(1);
  });

  it('wraps a load failure with the symbol/timeframe and preserves the cause', async () => {
    const cause = new Error('provider down');
    getCandlesSpy.mockRejectedValue(cause);

    const err = await loadBacktestCandleWindow({
      symbol: 'XAUUSD',
      timeframe: '1h',
      count: 120,
    }).catch((e: unknown) => e);

    expect((err as Error).message).toContain('Could not load XAUUSD 1h candles');
    expect((err as Error).message).toContain('provider down');
    expect((err as Error).cause).toBe(cause);
  });
});
