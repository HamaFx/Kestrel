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

// SPDX-License-Identifier: Apache-2.0

/**
 * Comparison committee workflow (A-01 / B-01; audit 2026-10-18, Phase 4
 * split). Extracted verbatim from the former god workflow: each compared
 * symbol gets its own cached packet and its own per-symbol desk passes
 * (technical + risk by default, P1-04) in parallel, verify is strict for real
 * desk failures, and the cross-symbol fusion compares the healthy subset
 * (F-01). `workflow.ts` dispatches here when two or more symbols are present.
 */

import { readFeatureFlag, type Symbol } from '@kestrel/shared';
import type { RequestContext } from '@mastra/core/request-context';
import { createStep, Workflow } from '@mastra/core/workflows';
import { z } from 'zod';

import { collectMultiSymbolPackets } from '../mastra-v2/packets/packet-cache';
import type { MastraGenerationStats } from '../mastra-v2/shared/stats';
import { createGenerationLedger } from '../persistence/generation-ledger';
import { isDeadlineAbort } from '../utils/timeout';
import {
  readCollectPacketResult,
  readSpecialistStepResultById,
  runSpecialistGeneration,
  SpecialistStepResultSchema,
} from './specialist-runner';
import { recordCommitteeStepSpan } from './step-spans';
import { synthesizeComparisonAnswer } from './synthesizer';
import {
  CollectPacketOutputSchema,
  committeeModelMetadata,
  committeeProgressStages,
  MastraModeStrictFailureError,
  REQUEST_CONTEXT_SCHEMA,
  zeroStats,
  type CollectComparisonPacketsFn,
  type MastraAnalysisMode,
  type MastraModeOpinion,
  type MastraSpecialistName,
  type ModeRequestContext,
} from './types';
import {
  asParallelSteps,
  CommitteeWorkflowInputSchema,
  CommitteeWorkflowOutputSchema,
  ComparisonSpecialistStepInputSchema,
  runSignalsFor,
  specialistRunnerDepsFor,
  VerifyOutputSchema,
  type CommitteeWorkflowDeps,
} from './workflow-shared';

export function createComparisonCommitteeWorkflow(
  deps: CommitteeWorkflowDeps,
  comparisonSymbols: readonly Symbol[],
  mode: MastraAnalysisMode,
  workflowId: string,
): Workflow {
  const progressStages = committeeProgressStages(mode);
  const generationLedger = deps.ledger ?? createGenerationLedger();
  const maxSteps = deps.maxSteps ?? 1;
  const { runSignals, runSignal } = runSignalsFor(deps);

  const collectComparisonPackets: CollectComparisonPacketsFn =
    deps.collectComparisonPackets ?? collectMultiSymbolPackets;
  const comparisonDeskNames: readonly MastraSpecialistName[] = readFeatureFlag(
    'ENABLE_COMPARISON_RISK_DESK',
  )
    ? ['technical', 'risk']
    : ['technical'];
  const comparisonStepId = (desk: MastraSpecialistName, symbol: string) =>
    `${desk}-${symbol.toLowerCase()}`;

  const specialistDeps = specialistRunnerDepsFor(deps, generationLedger, maxSteps);

  const comparisonCollectStep = createStep({
    id: 'collect-packet',
    inputSchema: CommitteeWorkflowInputSchema,
    outputSchema: CollectPacketOutputSchema,
    execute: async ({ inputData, requestContext, abortSignal, bail }) => {
      const signal = runSignal ?? abortSignal;
      await deps.onProgress?.(progressStages[0]!);
      // P-01: the input schema already validates each symbol, so the typed
      // list needs no cast at the collector boundary.
      const symbols: readonly Symbol[] = inputData.symbols ?? comparisonSymbols;
      const packets = await collectComparisonPackets(symbols, signal);
      const entries = [...packets.entries()];
      for (const [entrySymbol, packet] of entries) {
        recordCommitteeStepSpan({
          step: 'collect-packet',
          runId: (requestContext.get('runId') as string | undefined) ?? 'unknown',
          symbol: entrySymbol,
          mode: inputData.mode,
          packetId: packet.packetId,
          ok: packet.status === 'ready',
        });
      }
      // F-01: one blocked symbol must not fail the whole comparison. Only a
      // fully blocked collection is terminal; otherwise the healthy subset
      // is compared and the fusion discloses the excluded symbols.
      const healthy = entries.filter(([, packet]) => packet.status === 'ready');
      const blocked = entries.filter(([, packet]) => packet.status !== 'ready');
      const primary = healthy[0]?.[1] ?? entries[0]?.[1];
      if (!primary) throw new Error('Comparison packet collection returned no packets.');
      if (healthy.length === 0) {
        const text = `I could not complete the comparison because required market data is unavailable for every requested symbol.\n\n${blocked
          .flatMap(([, packet]) => packet.missingData)
          .join('\n')}`;
        return bail({
          status: 'blocked' as const,
          blockedText: text,
          opinions: [],
          critiques: [],
          packet: primary,
          packets: Object.fromEntries(entries),
          blockedSymbols: blocked.map(([entrySymbol]) => entrySymbol),
          stats: zeroStats(),
          failedAgents: [],
          totalCostUsd: 0,
        });
      }
      return {
        packet: primary,
        packets: Object.fromEntries(healthy),
        ...(blocked.length > 0
          ? {
              blockedSymbols: blocked.map(([entrySymbol]) => entrySymbol),
              blockedMissingData: blocked.flatMap(([, packet]) => packet.missingData),
            }
          : {}),
        prompt: inputData.prompt,
        // Comparison v1 always runs the one-desk read per symbol; the
        // durable full-committee queue never carries a comparison.
        mode: 'single' as const,
      };
    },
  });

  const comparisonSpecialistSteps = comparisonSymbols.flatMap((symbol) =>
    comparisonDeskNames.map((desk) =>
      createStep({
        id: comparisonStepId(desk, symbol),
        inputSchema: ComparisonSpecialistStepInputSchema,
        outputSchema: SpecialistStepResultSchema,
        retries: 1,
        execute: async ({ inputData, requestContext, abortSignal }) => {
          const packet = inputData.packets?.[symbol];
          if (!packet) {
            // F-01: the symbol's packet was blocked and excluded by the
            // collect step. The desk is skipped (not failed); the fusion
            // discloses the missing symbol.
            return {
              ok: false,
              agentName: desk,
              error: 'data-unavailable',
            };
          }
          await deps.onProgress?.(desk);
          const startedAt = Date.now();
          const signal = runSignal ?? abortSignal;
          let result: Awaited<ReturnType<typeof runSpecialistGeneration>>;
          try {
            result = await runSpecialistGeneration({
              name: desk,
              prompt: inputData.prompt,
              packet,
              symbol,
              requestContext: requestContext as RequestContext<ModeRequestContext>,
              signal,
              startedAt,
              deps: specialistDeps,
            });
          } catch (error) {
            if (isDeadlineAbort(runSignals)) {
              recordCommitteeStepSpan({
                step: desk,
                runId: (requestContext.get('runId') as string | undefined) ?? 'unknown',
                symbol,
                mode,
                packetId: packet.packetId,
                latencyMs: Date.now() - startedAt,
                ok: false,
                error: 'deadline',
              });
              return {
                ok: false,
                agentName: desk,
                error: 'deadline',
                latencyMs: Date.now() - startedAt,
              };
            }
            throw error;
          }
          recordCommitteeStepSpan({
            step: desk,
            runId: (requestContext.get('runId') as string | undefined) ?? 'unknown',
            symbol,
            mode,
            packetId: packet.packetId,
            ...(result.model ? { modelId: result.model } : {}),
            ...(result.latencyMs !== undefined ? { latencyMs: result.latencyMs } : {}),
            ...(result.costUsd !== undefined ? { tokenCostUsd: result.costUsd } : {}),
            ...(result.stats
              ? { inputTokens: result.stats.inputTokens, outputTokens: result.stats.outputTokens }
              : {}),
            ok: result.ok,
            ...(result.error ? { error: result.error } : {}),
          });
          return result;
        },
      }),
    ),
  );

  const comparisonVerifyStep = createStep({
    id: 'verify',
    inputSchema: z.unknown(),
    outputSchema: VerifyOutputSchema,
    execute: async ({ requestContext, getStepResult }) => {
      await deps.onProgress?.('verify');
      const failedDesks = new Set<MastraSpecialistName>();
      const failedLabels: string[] = [];
      let sawDeadline = false;
      for (const symbol of comparisonSymbols) {
        for (const desk of comparisonDeskNames) {
          const marker = readSpecialistStepResultById(
            getStepResult,
            comparisonStepId(desk, symbol),
          );
          // F-01: `data-unavailable` is the skip marker for a blocked symbol
          // — the fusion discloses it; only real desk failures are terminal.
          if (marker?.ok === false && marker.error !== 'data-unavailable') {
            failedDesks.add(desk);
            failedLabels.push(`${desk} desk on ${symbol}`);
            if (marker.error === 'deadline') sawDeadline = true;
          }
        }
      }
      recordCommitteeStepSpan({
        step: 'verify',
        runId: (requestContext?.get('runId') as string | undefined) ?? 'unknown',
        symbol: comparisonSymbols.join('/'),
        mode,
        ok: failedLabels.length === 0,
        ...(failedLabels.length > 0 ? { error: failedLabels.join(', ') } : {}),
      });
      if (failedLabels.length > 0) {
        throw new MastraModeStrictFailureError(
          [...failedDesks],
          undefined,
          sawDeadline
            ? `Comparison analysis timed out (${failedLabels.join(', ')} did not complete) — please retry. No partial answer was returned.`
            : `Comparison analysis could not complete (${failedLabels.join(', ')}). No partial answer was returned — please retry.`,
        );
      }
      return { failedAgents: [] };
    },
  });

  const comparisonFusionStep = createStep({
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

  const comparisonWorkflow = new Workflow({
    id: workflowId,
    inputSchema: CommitteeWorkflowInputSchema,
    outputSchema: CommitteeWorkflowOutputSchema,
    requestContextSchema: REQUEST_CONTEXT_SCHEMA,
    retryConfig: { attempts: 2, delay: 2_000 },
    ...(deps.mastra ? { mastra: deps.mastra } : {}),
  })
    .then(comparisonCollectStep)
    .parallel(asParallelSteps(comparisonSpecialistSteps))
    .then(comparisonVerifyStep)
    .then(comparisonFusionStep)
    .commit() as unknown as Workflow;

  return comparisonWorkflow;
}
