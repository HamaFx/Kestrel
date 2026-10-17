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
 * Committee workflow — one Mastra workflow shared by the two analysis modes
 * (single: one technical desk; full: four desks).
 *
 * Graph:
 *
 *   collect-packet (deterministic, fail closed on blocked)
 *     → parallel(technical[, fundamental, risk, sentiment])
 *     → critique (full only; cross-critique round, see ENABLE_COMMITTEE_CRITIQUE)
 *     → verify (both modes strict: any required specialist failure is terminal)
 *     → fusion (LLM synthesis, grounded by the fusion verifier)
 */

import { readFeatureFlag } from '@kestrel/shared';
import type { Mastra } from '@mastra/core';
import type { AgentMemoryOption } from '@mastra/core/agent';
import type { MastraScorers } from '@mastra/core/evals';
import type { MastraMemory } from '@mastra/core/memory';
import type { InputProcessorOrWorkflow } from '@mastra/core/processors';
import type { RequestContext } from '@mastra/core/request-context';
import { createStep, Workflow } from '@mastra/core/workflows';
import type { LanguageModel } from 'ai';
import { z } from 'zod';

import { createGenerationLedger, type GenerationLedger } from '../generation-ledger';
import {
  collectSymbolResearchPacketCached,
  SymbolResearchPacketSchema,
} from '../mastra-v2/packets/packet-cache';
import type { MastraGenerationStats } from '../mastra-v2/shared/stats';
import type { ToolContext } from '../tool-context';
import {
  combineRunSignal,
  deadlineSignalFor,
  isDeadlineAbort,
  type DeadlineSignals,
} from '../utils/timeout';
import {
  CritiqueStepOutputSchema,
  DebateStepOutputSchema,
  readCritiqueStepResult,
  readDebateStepResult,
  runCritiqueGeneration,
  runDebateRevision,
  type CritiqueStepResult,
  type DebateStepResult,
} from './critique';
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
  CommitteeCritiqueSchema,
  committeeModelMetadata,
  committeeModePolicy,
  committeeProgressStages,
  MastraAnalysisModeSchema,
  MastraModeOpinionSchema,
  MastraModeStrictFailureError,
  MastraSpecialistNameSchema,
  REQUEST_CONTEXT_SCHEMA,
  zeroStats,
  type CollectPacketFn,
  type CommitteeAgentId,
  type CommitteeCritique,
  type CommitteeStepId,
  type MastraAnalysisMode,
  type MastraModeOpinion,
  type MastraSpecialistName,
  type ModeRequestContext,
} from './types';

export const CommitteeWorkflowInputSchema = z.object({
  prompt: z.string().min(1),
  symbol: SymbolResearchPacketSchema.shape.symbol,
  mode: MastraAnalysisModeSchema,
});

export const CommitteeWorkflowOutputSchema = z.object({
  status: z.enum(['ready', 'blocked']),
  blockedText: z.string().optional(),
  finalText: z.string().optional(),
  opinions: z.array(MastraModeOpinionSchema),
  /** §3.2 cross-critique records (Q6: ON by default for full). */
  critiques: z.array(CommitteeCritiqueSchema),
  packet: SymbolResearchPacketSchema,
  stats: z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    toolCalls: z.number(),
    steps: z.number(),
  }),
  failedAgents: z.array(MastraSpecialistNameSchema),
  totalCostUsd: z.number().nonnegative().default(0),
});

const SpecialistStepInputSchema = z.object({
  packet: SymbolResearchPacketSchema,
  prompt: z.string(),
});

const VerifyOutputSchema = z.object({
  failedAgents: z.array(MastraSpecialistNameSchema),
});

export interface CommitteeWorkflowDeps {
  model: LanguageModel;
  modelId: string;
  providerId: string;
  memory: MastraMemory;
  /** Read thread context; the specialist runner enforces read-only by default. */
  specialistCallOptions: AgentMemoryOption;
  /** The fusion/output layer owns writes to the conversation thread. */
  fusionCallOptions: AgentMemoryOption;
  signal?: AbortSignal;
  /**
   * Audit plan §3.1 (Q1: quality always) — optional per-agent top-tier model
   * resolution. Returns null to fall back to the run's primary model. The
   * resolver must never downgrade to a cheaper tier for cost.
   */
  resolveModelForAgent?: (agent: CommitteeAgentId) => {
    model: LanguageModel;
    modelId: string;
    providerId: string;
  } | null;
  /** Shared Mastra instance for run-snapshot persistence (optional; in-memory when absent). */
  mastra?: Mastra;
  /** Input processors (Unicode normalizer + prompt-injection detector). */
  inputProcessors?: Array<InputProcessorOrWorkflow>;
  /** Research-specific processors; falls back to inputProcessors for compatibility. */
  researchInputProcessors?: Array<InputProcessorOrWorkflow>;
  /** Sampled live scorers for research agents (from `buildResearchScorers`). */
  scorers?: MastraScorers;
  ledger?: GenerationLedger;
  /** Optional progress sink; each stage is emitted exactly once per run. */
  onProgress?: (step: CommitteeStepId) => void | Promise<void>;
  /** Capability-derived bounded step limit for specialist/fusion LLM calls. */
  maxSteps?: number;
  /** Deterministic evidence packet collector; defaults to symbol-research. */
  collectPacket?: CollectPacketFn;
  /**
   * Committee deadline (audit plan §1.7, Q3). When set, a deadline abort is
   * converted into an explicit failure marker / strict error instead of an
   * opaque route abort. Sync web runs pass 45s; durable worker runs omit it.
   */
  deadlineMs?: number;
  toolContext?: ToolContext;
  disabledTools?: readonly string[] | null;
}

export function createCommitteeWorkflow(
  deps: CommitteeWorkflowDeps,
  mode: MastraAnalysisMode,
  workflowId: string = 'symbol-research',
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
  const deadlineSignal = deadlineSignalFor(deps.deadlineMs);
  const runSignals: DeadlineSignals = {
    ...(deps.signal ? { userSignal: deps.signal } : {}),
    ...(deadlineSignal ? { deadlineSignal } : {}),
  };
  const runSignal = combineRunSignal(runSignals);

  const collectPacketStep = createStep({
    id: 'collect-packet',
    inputSchema: CommitteeWorkflowInputSchema,
    outputSchema: CollectPacketOutputSchema,
    execute: async ({ inputData, requestContext, abortSignal, bail }) => {
      const signal = runSignal ?? abortSignal;
      await deps.onProgress?.(progressStages[0]!);
      const packet = await collectPacket(inputData.symbol, signal);
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
            deps: {
              model: deps.model,
              modelId: deps.modelId,
              providerId: deps.providerId,
              ...(deps.resolveModelForAgent
                ? { resolveModelForAgent: deps.resolveModelForAgent }
                : {}),
              memory: deps.memory,
              specialistCallOptions: deps.specialistCallOptions,
              ...(deps.researchInputProcessors
                ? { researchInputProcessors: deps.researchInputProcessors }
                : {}),
              ...(deps.inputProcessors ? { inputProcessors: deps.inputProcessors } : {}),
              ...(deps.scorers ? { scorers: deps.scorers } : {}),
              ledger: generationLedger,
              maxSteps,
              ...(deps.toolContext ? { toolContext: deps.toolContext } : {}),
              ...(deps.disabledTools ? { disabledTools: deps.disabledTools } : {}),
            },
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

  const critiqueStep = createStep({
    id: 'critique',
    inputSchema: z.unknown(),
    outputSchema: CritiqueStepOutputSchema,
    retries: 1,
    execute: async ({ requestContext, getStepResult, abortSignal }) => {
      if (!critiqueEnabled) return { critiques: [], failedAgents: [] };
      await deps.onProgress?.('critique' as const);
      const collect = readCollectPacketResult(getStepResult);
      if (!collect) return { critiques: [], failedAgents: [] };
      const signal = runSignal ?? abortSignal;
      const startedAt = Date.now();
      const peers: MastraModeOpinion[] = [];
      for (const name of specialists) {
        const marker = readSpecialistStepResult(getStepResult, name);
        if (marker?.ok && marker.opinion) {
          peers.push({
            agentName: name,
            bias: marker.opinion.bias,
            confidence: marker.opinion.confidence,
            reasoning: marker.opinion.reasoning,
            rawData: marker.opinion.details,
            ...committeeModelMetadata(
              marker.model ?? deps.modelId,
              marker.providerId ?? deps.providerId,
              marker.stats!,
              marker.costUsd ?? 0,
              marker.latencyMs ?? 0,
            ),
          });
        }
      }
      if (peers.length < 2) return { critiques: [], failedAgents: [] };

      const results = await Promise.all(
        peers.map((peer) =>
          runCritiqueGeneration({
            name: peer.agentName,
            prompt: collect.prompt,
            packet: collect.packet,
            ownOpinion: peer,
            peerOpinions: peers.filter((other) => other.agentName !== peer.agentName),
            requestContext: requestContext as RequestContext<ModeRequestContext>,
            signal,
            startedAt,
            deps: {
              model: deps.model,
              modelId: deps.modelId,
              providerId: deps.providerId,
              ...(deps.resolveModelForAgent
                ? { resolveModelForAgent: deps.resolveModelForAgent }
                : {}),
              memory: deps.memory,
              specialistCallOptions: deps.specialistCallOptions,
              ...(deps.researchInputProcessors
                ? { inputProcessors: deps.researchInputProcessors as never }
                : {}),
              ...(deps.inputProcessors ? { inputProcessors: deps.inputProcessors as never } : {}),
              ...(deps.scorers ? { scorers: deps.scorers } : {}),
              ledger: generationLedger,
              maxSteps,
            },
          }).catch((error: unknown): CritiqueStepResult => {
            if (isDeadlineAbort(runSignals)) {
              return {
                ok: false,
                agentName: peer.agentName,
                error: 'deadline',
                latencyMs: Date.now() - startedAt,
              };
            }
            throw error;
          }),
        ),
      );

      const critiques: CommitteeCritique[] = [];
      const failedAgents: string[] = [];
      for (const result of results) {
        recordCommitteeStepSpan({
          step: 'critique',
          runId: (requestContext.get('runId') as string | undefined) ?? 'unknown',
          symbol: collect.packet.symbol,
          mode,
          packetId: collect.packet.packetId,
          ...(result.critique ? { modelId: result.critique.model } : {}),
          ...(result.latencyMs !== undefined ? { latencyMs: result.latencyMs } : {}),
          ...(result.critique ? { tokenCostUsd: result.critique.costUsd } : {}),
          ok: result.ok,
          ...(result.error ? { error: result.error } : {}),
        });
        if (result.ok && result.critique) critiques.push(result.critique);
        else failedAgents.push(result.agentName ?? 'unknown');
      }
      return { critiques, failedAgents };
    },
  });

  const debateStep = createStep({
    id: 'debate',
    inputSchema: z.unknown(),
    outputSchema: DebateStepOutputSchema,
    retries: 1,
    execute: async ({ requestContext, getStepResult, abortSignal }) => {
      if (!debateEnabled) return { revisions: [], failedAgents: [] };
      const collect = readCollectPacketResult(getStepResult);
      const critiqueOutput = readCritiqueStepResult(getStepResult);
      const critiques = critiqueOutput?.critiques ?? [];
      if (!collect || critiques.length === 0) return { revisions: [], failedAgents: [] };
      const signal = runSignal ?? abortSignal;
      const startedAt = Date.now();
      const revisable: MastraModeOpinion[] = [];
      for (const name of specialists) {
        const marker = readSpecialistStepResult(getStepResult, name);
        if (marker?.ok && marker.opinion && critiques.some((c) => c.agentName === name)) {
          revisable.push({
            agentName: name,
            bias: marker.opinion.bias,
            confidence: marker.opinion.confidence,
            reasoning: marker.opinion.reasoning,
            rawData: marker.opinion.details,
            ...committeeModelMetadata(
              marker.model ?? deps.modelId,
              marker.providerId ?? deps.providerId,
              marker.stats!,
              marker.costUsd ?? 0,
              marker.latencyMs ?? 0,
            ),
          });
        }
      }

      const results = await Promise.all(
        revisable.map((opinion) =>
          runDebateRevision({
            name: opinion.agentName,
            prompt: collect.prompt,
            packet: collect.packet,
            ownOpinion: opinion,
            critiques,
            requestContext: requestContext as RequestContext<ModeRequestContext>,
            signal,
            startedAt,
            deps: {
              model: deps.model,
              modelId: deps.modelId,
              providerId: deps.providerId,
              ...(deps.resolveModelForAgent
                ? { resolveModelForAgent: deps.resolveModelForAgent }
                : {}),
              memory: deps.memory,
              specialistCallOptions: deps.specialistCallOptions,
              ...(deps.researchInputProcessors
                ? { inputProcessors: deps.researchInputProcessors as never }
                : {}),
              ...(deps.inputProcessors ? { inputProcessors: deps.inputProcessors as never } : {}),
              ...(deps.scorers ? { scorers: deps.scorers } : {}),
              ledger: generationLedger,
              maxSteps,
            },
          }).catch((error: unknown): DebateStepResult => {
            if (isDeadlineAbort(runSignals)) {
              return {
                ok: false,
                agentName: opinion.agentName,
                error: 'deadline',
                latencyMs: Date.now() - startedAt,
              };
            }
            throw error;
          }),
        ),
      );

      const revisions: MastraModeOpinion[] = [];
      const failedAgents: string[] = [];
      for (const result of results) {
        recordCommitteeStepSpan({
          step: 'debate',
          runId: (requestContext.get('runId') as string | undefined) ?? 'unknown',
          symbol: collect.packet.symbol,
          mode,
          packetId: collect.packet.packetId,
          ...(result.opinion ? { modelId: result.opinion.model } : {}),
          ...(result.latencyMs !== undefined ? { latencyMs: result.latencyMs } : {}),
          ...(result.opinion ? { tokenCostUsd: result.opinion.costUsd } : {}),
          ok: result.ok,
          ...(result.error ? { error: result.error } : {}),
        });
        if (result.ok && result.opinion) revisions.push(result.opinion);
        else failedAgents.push(result.agentName ?? 'unknown');
      }
      return { revisions, failedAgents };
    },
  });

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
    .parallel(specialistSteps as never)
    .then(critiqueStep)
    .then(debateStep)
    .then(verifyStep)
    .then(fusionStep)
    .commit() as unknown as Workflow;

  return workflow;
}
