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

// Step factories for the N-symbol committee graph. The graph builder in
// `workflow.ts` supplies one context; every step is parameterized over the
// run's slots so single-symbol and comparison runs share one implementation.

import type { Symbol } from '@kestrel/shared';
import type { RequestContext } from '@mastra/core/request-context';
import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';

import type { SymbolResearchPacket } from '../mastra-v2/packets/symbol-research';
import type { MastraGenerationStats } from '../mastra-v2/shared/stats';
import type { createGenerationLedger } from '../persistence/generation-ledger';
import { enrichPacketForUser } from '../plugins/enrichers';
import { isDeadlineAbort } from '../utils/timeout';
import {
  CollectPacketOutputSchema,
  committeeModelMetadata,
  type committeeProgressStages,
  MastraModeStrictFailureError,
  zeroStats,
  type CollectComparisonPacketsFn,
  type CollectPacketFn,
  type MastraAnalysisMode,
  type MastraModeOpinion,
  type MastraSpecialistName,
  type ModeRequestContext,
} from './types';
import {
  readCollectPacketResult,
  readSpecialistStepResultById,
  runSpecialistGeneration,
  SpecialistStepResultSchema,
} from './specialist-runner';
import { recordCommitteeStepSpan } from './step-spans';
import { synthesizeCommitteeAnswer, synthesizeComparisonAnswer } from './synthesizer';
import type { CommitteeSynthesisResult } from './synthesizer/types';
import {
  CommitteeWorkflowInputSchema,
  CommitteeWorkflowOutputSchema,
  type runSignalsFor,
  SpecialistStepInputSchema,
  VerifyOutputSchema,
  type CommitteeRunnerDeps,
  type CommitteeWorkflowDeps,
} from './workflow-shared';

export interface WorkflowSlot {
  readonly desk: MastraSpecialistName;
  /** Absent for a single-symbol run; present for each compared symbol. */
  readonly symbol?: Symbol;
  readonly stepId: string;
}

export interface WorkflowContext {
  deps: CommitteeWorkflowDeps;
  mode: MastraAnalysisMode;
  comparison: boolean;
  symbols: readonly Symbol[];
  slots: readonly WorkflowSlot[];
  strict: boolean;
  progressStages: ReturnType<typeof committeeProgressStages>;
  generationLedger: ReturnType<typeof createGenerationLedger>;
  maxSteps: number;
  collectPacket: CollectPacketFn;
  collectComparisonPackets: CollectComparisonPacketsFn;
  runSignals: ReturnType<typeof runSignalsFor>['runSignals'];
  runSignal: AbortSignal | undefined;
  specialistDeps: CommitteeRunnerDeps;
}

export function createCollectStep(ctx: WorkflowContext) {
  const { deps, comparison, collectPacket, collectComparisonPackets, runSignal, progressStages } =
    ctx;

  return createStep({
    id: 'collect-packet',
    inputSchema: CommitteeWorkflowInputSchema,
    outputSchema: CollectPacketOutputSchema,
    execute: async ({ inputData, requestContext, abortSignal, bail }) => {
      const signal = runSignal ?? abortSignal;
      await deps.onProgress?.(progressStages[0]!);
      const requestedSymbols: readonly Symbol[] = comparison
        ? (inputData.symbols ?? ctx.symbols)
        : [inputData.symbol];
      const rawPackets = comparison
        ? await collectComparisonPackets(requestedSymbols, signal)
        : new Map<Symbol, SymbolResearchPacket>([
            [inputData.symbol, await collectPacket(inputData.symbol, signal)],
          ]);

      const userId = requestContext.get('userId') as string | undefined;
      const entries: Array<[string, SymbolResearchPacket]> = [];
      for (const [entrySymbol, rawPacket] of rawPackets.entries()) {
        entries.push([
          entrySymbol,
          userId ? await enrichPacketForUser(rawPacket, userId, signal) : rawPacket,
        ]);
      }
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

      if (!comparison) {
        const packet = entries[0]?.[1];
        if (!packet) throw new Error('Committee packet collection returned no packet.');
        if (packet.status === 'blocked') {
          const text = `I could not complete ${packet.symbol} ${inputData.mode} analysis because required market data is unavailable.\n\n${packet.missingData.join('\n')}`;
          return bail({
            status: 'blocked' as const,
            blockedText: text,
            opinions: [],
            packet,
            stats: zeroStats(),
            failedAgents: [],
            totalCostUsd: 0,
          });
        }
        return { packet, prompt: inputData.prompt, mode: inputData.mode };
      }

      // F-01: one blocked symbol must not fail the whole comparison. Only a
      // fully blocked collection is terminal; otherwise the healthy subset is
      // compared and the fusion discloses the excluded symbols.
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
        // A comparison never runs the full four-desk committee.
        mode: 'single' as const,
      };
    },
  });
}

export function createSpecialistStep(ctx: WorkflowContext, slot: WorkflowSlot) {
  const { deps, comparison, specialistDeps, runSignals, runSignal } = ctx;

  return createStep({
    id: slot.stepId,
    inputSchema: SpecialistStepInputSchema,
    outputSchema: SpecialistStepResultSchema,
    retries: 1,
    execute: async ({ inputData, requestContext, abortSignal }) => {
      const packet = slot.symbol ? inputData.packets?.[slot.symbol] : inputData.packet;
      if (!packet) {
        if (comparison) {
          // F-01: the symbol's packet was blocked and excluded by collect.
          return {
            ok: false,
            agentName: slot.desk,
            error: 'data-unavailable',
          };
        }
        throw new Error(`Committee specialist ${slot.desk} is missing its packet.`);
      }
      await deps.onProgress?.(slot.desk);
      const startedAt = Date.now();
      const signal = runSignal ?? abortSignal;
      let result: Awaited<ReturnType<typeof runSpecialistGeneration>>;
      try {
        result = await runSpecialistGeneration({
          name: slot.desk,
          prompt: inputData.prompt,
          packet,
          ...(slot.symbol ? { symbol: slot.symbol } : {}),
          requestContext: requestContext as RequestContext<ModeRequestContext>,
          signal,
          startedAt,
          deps: specialistDeps,
        });
      } catch (error) {
        if (isDeadlineAbort(runSignals)) {
          recordCommitteeStepSpan({
            step: slot.desk,
            runId: (requestContext.get('runId') as string | undefined) ?? 'unknown',
            symbol: slot.symbol ?? packet.symbol,
            mode: ctx.mode,
            packetId: packet.packetId,
            latencyMs: Date.now() - startedAt,
            ok: false,
            error: 'deadline',
          });
          return {
            ok: false,
            agentName: slot.desk,
            error: 'deadline',
            latencyMs: Date.now() - startedAt,
          };
        }
        throw error;
      }
      recordCommitteeStepSpan({
        step: slot.desk,
        runId: (requestContext.get('runId') as string | undefined) ?? 'unknown',
        symbol: slot.symbol ?? packet.symbol,
        mode: ctx.mode,
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
  });
}

export function createVerifyStep(ctx: WorkflowContext) {
  const { deps, comparison, symbols, slots, strict, mode } = ctx;

  return createStep({
    id: 'verify',
    inputSchema: z.unknown(),
    outputSchema: VerifyOutputSchema,
    execute: async ({ requestContext, getStepResult }) => {
      await deps.onProgress?.('verify');
      const failedDesks = new Set<MastraSpecialistName>();
      const failedLabels: string[] = [];
      const deadlineAgents: string[] = [];
      let sawDeadline = false;

      for (const slot of slots) {
        const marker = readSpecialistStepResultById(getStepResult, slot.stepId);
        if (comparison) {
          // F-01: `data-unavailable` is the skip marker for a blocked symbol —
          // the fusion discloses it; only real desk failures are terminal.
          if (marker?.ok === false && marker.error !== 'data-unavailable') {
            failedDesks.add(slot.desk);
            failedLabels.push(`${slot.desk} desk on ${slot.symbol}`);
            if (marker.error === 'deadline') sawDeadline = true;
          }
        } else if (!marker?.ok) {
          failedDesks.add(slot.desk);
          failedLabels.push(slot.desk);
          if (marker?.error === 'deadline') deadlineAgents.push(slot.desk);
        }
      }

      const collect = readCollectPacketResult(getStepResult);
      recordCommitteeStepSpan({
        step: 'verify',
        runId: (requestContext?.get('runId') as string | undefined) ?? 'unknown',
        symbol: comparison ? symbols.join('/') : (collect?.packet.symbol ?? 'unknown'),
        mode,
        ...(collect?.packet.packetId && !comparison ? { packetId: collect.packet.packetId } : {}),
        ok: failedLabels.length === 0,
        ...(failedLabels.length > 0 ? { error: failedLabels.join(', ') } : {}),
      });

      const shouldFail = comparison ? failedLabels.length > 0 : strict && failedDesks.size > 0;
      if (shouldFail) {
        const detail = comparison
          ? sawDeadline
            ? `Comparison analysis timed out (${failedLabels.join(', ')} did not complete) — please retry. No partial answer was returned.`
            : `Comparison analysis could not complete (${failedLabels.join(', ')}). No partial answer was returned — please retry.`
          : deadlineAgents.length > 0
            ? `Committee analysis timed out (${deadlineAgents.join(', ')} did not complete) — please retry. No partial answer was returned.`
            : undefined;
        throw new MastraModeStrictFailureError([...failedDesks], undefined, detail);
      }
      return { failedAgents: comparison ? [] : [...failedDesks] };
    },
  });
}

export function createFusionStep(ctx: WorkflowContext) {
  const { deps, comparison, symbols, slots, runSignals, runSignal, generationLedger, maxSteps } =
    ctx;

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
      if (!collect) throw new Error('Committee workflow is missing collect-packet output.');
      if (comparison && !collect.packets) {
        throw new Error('Comparison workflow is missing per-symbol collect-packet output.');
      }

      const opinions: MastraModeOpinion[] = [];
      const executionStats: MastraGenerationStats[] = [];
      const failedAgents: MastraSpecialistName[] = [];
      for (const slot of slots) {
        const marker = readSpecialistStepResultById(getStepResult, slot.stepId);
        if (!marker?.ok || !marker.opinion || !marker.stats) {
          if (!comparison) failedAgents.push(slot.desk);
          continue;
        }
        opinions.push({
          agentName: slot.desk,
          ...(slot.symbol ? { symbol: slot.symbol } : {}),
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

      const synthesisDeps = {
        model: deps.model,
        modelId: deps.modelId,
        providerId: deps.providerId,
        ...(deps.resolveModelForAgent ? { resolveModelForAgent: deps.resolveModelForAgent } : {}),
        memory: deps.memory,
        fusionCallOptions: deps.fusionCallOptions,
        ...(deps.inputProcessors ? { inputProcessors: deps.inputProcessors } : {}),
        ...(deps.scorers ? { scorers: deps.scorers } : {}),
        ledger: generationLedger,
        maxSteps,
      };

      let synthesis: CommitteeSynthesisResult;
      try {
        if (comparison) {
          const packetRecord = collect.packets ?? {};
          // F-01: only healthy packets reach the fusion; blocked symbols are
          // disclosed through the prompt instead of being compared.
          const packets = symbols
            .map((symbol) => packetRecord[symbol])
            .filter((packet): packet is SymbolResearchPacket => Boolean(packet));
          synthesis = await synthesizeComparisonAnswer({
            prompt: collect.prompt,
            packets,
            opinions,
            executionStats,
            ...(collect.blockedSymbols && collect.blockedSymbols.length > 0
              ? { blockedSymbols: collect.blockedSymbols }
              : {}),
            ...(collect.blockedMissingData && collect.blockedMissingData.length > 0
              ? { blockedMissingData: collect.blockedMissingData }
              : {}),
            requestContext: requestContext as RequestContext<ModeRequestContext>,
            ...(signal ? { signal } : {}),
            deps: synthesisDeps,
          });
        } else {
          synthesis = await synthesizeCommitteeAnswer({
            mode: collect.mode,
            prompt: collect.prompt,
            packet: collect.packet,
            opinions,
            executionStats,
            requestContext: requestContext as RequestContext<ModeRequestContext>,
            ...(signal ? { signal } : {}),
            deps: synthesisDeps,
          });
        }
      } catch (error) {
        if (isDeadlineAbort(runSignals)) {
          throw new MastraModeStrictFailureError(
            ['fusion'],
            new Error(
              comparison
                ? 'Comparison analysis timed out during fusion — please retry.'
                : 'Committee analysis timed out during fusion — please retry.',
            ),
          );
        }
        throw error;
      }

      recordCommitteeStepSpan({
        step: 'fusion',
        runId: (requestContext.get('runId') as string | undefined) ?? 'unknown',
        symbol: comparison ? symbols.join('/') : collect.packet.symbol,
        mode: comparison ? ctx.mode : collect.mode,
        ...(comparison ? {} : { packetId: collect.packet.packetId }),
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
        packet: collect.packet,
        ...(comparison ? { packets: collect.packets } : {}),
        ...(comparison && collect.blockedSymbols && collect.blockedSymbols.length > 0
          ? { blockedSymbols: collect.blockedSymbols }
          : {}),
        stats: synthesis.stats,
        failedAgents,
        totalCostUsd: generationLedger.total(),
      };
    },
  });
}
