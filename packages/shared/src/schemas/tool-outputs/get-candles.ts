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

// Output envelope returned by the `get_candles` AI tool.
//
// Source of truth: packages/ai/src/mastra-v2/tools/canonical/candles.ts execute().
//
// R8 (audit 2026-10-31): the wrapper carries window freshness, and `changePct`
// is nullable instead of fabricating 0% when the window's open is zero (or the
// window is empty in a way the summary cannot express). `freshness`/`warnings`
// are optional so tool outputs persisted before R8 still parse.

import { z } from 'zod';

import { CandleSchema } from '../candle';
import { CandlesFreshnessSchema } from './freshness';

export const CandlePeriodSummarySchema = z.object({
  fromIso: z.string(),
  toIso: z.string(),
  open: z.number(),
  high: z.number(),
  highAtIso: z.string().optional(),
  low: z.number(),
  lowAtIso: z.string().optional(),
  close: z.number(),
  change: z.number(),
  /** Null when the window's open is zero, so no percentage exists — never a fabricated 0. */
  changePct: z.number().nullable(),
  avgBarRange: z.number(),
  totalVolume: z.number(),
});
export type CandlePeriodSummary = z.infer<typeof CandlePeriodSummarySchema>;

export const GetCandlesOutputSchema = z.object({
  symbol: z.string(),
  tf: z.string(),
  candles: z.array(CandleSchema),
  summary: CandlePeriodSummarySchema.optional().nullable(),
  /** Omitted by pre-R8 persisted outputs. */
  freshness: CandlesFreshnessSchema.optional(),
  /** Pre-rendered disclosure lines the model should surface when data is stale. */
  warnings: z.array(z.string()).optional(),
});

export type GetCandlesOutput = z.infer<typeof GetCandlesOutputSchema>;
