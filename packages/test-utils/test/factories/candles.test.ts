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

import type { Candle, Tick } from '@kestrel/shared';
import { describe, expect, it } from 'vitest';

import { makeCandles, makeTicks } from '../../src/factories/candles';

const BASE_TS = 1_700_000_000_000;
const HOUR = 3_600_000;

describe('makeCandles', () => {
  it('builds valid OHLCV candles with defaults from an explicit closes array', () => {
    const candles = makeCandles([100, 105, 102]) as [Candle, Candle, Candle];

    expect(candles).toHaveLength(3);
    expect(candles.map((c) => [c.o, c.h, c.l, c.c])).toEqual([
      [100, 101, 99, 100],
      [105, 106, 104, 105],
      [102, 103, 101, 102],
    ]);
    expect(candles.map((c) => c.t)).toEqual([BASE_TS, BASE_TS + HOUR, BASE_TS + 2 * HOUR]);
    for (const candle of candles) {
      expect(candle).toMatchObject({
        symbol: 'XAUUSD',
        tf: '1h',
        source: 'test',
        v: null,
        fetchedAt: 0,
      });
    }
  });

  it('builds candles from an explicit closes array with custom highs, lows, symbol, and timeframe', () => {
    const candles = makeCandles([100, 105, 102], {
      highs: [110, 115, 112],
      lows: [95, 98, 96],
      symbol: 'EURUSD',
      tf: '4h',
      source: 'binance',
    }) as [Candle, Candle, Candle];

    expect(candles.map((c) => [c.o, c.h, c.l, c.c])).toEqual([
      [100, 110, 95, 100],
      [105, 115, 98, 105],
      [102, 112, 96, 102],
    ]);
    for (const candle of candles) {
      expect(candle).toMatchObject({ symbol: 'EURUSD', tf: '4h', source: 'binance' });
    }
  });

  it.each([
    { label: 'an empty closes array', closes: [] as number[], expectedLen: 0 },
    {
      label: 'a five-bar closes array',
      closes: [2000, 2010, 2020, 2030, 2040],
      expectedLen: 5,
      firstClose: 2000,
      lastClose: 2040,
    },
  ])(
    'maps $label to the expected length and boundary closes',
    ({ closes, expectedLen, firstClose, lastClose }) => {
      const candles = makeCandles(closes);

      expect(candles).toHaveLength(expectedLen);
      if (expectedLen > 0) {
        expect(candles[0]!.c).toBe(firstClose);
        expect(candles[expectedLen - 1]!.c).toBe(lastClose);
      }
    },
  );
});

describe('makeTicks', () => {
  it('creates ticks with default options, a ±0.1 spread, and 1-second spacing', () => {
    const ticks = makeTicks([100, 101]) as [Tick, Tick];

    expect(ticks).toHaveLength(2);
    expect(ticks[0]!).toMatchObject({ symbol: 'XAUUSD', mid: 100, source: 'test' });
    expect(ticks.map((t) => [t.bid, t.ask, t.mid])).toEqual([
      [99.9, 100.1, 100],
      [100.9, 101.1, 101],
    ]);
    expect(ticks[1]!.ts - ticks[0]!.ts).toBe(1_000);
  });

  it('accepts custom symbol and source', () => {
    const [tick] = makeTicks([50], { symbol: 'GBPUSD', source: 'biquote' }) as [Tick];
    expect(tick.symbol).toBe('GBPUSD');
    expect(tick.source).toBe('biquote');
  });

  it.each([
    { mid: 0, expectedBid: -0.1, expectedAsk: 0.1 },
    { mid: 42, expectedBid: 41.9, expectedAsk: 42.1 },
    { mid: 1000, expectedBid: 999.9, expectedAsk: 1000.1 },
  ])('derives bid/ask around a mid of $mid', ({ mid, expectedBid, expectedAsk }) => {
    const [tick] = makeTicks([mid]) as [Tick];
    expect(tick.bid).toBe(expectedBid);
    expect(tick.ask).toBe(expectedAsk);
    expect(tick.mid).toBe(mid);
  });

  it('returns empty array for empty input', () => {
    expect(makeTicks([])).toHaveLength(0);
  });
});
