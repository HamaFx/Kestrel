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

// Output envelope returned by the `get_market_structure` AI tool. The tool
// tail-trims the swing list, folds the most recent pivot high/low into a
// range band, and adds a `summary` prose field, so the envelope is bespoke
// (it is NOT `StructureResultSchema`).
//
// Source of truth: packages/ai/src/mastra-v2/tools/canonical/market-structure.ts
// execute() return type.

import { z } from 'zod';

import { SwingPointSchema } from '../structure';

export const GetMarketStructureOutputSchema = z.object({
  symbol: z.string(),
  tf: z.string(),
  /** Number of candles the result was computed against. */
  bars: z.int().nonnegative(),
  swings: z.array(SwingPointSchema),
  /** Highest of the recent swing highs, or null when none qualified. */
  recentSwingHigh: z.number().nullable(),
  /** Lowest of the recent swing lows, or null when none qualified. */
  recentSwingLow: z.number().nullable(),
  /** Distance between the recent range extremes, or null when incomplete. */
  rangeSize: z.number().nullable(),
  /** Compact human-readable summary the model can echo verbatim. */
  summary: z.string(),
});

export type GetMarketStructureOutput = z.infer<typeof GetMarketStructureOutputSchema>;
