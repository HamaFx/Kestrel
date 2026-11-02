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

// Output envelope returned by the `get_seasonality` AI tool.
//
// Per-month / per-weekday / per-hour return distributions derived from
// the last 3 years of daily candles for monthly + weekday, and the last
// 90 days of 1H candles for hourly. Buckets are sorted in their natural
// chronological order.
//
// Source of truth: packages/ai/src/tools/get-seasonality.ts execute() return type.

import { z } from 'zod';

import { SymbolSchema } from '../../domain/symbols';

export const SeasonalityGranularitySchema = z.enum(['month', 'weekday', 'hour']);
export type SeasonalityGranularity = z.infer<typeof SeasonalityGranularitySchema>;

export const GetSeasonalityInputSchema = z.object({
  symbol: SymbolSchema,
  granularity: SeasonalityGranularitySchema.default('month'),
});
export type GetSeasonalityInput = z.infer<typeof GetSeasonalityInputSchema>;

export const SeasonalityBucketSchema = z.object({
  /**
   * Bucket key:
   *  - `month`:   1..12 (Jan = 1)
   *  - `weekday`: 0..6  (Sun = 0)
   *  - `hour`:    0..23
   */
  key: z.int(),
  /** Human-readable label, e.g. "Mar", "Mon", "13:00 UTC". */
  label: z.string(),
  /** Number of samples in the bucket. A count, so 0 is honest here. */
  count: z.int(),
  /**
   * Median percent return across samples. Null (not 0) when the bucket has no
   * samples — R8 (audit 2026-10-31). A fabricated 0 reads as a measured
   * "flat" return and grounds a claim the data does not support.
   */
  medianReturnPct: z.number().nullable(),
  /** 25th percentile percent return. Null when the bucket has no samples. */
  q1Pct: z.number().nullable(),
  /** 75th percentile percent return. Null when the bucket has no samples. */
  q3Pct: z.number().nullable(),
  /**
   * Fraction of samples with positive return, 0..1. Null when the bucket has
   * no samples; 0 remains a real reading when trades/samples exist but none won.
   */
  winRate: z.number().min(0).max(1).nullable(),
});
export type SeasonalityBucket = z.infer<typeof SeasonalityBucketSchema>;

export const GetSeasonalityOutputSchema = z.object({
  symbol: SymbolSchema,
  granularity: SeasonalityGranularitySchema,
  asOf: z.int(),
  buckets: z.array(SeasonalityBucketSchema),
  /** Number of bars used to derive the buckets. A count, so 0 is honest. */
  sampleSize: z.int(),
  /** True when fewer than 30 samples were available — buckets are noisy. */
  thin: z.boolean(),
  /**
   * True when a candle window was served from the stale-while-revalidate
   * cache (R8, audit 2026-10-31). Optional so outputs persisted before the
   * fix still parse.
   */
  stale: z.boolean().optional(),
  /**
   * Deterministic note explaining when no statistics could be derived at all.
   * Optional so tool outputs persisted before the R8 fix still parse.
   */
  notes: z.string().optional(),
});
export type GetSeasonalityOutput = z.infer<typeof GetSeasonalityOutputSchema>;
