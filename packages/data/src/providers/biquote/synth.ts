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

// Weekly candles synthesized from BiQuote's daily bars.
//
// BiQuote's OHLC endpoint has no W1 interval, so the adapter aggregates 1d
// bars into ISO weeks (Monday 00:00 UTC). This mirrors the Finnhub
// `synth4HFrom1H` approach: a bucket may contain fewer than seven bars at the
// edges of the window, and the trailing partial week is dropped because its
// high/low/close are still moving.

import type { Candle } from '@kestrel/shared';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** Monday 00:00 UTC of the ISO week containing `ms`. */
export function isoWeekMondayUtcMs(ms: number): number {
  const date = new Date(ms);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return (
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) -
    daysSinceMonday * DAY_MS
  );
}

/**
 * Aggregate daily candles into Monday-anchored weekly candles.
 *
 * Input must be ascending (the BiQuote adapter guarantees this). Buckets are
 * emitted ascending; a week with no bars is simply absent.
 */
export function synth1WFrom1D(candles: readonly Candle[], nowMs = Date.now()): Candle[] {
  if (candles.length === 0) return [];

  const buckets = new Map<number, Candle[]>();
  for (const candle of candles) {
    const bucket = isoWeekMondayUtcMs(candle.t);
    const list = buckets.get(bucket);
    if (list) list.push(candle);
    else buckets.set(bucket, [candle]);
  }

  const out: Candle[] = [];
  for (const [weekStartMs, group] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    // Drop the trailing partial week: its OHLC is still forming.
    if (weekStartMs + WEEK_MS > nowMs) continue;

    const first = group[0]!;
    const last = group[group.length - 1]!;
    let high = Number.NEGATIVE_INFINITY;
    let low = Number.POSITIVE_INFINITY;
    let volume = 0;
    let hasVolume = false;
    let fetchedAt = first.fetchedAt;
    for (const bar of group) {
      if (bar.h > high) high = bar.h;
      if (bar.l < low) low = bar.l;
      if (bar.v !== null) {
        volume += bar.v;
        hasVolume = true;
      }
      if (bar.fetchedAt > fetchedAt) fetchedAt = bar.fetchedAt;
    }

    out.push({
      symbol: first.symbol,
      tf: '1w',
      t: weekStartMs,
      o: first.o,
      h: high,
      l: low,
      c: last.c,
      v: hasVolume ? volume : null,
      source: first.source,
      fetchedAt,
    });
  }
  return out;
}
