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

// Freshness envelopes attached to market-data tool outputs (audit 2026-10-31
// R8). The AI must be able to see, and therefore disclose, that a value came
// from a stale-while-revalidate cache fallback or is older than the live
// window. These blocks are optional on the wire so tool outputs persisted
// before R8 keep parsing in the chat replay path.

import { z } from 'zod';

import { SymbolSchema } from '../../symbols';

/**
 * How old the value is and whether it was served from a fallback path.
 *
 * `stale` is true when either the upstream provider flagged the value stale
 * or the adapter served it from a stale-while-revalidate cache entry after an
 * upstream failure. `ageSeconds` counts from the moment the upstream observed
 * the value, so it includes time spent in the cache; it is null when the
 * provider reports no observation time.
 */
export const DataFreshnessSchema = z.object({
  stale: z.boolean(),
  /** ms epoch UTC when the market-data adapter produced (fetched or cached) this value. */
  producedAt: z.int(),
  /** Seconds since the upstream observed the value; null when unknown. */
  ageSeconds: z.number().nonnegative().nullable(),
});
export type DataFreshness = z.infer<typeof DataFreshnessSchema>;

/** Per-symbol price freshness — one entry per requested symbol. */
export const QuoteFreshnessSchema = DataFreshnessSchema.extend({
  symbol: SymbolSchema,
  /** Provider that produced the value (`biquote`, `finnhub`, `binance`, …). */
  source: z.string(),
});
export type QuoteFreshness = z.infer<typeof QuoteFreshnessSchema>;

/** Candle-window freshness, including how far behind the window's last closed bar is. */
export const CandlesFreshnessSchema = DataFreshnessSchema.extend({
  /** Seconds since the newest fully closed bar closed; null when none is closed yet. */
  lastClosedBarAgeSeconds: z.number().nonnegative().nullable(),
});
export type CandlesFreshness = z.infer<typeof CandlesFreshnessSchema>;
