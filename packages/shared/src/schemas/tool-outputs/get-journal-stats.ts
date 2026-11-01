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

// Output envelope returned by the `get_journal_stats` AI tool. Reuses the
// shared `JournalStatsSchema` for the global block and adds per-symbol +
// per-tag breakdowns derived from SQL group-bys.
//
// Source of truth: packages/ai/src/tools/get-journal-stats.ts execute() return type.

import { z } from 'zod';

import { SymbolSchema } from '../../symbols';
import { JournalStatsSchema, TradeSideSchema } from '../journal';

export const GetJournalStatsInputSchema = z.object({
  /** ms epoch lower bound on `openedAt`. */
  sinceMs: z.int().optional(),
  /** ms epoch upper bound on `openedAt`. */
  untilMs: z.int().optional(),
  symbol: SymbolSchema.optional(),
  side: TradeSideSchema.optional(),
});
export type GetJournalStatsInput = z.infer<typeof GetJournalStatsInputSchema>;

export const StatBreakdownSchema = z.object({
  /** The bucket key — symbol code or tag string. */
  key: z.string(),
  /** Number of entries in the bucket. A count, so 0 is honest here. */
  count: z.int().min(0),
  /**
   * [0, 1]; closed trades only. Null (not 0) when the bucket has no closed
   * trades — R8 (audit 2026-10-31). A fabricated 0 would read as a measured
   * 0% win rate and the numeric evidence gate would accept it.
   */
  winRate: z.number().min(0).max(1).nullable(),
  /**
   * Mean realized R over trades carrying an R multiple. Null (not 0) when the
   * bucket has none — R8 (audit 2026-10-31).
   */
  avgR: z.number().nullable(),
});
export type StatBreakdown = z.infer<typeof StatBreakdownSchema>;

/**
 * The global stats block with the R8 honesty override: `winRate`, `avgR` and
 * `totalR` are null rather than 0 when nothing has closed / nothing carries an
 * R multiple. Kept as an extension of `JournalStatsSchema` so the base
 * contract (and every other consumer of it) is unchanged, while previously
 * persisted tool outputs that carry numeric zeros still parse.
 */
export const JournalStatsWithNullsSchema = JournalStatsSchema.extend({
  /** [0, 1]; null when no trade in the window has closed. */
  winRate: z.number().min(0).max(1).nullable(),
  /** Null when no trade in the window carries an R multiple. */
  avgR: z.number().nullable(),
  /** Sum of R over trades that carry one; null when none do. */
  totalR: z.number().nullable(),
});

export const GetJournalStatsOutputSchema = z.object({
  stats: JournalStatsWithNullsSchema,
  bySymbol: z.array(StatBreakdownSchema),
  byTag: z.array(StatBreakdownSchema),
  /**
   * Deterministic explanation of any null win-rate / average-R reading.
   * Optional so tool outputs persisted before the R8 fix still parse.
   */
  notes: z.string().optional(),
});
export type GetJournalStatsOutput = z.infer<typeof GetJournalStatsOutputSchema>;
