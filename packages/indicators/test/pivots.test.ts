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

import { describe, expect, it } from 'vitest';

import { classicPivots, pivotsAligned } from '../src/pivots';
import { makeCandles } from './fixtures';

describe('classicPivots', () => {
  it('matches the textbook formula', () => {
    // prevHigh=110, prevLow=90, prevClose=105
    // pp = (110 + 90 + 105) / 3 = 101.666...
    // r1 = 2*pp - prevLow = 113.333...
    // s1 = 2*pp - prevHigh = 93.333...
    const p = classicPivots(110, 90, 105);
    expect(p.pp).toBeCloseTo(101.666_666, 5);
    expect(p.r1).toBeCloseTo(113.333_333, 5);
    expect(p.s1).toBeCloseTo(93.333_333, 5);
    // r2 = pp + (h - l)
    expect(p.r2).toBeCloseTo(p.pp + 20, 10);
    expect(p.s2).toBeCloseTo(p.pp - 20, 10);
  });
});

describe('pivotsAligned', () => {
  it('returns null for the first candle and pivots for the rest', () => {
    const candles = makeCandles([1, 2, 3]);
    const out = pivotsAligned(candles);
    expect(out[0]).toBeNull();
    expect(out[1]).not.toBeNull();
    expect(out[2]).not.toBeNull();
  });

  it('aggregates intraday bars by UTC day so all bars on day D share prior day pivots (F-13)', () => {
    const day1T1 = Date.parse('2026-03-01T10:00:00Z');
    const day1T2 = Date.parse('2026-03-01T11:00:00Z');
    const day2T1 = Date.parse('2026-03-02T10:00:00Z');
    const day2T2 = Date.parse('2026-03-02T11:00:00Z');

    const candles = [
      {
        symbol: 'XAUUSD' as const,
        tf: '1h' as const,
        t: day1T1,
        o: 100,
        h: 110,
        l: 95,
        c: 105,
        v: null,
        source: 'test',
        fetchedAt: 0,
      },
      {
        symbol: 'XAUUSD' as const,
        tf: '1h' as const,
        t: day1T2,
        o: 105,
        h: 115,
        l: 100,
        c: 108,
        v: null,
        source: 'test',
        fetchedAt: 0,
      },
      {
        symbol: 'XAUUSD' as const,
        tf: '1h' as const,
        t: day2T1,
        o: 108,
        h: 120,
        l: 106,
        c: 118,
        v: null,
        source: 'test',
        fetchedAt: 0,
      },
      {
        symbol: 'XAUUSD' as const,
        tf: '1h' as const,
        t: day2T2,
        o: 118,
        h: 125,
        l: 115,
        c: 120,
        v: null,
        source: 'test',
        fetchedAt: 0,
      },
    ];

    const out = pivotsAligned(candles);
    // Day 1 bars have no prior day in dataset: null
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();

    // Day 1 aggregated: H=115, L=95, C=108. pp = (115 + 95 + 108) / 3 = 106
    expect(out[2]).not.toBeNull();
    expect(out[3]).not.toBeNull();
    expect(out[2]!.pp).toBeCloseTo(106, 5);
    expect(out[3]!.pp).toBeCloseTo(106, 5);
    expect(out[2]!.r1).toBe(out[3]!.r1);
    expect(out[2]!.s1).toBe(out[3]!.s1);
  });
});
