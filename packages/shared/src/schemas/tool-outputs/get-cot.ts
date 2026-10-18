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

// Output envelope returned by the `get_cot` AI tool.
//
// Returns the last N weeks of CFTC Commitment-of-Traders rows for one
// symbol, ingested by `/api/cron/cot`. Each sample has the four bucket
// long/short pairs (dealer / asset / leveraged / other); the agent
// computes net = long - short for trend reasoning.
//
// Source of truth: packages/ai/src/tools/get-cot.ts execute() return type.

import { z } from 'zod';

import { SymbolSchema } from '../../symbols';

export const GetCoTInputSchema = z.object({
  symbol: SymbolSchema.optional(),
  weeks: z.int().min(1).max(52).default(8),
});
export type GetCoTInput = z.infer<typeof GetCoTInputSchema>;

export const CoTSampleSchema = z.object({
  /** ms epoch UTC of the report date. */
  reportDate: z.int(),
  dealerLong: z.int().nullable(),
  dealerShort: z.int().nullable(),
  assetLong: z.int().nullable(),
  assetShort: z.int().nullable(),
  leveragedLong: z.int().nullable(),
  leveragedShort: z.int().nullable(),
  otherLong: z.int().nullable(),
  otherShort: z.int().nullable(),
});
export type CoTSample = z.infer<typeof CoTSampleSchema>;

export const GetCoTOutputSchema = z.object({
  symbol: SymbolSchema,
  samples: z.array(CoTSampleSchema),
  /** Templated summary string (no LLM second pass). */
  summary: z.string(),
  /** True when the table is empty (cron hasn't run yet). */
  pipelinePending: z.boolean(),
});
export type GetCoTOutput = z.infer<typeof GetCoTOutputSchema>;
