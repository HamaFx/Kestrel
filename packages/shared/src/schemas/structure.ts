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

// Objective market-structure reads.
//
// Swing pivots are local price extremes (a high with lower highs on both
// sides, a low with higher lows). Unlike continuous indicators they are
// SPARSE EVENTS scattered across a candle window, so they get their own
// schema and result envelope instead of the per-candle
// `IndicatorResult.values` array.
//
// All event indices reference positions in the candle array the request was
// computed against. The chart UI uses these to place markers.

import { z } from 'zod';

import { SymbolSchema } from '../domain/symbols';
import { TimeframeSchema } from '../domain/timeframes';

// ---------------------------------------------------------------------------
// Swing points — local pivot highs / lows, the anchor prices behind support
// and resistance reads.
// ---------------------------------------------------------------------------

export const SwingTypeSchema = z.enum(['high', 'low']);
export type SwingType = z.infer<typeof SwingTypeSchema>;

export const SwingPointSchema = z.object({
  /** Index into the candle window. */
  index: z.int().min(0),
  /** Open time of the bar at `index`, ms epoch UTC. */
  time: z.int(),
  /** The pivot price — high for swing-high, low for swing-low. */
  price: z.number(),
  type: SwingTypeSchema,
  /** Lookback used to qualify the pivot (k bars on each side). */
  lookback: z.int().positive(),
});
export type SwingPoint = z.infer<typeof SwingPointSchema>;

// ---------------------------------------------------------------------------
// StructureResult — envelope returned by `computeStructure` and the
// `get_market_structure` AI tool.
// ---------------------------------------------------------------------------

export const StructureResultSchema = z.object({
  symbol: SymbolSchema,
  tf: TimeframeSchema,
  /** Number of candles the result was computed against. */
  bars: z.int().nonnegative(),
  swings: z.array(SwingPointSchema),
  fetchedAt: z.int(),
});
export type StructureResult = z.infer<typeof StructureResultSchema>;
