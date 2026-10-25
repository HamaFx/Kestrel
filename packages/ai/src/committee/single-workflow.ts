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
 * Single-symbol committee workflow (audit 2026-10-18, Phase 4 split).
 * Extracted verbatim from the former god workflow:
 *
 *   collect-packet (deterministic, fail closed on blocked)
 *     → parallel(technical[, fundamental, risk, sentiment])
 *     → critique (full only; cross-critique round, see ENABLE_COMMITTEE_CRITIQUE)
 *     → debate (full only; ENABLE_COMMITTEE_DEBATE)
 *     → verify (both modes strict: any required specialist failure is terminal)
 *     → fusion (LLM synthesis, grounded by the fusion verifier)
 *
 * `workflow.ts` dispatches here for ordinary runs (and stays the module entry
 * point for schemas and the deps contract).
 */

import { readFeatureFlag } from '@kestrel/shared';
import type { RequestContext } from '@mastra/core/request-context';
import { createStep, Workflow } from '@mastra/core/workflows';
import { z } from 'zod';

import { createGenerationLedger } from '../generation-ledger';
import { collectSymbolResearchPacketCached } from '../mastra-v2/packets/packet-cache';
import type { MastraGenerationStats } from '../mastra-v2/shared/stats';
import { enrichPacketForUser } from '../plugins/enrichers';
import { isDeadlineAbort } from '../utils/timeout';
import { readCritiqueStepResult, readDebateStepResult } from './critique';
import { createCritiqueStep, createDebateStep, type CritiqueStepContext } from './critique-steps';
import {
  readCollectPacketResult,
  readSpecialistStepResult,
  runSpecialistGeneration,
  SpecialistStepResultSchema,
} from './specialist-runner';
import { recordCommitteeStepSpan } from './step-spans';
import { synthesizeCommitteeAnswer } from './synthesizer';
import {
  CollectPacketOutputSchema,
  committeeModelMetadata,
  committeeModePolicy,
  committeeProgressStages,
  MastraModeStrictFailureError,
  REQUEST_CONTEXT_SCHEMA,
  zeroStats,
  type CommitteeCritique,
  type MastraAnalysisMode,
  type MastraModeOpinion,
  type MastraSpecialistName,
  type ModeRequestContext,
} from './types';
import {
  asParallelSteps,
  CommitteeWorkflowInputSchema,
  CommitteeWorkflowOutputSchema,
  runSignalsFor,
  specialistRunnerDepsFor,
  SpecialistStepInputSchema,
  VerifyOutputSchema,
  type CommitteeWorkflowDeps,
} from './workflow-shared';

export function createSingleCommitteeWorkflow(
  deps: CommitteeWorkflowDeps,
  mode: MastraAnalysisMode,
  workflowId: string,
): Workflow {
  const policy = committeeModePolicy(mode);
  const specialists = policy.specialists;
  const strict = policy.strict;
  const progressStages = committeeProgressStages(mode);
  const generationLedger = deps.ledger ?? createGenerationLedger();
  const maxSteps = deps.maxSteps ?? 1;
  // Audit plan §2.1: the default collector is the 30s fresh-only packet cache;
  // tests and callers can still inject a bare collector via `collectPacket`.
  const collectPacket = deps.collectPacket ?? collectSymbolResearchPacketCached;
  // Audit plan §1.7: one deadline signal shared by every step in this run.
  const { runSignals, runSignal } = runSignalsFor(deps);
  // One deps copy for every specialist/critique/debate step (P2-02 cleanup).
  const specialistDeps = specialistRunnerDepsFor(deps, generationLedger, maxSteps);

  const collectPacketStep = createStep({
    id: 'collect-packet',
    inputSchema: CommitteeWorkflowInputSchema,
    outputSchema: CollectPacketOutputSchema,
    execute: async ({ inputData, requestContext, abortSignal, bail }) => {
      const signal = runSignal ?? abortSignal;
      await deps.onProgress?.(progressStages[0]!);
      const basePacket = await collectPacket(inputData.symbol, signal);
      const userId = requestContext.get('userId') as string | undefined;
      const packet = userId ? await enrichPacketForUser(basePacket, userId, signal) : basePacket;
      recordCommitteeStepSpan({
        step: 'collect-packet',
        runId: (requestContext.get('runId') as string | undefined) ?? 'unknown',
        symbol: packet.symbol,
        mode: inputData.mode,
        packetId: packet.packetId,
        ok: packet.status === 'ready',
      });
      if (packet.status === 'blocked') {
        const text = `I could not complete ${packet.symbol} ${inputData.mode} analysis because required market data is unavailable.\n\n${packet.missingData.join('\n')}`;
        return bail({
          status: 'blocked' as const,
          blockedText: text,
          opinions: [],
          critiques: [],
          packet,
          stats: zeroStats(),
          failedAgents: [],
          totalCostUsd: 0,
        });
      }
      return { packet, prompt: inputData.prompt, mode: inputData.mode };
    },
  });

  const specialistSteps = specialists.map((name) =>
    createStep({
      id: name,
      inputSchema: SpecialistStepInputSchema,
      outputSchema: SpecialistStepResultSchema,
      retries: 1,
      execute: async ({ inputData, requestContext, abortSignal }) => {
        await deps.onProgress?.(name);
        const startedAt = Date.now();
        const signal = runSignal ?? abortSignal;
        let result: Awaited<ReturnType<typeof runSpecialistGeneration>>;
        try {
          result = await runSpecialistGeneration({
            name,
            prompt: inputData.prompt,
            packet: inputData.packet,
            requestContext: requestContext as RequestContext<ModeRequestContext>,
            signal,
            startedAt,
            deps: specialistDeps,
          });
        } catch (error) {
          if (isDeadlineAbort(runSignals)) {
            recordCommitteeStepSpan({
              step: name,
              runId: (requestContext.get('runId') as string | undefined) ?? 'unknown',
              symbol: inputData.packet.symbol,
              mode,
              packetId: inputData.packet.packetId,
              latencyMs: Date.now() - startedAt,
              ok: false,
              error: 'deadline',
            });
            return {
              ok: false,
              agentName: name,
              error: 'deadline',
              latencyMs: Date.now() - startedAt,
            };
          }
          throw error;
        }
        recordCommitteeStepSpan({
          step: name,
          runId: (requestContext.get('runId') as string | undefined) ?? 'unknown',
          symbol: inputData.packet.symbol,
          mode,
          packetId: inputData.packet.packetId,
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
  );

  const critiqueEnabled = mode === 'full' && readFeatureFlag('ENABLE_COMMITTEE_CRITIQUE');
  const debateEnabled = critiqueEnabled && readFeatureFlag('ENABLE_COMMITTEE_DEBATE');
  const critiqueRoundContext: CritiqueStepContext = {
    deps,
    specialists,
    mode,
    generationLedger,
    maxSteps,
    runSignals,
    runSignal,
  };
  const critiqueStep = createCritiqueStep(critiqueRoundContext, { enabled: critiqueEnabled });
  const debateStep = createDebateStep(critiqueRoundContext, { enabled: debateEnabled });

  const verifyStep = createStep({
    id: 'verify',
    inputSchema: z.unknown(),
    outputSchema: VerifyOutputSchema,
    execute: async ({ requestContext, getStepResult }) => {
      await deps.onProgress?.('verify' as const);
      const failedAgents: MastraSpecialistName[] = [];
      const deadlineAgents: string[] = [];
      for (const name of specialists) {
        const marker = readSpecialistStepResult(getStepResult, name);
        if (marker?.ok === false) {
          failedAgents.push(name);
          if (marker.error === 'deadline') deadlineAgents.push(name);
        }
      }
      if (critiqueEnabled) {
        const critiqueOutput = readCritiqueStepResult(getStepResult);
        for (const failed of critiqueOutput?.failedAgents ?? []) {
          const name = failed as MastraSpecialistName;
          if (!failedAgents.includes(name)) failedAgents.push(name);
        }
      }
      if (debateEnabled) {
        const debateOutput = readDebateStepResult(getStepResult);
        for (const failed of debateOutput?.failedAgents ?? []) {
          const name = failed as MastraSpecialistName;
          if (!failedAgents.includes(name)) failedAgents.push(name);
        }
      }
      const collectForSpan = readCollectPacketResult(getStepResult);
      recordCommitteeStepSpan({
        step: 'verify',
        runId: (requestContext?.get('runId') as string | undefined) ?? 'unknown',
        symbol: collectForSpan?.packet.symbol ?? 'unknown',
        mode,
        ...(collectForSpan?.packet.packetId ? { packetId: collectForSpan.packet.packetId } : {}),
        ok: failedAgents.length === 0,
        ...(failedAgents.length > 0 ? { error: failedAgents.join(',') } : {}),
      });
      if (strict && failedAgents.length > 0) {
        throw new MastraModeStrictFailureError(
          failedAgents,
          undefined,
          deadlineAgents.length > 0
            ? `Committee analysis timed out (${deadlineAgents.join(', ')} did not complete) — please retry. No partial answer was returned.`
            : undefined,
        );
      }
      return { failedAgents };
    },
  });

  const fusionStep = createStep({
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

  const workflow = new Workflow({
    id: workflowId,
    inputSchema: CommitteeWorkflowInputSchema,
    outputSchema: CommitteeWorkflowOutputSchema,
    requestContextSchema: REQUEST_CONTEXT_SCHEMA,
    retryConfig: { attempts: 2, delay: 2_000 },
    ...(deps.mastra ? { mastra: deps.mastra } : {}),
  })
    .then(collectPacketStep)
    .parallel(asParallelSteps(specialistSteps))
    .then(critiqueStep)
    .then(debateStep)
    .then(verifyStep)
    .then(fusionStep)
    .commit() as unknown as Workflow;

  return workflow;
}
