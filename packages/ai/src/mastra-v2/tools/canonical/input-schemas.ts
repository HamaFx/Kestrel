// SPDX-License-Identifier: Apache-2.0

// Canonical tool input schemas — a leaf module that imports only `zod` and
// `@kestrel/shared`.
//
// Same reason as `./descriptions.ts`: the legacy AI SDK shims read these
// values at module scope, and the canonical tool modules sit inside an import
// cycle, so a read could land on a binding that is still being initialised
// (TDZ → masked React error #441 in production). Nothing here imports the app
// graph, so the read can never race module evaluation.
//
// The canonical modules re-export these, so existing import paths keep working.

import {
  ALL_SYMBOLS,
  GetCoTInputSchema,
  IndicatorKindSchema,
  IndicatorParamsSchema,
  SearchKnowledgeInputSchema,
  StructureKindSchema,
  SymbolSchema,
  TimeframeSchema,
} from '@kestrel/shared';
import { z } from 'zod';

// We extend the published knowledge input schema with the optional `kinds`
// filter without breaking existing callers — the original input parses fine
// because the new field is optional. The DSL enum is restricted to the stable
// `MemoryKind` set so the agent can't ask for arbitrary buckets.
const SearchKindsSchema = z.array(z.enum(['news', 'journal', 'briefing', 'thread_synopsis']));

export const CanonicalCandlesInputSchema = z.object({
  symbol: SymbolSchema,
  tf: TimeframeSchema,
  /** Bars to fetch. Cap kept tight — the model rarely benefits from >200. */
  count: z.int().min(10).max(500).default(120),
});

export const CanonicalCoTInputSchema = GetCoTInputSchema;

export const CanonicalIndicatorsInputSchema = z.object({
  symbol: SymbolSchema,
  tf: TimeframeSchema,
  count: z.int().min(20).max(500).default(200),
  indicators: z
    .array(z.object({ kind: IndicatorKindSchema, params: IndicatorParamsSchema.default({}) }))
    .min(1)
    .max(6),
});

export const CanonicalKnowledgeInputSchema = SearchKnowledgeInputSchema.extend({
  kinds: SearchKindsSchema.optional(),
  /**
   * Halflife for time-decayed scoring, in days. Defaults to 7 days for
   * news, 30 days for memory recall. When the agent is digging through
   * older context it can bump this.
   */
  halflifeDays: z.number().min(0.5).max(365).optional(),
});

export const CanonicalMarketStructureInputSchema = z.object({
  symbol: SymbolSchema,
  tf: TimeframeSchema,
  /** Bars to scan. 300 covers ~12 days on 1h, 12 weeks on 4h. */
  count: z.int().min(50).max(1000).default(300),
  /**
   * Which kinds to compute. Skip the ones you don't need to keep the
   * payload small in the chat history.
   * Default: all 5 structure kinds.
   */
  kinds: z.array(StructureKindSchema).optional(),
  /** How many most recent events per kind to return. Default 5. */
  lookback: z.int().min(2).max(10).default(5),
});

export const CanonicalNewsInputSchema = z.object({
  /** Optional symbol filter. Omit to get cross-symbol macro coverage. */
  symbol: SymbolSchema.optional(),
  /** ms epoch lower bound. Defaults to 24 h ago. */
  since: z.int().optional(),
  limit: z.int().min(1).max(20).default(8),
  /** Minimum sentiment magnitude to include. */
  minSentiment: z.number().min(0).max(1).optional(),
});

export const CanonicalPriceInputSchema = z.object({
  symbols: z.array(SymbolSchema).min(1).max(ALL_SYMBOLS.length),
});
