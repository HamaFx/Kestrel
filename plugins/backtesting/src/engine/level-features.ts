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

// Point-in-time swing-pivot levels for the strategy feature matrix.
//
// A strategy may only see a pivot once its confirmation bars have closed:
// `swing.index + swing.lookback` is the bar where the pivot becomes
// knowable, and the level then carries forward until a newer pivot of the
// same side replaces it.

import { computeStructure } from '@kestrel/indicators';
import type { Candle, SwingPoint, Symbol, Timeframe } from '@kestrel/shared';

import type { FeatureMatrix } from './feature-types';

/**
 * Populate `swingHigh` / `swingLow` (session levels are added separately by
 * `applySessionLevels`).
 *
 * `candles` must be oldest-first and closed bars only. The function never
 * mutates the input.
 */
export function applySwingLevels(
  matrix: FeatureMatrix,
  candles: readonly Candle[],
  symbol: Symbol,
  timeframe: Timeframe,
): void {
  const structure = computeStructure({
    symbol,
    tf: timeframe,
    candles: [...candles],
  });

  const swingByBar = new Map<number, SwingPoint[]>();
  for (const swing of structure.swings) {
    const visibleAt = Math.min(candles.length - 1, swing.index + swing.lookback);
    const list = swingByBar.get(visibleAt) ?? [];
    list.push(swing);
    swingByBar.set(visibleAt, list);
  }

  const levels = matrix.levels;
  let lastSwingHigh: number | null = null;
  let lastSwingLow: number | null = null;

  for (let i = 0; i < candles.length; i += 1) {
    for (const swing of swingByBar.get(i) ?? []) {
      if (swing.type === 'high') lastSwingHigh = swing.price;
      else lastSwingLow = swing.price;
    }
    if (lastSwingHigh !== null) levels.swingHigh[i] = lastSwingHigh;
    if (lastSwingLow !== null) levels.swingLow[i] = lastSwingLow;
  }
}
