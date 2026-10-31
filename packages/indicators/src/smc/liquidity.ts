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

// Liquidity sweep detection.
//
// A sweep is a bar whose wick spikes BEYOND a recent swing high/low and
// then closes BACK INSIDE. Marks where stops likely got hit; common
// reversal signal. We only consider swings already confirmed at the time
// of the sweep (per the swing's `lookback` confirmation lag).

import type { Candle, LiquiditySweep, SwingPoint } from '@kestrel/shared';

export interface DetectLiquiditySweepsOptions {
  /**
   * Maximum bars between the swing being swept and the sweep itself.
   * Older swings are usually too distant to be the actual liquidity. 200.
   */
  maxLookback?: number;
  /** ATR(14) value for magnitude scoring. If not provided, magnitude defaults to 0. */
  atr14?: number;
  /**
   * Per-bar ATR(14) series. When provided, each sweep's magnitude uses the
   * ATR knowable on the sweep bar so the score stays point-in-time.
   */
  atrSeries?: readonly (number | null)[];
}

export function detectLiquiditySweeps(
  candles: Candle[],
  swings: SwingPoint[],
  opts: DetectLiquiditySweepsOptions = {},
): LiquiditySweep[] {
  const maxLookback = opts.maxLookback ?? 200;
  const atr14 = opts.atr14 ?? 0;
  if (candles.length === 0 || swings.length === 0) return [];

  const out: LiquiditySweep[] = [];

  // For efficiency: separate highs / lows so we can binary-search the most
  // recent ones for each candle.
  const swingHighs = swings.filter((s) => s.type === 'high');
  const swingLows = swings.filter((s) => s.type === 'low');

  // Each swing level can be swept at most once. A close beyond the level is a
  // break, not a sweep — it consumes the level too so it never re-fires later.
  const sweptHighs = new Set<number>();
  const sweptLows = new Set<number>();

  for (let i = 0; i < candles.length; i += 1) {
    const c = candles[i]!;
    const barAtr = opts.atrSeries?.[i] ?? atr14;

    // Sweep of a swing-high: c.h > swing.price AND c.c < swing.price AND
    // the swing was confirmed by bar i (i.e. swing.index + swing.lookback <= i).
    for (let s = swingHighs.length - 1; s >= 0; s -= 1) {
      const sw = swingHighs[s]!;
      if (sweptHighs.has(sw.index)) continue;
      if (sw.index + sw.lookback > i) continue; // not confirmed yet at i
      if (sw.index >= i) continue; // can't sweep self
      if (i - sw.index > maxLookback) break;
      if (c.h > sw.price && c.c < sw.price) {
        const extension = c.h - sw.price;
        out.push({
          side: 'high',
          index: i,
          time: c.t,
          level: sw.price,
          wick: c.h,
          magnitude: barAtr > 0 ? extension / barAtr : 0,
        });
        sweptHighs.add(sw.index);
        break; // one sweep per bar per side is enough
      }
      if (c.c > sw.price) sweptHighs.add(sw.index); // clean break consumes the level
    }

    for (let s = swingLows.length - 1; s >= 0; s -= 1) {
      const sw = swingLows[s]!;
      if (sweptLows.has(sw.index)) continue;
      if (sw.index + sw.lookback > i) continue;
      if (sw.index >= i) continue;
      if (i - sw.index > maxLookback) break;
      if (c.l < sw.price && c.c > sw.price) {
        const extension = sw.price - c.l;
        out.push({
          side: 'low',
          index: i,
          time: c.t,
          level: sw.price,
          wick: c.l,
          magnitude: barAtr > 0 ? extension / barAtr : 0,
        });
        sweptLows.add(sw.index);
        break;
      }
      if (c.c < sw.price) sweptLows.add(sw.index); // clean break consumes the level
    }
  }

  return out;
}
