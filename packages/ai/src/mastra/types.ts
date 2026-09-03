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

import {
  CandleSchema,
  EconomicEventSchema,
  IndicatorResultSchema,
  NewsArticleSchema,
  SymbolSchema,
  TickSchema,
  TimeframeSchema,
} from '@kestrel/shared';
import { z } from 'zod';

import { EvidenceProvenanceSchema, EvidenceTrustSchema } from './evidence-types';

export const XAUUSD = 'XAUUSD' as const;

export const XauusdRequestContextSchema = z.object({
  userId: z.string().min(1),
  runId: z.string().min(1),
  /** Optional for direct tool tests; production runs provide the chat thread. */
  threadId: z.string().min(1).optional(),
  /** Trusted server-created packet supplied to the synthesis model. */
  researchPacket: z.unknown().optional(),
  /** Optional prior verified report used only to explain a follow-up. */
  priorReport: z.unknown().optional(),
  /** User-scoped historical context; never current market evidence. */
  memoryContext: z.string().optional(),
});

export type XauusdRequestContext = z.infer<typeof XauusdRequestContextSchema>;

export { EvidenceFreshnessSchema, EvidenceQualitySchema } from './evidence-types';
export type {
  EvidenceFreshness,
  EvidenceProvenance,
  EvidenceQuality,
  EvidenceTrust,
  ModelGeneratedEvidence,
  SynthesisEvidence,
  TrustedDeterministicEvidence,
  UntrustedExternalEvidence,
  UserMemoryEvidence,
} from './evidence-types';
export {
  EvidenceProvenanceSchema,
  EvidenceTrustSchema,
  ModelGeneratedEvidenceSchema,
  SynthesisEvidenceSchema,
  TrustedDeterministicEvidenceSchema,
  UntrustedExternalEvidenceSchema,
  UserMemoryEvidenceSchema,
} from './evidence-types';

export const EvidenceMetadataSchema = EvidenceProvenanceSchema.extend({
  evidenceId: z.string().min(1),
  symbol: SymbolSchema,
  timeframe: TimeframeSchema.optional(),
  trust: EvidenceTrustSchema.optional(),
});

export type EvidenceMetadata = z.infer<typeof EvidenceMetadataSchema>;

export const XauusdPriceEvidenceSchema = EvidenceMetadataSchema.extend({
  kind: z.literal('price'),
  symbol: z.literal(XAUUSD),
  data: z.object({
    tick: TickSchema,
    stale: z.boolean(),
    ageMs: z.number().nullable(),
  }),
});

export const XauusdCandlesEvidenceSchema = EvidenceMetadataSchema.extend({
  kind: z.literal('candles'),
  symbol: z.literal(XAUUSD),
  timeframe: TimeframeSchema,
  data: z.object({
    candles: z.array(CandleSchema),
    stale: z.boolean(),
    count: z.number().int().nonnegative(),
  }),
});

export const XauusdIndicatorsEvidenceSchema = EvidenceMetadataSchema.extend({
  kind: z.literal('indicators'),
  symbol: z.literal(XAUUSD),
  timeframe: TimeframeSchema,
  data: z.object({
    results: z.array(IndicatorResultSchema),
    candleCount: z.number().int().nonnegative(),
    stale: z.boolean(),
  }),
});

export const XauusdMacroEvidenceSchema = EvidenceMetadataSchema.extend({
  kind: z.literal('macro'),
  symbol: z.literal(XAUUSD),
  data: z.object({
    news: z.array(NewsArticleSchema),
    events: z.array(EconomicEventSchema),
    dollarIndex: z.array(z.object({ date: z.string(), value: z.number() })),
    realYields: z.array(z.object({ date: z.string(), value: z.number() })),
    breakevenInflation: z.array(z.object({ date: z.string(), value: z.number() })),
  }),
});

export type XauusdPriceEvidence = z.infer<typeof XauusdPriceEvidenceSchema>;
export type XauusdCandlesEvidence = z.infer<typeof XauusdCandlesEvidenceSchema>;
export type XauusdIndicatorsEvidence = z.infer<typeof XauusdIndicatorsEvidenceSchema>;
export type XauusdMacroEvidence = z.infer<typeof XauusdMacroEvidenceSchema>;
