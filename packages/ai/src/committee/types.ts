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
 * Committee workflow shared types and mode policy (Phase 6).
 *
 * The committee is a bounded multi-agent workflow: deterministic packet
 * collection, parallel read-only specialists, verification, then a single
 * synthesizer. Agents communicate only through these typed step outputs.
 * Q2 decision (docs/plans/decisions.log.md): exactly two modes exist —
 * `single` (one technical desk) and `full` (the 4-desk committee). Q3
 * decision: both are strict all-or-nothing.
 */

import type { Symbol } from '@kestrel/shared';
import type { AgentMemoryOption } from '@mastra/core/agent';
import { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';

import type { MastraGenerationStats } from '../mastra/stats';
import { SymbolResearchPacketSchema, type SymbolResearchPacket } from '../mastra/symbol-research';

export type MastraAnalysisMode = 'single' | 'full';
export type MastraSpecialistName = 'technical' | 'fundamental' | 'risk' | 'sentiment';

/** Committee step ids extend specialists with the orchestration stages. */
export type CommitteeAgentId = MastraSpecialistName | 'fusion';

export const MastraAnalysisModeSchema = z.enum(['single', 'full']);
export const MastraSpecialistNameSchema = z.enum(['technical', 'fundamental', 'risk', 'sentiment']);

/** Which specialists participate in each mode (single source of truth). */
export const SPECIALISTS_BY_MODE: Record<MastraAnalysisMode, readonly MastraSpecialistName[]> = {
  single: ['technical'],
  full: ['technical', 'fundamental', 'risk', 'sentiment'],
};

/**
 * Committee deadline for synchronous runs (audit plan §1.7). Leaves ~10s of
 * headroom under the chat route's 55s window so a deadline surfaces as an
 * explicit strict failure instead of an opaque route abort.
 */
export const COMMITTEE_DEADLINE_MS = 45_000;

/** One logical workflow stage, emitted as progress exactly once per run. */
export type CommitteeStepId =
  | MastraSpecialistName
  | 'collect-packet'
  | 'critique'
  | 'verify'
  | 'fusion';

/** Ordered progress stages for a mode (stable across runs and snapshots). */
export function committeeProgressStages(mode: MastraAnalysisMode): readonly CommitteeStepId[] {
  // Full mode runs one cross-critique round after the specialists (Q6 ON by
  // default); single is a one-desk read with nothing to critique.
  const critique: CommitteeStepId[] = mode === 'full' ? ['critique'] : [];
  return ['collect-packet', ...SPECIALISTS_BY_MODE[mode], ...critique, 'verify', 'fusion'];
}

export interface CommitteeModePolicy {
  readonly mode: MastraAnalysisMode;
  /**
   * Strict modes fail closed (Q3 decision): any specialist failure —
   * including a fusion-verifier failure or a deadline — is terminal and no
   * partial committee answer is returned to the user.
   */
  readonly strict: boolean;
  /** Participating specialists, in stable execution order. */
  readonly specialists: readonly MastraSpecialistName[];
  /** Q3: strict all-or-nothing for every mode; never continue on partial. */
  readonly continueOnPartialFailure: boolean;
}

export const MODE_POLICY: Record<MastraAnalysisMode, CommitteeModePolicy> = {
  single: {
    mode: 'single',
    strict: true,
    specialists: SPECIALISTS_BY_MODE.single,
    continueOnPartialFailure: false,
  },
  full: {
    mode: 'full',
    strict: true,
    specialists: SPECIALISTS_BY_MODE.full,
    continueOnPartialFailure: false,
  },
};

export function committeeModePolicy(mode: MastraAnalysisMode): CommitteeModePolicy {
  return MODE_POLICY[mode];
}

/** Committee failure (specialist, fusion, or deadline): terminal, no partial result. */
export class MastraModeStrictFailureError extends Error {
  readonly code = 'MASTRA_MODE_INCOMPLETE';
  readonly failedAgents: CommitteeAgentId[];

  constructor(failedAgents: CommitteeAgentId[], cause?: unknown, detail?: string) {
    super(
      [
        `Mastra analysis could not complete. Failed agents: ${failedAgents.join(', ')}.`,
        // Q3/§1.7: surfaces the retry guidance the user should see.
        detail ?? 'No partial answer was returned — please retry.',
      ].join(' '),
      { cause },
    );
    this.name = 'MastraModeStrictFailureError';
    this.failedAgents = failedAgents;
  }
}

export const REQUEST_CONTEXT_SCHEMA = z.object({
  userId: z.string().min(1),
  runId: z.string().min(1),
  threadId: z.string().min(1),
  symbol: z.string().min(1),
  packet: z.unknown().optional(),
  /** Typed committee opinions injected for the fusion call (§2.2). */
  opinions: z.unknown().optional(),
  /** Cross-critique records injected for the fusion call (§3.2). */
  critiques: z.unknown().optional(),
});

export type ModeRequestContext = z.infer<typeof REQUEST_CONTEXT_SCHEMA>;

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
  bias: z.enum(['bullish', 'bearish', 'neutral']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
  rawData: z.record(z.unknown()),
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

/** Deterministic evidence packet collector injected into the workflow. */
export type CollectPacketFn = (
  symbol: Symbol,
  signal?: AbortSignal,
) => Promise<SymbolResearchPacket>;

/** Typed output of the collect-packet stage. */
export const CollectPacketOutputSchema = z.object({
  packet: SymbolResearchPacketSchema,
  prompt: z.string().min(1),
  mode: MastraAnalysisModeSchema,
});
export type CollectPacketOutput = z.infer<typeof CollectPacketOutputSchema>;

/** Rebuild the per-run request context with the packet (and opinions) present. */
export function contextWithPacket(
  base: RequestContext<ModeRequestContext>,
  packet: SymbolResearchPacket,
  opinions?: MastraModeOpinion[],
  critiques?: CommitteeCritique[],
): RequestContext<ModeRequestContext> {
  const entries: [string, unknown][] = [
    ['userId', base.get('userId') as string],
    ['runId', base.get('runId') as string],
    ['threadId', base.get('threadId') as string],
    ['symbol', packet.symbol],
    ['packet', packet],
  ];
  if (opinions) entries.push(['opinions', opinions]);
  if (critiques) entries.push(['critiques', critiques]);
  return new RequestContext<ModeRequestContext>(entries as never);
}

/**
 * Specialists read thread context but must not write their internal opinions
 * into the conversation thread; only the fusion/output layer writes
 * user-visible assistant messages. This is applied by default to every
 * specialist call regardless of what the caller passes.
 */
export function readOnlyMemoryOptions(callOptions: AgentMemoryOption): AgentMemoryOption {
  return { ...callOptions, options: { ...callOptions.options, readOnly: true } };
}
