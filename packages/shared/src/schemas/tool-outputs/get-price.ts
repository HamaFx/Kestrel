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

// Output envelope returned by the `get_price` AI tool. Reuses the existing
// per-row `TickSchema` primitive — this file only describes the wrapper.
//
// Source of truth: packages/ai/src/mastra-v2/tools/canonical/price.ts execute().
//
// R8 (audit 2026-10-31): the wrapper carries per-symbol freshness so the model
// can disclose that a quote was served stale instead of presenting it as live.
// `freshness`/`warnings` are optional so tool outputs persisted before R8
// still parse in the chat replay path.

import { z } from 'zod';

import { TickSchema } from '../tick';
import { QuoteFreshnessSchema } from './freshness';

export const GetPriceOutputSchema = z.object({
  ticks: z.array(TickSchema),
  /** ISO timestamp the answer was assembled at — drives freshness UI. */
  asOf: z.string(),
  /** One entry per requested symbol; omitted by pre-R8 persisted outputs. */
  freshness: z.array(QuoteFreshnessSchema).optional(),
  /** Pre-rendered disclosure lines the model should surface when data is stale. */
  warnings: z.array(z.string()).optional(),
});

export type GetPriceOutput = z.infer<typeof GetPriceOutputSchema>;
