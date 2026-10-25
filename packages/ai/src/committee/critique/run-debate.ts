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

// Optional bounded debate round (DEC-05 split from critique.ts).
//
// Audit plan §3.3, flag `ENABLE_COMMITTEE_DEBATE`, Full mode only. Each desk
// reads its own initial opinion plus every peer critique and returns one FINAL
// structured opinion — revised or reaffirmed. The revision is verified with
// the same deterministic opinion gate as the first round, so a hallucinating
// revision fails the desk and (Q3) the whole committee instead of reaching
// fusion.

import type { RequestContext } from '@mastra/core/request-context';

import { estimateCostUsd } from '../../budget/cost';
import { getMastraGenerationStats } from '../../mastra-v2/shared/telemetry';
import { debateRevisionInstructionsForRequest } from '../prompts';
import { createCommitteeAgent, SPECIALIST_DEFINITIONS } from '../specialists';
import { jsonPromptInjectionForModel } from '../structured-output';
import {
  contextWithPacket,
  OpinionSchema,
  readOnlyMemoryOptions,
  type MastraModeOpinion,
  type ModeRequestContext,
} from '../types';
import { verifyMastraOpinion } from '../verifier';
import { isTransientProviderError } from './errors';
import type { DebateStepResult } from './schemas';
import type { RunDebateRevisionArgs } from './types';

export async function runDebateRevision(args: RunDebateRevisionArgs): Promise<DebateStepResult> {
  const { name, prompt, packet, ownOpinion, critiques, requestContext, signal, startedAt, deps } =
    args;
  const agentModel = deps.resolveModelForAgent?.(name) ?? {
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
      ...(deps.specialistCallOptions
        ? { memory: readOnlyMemoryOptions(deps.specialistCallOptions) }
        : {}),
      toolChoice: 'none',
      maxSteps: deps.maxSteps,
      structuredOutput: {
        schema: OpinionSchema,
        jsonPromptInjection: jsonPromptInjectionForModel(agentModel.model),
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
