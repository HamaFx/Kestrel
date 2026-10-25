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

// Market-structure summary derived from the collected evidence.

import { priceDecimals } from '@kestrel/shared';
import type { z } from 'zod';

import type { MarketStructureSummarySchema, SymbolResearchEvidence } from './schemas';

export function computeMarketStructureSummary(
  timeframes: readonly SymbolResearchEvidence[],
  symbol?: string,
): z.infer<typeof MarketStructureSummarySchema> | undefined {
  const preferred =
    timeframes.find((tf) => tf.timeframe === '1h' && tf.candles.length > 0) ??
    timeframes.find((tf) => tf.candles.length > 0);
  if (!preferred || preferred.candles.length === 0) return undefined;
  const window = preferred.candles.slice(-50);
  let recentSwingHigh = -Infinity;
  let recentSwingLow = Infinity;
  for (const c of window) {
    if (c.h > recentSwingHigh) recentSwingHigh = c.h;
    if (c.l < recentSwingLow) recentSwingLow = c.l;
  }
  if (!Number.isFinite(recentSwingHigh) || !Number.isFinite(recentSwingLow)) return undefined;
  const dec = symbol ? priceDecimals(symbol) : 5;
  return {
    recentSwingHigh,
    recentSwingLow,
    rangeSize: Number((recentSwingHigh - recentSwingLow).toFixed(dec)),
  };
}
