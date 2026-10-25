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

// Symbol-research packet schemas, evidence contracts, and the collection
// windows/indicators every packet is built from.

import {
  CandleSchema,
  IndicatorRequestSchema,
  IndicatorResultSchema,
  SymbolSchema,
  TickSchema,
  TimeframeSchema,
  type IndicatorRequest,
  type Timeframe,
} from '@kestrel/shared';
import { z } from 'zod';

import { GenericMacroExtensionSchema } from '../research-packet-macro';

export const RESEARCH_TIMEFRAMES: readonly { timeframe: Timeframe; count: number }[] = [
  { timeframe: '1d', count: 120 },
  { timeframe: '4h', count: 120 },
  { timeframe: '1h', count: 160 },
  { timeframe: '15m', count: 160 },
];

export const RESEARCH_INDICATORS: readonly IndicatorRequest[] = [
  { kind: 'ema', params: { period: 20 } },
  { kind: 'ema', params: { period: 50 } },
  { kind: 'rsi', params: { period: 14 } },
  { kind: 'macd', params: { fast: 12, slow: 26, signal: 9 } },
  { kind: 'atr', params: { period: 14 } },
];

export const EvidenceSchema = z.object({
  evidenceId: z.string().min(1),
  symbol: SymbolSchema,
  timeframe: TimeframeSchema,
  source: z.string().min(1),
  fetchedAt: z.iso.datetime(),
  dataAsOf: z.iso.datetime(),
  freshness: z.enum(['fresh', 'stale', 'unknown']),
  quality: z.enum(['complete', 'partial', 'degraded']),
  warnings: z.array(z.string()),
  candles: z.array(CandleSchema),
  indicators: z.array(IndicatorResultSchema),
});

export const MarketStructureSummarySchema = z.object({
  recentSwingHigh: z.number(),
  recentSwingLow: z.number(),
  rangeSize: z.number(),
});

export const XauusdExtensionSchema = z.object({
  evidenceId: z.string().min(1),
  dollarIndex: z.array(z.object({ asOf: z.string(), value: z.number() })).max(10),
  realYields: z.array(z.object({ asOf: z.string(), value: z.number() })).max(10),
  breakevenInflation: z.array(z.object({ asOf: z.string(), value: z.number() })).max(10),
  events: z
    .array(
      z.object({
        name: z.string().min(1),
        actual: z.number().nullable(),
        forecast: z.number().nullable(),
        previous: z.number().nullable(),
      }),
    )
    .max(10),
  newsCount: z.int().nonnegative(),
  newsHeadlines: z
    .array(
      z.object({
        title: z.string().min(1),
        source: z.string().optional(),
        publishedAt: z.string().optional(),
      }),
    )
    .max(8)
    .optional(),
  warnings: z.array(z.string()),
});

export const SymbolResearchPacketSchema = z.object({
  packetId: z.string().min(1),
  kind: z.literal('symbol_research_packet'),
  symbol: SymbolSchema,
  generatedAt: z.iso.datetime(),
  status: z.enum(['ready', 'blocked']),
  dataQuality: z.enum(['complete', 'partial', 'degraded']),
  price: z
    .object({
      evidenceId: z.string().min(1),
      symbol: SymbolSchema,
      source: z.string().min(1),
      fetchedAt: z.iso.datetime(),
      dataAsOf: z.iso.datetime(),
      freshness: z.enum(['fresh', 'stale', 'unknown']),
      quality: z.enum(['complete', 'partial', 'degraded']),
      warnings: z.array(z.string()),
      tick: TickSchema,
    })
    .nullable(),
  timeframes: z.array(EvidenceSchema),
  marketStructure: MarketStructureSummarySchema.optional(),
  xauusdExtension: XauusdExtensionSchema.optional(),
  /**
   * M-02 (audit 2026-10-18) — generic macro evidence (news, upcoming
   * calendar releases for the symbol's currencies, CFTC positioning where
   * supported) attached to non-XAUUSD packets when `ENABLE_GENERIC_MACRO`
   * is on. Gated by `optionalContext`; never set for XAUUSD (which keeps
   * `xauusdExtension`).
   */
  genericMacro: GenericMacroExtensionSchema.optional(),
  /**
   * Per-user enrichment contributed by installed plugins (e.g. open paper
   * positions for this symbol). Applied after the cache read, never cached.
   */
  pluginEnrichment: z.record(z.string(), z.unknown()).optional(),
  optionalContext: z.object({
    available: z.boolean(),
    reason: z.string().min(1),
  }),
  missingData: z.array(z.string()),
  warnings: z.array(z.string()),
});

export type SymbolResearchPacket = z.infer<typeof SymbolResearchPacketSchema>;
export type XauusdExtension = z.infer<typeof XauusdExtensionSchema>;
export type SymbolResearchEvidence = z.infer<typeof EvidenceSchema>;

export const SYMBOL_RESEARCH_TIMEFRAMES = RESEARCH_TIMEFRAMES;
export const SYMBOL_RESEARCH_INDICATORS = RESEARCH_INDICATORS;

export const SymbolResearchInputSchema = z.object({ symbol: SymbolSchema });
export const SymbolResearchIndicatorRequestSchema = IndicatorRequestSchema;
