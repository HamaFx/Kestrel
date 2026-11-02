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

// Output envelope returned by the `get_correlation` AI tool.
//
// Returns a Pearson correlation matrix over close-to-close returns for
// the supported symbols at a given timeframe + window, plus a derived
// USD-strength proxy ("DXY proxy") computed from the FX legs only.
// The `dxyProxy.formula` field is the verbatim formula + weights so any
// agent answer can cite it.
//
// Source of truth: packages/ai/src/tools/get-correlation.ts execute() return type.

import { z } from 'zod';

import { SymbolSchema } from '../../domain/symbols';
import { TimeframeSchema } from '../../domain/timeframes';

export const GetCorrelationInputSchema = z.object({
  tf: TimeframeSchema.default('1h'),
  windowBars: z.int().min(20).max(500).default(100),
});
export type GetCorrelationInput = z.infer<typeof GetCorrelationInputSchema>;

export const CorrelationCellSchema = z.object({
  a: SymbolSchema,
  b: SymbolSchema,
  /** Pearson correlation in [-1, 1] (clamped against floating-point drift). */
  r: z.number().min(-1.001).max(1.001),
});
export type CorrelationCell = z.infer<typeof CorrelationCellSchema>;

export const GetCorrelationOutputSchema = z.object({
  tf: TimeframeSchema,
  windowBars: z.int(),
  asOf: z.int(),
  matrix: z.array(CorrelationCellSchema),
  /**
   * USD-strength proxy snapshot. Null (not `{ value: 0, change24h: 0 }`) when
   * EURUSD/GBPUSD data is unavailable — R8 (audit 2026-10-31). A fabricated 0
   * is accepted by the numeric evidence gate as a real reading, while the
   * truth is that no proxy value exists. `change24h` is separately nullable
   * when no bar sits near 24h before the last close.
   */
  dxyProxy: z
    .object({
      /** Synthetic USD-strength index. Typically near 100 with the chosen formula. */
      value: z.number(),
      /** Percent change of the proxy across the most recent 24 hours of bars. */
      change24h: z.number().nullable(),
      /** Bars used to compute the value. A count, so 0 is honest here. */
      samples: z.int(),
      /** Verbatim formula + weights so the agent can cite it. */
      formula: z.string(),
    })
    .nullable(),
  /**
   * Deterministic interpretation, including which readings are unavailable and
   * why. Optional so tool outputs persisted before the R8 fix still parse.
   */
  notes: z.string().optional(),
  /** True when one or more symbol candle windows could not be fetched. */
  partial: z.boolean().optional(),
  /**
   * True when at least one candle window was served from a stale cache. The
   * proxy is a price-derived reading, so staleness is disclosed (R8).
   */
  stale: z.boolean().optional(),
});
export type GetCorrelationOutput = z.infer<typeof GetCorrelationOutputSchema>;
