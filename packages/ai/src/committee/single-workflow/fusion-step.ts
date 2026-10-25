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

// fusion step of the single-symbol committee workflow (DEC-05 split of
// single-workflow.ts). Extracted verbatim from the former module: LLM
// synthesis of the verified opinions (debate revisions win), grounded by the
// fusion verifier.

import type { RequestContext } from '@mastra/core/request-context';
import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';

import type { MastraGenerationStats } from '../../mastra-v2/shared/stats';
import { isDeadlineAbort } from '../../utils/timeout';
import { readCritiqueStepResult, readDebateStepResult } from '../critique';
import { readCollectPacketResult, readSpecialistStepResult } from '../specialist-runner';
import { recordCommitteeStepSpan } from '../step-spans';
import { synthesizeCommitteeAnswer } from '../synthesizer';
import {
  committeeModelMetadata,
  MastraModeStrictFailureError,
  type CommitteeCritique,
  type MastraModeOpinion,
  type MastraSpecialistName,
  type ModeRequestContext,
} from '../types';
import { CommitteeWorkflowOutputSchema } from '../workflow-shared';
import type { SingleVerifyStepContext } from './context';

export function createSingleFusionStep(ctx: SingleVerifyStepContext) {
  const {
    deps,
    specialists,
    critiqueEnabled,
    debateEnabled,
    runSignals,
    runSignal,
    generationLedger,
    maxSteps,
  } = ctx;

  return createStep({
    id: 'fusion',
    inputSchema: z.unknown(),
    outputSchema: CommitteeWorkflowOutputSchema,
    retries: 1,
    execute: async ({ requestContext, getStepResult, abortSignal }) => {
      const fusionStartedAt = Date.now();
      const signal = runSignal ?? abortSignal;
      await deps.onProgress?.('fusion' as const);
      const collect = readCollectPacketResult(getStepResult);
      if (!collect) throw new Error('Committee workflow is missing collect-packet output.');
      const { packet, prompt, mode: runMode } = collect;
      const failedAgents: MastraSpecialistName[] = [];
      const opinions: MastraModeOpinion[] = [];
      const executionStats: MastraGenerationStats[] = [];
      const critiqueOutput = critiqueEnabled ? readCritiqueStepResult(getStepResult) : undefined;
      const critiques: CommitteeCritique[] = critiqueOutput?.critiques ?? [];
      const debateOutput = debateEnabled ? readDebateStepResult(getStepResult) : undefined;
      const revisions = new Map(
        (debateOutput?.revisions ?? []).map((revision) => [revision.agentName, revision]),
      );

      for (const name of specialists) {
        const marker = readSpecialistStepResult(getStepResult, name);
        if (marker?.ok === false) {
          failedAgents.push(name);
          continue;
        }
        if (!marker?.ok || !marker.opinion || !marker.stats) continue;
        const revised = revisions.get(name);
        if (revised) {
          opinions.push(revised);
          executionStats.push({
            inputTokens: revised.inputTokens,
            outputTokens: revised.outputTokens,
            toolCalls: 0,
            steps: 1,
          });
        } else {
          opinions.push({
            agentName: name,
            bias: marker.opinion.bias,
            confidence: marker.opinion.confidence,
            reasoning: marker.opinion.reasoning,
            rawData: marker.opinion.details,
            ...committeeModelMetadata(
              marker.model ?? deps.modelId,
              marker.providerId ?? deps.providerId,
              marker.stats,
              marker.costUsd ?? 0,
              marker.latencyMs ?? 0,
            ),
          });
        }
        executionStats.push(marker.stats);
      }

      let synthesis: Awaited<ReturnType<typeof synthesizeCommitteeAnswer>>;
      try {
        synthesis = await synthesizeCommitteeAnswer({
          mode: runMode,
          prompt,
          packet,
          opinions,
          ...(critiques.length > 0 ? { critiques } : {}),
          executionStats,
          requestContext: requestContext as RequestContext<ModeRequestContext>,
          signal,
          deps: {
            model: deps.model,
            modelId: deps.modelId,
            providerId: deps.providerId,
            ...(deps.resolveModelForAgent
              ? { resolveModelForAgent: deps.resolveModelForAgent }
              : {}),
            memory: deps.memory,
            fusionCallOptions: deps.fusionCallOptions,
            ...(deps.inputProcessors ? { inputProcessors: deps.inputProcessors } : {}),
            ...(deps.scorers ? { scorers: deps.scorers } : {}),
            ledger: generationLedger,
            maxSteps,
          },
        });
      } catch (error) {
        if (isDeadlineAbort(runSignals)) {
          throw new MastraModeStrictFailureError(
            ['fusion'],
            new Error('Committee analysis timed out during fusion — please retry.'),
          );
        }
        throw error;
      }

      recordCommitteeStepSpan({
        step: 'fusion',
        runId: (requestContext.get('runId') as string | undefined) ?? 'unknown',
        symbol: packet.symbol,
        mode: runMode,
        packetId: packet.packetId,
        modelId: synthesis.fusionModelId ?? deps.modelId,
        latencyMs: Date.now() - fusionStartedAt,
        tokenCostUsd: generationLedger.total(),
        inputTokens: synthesis.stats.inputTokens,
        outputTokens: synthesis.stats.outputTokens,
        ok: true,
      });
      return {
        status: 'ready' as const,
        finalText: synthesis.finalText,
        opinions,
        critiques,
        packet,
        stats: synthesis.stats,
        failedAgents,
        totalCostUsd: generationLedger.total(),
      };
    },
  });
}
