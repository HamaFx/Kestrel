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

// fusion step of the comparison committee workflow (DEC-05 split of
// comparison-workflow.ts). Extracted verbatim from the former module: the
// cross-symbol fusion compares the healthy packet subset and discloses the
// blocked symbols (F-01).

import type { RequestContext } from '@mastra/core/request-context';
import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';

import type { MastraGenerationStats } from '../../mastra-v2/shared/stats';
import { isDeadlineAbort } from '../../utils/timeout';
import { readCollectPacketResult, readSpecialistStepResultById } from '../specialist-runner';
import { recordCommitteeStepSpan } from '../step-spans';
import { synthesizeComparisonAnswer } from '../synthesizer';
import {
  committeeModelMetadata,
  MastraModeStrictFailureError,
  type MastraModeOpinion,
  type ModeRequestContext,
} from '../types';
import { CommitteeWorkflowOutputSchema } from '../workflow-shared';
import type { ComparisonStepContext } from './context';

export function createComparisonFusionStep(ctx: ComparisonStepContext) {
  const {
    deps,
    mode,
    symbols: comparisonSymbols,
    deskNames: comparisonDeskNames,
    stepIdFor: comparisonStepId,
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
      await deps.onProgress?.('fusion');
      const collect = readCollectPacketResult(getStepResult);
      if (!collect?.packets) {
        throw new Error('Comparison workflow is missing collect-packet output.');
      }
      const packetRecord = collect.packets;
      // F-01: `collect.packets` holds only the healthy packets; the
      // blocked symbols reach the fusion prompt as an explicit disclosure.
      const packets = comparisonSymbols
        .map((symbol) => packetRecord[symbol])
        .filter((packet): packet is NonNullable<typeof packet> => Boolean(packet));
      const blockedSymbols = collect.blockedSymbols ?? [];
      const blockedMissingData = collect.blockedMissingData ?? [];
      const opinions: MastraModeOpinion[] = [];
      const executionStats: MastraGenerationStats[] = [];
      for (const symbol of comparisonSymbols) {
        for (const desk of comparisonDeskNames) {
          const marker = readSpecialistStepResultById(
            getStepResult,
            comparisonStepId(desk, symbol),
          );
          if (!marker?.ok || !marker.opinion || !marker.stats) continue;
          opinions.push({
            agentName: desk,
            symbol,
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
          executionStats.push(marker.stats);
        }
      }

      let synthesis: Awaited<ReturnType<typeof synthesizeComparisonAnswer>>;
      try {
        synthesis = await synthesizeComparisonAnswer({
          prompt: collect.prompt,
          packets,
          opinions,
          executionStats,
          ...(blockedSymbols.length > 0 ? { blockedSymbols, blockedMissingData } : {}),
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
            new Error('Comparison analysis timed out during fusion — please retry.'),
          );
        }
        throw error;
      }

      recordCommitteeStepSpan({
        step: 'fusion',
        runId: (requestContext.get('runId') as string | undefined) ?? 'unknown',
        symbol: comparisonSymbols.join('/'),
        mode,
        latencyMs: Date.now() - fusionStartedAt,
        modelId: synthesis.fusionModelId ?? deps.modelId,
        tokenCostUsd: generationLedger.total(),
        inputTokens: synthesis.stats.inputTokens,
        outputTokens: synthesis.stats.outputTokens,
        ok: true,
      });
      return {
        status: 'ready' as const,
        finalText: synthesis.finalText,
        opinions,
        critiques: [],
        packet: collect.packet,
        packets: packetRecord,
        ...(blockedSymbols.length > 0 ? { blockedSymbols } : {}),
        stats: synthesis.stats,
        failedAgents: [],
        totalCostUsd: generationLedger.total(),
      };
    },
  });
}
