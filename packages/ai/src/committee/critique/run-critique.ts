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

// Cross-critique runner (DEC-05 split from critique.ts).
//
// After the parallel specialists, each desk reads the *other* desks'
// {bias, confidence, reasoning} — never raw packet data — and returns a
// structured critique: does it confirm its own view, a revised confidence,
// and a short disagreement summary. Each desk's own opinion is restated in
// the critique prompt (§1.7).
//
// All calls use top-tier models (Q1: quality always, never a cheaper tier).
// Failures become explicit markers so the strict verify step (Q3) fails the
// whole committee instead of returning a partial answer.

import type { RequestContext } from '@mastra/core/request-context';

import { estimateCostUsd } from '../../budget/cost';
import { getMastraGenerationStats } from '../../mastra-v2/shared/telemetry';
import { critiqueInstructionsForRequest } from '../prompts';
import { createCommitteeAgent, SPECIALIST_DEFINITIONS } from '../specialists';
import { jsonPromptInjectionForModel } from '../structured-output';
import {
  contextWithPacket,
  CritiqueSchema,
  readOnlyMemoryOptions,
  type ModeRequestContext,
} from '../types';
import { isTransientProviderError } from './errors';
import type { CritiqueStepResult } from './schemas';
import type { RunCritiqueGenerationArgs } from './types';

export async function runCritiqueGeneration(
  args: RunCritiqueGenerationArgs,
): Promise<CritiqueStepResult> {
  const {
    name,
    prompt,
    packet,
    ownOpinion,
    peerOpinions,
    requestContext,
    signal,
    startedAt,
    deps,
  } = args;
  const agentModel = deps.resolveModelForAgent?.(name) ?? {
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
      ...(deps.specialistCallOptions
        ? { memory: readOnlyMemoryOptions(deps.specialistCallOptions) }
        : {}),
      toolChoice: 'none',
      maxSteps: deps.maxSteps,
      structuredOutput: {
        schema: CritiqueSchema,
        jsonPromptInjection: jsonPromptInjectionForModel(agentModel.model),
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
