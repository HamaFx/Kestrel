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

// Shared helpers for indicator implementations. All functions here are
// pure: same inputs → same output, no side effects.

import type { Candle } from '@kestrel/shared';

/** Extract close prices from a candle window. */
export function closes(candles: Candle[]): number[] {
  return candles.map((c) => c.c);
}

export function highs(candles: Candle[]): number[] {
  return candles.map((c) => c.h);
}

export function lows(candles: Candle[]): number[] {
  return candles.map((c) => c.l);
}

/**
 * Pad an indicator series to the same length as the source candles, with
 * `null` for the first `nullCount` entries (where the indicator can't
 * produce a value yet).
 */
export function padFront<T>(series: T[], nullCount: number, fill: T | null = null): (T | null)[] {
  const out: (T | null)[] = [];
  for (let i = 0; i < nullCount; i += 1) out.push(fill);
  for (const v of series) out.push(v);
  return out;
}

/** Numeric average of a finite array. Returns NaN for empty input. */
export function mean(xs: number[]): number {
  if (xs.length === 0) return Number.NaN;
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}

/** Sample standard deviation (Bessel's correction). NaN for length < 2. */
export function stdev(xs: number[]): number {
  if (xs.length < 2) return Number.NaN;
  const m = mean(xs);
  let sq = 0;
  for (const x of xs) sq += (x - m) ** 2;
  return Math.sqrt(sq / (xs.length - 1));
}

/** Population standard deviation (divide by N). Used by Bollinger Bands (TradingView / MT5 standard). NaN for empty input. */
export function stdevPopulation(xs: number[]): number {
  if (xs.length === 0) return Number.NaN;
  const m = mean(xs);
  let sq = 0;
  for (const x of xs) sq += (x - m) ** 2;
  return Math.sqrt(sq / xs.length);
}

/** UTC calendar day key (YYYY-MM-DD) for a millisecond timestamp. */
export function utcDayKey(ms: number): string {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

/** Distinct UTC day keys present in a candle window, in first-seen order. */
export function collectDistinctDays(candles: readonly { t: number }[]): string[] {
  const days: string[] = [];
  let last = '';
  for (const candle of candles) {
    const key = utcDayKey(candle.t);
    if (key !== last) {
      days.push(key);
      last = key;
    }
  }
  return days;
}

/**
 * EMA over a raw number series, aligned 1:1 with the input. The first
 * `period - 1` entries are null; the seed is the SMA of the first period.
 */
export function emaOfNumbers(xs: readonly number[], period: number): (number | null)[] {
  if (xs.length < period) return Array(xs.length).fill(null);
  const out: (number | null)[] = [];
  for (let i = 0; i < period - 1; i += 1) out.push(null);
  let seed = 0;
  for (let i = 0; i < period; i += 1) seed += xs[i]!;
  let prev = seed / period;
  out.push(prev);
  const k = 2 / (period + 1);
  for (let i = period; i < xs.length; i += 1) {
    prev = (xs[i]! - prev) * k + prev;
    out.push(prev);
  }
  return out;
}
