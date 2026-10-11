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
 * and a short disagreement summary. Fusion then receives both opinions and
 * critiques so it can surface the committee's splits instead of silently
 * picking a side.
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
import type { SymbolResearchPacket } from '../mastra/symbol-research';
import { getMastraGenerationStats } from '../mastra/telemetry';
import { critiqueInstructionsForRequest } from './prompts';
import { createCommitteeAgent, SPECIALIST_DEFINITIONS } from './specialists';
import {
  CommitteeCritiqueSchema,
  contextWithPacket,
  CritiqueSchema,
  readOnlyMemoryOptions,
  type CommitteeAgentId,
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
  const { name, prompt, packet, peerOpinions, requestContext, signal, startedAt, deps } = args;
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
        critiqueInstructionsForRequest({ name, peerOpinions, requestContext: ctx.requestContext }),
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

/** Read the critique step output through its typed schema. */
export function readCritiqueStepResult(
  getStepResult: (stepId: string) => unknown,
): CritiqueStepOutput | undefined {
  const raw = getStepResult('critique');
  if (raw === undefined) return undefined;
  const parsed = CritiqueStepOutputSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}
