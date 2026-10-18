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

// Daily / weekly classic floor-trader pivots. Single-value per period:
// computed from the PREVIOUS period's H/L/C, used as a target line on the
// CURRENT period.

import type { Candle } from '@kestrel/shared';

export interface ClassicPivots {
  pp: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
}

/**
 * Compute classic pivots from a single (prevHigh, prevLow, prevClose) tuple.
 * Used by both daily and weekly variants.
 */
export function classicPivots(prevHigh: number, prevLow: number, prevClose: number): ClassicPivots {
  const pp = (prevHigh + prevLow + prevClose) / 3;
  const r1 = 2 * pp - prevLow;
  const s1 = 2 * pp - prevHigh;
  const r2 = pp + (prevHigh - prevLow);
  const s2 = pp - (prevHigh - prevLow);
  const r3 = prevHigh + 2 * (pp - prevLow);
  const s3 = prevLow - 2 * (prevHigh - pp);
  return { pp, r1, r2, r3, s1, s2, s3 };
}

/**
 * Compute pivots aligned 1:1 with a candle window. For a daily timeframe
 * window, each candle gets the pivots derived from the PREVIOUS bar's
 * (h, l, c). The first bar gets `null`.
 *
 * For intraday windows you typically want pivots derived from a single
 * prior daily bar — call `classicPivots()` directly with that data.
 */
export function pivotsAligned(candles: Candle[]): (ClassicPivots | null)[] {
  if (candles.length === 0) return [];

  // Group by UTC date string.
  const dateStr = (t: number): string => {
    try {
      return new Date(t).toISOString().slice(0, 10);
    } catch {
      return '';
    }
  };

  const dates: string[] = [];
  const dayIndex = new Map<string, number>();
  const dayAggregates = new Map<string, { h: number; l: number; c: number }>();
  // Per-bar UTC day key, populated in the same pass as the aggregation so the
  // second pass never re-derives it (or linear-scans for its index — this was
  // O(n × distinct days) before).
  const dayKeys: string[] = new Array<string>(candles.length);

  for (let i = 0; i < candles.length; i += 1) {
    const c = candles[i]!;
    const d = dateStr(c.t);
    dayKeys[i] = d;
    const existing = dayAggregates.get(d);
    if (!existing) {
      dayIndex.set(d, dates.length);
      dates.push(d);
      dayAggregates.set(d, { h: c.h, l: c.l, c: c.c });
    } else {
      existing.h = Math.max(existing.h, c.h);
      existing.l = Math.min(existing.l, c.l);
      existing.c = c.c; // latest close in that day
    }
  }

  // If all bars share the same day (e.g. single-day synthetic test fixtures or property tests),
  // fallback to preceding bar.
  if (dates.length <= 1) {
    return candles.map((_c, i) => {
      if (i === 0) return null;
      const prev = candles[i - 1]!;
      return classicPivots(prev.h, prev.l, prev.c);
    });
  }

  // Multi-day: for each candle, use previous calendar day's aggregated H/L/C.
  return candles.map((_c, i) => {
    const idx = dayIndex.get(dayKeys[i]!)!;
    if (idx <= 0) return null;
    const prevDate = dates[idx - 1]!;
    const prevDay = dayAggregates.get(prevDate)!;
    return classicPivots(prevDay.h, prevDay.l, prevDay.c);
  });
}
