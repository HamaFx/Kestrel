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
// Source of truth: packages/ai/src/tools/get-candles.ts execute() return type.

import { z } from 'zod';

import { CandleSchema } from '../candle';

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
  changePct: z.number(),
  avgBarRange: z.number(),
  totalVolume: z.number(),
});
export type CandlePeriodSummary = z.infer<typeof CandlePeriodSummarySchema>;

export const GetCandlesOutputSchema = z.object({
  symbol: z.string(),
  tf: z.string(),
  candles: z.array(CandleSchema),
  summary: CandlePeriodSummarySchema.optional().nullable(),
});

export type GetCandlesOutput = z.infer<typeof GetCandlesOutputSchema>;

