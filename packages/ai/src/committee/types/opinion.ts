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

// SPDX-License-Identifier: Apache-2.0

/**
 * Committee opinion, critique, and generation-metadata types: the shapes the
 * specialists return, the cross-critique records, and the standardized model
 * metadata every generation carries into fusion and snapshots.
 */

import { z } from 'zod';

import type { MastraGenerationStats } from '../../mastra-v2/shared/stats';
import { MastraSpecialistNameSchema, type MastraSpecialistName } from './mode';

/** Structured specialist output schema (the only LLM opinion shape). */
export const OpinionSchema = z.object({
  bias: z.enum(['bullish', 'bearish', 'neutral']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
  /**
   * Audit plan §4.4 — typed detail envelope so fusion and verifiers can
   * attribute claims (key levels, assumptions, evidence gaps). `catchall`
   * keeps arbitrary legacy/provider-specific keys valid.
   */
  details: z
    .object({
      keyLevels: z
        .array(
          z.object({
            price: z.number(),
            kind: z.enum(['support', 'resistance', 'trigger', 'invalidation']),
            evidenceId: z.string().optional(),
          }),
        )
        .optional(),
      assumptions: z.array(z.string()).optional(),
      missingEvidence: z.array(z.string()).optional(),
    })
    .catchall(z.unknown())
    .default({}),
});

/**
 * Audit plan §3.2 (Q6: ON by default for full) — one cross-critique round.
 * Each specialist reviews the other desks' {bias, confidence, reasoning} and
 * returns whether it confirms its own view, a revised confidence, and a short
 * critique capturing agreement/disagreement.
 */
export const CritiqueSchema = z.object({
  confirms: z.boolean(),
  revisedConfidence: z.number().min(0).max(1),
  critique: z.string().min(1),
});

/** Full critique record the workflow emits so fusion and snapshots can use it. */
export interface CommitteeCritique {
  agentName: MastraSpecialistName;
  confirms: boolean;
  revisedConfidence: number;
  critique: string;
  model: string;
  providerId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
}

export const CommitteeCritiqueSchema = z.object({
  agentName: MastraSpecialistNameSchema,
  confirms: z.boolean(),
  revisedConfidence: z.number().min(0).max(1),
  critique: z.string().min(1),
  model: z.string(),
  providerId: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  costUsd: z.number(),
  latencyMs: z.number(),
});

/** Full opinion shape the workflow emits so callers can persist metadata. */
export interface MastraModeOpinion {
  agentName: MastraSpecialistName;
  /** A-01: symbol the opinion is about (present for comparison runs). */
  symbol?: string | undefined;
  bias: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  reasoning: string;
  rawData: Record<string, unknown>;
  model: string;
  providerId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
}

export const MastraModeOpinionSchema = z.object({
  agentName: MastraSpecialistNameSchema,
  symbol: z.string().min(1).optional(),
  bias: z.enum(['bullish', 'bearish', 'neutral']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
  rawData: z.record(z.string(), z.unknown()),
  model: z.string(),
  providerId: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  costUsd: z.number(),
  latencyMs: z.number(),
});

export const StatsSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  toolCalls: z.number(),
  steps: z.number(),
});

export const zeroStats = (): MastraGenerationStats => ({
  inputTokens: 0,
  outputTokens: 0,
  toolCalls: 0,
  steps: 0,
});

/** Standardized model metadata every committee generation carries. */
export interface CommitteeModelMetadata {
  model: string;
  providerId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
}

/**
 * One metadata builder for every committee generation so specialist and
 * fusion opinions always carry the same model/provider/token fields from
 * the same resolved snapshot.
 */
export function committeeModelMetadata(
  modelId: string,
  providerId: string,
  stats: MastraGenerationStats,
  costUsd: number,
  latencyMs: number,
): CommitteeModelMetadata {
  return {
    model: modelId,
    providerId,
    inputTokens: stats.inputTokens,
    outputTokens: stats.outputTokens,
    costUsd,
    latencyMs,
  };
}
