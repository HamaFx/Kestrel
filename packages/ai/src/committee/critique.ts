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
 * Cross-critique round (audit plan §3.2, Q6 decision: ON by default for
 * `full`). After the parallel specialists, each desk reads the *other*
 * desks' {bias, confidence, reasoning} — never raw packet data — and returns
 * a structured critique: does it confirm its own view, a revised confidence,
 * and a short disagreement summary. Each desk's own opinion is restated in
 * the critique prompt (§1.7) so confirming its own view is answerable.
 * Fusion then receives both opinions and critiques so it can surface the
 * committee's splits instead of silently picking a side.
 *
 * All calls use top-tier models (Q1: quality always, never a cheaper tier).
 * Failures become explicit markers so the strict verify step (Q3) fails the
 * whole committee instead of returning a partial answer.
 */

import type { AgentMemoryOption } from '@mastra/core/agent';
import type { MastraScorers } from '@mastra/core/evals';
import type { MastraMemory } from '@mastra/core/memory';
import type { InputProcessorOrWorkflow } from '@mastra/core/processors';
import type { RequestContext } from '@mastra/core/request-context';
import type { LanguageModel } from 'ai';
import { z } from 'zod';

import { estimateCostUsd } from '../cost';
import { classifyStreamError } from '../fallback';
import type { GenerationLedger } from '../generation-ledger';
import type { SymbolResearchPacket } from '../mastra-v2/packets/symbol-research';
import { getMastraGenerationStats } from '../mastra-v2/shared/telemetry';
import { critiqueInstructionsForRequest, debateRevisionInstructionsForRequest } from './prompts';
import { createCommitteeAgent, SPECIALIST_DEFINITIONS } from './specialists';
import { verifyMastraOpinion } from './verifier';
import {
  CommitteeCritiqueSchema,
  contextWithPacket,
  CritiqueSchema,
  MastraModeOpinionSchema,
  OpinionSchema,
  readOnlyMemoryOptions,
  type CommitteeAgentId,
  type CommitteeCritique,
  type MastraModeOpinion,
  type MastraSpecialistName,
  type ModeRequestContext,
} from './types';

/** Typed output of the critique step (mirrors the specialist marker shape). */
export const CritiqueStepResultSchema = z.object({
  ok: z.boolean(),
  agentName: z.string().optional(),
  critique: CommitteeCritiqueSchema.optional(),
  error: z.string().optional(),
  latencyMs: z.number().optional(),
});
export type CritiqueStepResult = z.infer<typeof CritiqueStepResultSchema>;

export const CritiqueStepOutputSchema = z.object({
  critiques: z.array(CommitteeCritiqueSchema),
  failedAgents: z.array(z.string()),
});
export type CritiqueStepOutput = z.infer<typeof CritiqueStepOutputSchema>;

export interface CritiqueRunnerDeps {
  model: LanguageModel;
  modelId: string;
  providerId: string;
  /** §3.1: optional per-agent top-tier model resolution. */
  resolveModelForAgent?: (agent: CommitteeAgentId) => {
    model: LanguageModel;
    modelId: string;
    providerId: string;
  } | null;
  memory: MastraMemory;
  specialistCallOptions: AgentMemoryOption;
  inputProcessors?: Array<InputProcessorOrWorkflow>;
  scorers?: MastraScorers;
  ledger: GenerationLedger;
  maxSteps: number;
}

export interface RunCritiqueGenerationArgs {
  name: MastraSpecialistName;
  prompt: string;
  packet: SymbolResearchPacket;
  /** The desk's own verified opinion, restated in the prompt (§1.7 P1-1). */
  ownOpinion: MastraModeOpinion;
  /** The other desks' verified opinions (never raw packet data). */
  peerOpinions: MastraModeOpinion[];
  requestContext: RequestContext<ModeRequestContext>;
  signal?: AbortSignal;
  startedAt: number;
  deps: CritiqueRunnerDeps;
}

export async function runCritiqueGeneration(
  args: RunCritiqueGenerationArgs,
): Promise<CritiqueStepResult> {
  const { name, prompt, packet, ownOpinion, peerOpinions, requestContext, signal, startedAt, deps } =
    args;
  const agentModel =
    deps.resolveModelForAgent?.(name) ?? {
      model: deps.model,
      modelId: deps.modelId,
      providerId: deps.providerId,
    };
  try {
    const agent = createCommitteeAgent(
      agentModel.model,
      `${SPECIALIST_DEFINITIONS[name].agentId}-critique`,
      (ctx: { requestContext: RequestContext<ModeRequestContext> }) =>
        critiqueInstructionsForRequest({
          name,
          ownOpinion,
          peerOpinions,
          requestContext: ctx.requestContext,
        }),
      deps.memory,
      deps.inputProcessors,
      deps.scorers,
    );
    const result = await agent.generate(prompt, {
      requestContext: contextWithPacket(requestContext, packet),
      memory: readOnlyMemoryOptions(deps.specialistCallOptions),
      toolChoice: 'none',
      maxSteps: deps.maxSteps,
      structuredOutput: {
        schema: CritiqueSchema,
        jsonPromptInjection: 'auto',
        instructions:
          'Return a complete critique object referencing the peer desks by name and your own desk by name.',
      },
      ...(signal ? { abortSignal: signal } : {}),
    });
    const stats = getMastraGenerationStats(result);
    const critique = CritiqueSchema.parse(result.object);
    const costUsd = estimateCostUsd(agentModel.modelId, stats.inputTokens, stats.outputTokens);
    deps.ledger.recordCost(`critique:${name}`, 'specialist', costUsd);
    return {
      ok: true,
      agentName: name,
      critique: {
        agentName: name,
        confirms: critique.confirms,
        revisedConfidence: critique.revisedConfidence,
        critique: critique.critique,
        model: agentModel.modelId,
        providerId: agentModel.providerId,
        inputTokens: stats.inputTokens,
        outputTokens: stats.outputTokens,
        costUsd,
        latencyMs: Date.now() - startedAt,
      },
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    if (
      signal?.aborted === true ||
      (error instanceof Error && error.name === 'AbortError') ||
      isTransientProviderError(error)
    ) {
      throw error;
    }
    return {
      ok: false,
      agentName: name,
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - startedAt,
    };
  }
}

function isTransientProviderError(error: unknown): boolean {
  const { reason } = classifyStreamError(error);
  return (
    reason === 'rate-limit' || reason === 'upstream' || reason === 'timeout' || reason === 'unknown'
  );
}

/**
 * Optional bounded debate round (audit plan §3.3, flag
 * `ENABLE_COMMITTEE_DEBATE`, Full mode only). Each desk reads its own initial
 * opinion plus every peer critique and returns one FINAL structured opinion —
 * revised or reaffirmed. The revision is verified with the same deterministic
 * opinion gate as the first round, so a hallucinating revision fails the
 * desk and (Q3) the whole committee instead of reaching fusion.
 */
export const DebateStepResultSchema = z.object({
  ok: z.boolean(),
  agentName: z.string().optional(),
  opinion: MastraModeOpinionSchema.optional(),
  error: z.string().optional(),
  latencyMs: z.number().optional(),
});
export type DebateStepResult = z.infer<typeof DebateStepResultSchema>;

export const DebateStepOutputSchema = z.object({
  revisions: z.array(MastraModeOpinionSchema),
  failedAgents: z.array(z.string()),
});
export type DebateStepOutput = z.infer<typeof DebateStepOutputSchema>;

export interface RunDebateRevisionArgs {
  name: MastraSpecialistName;
  prompt: string;
  packet: SymbolResearchPacket;
  /** The desk's own verified first-round opinion. */
  ownOpinion: MastraModeOpinion;
  /** Every critique from the cross-critique round (own + peers). */
  critiques: CommitteeCritique[];
  requestContext: RequestContext<ModeRequestContext>;
  signal?: AbortSignal;
  startedAt: number;
  deps: CritiqueRunnerDeps;
}

export async function runDebateRevision(
  args: RunDebateRevisionArgs,
): Promise<DebateStepResult> {
  const { name, prompt, packet, ownOpinion, critiques, requestContext, signal, startedAt, deps } =
    args;
  const agentModel =
    deps.resolveModelForAgent?.(name) ?? {
      model: deps.model,
      modelId: deps.modelId,
      providerId: deps.providerId,
    };
  const latencyMs = Date.now() - startedAt;
  try {
    const agent = createCommitteeAgent(
      agentModel.model,
      `${SPECIALIST_DEFINITIONS[name].agentId}-debate`,
      (ctx: { requestContext: RequestContext<ModeRequestContext> }) =>
        debateRevisionInstructionsForRequest({
          name,
          ownOpinion,
          critiques,
          requestContext: ctx.requestContext,
        }),
      deps.memory,
      deps.inputProcessors,
      deps.scorers,
    );
    const result = await agent.generate(prompt, {
      requestContext: contextWithPacket(requestContext, packet),
      memory: readOnlyMemoryOptions(deps.specialistCallOptions),
      toolChoice: 'none',
      maxSteps: deps.maxSteps,
      structuredOutput: {
        schema: OpinionSchema,
        jsonPromptInjection: 'auto',
        instructions:
          'Return your final complete opinion object (bias, confidence, reasoning, details) for the debate round.',
      },
      ...(signal ? { abortSignal: signal } : {}),
    });
    const stats = getMastraGenerationStats(result);
    const revised = OpinionSchema.parse(result.object);
    const opinion: MastraModeOpinion = {
      agentName: name,
      bias: revised.bias,
      confidence: revised.confidence,
      reasoning: revised.reasoning,
      rawData: revised.details ?? {},
      model: agentModel.modelId,
      providerId: agentModel.providerId,
      inputTokens: stats.inputTokens,
      outputTokens: stats.outputTokens,
      costUsd: estimateCostUsd(agentModel.modelId, stats.inputTokens, stats.outputTokens),
      latencyMs: Date.now() - startedAt,
    };
    // Same deterministic gate as the first round: an ungrounded revision is a
    // failed desk, never a silently-degraded opinion (Q3).
    const verification = verifyMastraOpinion(opinion, packet);
    if (!verification.ok) {
      deps.ledger.recordCost(
        `debate:${name}`,
        'specialist',
        estimateCostUsd(agentModel.modelId, stats.inputTokens, stats.outputTokens),
      );
      return {
        ok: false,
        agentName: name,
        error: `revision failed verification: ${verification.findings.join('; ')}`,
        latencyMs: Date.now() - startedAt,
      };
    }
    deps.ledger.recordCost(`debate:${name}`, 'specialist', opinion.costUsd);
    return { ok: true, agentName: name, opinion, latencyMs: Date.now() - startedAt };
  } catch (error) {
    if (
      signal?.aborted === true ||
      (error instanceof Error && error.name === 'AbortError') ||
      isTransientProviderError(error)
    ) {
      throw error;
    }
    return {
      ok: false,
      agentName: name,
      error: error instanceof Error ? error.message : String(error),
      latencyMs,
    };
  }
}

/** Read the debate step output through its typed schema. */
export function readDebateStepResult(
  getStepResult: (stepId: string) => unknown,
): DebateStepOutput | undefined {
  const raw = getStepResult('debate');
  if (raw === undefined) return undefined;
  const parsed = DebateStepOutputSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/** Read the critique step output through its typed schema. */
export function readCritiqueStepResult(
  getStepResult: (stepId: string) => unknown,
): CritiqueStepOutput | undefined {
  const raw = getStepResult('critique');
  if (raw === undefined) return undefined;
  const parsed = CritiqueStepOutputSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}
