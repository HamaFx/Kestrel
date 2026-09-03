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
 * Reusable specialist runner (Phase 6). One bounded, read-only model call
 * that produces a typed specialist step result. Transient provider errors
 * throw so the workflow retries the step; permanent errors and verification
 * failures return an explicit failure marker so non-strict modes can
 * continue (partial mode) and Full mode can fail closed in the verify step.
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
import { specialistInstructions } from './prompts';
import { createCommitteeAgent, SPECIALIST_DEFINITIONS } from './specialists';
import {
  CollectPacketOutputSchema,
  committeeModelMetadata,
  contextWithPacket,
  MastraSpecialistNameSchema,
  OpinionSchema,
  readOnlyMemoryOptions,
  StatsSchema,
  type CollectPacketOutput,
  type MastraModeOpinion,
  type MastraSpecialistName,
  type ModeRequestContext,
} from './types';
import { verifyMastraOpinion } from './verifier';

/** Typed output of one specialist step (replaces broad `unknown` casts). */
export const SpecialistStepResultSchema = z.object({
  ok: z.boolean(),
  agentName: MastraSpecialistNameSchema.optional(),
  opinion: OpinionSchema.optional(),
  stats: StatsSchema.optional(),
  model: z.string().optional(),
  providerId: z.string().optional(),
  costUsd: z.number().optional(),
  latencyMs: z.number().optional(),
  error: z.string().optional(),
});
export type SpecialistStepResult = z.infer<typeof SpecialistStepResultSchema>;

export interface SpecialistRunnerDeps {
  model: LanguageModel;
  modelId: string;
  providerId: string;
  memory: MastraMemory;
  /** Read thread context; read-only is enforced by default inside the runner. */
  specialistCallOptions: AgentMemoryOption;
  inputProcessors?: Array<InputProcessorOrWorkflow>;
  researchInputProcessors?: Array<InputProcessorOrWorkflow>;
  scorers?: MastraScorers;
  ledger: GenerationLedger;
  /** Bounded single-step limit for the specialist LLM call. */
  maxSteps: number;
}

export interface RunSpecialistGenerationArgs {
  name: MastraSpecialistName;
  prompt: string;
  packet: SymbolResearchPacket;
  requestContext: RequestContext<ModeRequestContext>;
  signal?: AbortSignal;
  /** Step start time; reused so failure markers report the full step latency. */
  startedAt: number;
  deps: SpecialistRunnerDeps;
}

export async function runSpecialistGeneration(
  args: RunSpecialistGenerationArgs,
): Promise<SpecialistStepResult> {
  const { name, prompt, packet, requestContext, signal, startedAt, deps } = args;
  try {
    const agent = createCommitteeAgent(
      deps.model,
      SPECIALIST_DEFINITIONS[name].agentId,
      specialistInstructions(name, packet),
      deps.memory,
      deps.researchInputProcessors ?? deps.inputProcessors,
      deps.scorers,
    );
    const result = await agent.generate(prompt, {
      requestContext: contextWithPacket(requestContext, packet),
      // Specialists never persist their internal opinions; the fusion/output
      // layer owns user-visible assistant writes (Phase 6).
      memory: readOnlyMemoryOptions(deps.specialistCallOptions),
      toolChoice: 'none',
      maxSteps: deps.maxSteps,
      structuredOutput: {
        schema: OpinionSchema,
        jsonPromptInjection: 'auto',
        instructions:
          'Return a complete opinion object. Keep numeric claims tied to packet evidence and mention packet quality when it is not complete.',
      },
      ...(signal ? { abortSignal: signal } : {}),
    });
    const stats = getMastraGenerationStats(result);
    const opinion = OpinionSchema.parse(result.object);
    const candidateOpinion: MastraModeOpinion = {
      agentName: name,
      bias: opinion.bias,
      confidence: opinion.confidence,
      reasoning: opinion.reasoning,
      rawData: opinion.details,
      ...committeeModelMetadata(deps.modelId, deps.providerId, stats, 0, Date.now() - startedAt),
    };
    const opinionVerification = verifyMastraOpinion(candidateOpinion, packet);
    if (!opinionVerification.ok) {
      return {
        ok: false,
        agentName: name,
        error: `Opinion verification failed: ${opinionVerification.findings.join('; ')}`,
        latencyMs: Date.now() - startedAt,
      };
    }
    const costUsd = estimateCostUsd(deps.modelId, stats.inputTokens, stats.outputTokens);
    deps.ledger.recordCost(`specialist:${name}`, 'specialist', costUsd);
    return {
      ok: true,
      agentName: name,
      opinion,
      stats,
      model: deps.modelId,
      providerId: deps.providerId,
      costUsd,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    if (isAbort(error, signal)) throw error;
    if (isTransientProviderError(error)) throw error;
    return {
      ok: false,
      agentName: name,
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - startedAt,
    };
  }
}

/**
 * Read one specialist step result through the typed schema. Inside a step,
 * `getStepResult` returns the raw step output; this helper is the single
 * schema-validated cast at the workflow boundary.
 */
export function readSpecialistStepResult(
  getStepResult: (stepId: string) => unknown,
  name: MastraSpecialistName,
): SpecialistStepResult | undefined {
  return readStepResult(getStepResult, name, SpecialistStepResultSchema);
}

/** Read the collect-packet stage output through its typed schema. */
export function readCollectPacketResult(
  getStepResult: (stepId: string) => unknown,
): CollectPacketOutput | undefined {
  return readStepResult(getStepResult, 'collect-packet', CollectPacketOutputSchema);
}

function readStepResult<T>(
  getStepResult: (stepId: string) => unknown,
  stepId: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): T | undefined {
  const raw = getStepResult(stepId);
  if (raw === undefined) return undefined;
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

function isTransientProviderError(error: unknown): boolean {
  const { reason } = classifyStreamError(error);
  return (
    reason === 'rate-limit' || reason === 'upstream' || reason === 'timeout' || reason === 'unknown'
  );
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return (
    signal?.aborted === true ||
    (error instanceof Error && error.name === 'AbortError') ||
    (typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      error.name === 'AbortError')
  );
}
