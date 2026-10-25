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

// Single/full-mode synthesis (DEC-05 split from synthesizer.ts) — the only
// path allowed to produce the final user-facing answer. Single mode formats
// the single technical opinion directly; Full runs one bounded LLM synthesis
// over the verified specialist opinions (structured by default per Q12).

import { estimateCostUsd } from '../../budget/cost';
import {
  getMastraGenerationStats,
  type MastraGenerationStats,
} from '../../mastra-v2/shared/telemetry';
import { fusionRepairPrompt, verifyFusionAnswer } from '../fusion-verifier';
import { fusionInstructionsForRequest } from '../prompts';
import { createCommitteeAgent, FUSION_AGENT_ID } from '../specialists';
import { jsonPromptInjectionForModel } from '../structured-output';
import { contextWithPacket, MastraModeStrictFailureError } from '../types';
import { FusionAnswerSchema, renderFusionAnswer, structuredFusionEnabled } from './fusion-answer';
import { aggregateStats } from './stats';
import type { CommitteeSynthesisArgs, CommitteeSynthesisResult } from './types';

export async function synthesizeCommitteeAnswer(
  args: CommitteeSynthesisArgs,
): Promise<CommitteeSynthesisResult> {
  const {
    mode,
    prompt,
    packet,
    opinions,
    critiques,
    executionStats,
    requestContext,
    signal,
    deps,
  } = args;

  if (mode === 'single') {
    const finalText = opinions[0]
      ? `**${packet.symbol} read**\n\n${opinions[0].reasoning}\n\nData quality: **${packet.dataQuality}**.`
      : `No specialist opinion was available for ${packet.symbol}.`;
    // Single mode has no fusion LLM pass, but the verbatim desk read is still
    // the user-facing answer, so it is grounded with the same strict check.
    const verification = verifyFusionAnswer(finalText, packet, opinions);
    if (!verification.ok) {
      throw new MastraModeStrictFailureError(
        ['fusion'],
        new Error(`Single-desk answer failed verification: ${verification.findings.join('; ')}`),
      );
    }
    return { finalText, stats: aggregateStats(executionStats) };
  }

  // §3.1: the fusion agent may use its own user-picked top-tier model.
  const fusionModel = deps.resolveModelForAgent?.('fusion') ?? {
    model: deps.model,
    modelId: deps.modelId,
    providerId: deps.providerId,
  };
  // §2.2: the fusion agent reads the packet and the typed opinions from the
  // request context (injected on every generate call below) instead of
  // JSON-joining them into the prompt at build time.
  const fusionAgent = createCommitteeAgent(
    fusionModel.model,
    FUSION_AGENT_ID,
    (ctx: {
      requestContext: Parameters<typeof fusionInstructionsForRequest>[0]['requestContext'];
    }) => fusionInstructionsForRequest({ requestContext: ctx.requestContext }),
    deps.memory,
    deps.inputProcessors,
    deps.scorers,
  );

  // §3.3 / Q12: full mode uses structured fusion by default
  // (PHASE3_STRUCTURED_FUSION) whose markdown is rendered deterministically.
  const useStructuredFusion = mode === 'full' && structuredFusionEnabled();

  const runFusion = async (fusionPrompt: string) => {
    // The synthesizer owns the user-visible assistant message; it writes to
    // the thread with the caller's fusion call options.
    const baseOptions = {
      requestContext: contextWithPacket(requestContext, packet, opinions, critiques),
      ...(deps.fusionCallOptions ? { memory: deps.fusionCallOptions } : {}),
      toolChoice: 'none' as const,
      maxSteps: deps.maxSteps,
      ...(signal ? { abortSignal: signal } : {}),
    };
    return useStructuredFusion
      ? fusionAgent.generate(fusionPrompt, {
          ...baseOptions,
          structuredOutput: {
            schema: FusionAnswerSchema,
            jsonPromptInjection: jsonPromptInjectionForModel(fusionModel.model),
            instructions:
              'Return the complete structured answer: bottom line, evidence-aware reasoning, at least one risk, invalidation conditions, and a scenario table.',
          },
        })
      : fusionAgent.generate(fusionPrompt, baseOptions);
  };

  // P1-3: the first attempt and the bounded repair funnel through one shared
  // render path. When a test mock returns only `.text` (with `.object`
  // undefined), fall back to `.text` so unit tests that mock free-form fusion
  // strings continue to work seamlessly.
  const renderFusionResult = (result: Awaited<ReturnType<typeof runFusion>>): string =>
    useStructuredFusion && (result as { object?: unknown }).object !== undefined
      ? renderFusionAnswer(FusionAnswerSchema.parse((result as { object: unknown }).object))
      : result.text;

  const fusionResult = await runFusion(prompt);
  const fusionText = renderFusionResult(fusionResult);

  let finalText = fusionText;
  let generationStats: MastraGenerationStats[] = [getMastraGenerationStats(fusionResult)];
  let fusionCostUsd = estimateCostUsd(
    fusionModel.modelId,
    generationStats[0]!.inputTokens,
    generationStats[0]!.outputTokens,
  );

  const firstVerification = verifyFusionAnswer(finalText, packet, opinions);
  if (!firstVerification.ok) {
    const repairResult = await runFusion(fusionRepairPrompt(prompt, firstVerification.findings));
    const repairStats = getMastraGenerationStats(repairResult);
    generationStats = [...generationStats, repairStats];
    fusionCostUsd += estimateCostUsd(
      fusionModel.modelId,
      repairStats.inputTokens,
      repairStats.outputTokens,
    );
    finalText = renderFusionResult(repairResult);
    const repairVerification = verifyFusionAnswer(finalText, packet, opinions);
    if (!repairVerification.ok) {
      throw new MastraModeStrictFailureError(
        ['fusion'],
        new Error(
          `Fusion verification failed after repair: ${[...firstVerification.findings, ...repairVerification.findings].join('; ')}`,
        ),
      );
    }
  }

  deps.ledger.recordCost('fusion', 'fusion', fusionCostUsd);
  return {
    finalText,
    stats: aggregateStats([...executionStats, ...generationStats]),
    fusionModelId: fusionModel.modelId,
    fusionProviderId: fusionModel.providerId,
  };
}
