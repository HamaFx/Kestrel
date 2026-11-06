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

// Asian-session range extraction.
//
// The Asian session is 00:00–07:00 UTC (`SESSION_WINDOWS.asia`). We extract
// the high/low of the bars whose bar-start time falls in that window for the
// current UTC day relative to the latest bar. If the latest bar is itself
// before 07:00 UTC, the range is "still forming" and we use bars seen so
// far. If the window for today has no bars at all (weekend), we fall back
// to the most recent UTC day that does.

import type { Candle } from '@kestrel/shared';

import { collectDistinctDays } from '../util';
import { SESSION_WINDOWS, sliceSessionRange } from './sessions';

const ASIAN_WINDOW = SESSION_WINDOWS[0]!;

export interface AsianRange {
  /** YYYY-MM-DD UTC. */
  date: string;
  high: number;
  low: number;
  /** ms epoch UTC bounds of the actual bars used. */
  fromTime: number;
  toTime: number;
  /** True if `now` is still inside the Asian session (range may extend further). */
  forming: boolean;
}

export function computeAsianRange(candles: Candle[]): AsianRange | null {
  if (candles.length === 0) return null;

  const latest = candles[candles.length - 1]!;
  const days = collectDistinctDays(candles);

  // Walk distinct UTC days backwards from the latest bar; pick the first day
  // with bars in the Asian window.
  for (let i = days.length - 1; i >= 0; i -= 1) {
    const day = days[i]!;
    const dayStart = Date.parse(`${day}T00:00:00.000Z`);
    if (!Number.isFinite(dayStart)) continue;
    const range = sliceSessionRange(candles, dayStart, latest.t, ASIAN_WINDOW);
    if (range.open === null || range.high === null || range.low === null) continue;
    return {
      date: day,
      high: range.high,
      low: range.low,
      fromTime: range.fromMs,
      toTime: range.toMs,
      forming: range.forming,
    };
  }
  return null;
}
