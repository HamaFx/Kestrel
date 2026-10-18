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
 * Committee synthesizer (Phase 6 + Audit v3 Phase 4, Owner Decision Q12).
 * The fusion/output layer is the only committee component allowed to produce
 * the final user-facing answer: it owns writes to the conversation thread and
 * is the only layer that may emit a user-visible assistant message. Single
 * mode formats the single technical opinion directly; Full runs one bounded
 * LLM synthesis over the verified specialist opinions (structured by default
 * per Q12).
 */

import { readFeatureFlag } from '@kestrel/shared';
import type { AgentMemoryOption } from '@mastra/core/agent';
import type { MastraScorers } from '@mastra/core/evals';
import type { MastraMemory } from '@mastra/core/memory';
import type { InputProcessorOrWorkflow } from '@mastra/core/processors';
import type { RequestContext } from '@mastra/core/request-context';
import type { LanguageModel } from 'ai';
import { z } from 'zod';

import { estimateCostUsd } from '../cost';
import type { GenerationLedger } from '../generation-ledger';
import type { SymbolResearchPacket } from '../mastra-v2/packets/symbol-research';
import {
  getMastraGenerationStats,
  type MastraGenerationStats,
} from '../mastra-v2/shared/telemetry';
import {
  fusionRepairPrompt,
  verifyComparisonFusionAnswer,
  verifyFusionAnswer,
} from './fusion-verifier';
import { comparisonFusionInstructionsForRequest, fusionInstructionsForRequest } from './prompts';
import { createCommitteeAgent, FUSION_AGENT_ID } from './specialists';
import {
  contextWithPacket,
  contextWithPackets,
  MastraModeStrictFailureError,
  type CommitteeCritique,
  type MastraAnalysisMode,
  type MastraModeOpinion,
  type ModeRequestContext,
} from './types';

/**
 * Audit plan §3.3 + Audit v3 Q12 — structured fusion answer (enabled by default
 * via `PHASE3_STRUCTURED_FUSION`, full mode only). Deterministic fields let
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

/** Q12: structured fusion is enabled by default (disable with PHASE3_STRUCTURED_FUSION=0). */
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
  /** P-01: optional so view-only canonical registrations (Studio) can run without BYOK memory. */
  memory?: MastraMemory | undefined;
  /** The fusion agent owns writes to the conversation thread. */
  fusionCallOptions?: AgentMemoryOption | undefined;
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
            jsonPromptInjection: 'auto' as const,
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

function aggregateStats(stats: MastraGenerationStats[]): MastraGenerationStats {
  return {
    inputTokens: stats.reduce((sum, s) => sum + s.inputTokens, 0),
    outputTokens: stats.reduce((sum, s) => sum + s.outputTokens, 0),
    toolCalls: stats.reduce((sum, s) => sum + s.toolCalls, 0),
    steps: stats.reduce((sum, s) => sum + s.steps, 0),
  };
}

export interface CommitteeComparisonSynthesisArgs {
  prompt: string;
  /** One ready packet per compared symbol (prompt order). */
  packets: SymbolResearchPacket[];
  opinions: MastraModeOpinion[];
  executionStats: MastraGenerationStats[];
  /**
   * F-01: symbols excluded from the comparison because their packet was
   * blocked. The fusion prompt discloses them and compares the healthy
   * subset instead of failing the whole turn.
   */
  blockedSymbols?: readonly string[];
  /** F-01: the blocked packets' `missingData` lines for the disclosure. */
  blockedMissingData?: readonly string[];
  requestContext: RequestContext<ModeRequestContext>;
  signal?: AbortSignal;
  deps: CommitteeSynthesisDeps;
}

/**
 * A-01 (B-01/B-08) — cross-symbol comparison fusion. Unlike single mode's
 * deterministic desk read, a comparison always runs one bounded LLM
 * synthesis over the per-symbol packets and desk opinions ("compare these N
 * packets …"), then verifies the answer against the union of the packets'
 * evidence with the same single bounded repair as full-mode fusion.
 *
 * F-01 — at least one healthy packet is required; blocked symbols are
 * disclosed in the prompt and compared against the healthy subset.
 */
export async function synthesizeComparisonAnswer(
  args: CommitteeComparisonSynthesisArgs,
): Promise<CommitteeSynthesisResult> {
  const {
    prompt,
    packets,
    opinions,
    executionStats,
    blockedSymbols,
    blockedMissingData,
    requestContext,
    signal,
    deps,
  } = args;
  if (packets.length === 0) {
    throw new MastraModeStrictFailureError(
      ['fusion'],
      new Error('Comparison synthesis requires at least one collected packet.'),
    );
  }
  const fusionModel = deps.resolveModelForAgent?.('fusion') ?? {
    model: deps.model,
    modelId: deps.modelId,
    providerId: deps.providerId,
  };
  const fusionAgent = createCommitteeAgent(
    fusionModel.model,
    FUSION_AGENT_ID,
    (ctx: {
      requestContext: Parameters<
        typeof comparisonFusionInstructionsForRequest
      >[0]['requestContext'];
    }) => comparisonFusionInstructionsForRequest({ requestContext: ctx.requestContext }),
    deps.memory,
    deps.inputProcessors,
    deps.scorers,
  );

  const runFusion = async (fusionPrompt: string) =>
    fusionAgent.generate(fusionPrompt, {
      requestContext: contextWithPackets(
        requestContext,
        packets,
        opinions,
        blockedSymbols,
        blockedMissingData,
      ),
      ...(deps.fusionCallOptions ? { memory: deps.fusionCallOptions } : {}),
      toolChoice: 'none' as const,
      maxSteps: deps.maxSteps,
      ...(signal ? { abortSignal: signal } : {}),
    });

  const fusionResult = await runFusion(prompt);
  let finalText = fusionResult.text;
  let generationStats: MastraGenerationStats[] = [getMastraGenerationStats(fusionResult)];
  let fusionCostUsd = estimateCostUsd(
    fusionModel.modelId,
    generationStats[0]!.inputTokens,
    generationStats[0]!.outputTokens,
  );

  const firstVerification = verifyComparisonFusionAnswer(finalText, packets, opinions);
  if (!firstVerification.ok) {
    const repairResult = await runFusion(fusionRepairPrompt(prompt, firstVerification.findings));
    const repairStats = getMastraGenerationStats(repairResult);
    generationStats = [...generationStats, repairStats];
    fusionCostUsd += estimateCostUsd(
      fusionModel.modelId,
      repairStats.inputTokens,
      repairStats.outputTokens,
    );
    finalText = repairResult.text;
    const repairVerification = verifyComparisonFusionAnswer(finalText, packets, opinions);
    if (!repairVerification.ok) {
      throw new MastraModeStrictFailureError(
        ['fusion'],
        new Error(
          `Comparison fusion verification failed after repair: ${[...firstVerification.findings, ...repairVerification.findings].join('; ')}`,
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
