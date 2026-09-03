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
 * a user-visible assistant message. Single/Quick modes format the single
 * technical opinion directly; Standard/Full run one bounded LLM synthesis
 * over the verified specialist opinions.
 */

import type { AgentMemoryOption } from '@mastra/core/agent';
import type { MastraScorers } from '@mastra/core/evals';
import type { MastraMemory } from '@mastra/core/memory';
import type { InputProcessorOrWorkflow } from '@mastra/core/processors';
import type { RequestContext } from '@mastra/core/request-context';
import type { LanguageModel } from 'ai';

import { estimateCostUsd } from '../cost';
import type { GenerationLedger } from '../generation-ledger';
import type { SymbolResearchPacket } from '../mastra/symbol-research';
import { getMastraGenerationStats, type MastraGenerationStats } from '../mastra/telemetry';
import { fusionInstructions } from './prompts';
import { createCommitteeAgent, FUSION_AGENT_ID } from './specialists';
import {
  contextWithPacket,
  type MastraAnalysisMode,
  type MastraModeOpinion,
  type ModeRequestContext,
} from './types';

export interface CommitteeSynthesisDeps {
  model: LanguageModel;
  modelId: string;
  providerId: string;
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
  executionStats: MastraGenerationStats[];
  requestContext: RequestContext<ModeRequestContext>;
  signal?: AbortSignal;
  deps: CommitteeSynthesisDeps;
}

export interface CommitteeSynthesisResult {
  finalText: string;
  stats: MastraGenerationStats;
}

export async function synthesizeCommitteeAnswer(
  args: CommitteeSynthesisArgs,
): Promise<CommitteeSynthesisResult> {
  const { mode, prompt, packet, opinions, executionStats, requestContext, signal, deps } = args;

  if (mode === 'single' || mode === 'quick') {
    const label = mode === 'single' ? 'read' : 'quick technical read';
    const finalText = opinions[0]
      ? `**${packet.symbol} ${label}**\n\n${opinions[0].reasoning}\n\nData quality: **${packet.dataQuality}**.`
      : `No specialist opinion was available for ${packet.symbol}.`;
    return { finalText, stats: aggregateStats(executionStats) };
  }

  const fusionAgent = createCommitteeAgent(
    deps.model,
    FUSION_AGENT_ID,
    fusionInstructions(packet, opinions),
    deps.memory,
    deps.inputProcessors,
    deps.scorers,
  );
  const fusionResult = await fusionAgent.generate(prompt, {
    requestContext: contextWithPacket(requestContext, packet),
    // The synthesizer owns the user-visible assistant message; it writes to
    // the thread with the caller's fusion call options.
    memory: deps.fusionCallOptions,
    toolChoice: 'none',
    maxSteps: deps.maxSteps,
    ...(signal ? { abortSignal: signal } : {}),
  });
  const fusionStats = getMastraGenerationStats(fusionResult);
  const fusionCostUsd = estimateCostUsd(
    deps.modelId,
    fusionStats.inputTokens,
    fusionStats.outputTokens,
  );
  deps.ledger.recordCost('fusion', 'fusion', fusionCostUsd);
  return { finalText: fusionResult.text, stats: aggregateStats([...executionStats, fusionStats]) };
}

function aggregateStats(stats: MastraGenerationStats[]): MastraGenerationStats {
  return {
    inputTokens: stats.reduce((sum, s) => sum + s.inputTokens, 0),
    outputTokens: stats.reduce((sum, s) => sum + s.outputTokens, 0),
    toolCalls: stats.reduce((sum, s) => sum + s.toolCalls, 0),
    steps: stats.reduce((sum, s) => sum + s.steps, 0),
  };
}
