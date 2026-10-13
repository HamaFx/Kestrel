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
 * Committee synthesizer (Phase 6). The fusion/output layer is the only
 * committee component allowed to produce the final user-facing answer: it
 * owns writes to the conversation thread and is the only layer that may emit
 * a user-visible assistant message. Single mode formats the single technical
 * opinion directly; Full runs one bounded LLM synthesis over the verified
 * specialist opinions.
 */

import type { AgentMemoryOption } from '@mastra/core/agent';
import type { MastraScorers } from '@mastra/core/evals';
import type { MastraMemory } from '@mastra/core/memory';
import type { InputProcessorOrWorkflow } from '@mastra/core/processors';
import type { RequestContext } from '@mastra/core/request-context';
import type { LanguageModel } from 'ai';
import { readFeatureFlag } from '@kestrel/shared';
import { z } from 'zod';

import { estimateCostUsd } from '../cost';
import type { GenerationLedger } from '../generation-ledger';
import type { SymbolResearchPacket } from '../mastra-v2/packets/symbol-research';
import { getMastraGenerationStats, type MastraGenerationStats } from '../mastra-v2/shared/telemetry';
import { fusionRepairPrompt, verifyFusionAnswer } from './fusion-verifier';
import { fusionInstructionsForRequest } from './prompts';
import { createCommitteeAgent, FUSION_AGENT_ID } from './specialists';
import {
  contextWithPacket,
  MastraModeStrictFailureError,
  type CommitteeCritique,
  type MastraAnalysisMode,
  type MastraModeOpinion,
  type ModeRequestContext,
} from './types';

/**
 * Audit plan §3.3 — structured fusion answer (opt-in via
 * `PHASE3_STRUCTURED_FUSION=true`, full mode only). Deterministic fields let
 * the UI render scenario tables via the report parts instead of parsing
 * free-form markdown.
 */
export const FusionAnswerSchema = z.object({
  bottomLine: z.string().min(1),
  reasoning: z.string().min(1),
  risks: z.array(z.string().min(1)).min(1),
  invalidation: z.string().min(1),
  scenarioTable: z
    .array(
      z.object({
        scenario: z.string().min(1),
        bias: z.enum(['bullish', 'bearish', 'neutral']),
        trigger: z.string().min(1),
      }),
    )
    .min(1),
});
export type FusionAnswer = z.infer<typeof FusionAnswerSchema>;

/** Deterministic markdown rendering for the structured fusion answer. */
export function renderFusionAnswer(answer: FusionAnswer): string {
  const scenarioRows = answer.scenarioTable
    .map((row) => `| ${row.scenario} | ${row.bias} | ${row.trigger} |`)
    .join('\n');
  return [
    `**Bottom line:** ${answer.bottomLine}`,
    '',
    answer.reasoning,
    '',
    '**Scenarios**',
    '',
    '| Scenario | Bias | Trigger |',
    '| --- | --- | --- |',
    scenarioRows,
    '',
    `**Invalidation:** ${answer.invalidation}`,
    '',
    `**Risks:** ${answer.risks.map((risk) => `- ${risk}`).join('\n')}`,
  ].join('\n');
}

/** §3.3: structured fusion is opt-in (default remains free-form markdown). */
function structuredFusionEnabled(): boolean {
  return readFeatureFlag('PHASE3_STRUCTURED_FUSION');
}

export interface CommitteeSynthesisDeps {
  model: LanguageModel;
  modelId: string;
  providerId: string;
  /**
   * Audit plan §3.1 — optional per-agent model resolution; the fusion agent
   * requests itself by the `fusion` id. Returns null to fall back to the
   * primary run model. Never a cheaper tier (Q1).
   */
  resolveModelForAgent?: (agent: 'fusion') => {
    model: LanguageModel;
    modelId: string;
    providerId: string;
  } | null;
  memory: MastraMemory;
  /** The fusion agent owns writes to the conversation thread. */
  fusionCallOptions: AgentMemoryOption;
  inputProcessors?: Array<InputProcessorOrWorkflow>;
  scorers?: MastraScorers;
  ledger: GenerationLedger;
  /** Bounded single-step limit for the fusion LLM call. */
  maxSteps: number;
}

export interface CommitteeSynthesisArgs {
  mode: MastraAnalysisMode;
  prompt: string;
  packet: SymbolResearchPacket;
  opinions: MastraModeOpinion[];
  /** §3.2: peer reviews from the cross-critique round, when it ran. */
  critiques?: CommitteeCritique[];
  executionStats: MastraGenerationStats[];
  requestContext: RequestContext<ModeRequestContext>;
  signal?: AbortSignal;
  deps: CommitteeSynthesisDeps;
}

export interface CommitteeSynthesisResult {
  finalText: string;
  stats: MastraGenerationStats;
  /**
   * Audit plan §3.1 — the model the fusion pass actually used. With
   * `PHASE3_MODEL_DIVERSITY` off this equals the run's primary model id.
   */
  fusionModelId?: string;
  fusionProviderId?: string;
}

export async function synthesizeCommitteeAnswer(
  args: CommitteeSynthesisArgs,
): Promise<CommitteeSynthesisResult> {
  const { mode, prompt, packet, opinions, critiques, executionStats, requestContext, signal, deps } = args;

  if (mode === 'single') {
    const finalText = opinions[0]
      ? `**${packet.symbol} read**\n\n${opinions[0].reasoning}\n\nData quality: **${packet.dataQuality}**.`
      : `No specialist opinion was available for ${packet.symbol}.`;
    // Single mode has no fusion LLM pass, but the verbatim desk read is still
    // the user-facing answer, so it is grounded with the same strict check.
    const verification = verifyFusionAnswer(finalText, packet);
    if (!verification.ok) {
      throw new MastraModeStrictFailureError(
        ['fusion'],
        new Error(`Single-desk answer failed verification: ${verification.findings.join('; ')}`),
      );
    }
    return { finalText, stats: aggregateStats(executionStats) };
  }

  // §3.1: the fusion agent may use its own user-picked top-tier model.
  const fusionModel =
    deps.resolveModelForAgent?.('fusion') ?? {
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
    (ctx: { requestContext: Parameters<typeof fusionInstructionsForRequest>[0]['requestContext'] }) =>
      fusionInstructionsForRequest({ requestContext: ctx.requestContext }),
    deps.memory,
    deps.inputProcessors,
    deps.scorers,
  );

  // §3.3: full mode can opt into a structured fusion answer
  // (PHASE3_STRUCTURED_FUSION) whose markdown is rendered deterministically.
  const useStructuredFusion = mode === 'full' && structuredFusionEnabled();

  const runFusion = async (fusionPrompt: string) => {
    // The synthesizer owns the user-visible assistant message; it writes to
    // the thread with the caller's fusion call options.
    const baseOptions = {
      requestContext: contextWithPacket(requestContext, packet, opinions, critiques),
      memory: deps.fusionCallOptions,
      toolChoice: 'none' as const,
      maxSteps: deps.maxSteps,
      ...(signal ? { abortSignal: signal } : {}),
    };
    // §3.3: two explicit call shapes keep each generate() on its overload.
    return useStructuredFusion
      ? fusionAgent.generate(fusionPrompt, {
          ...baseOptions,
          structuredOutput: {
            schema: FusionAnswerSchema,
            jsonPromptInjection: 'auto' as const,
            instructions:
              'Return the complete structured answer: bottom line, evidence-aware reasoning, at least one risk, invalidation conditions, and a scenario table.',
          },
        })
      : fusionAgent.generate(fusionPrompt, baseOptions);
  };

  // P1-3: the first attempt and the bounded repair funnel through one shared
  // render path. A structured repair result is re-parsed and rendered to the
  // same deterministic markdown (never returned as the raw generate text), so
  // the two attempts can never produce different output forms.
  const renderFusionResult = (result: Awaited<ReturnType<typeof runFusion>>): string =>
    useStructuredFusion
      ? renderFusionAnswer(FusionAnswerSchema.parse(result.object))
      : result.text;

  const fusionResult = await runFusion(prompt);

  // §3.3: structured output is rendered deterministically; the grounding
  // verifier below still runs on the rendered markdown.
  const fusionText = renderFusionResult(fusionResult);

  // Audit plan §1.4 (Q3 strict): verify the free-form fusion answer against
  // the packet and opinions. One bounded repair; a second failure is terminal
  // — no degraded partial answer is returned.
  let finalText = fusionText;
  let generationStats: MastraGenerationStats[] = [getMastraGenerationStats(fusionResult)];
  let fusionCostUsd = estimateCostUsd(
    fusionModel.modelId,
    generationStats[0]!.inputTokens,
    generationStats[0]!.outputTokens,
  );

  const firstVerification = verifyFusionAnswer(finalText, packet);
  if (!firstVerification.ok) {
    const repairResult = await runFusion(fusionRepairPrompt(prompt, firstVerification.findings));
    const repairStats = getMastraGenerationStats(repairResult);
    generationStats = [...generationStats, repairStats];
    fusionCostUsd += estimateCostUsd(fusionModel.modelId, repairStats.inputTokens, repairStats.outputTokens);
    // P1-3: the repair renders through the same helper as the first attempt,
    // so the rendered markdown goes through the same strict verification.
    finalText = renderFusionResult(repairResult);
    const repairVerification = verifyFusionAnswer(finalText, packet);
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

function aggregateStats(stats: MastraGenerationStats[]): MastraGenerationStats {
  return {
    inputTokens: stats.reduce((sum, s) => sum + s.inputTokens, 0),
    outputTokens: stats.reduce((sum, s) => sum + s.outputTokens, 0),
    toolCalls: stats.reduce((sum, s) => sum + s.toolCalls, 0),
    steps: stats.reduce((sum, s) => sum + s.steps, 0),
  };
}
