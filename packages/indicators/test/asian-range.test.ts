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

import type { Candle } from '@kestrel/shared';
import { describe, expect, it } from 'vitest';

import { computeAsianRange } from '../src/structure/asian-range';
import { computeSessionRanges } from '../src/structure/sessions';

// Asian session is 00:00-07:00 UTC. Use timestamps that fall in this window.
// 2025-01-15 03:00 UTC = 1736905200000
const ASIAN_CANDLE_TS = 1_736_905_200_000;

function makeCandle(h: number, l: number, t: number): Candle {
  return {
    symbol: 'XAUUSD',
    tf: '1h',
    t,
    o: (h + l) / 2,
    h,
    l,
    c: (h + l) / 2,
    v: null,
    source: 'test',
    fetchedAt: 0,
  };
}

describe('computeAsianRange', () => {
  it('returns null for empty candles', () => {
    expect(computeAsianRange([])).toBeNull();
  });

  it('computes range from a single Asian-session candle', () => {
    const result = computeAsianRange([makeCandle(2010, 2000, ASIAN_CANDLE_TS)]);
    expect(result).not.toBeNull();
    expect(result!.high).toBe(2010);
    expect(result!.low).toBe(2000);
    expect(result!.forming).toBe(true);
  });

  it('computes high/low across multiple Asian session candles', () => {
    const candles = [
      makeCandle(2005, 2000, ASIAN_CANDLE_TS), // 03:00
      makeCandle(2015, 2008, ASIAN_CANDLE_TS + 3600000), // 04:00
      makeCandle(2010, 2002, ASIAN_CANDLE_TS + 7200000), // 05:00
    ];
    const result = computeAsianRange(candles);
    expect(result!.high).toBe(2015);
    expect(result!.low).toBe(2000);
  });

  it('ignores candles outside Asian session (after 07:00 UTC)', () => {
    // 10:00 UTC = ASIAN_CANDLE_TS + 7 * 3600000 = outside window
    const candles = [
      makeCandle(2005, 2000, ASIAN_CANDLE_TS),
      makeCandle(2020, 1995, ASIAN_CANDLE_TS + 7 * 3600000), // 10:00 — outside
    ];
    const result = computeAsianRange(candles);
    // Should only use the Asian window candle
    expect(result!.high).toBe(2005);
    expect(result!.low).toBe(2000);
  });

  it('falls back to previous day when latest day has no Asian bars', () => {
    // Two distinct days: day 1 has Asian bars, day 2 has no Asian bars
    const prevDayAsian = ASIAN_CANDLE_TS; // Day 1, 03:00 UTC
    const todayNonAsian = ASIAN_CANDLE_TS + 86400000 + 10 * 3600000; // Day 2, 10:00 UTC

    const candles = [makeCandle(2010, 2000, prevDayAsian), makeCandle(2050, 1990, todayNonAsian)];
    const result = computeAsianRange(candles);
    expect(result).not.toBeNull();
    // Should use yesterday's Asian session
    expect(result!.high).toBe(2010);
    expect(result!.low).toBe(2000);
  });

  it('marks forming=true when latest bar is inside Asian window', () => {
    const candles = [makeCandle(2010, 2000, ASIAN_CANDLE_TS)];
    const result = computeAsianRange(candles);
    expect(result!.forming).toBe(true);
  });

  it('marks forming=false when latest bar is outside Asian window', () => {
    // Latest bar at 10:00 UTC — outside Asian window
    const candles = [
      makeCandle(2010, 2000, ASIAN_CANDLE_TS),
      makeCandle(2015, 2005, ASIAN_CANDLE_TS + 7 * 3600000), // 10:00 UTC
    ];
    const result = computeAsianRange(candles);
    expect(result!.forming).toBe(false);
  });

  it('sets date from the Asian session day', () => {
    const candles = [makeCandle(2010, 2000, ASIAN_CANDLE_TS)];
    const result = computeAsianRange(candles);
    expect(result!.date).toBe('2025-01-15');
  });
});

describe('computeSessionRanges', () => {
  const DAY_START = Date.UTC(2026, 0, 5); // Monday
  const HOUR = 3600000;

  it('slices Asia, London and NY out of a 1H window', () => {
    const candles = [
      makeCandle(2005, 2000, DAY_START + 1 * HOUR),
      makeCandle(2010, 2004, DAY_START + 8 * HOUR),
      makeCandle(2020, 2012, DAY_START + 13 * HOUR),
    ];

    const { today, prior } = computeSessionRanges(candles, DAY_START + 22 * HOUR, {
      includePrior: true,
    });

    expect(today.map((range) => range.session)).toEqual(['asia', 'london', 'ny']);
    expect(today[0]).toMatchObject({ open: 2002.5, high: 2005, low: 2000, forming: false });
    expect(today[1]).toMatchObject({ high: 2010, low: 2004, forming: false });
    expect(today[2]).toMatchObject({ high: 2020, low: 2012, forming: false });
    expect(prior).toHaveLength(3);
  });

  it('withholds the close of a still-forming session', () => {
    const candles = [
      makeCandle(2005, 2000, DAY_START + 1 * HOUR),
      makeCandle(2010, 2004, DAY_START + 8 * HOUR),
    ];

    const { today, prior } = computeSessionRanges(candles, DAY_START + 9 * HOUR);

    expect(today[0]).toMatchObject({ forming: false });
    expect(today[0]!.close).toBe(2002.5);
    expect(today[1]).toMatchObject({ forming: true, close: null });
    expect(prior).toBeNull();
  });
});
