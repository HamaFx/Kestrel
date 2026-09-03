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
 * Quick/Standard/Full all use this one committee; the only differences are
 * the specialist set, limits, and strictness (see `MODE_POLICY`).
 */

import type { Symbol } from '@kestrel/shared';
import type { AgentMemoryOption } from '@mastra/core/agent';
import { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';

import type { MastraGenerationStats } from '../mastra/stats';
import { SymbolResearchPacketSchema, type SymbolResearchPacket } from '../mastra/symbol-research';

export type MastraAnalysisMode = 'single' | 'quick' | 'standard' | 'full';
export type MastraSpecialistName = 'technical' | 'fundamental' | 'risk' | 'sentiment';

export const MastraAnalysisModeSchema = z.enum(['single', 'quick', 'standard', 'full']);
export const MastraSpecialistNameSchema = z.enum(['technical', 'fundamental', 'risk', 'sentiment']);

/** Which specialists participate in each mode (single source of truth). */
export const SPECIALISTS_BY_MODE: Record<MastraAnalysisMode, readonly MastraSpecialistName[]> = {
  single: ['technical'],
  quick: ['technical'],
  standard: ['technical', 'fundamental'],
  full: ['technical', 'fundamental', 'risk', 'sentiment'],
};

/** One logical workflow stage, emitted as progress exactly once per run. */
export type CommitteeStepId = MastraSpecialistName | 'collect-packet' | 'verify' | 'fusion';

/** Ordered progress stages for a mode (stable across runs and snapshots). */
export function committeeProgressStages(mode: MastraAnalysisMode): readonly CommitteeStepId[] {
  return ['collect-packet', ...SPECIALISTS_BY_MODE[mode], 'verify', 'fusion'];
}

export interface CommitteeModePolicy {
  readonly mode: MastraAnalysisMode;
  /**
   * Strict modes (Full) fail closed: any required specialist failure is
   * terminal and no partial committee answer is returned to the user.
   */
  readonly strict: boolean;
  /** Participating specialists, in stable execution order. */
  readonly specialists: readonly MastraSpecialistName[];
  /**
   * Partial-mode continuation (approved product decision): non-strict modes
   * (single, Quick, Standard) may continue when a participating specialist
   * fails — e.g. Standard continues on fundamental failure — and the workflow
   * returns the remaining opinions with the failed agents listed. Full mode
   * is all-or-nothing and never continues.
   */
  readonly continueOnPartialFailure: boolean;
}

export const MODE_POLICY: Record<MastraAnalysisMode, CommitteeModePolicy> = {
  single: {
    mode: 'single',
    strict: false,
    specialists: SPECIALISTS_BY_MODE.single,
    continueOnPartialFailure: true,
  },
  quick: {
    mode: 'quick',
    strict: false,
    specialists: SPECIALISTS_BY_MODE.quick,
    continueOnPartialFailure: true,
  },
  standard: {
    mode: 'standard',
    strict: false,
    specialists: SPECIALISTS_BY_MODE.standard,
    continueOnPartialFailure: true,
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

/** Full-mode committee failure: terminal, no partial result (strict contract). */
export class MastraModeStrictFailureError extends Error {
  readonly code = 'MASTRA_MODE_INCOMPLETE';
  readonly failedAgents: MastraSpecialistName[];

  constructor(failedAgents: MastraSpecialistName[], cause?: unknown) {
    super(`Mastra Full mode could not complete. Failed agents: ${failedAgents.join(', ')}.`, {
      cause,
    });
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
});

export type ModeRequestContext = z.infer<typeof REQUEST_CONTEXT_SCHEMA>;

/** Structured specialist output schema (the only LLM opinion shape). */
export const OpinionSchema = z.object({
  bias: z.enum(['bullish', 'bearish', 'neutral']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
  details: z.record(z.unknown()).default({}),
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

/** Rebuild the per-run request context with the packet present. */
export function contextWithPacket(
  base: RequestContext<ModeRequestContext>,
  packet: SymbolResearchPacket,
): RequestContext<ModeRequestContext> {
  return new RequestContext<ModeRequestContext>([
    ['userId', base.get('userId') as string],
    ['runId', base.get('runId') as string],
    ['threadId', base.get('threadId') as string],
    ['symbol', packet.symbol],
    ['packet', packet],
  ]);
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
