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

import { z } from 'zod';

/** The trust boundary for data entering an agent or workflow. */
export const EvidenceTrustSchema = z.enum([
  'trusted-deterministic',
  'user-memory',
  'untrusted-external',
  'model-generated',
  'mixed',
]);
export type EvidenceTrust = z.infer<typeof EvidenceTrustSchema>;

export const EvidenceFreshnessSchema = z.enum(['fresh', 'stale', 'unknown']);
export type EvidenceFreshness = z.infer<typeof EvidenceFreshnessSchema>;

export const EvidenceQualitySchema = z.enum(['complete', 'partial', 'degraded']);
export type EvidenceQuality = z.infer<typeof EvidenceQualitySchema>;

/** Shared provenance required for every evidence item passed across agent boundaries. */
export const EvidenceProvenanceSchema = z.object({
  source: z.string().min(1),
  fetchedAt: z.string().datetime(),
  dataAsOf: z.string().datetime(),
  freshness: EvidenceFreshnessSchema,
  quality: EvidenceQualitySchema,
  warnings: z.array(z.string()),
});
export type EvidenceProvenance = z.infer<typeof EvidenceProvenanceSchema>;

export const TrustedDeterministicEvidenceSchema = EvidenceProvenanceSchema.extend({
  trust: z.literal('trusted-deterministic'),
});
export type TrustedDeterministicEvidence = z.infer<typeof TrustedDeterministicEvidenceSchema>;

export const UserMemoryEvidenceSchema = z.object({
  trust: z.literal('user-memory'),
  memoryId: z.string().min(1),
  text: z.string().max(8_000),
  createdAt: z.string().datetime().optional(),
});
export type UserMemoryEvidence = z.infer<typeof UserMemoryEvidenceSchema>;

export const UntrustedExternalEvidenceSchema = EvidenceProvenanceSchema.extend({
  evidenceId: z.string().min(1),
  trust: z.literal('untrusted-external'),
  provenance: z.object({
    url: z.string().url().optional(),
    publisher: z.string().min(1).optional(),
    provider: z.string().min(1).optional(),
  }),
  content: z.string().max(8_000),
  containsInstructionLikeText: z.boolean(),
});
export type UntrustedExternalEvidence = z.infer<typeof UntrustedExternalEvidenceSchema>;

/**
 * Claims produced by a model (specialist, fusion, or report output). These are
 * derived outputs, not raw inputs: callers may persist or cite them, but they
 * must never re-enter synthesis context as if they were trusted evidence.
 */
export const ModelGeneratedEvidenceSchema = z.object({
  trust: z.literal('model-generated'),
  claimId: z.string().min(1),
  claim: z.string().min(1).max(8_000),
  sourceEvidenceIds: z.array(z.string()).max(50).default([]),
  generatedAt: z.string().datetime(),
});
export type ModelGeneratedEvidence = z.infer<typeof ModelGeneratedEvidenceSchema>;

/**
 * Explicit conversion marker used before untrusted data enters synthesis
 * context. Model-generated claims are intentionally excluded: they are
 * outputs that must not be fed back as evidence.
 */
export const SynthesisEvidenceSchema = z.discriminatedUnion('trust', [
  TrustedDeterministicEvidenceSchema,
  UserMemoryEvidenceSchema,
  UntrustedExternalEvidenceSchema,
]);
export type SynthesisEvidence = z.infer<typeof SynthesisEvidenceSchema>;
