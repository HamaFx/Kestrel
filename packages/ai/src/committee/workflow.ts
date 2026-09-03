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
 * Committee workflow (Phase 6) — one Mastra workflow shared by the
 * single / Quick / Standard / Full committee analysis modes.
 *
 * Graph:
 *
 *   collect-packet (deterministic, fail closed on blocked)
 *     → parallel(technical[, fundamental[, risk[, sentiment]]])
 *     → verify (Full strict: any required specialist failure is terminal)
 *     → fusion (LLM synthesis for standard/full, direct formatting for
 *               single/quick; same per-step retry policy as specialists)
 *
 * The only differences between modes are the specialist set, limits, and
 * strictness (see `committeeModePolicy`). Progress is emitted once per
 * logical stage (`committeeProgressStages`) so durable queue projections
 * never see duplicate step events.
 *
 * The workflow is a **per-request factory**: BYOK models and per-call
 * memory are request-scoped, so the graph is built per call with the
 * resolved dependencies closed over. Run snapshots persist to the shared
 * Mastra storage when a `mastra` instance is provided (operator/Studio
 * visibility); without one the run stays in-memory (tests, hermetic runs).
 */

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
import type { MastraGenerationStats } from '../mastra/stats';
import { collectSymbolResearchPacket, SymbolResearchPacketSchema } from '../mastra/symbol-research';
import {
  readCollectPacketResult,
  readSpecialistStepResult,
  runSpecialistGeneration,
  SpecialistStepResultSchema,
} from './specialist-runner';
import { synthesizeCommitteeAnswer } from './synthesizer';
import {
  CollectPacketOutputSchema,
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
}

/**
 * Build a per-request committee workflow. All BYOK-sensitive dependencies
 * (model, memory, call options, abort signal) are closed over at build time;
 * the run input carries prompt/symbol/mode and the mode fixes the specialist
 * set and strict flag once per request via `committeeModePolicy`.
 *
 * `workflowId` overrides the storage key for the run records. The default
 * `symbol-research` identity is the shared research workflow; the durable
 * Full-mode queue uses `full-analysis` so claimed runs never collide with
 * synchronous Quick/Standard/Single snapshots.
 */
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
  const collectPacket = deps.collectPacket ?? collectSymbolResearchPacket;

  const collectPacketStep = createStep({
    id: 'collect-packet',
    inputSchema: CommitteeWorkflowInputSchema,
    outputSchema: CollectPacketOutputSchema,
    execute: async ({ inputData, abortSignal, bail }) => {
      const signal = deps.signal ?? abortSignal;
      // First stage is always collect-packet (see committeeProgressStages).
      await deps.onProgress?.(progressStages[0]!);
      const packet = await collectPacket(inputData.symbol, signal);
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
    },
  });

  const specialistSteps = specialists.map((name) =>
    createStep({
      id: name,
      inputSchema: SpecialistStepInputSchema,
      outputSchema: SpecialistStepResultSchema,
      // Per-step retry with backoff (workflow retryConfig supplies the delay):
      // transient provider errors throw so Mastra retries; permanent errors
      // return an explicit failure marker so non-strict modes can continue.
      retries: 1,
      execute: async ({ inputData, requestContext, abortSignal }) => {
        await deps.onProgress?.(name);
        const startedAt = Date.now();
        const signal = deps.signal ?? abortSignal;
        return runSpecialistGeneration({
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
            memory: deps.memory,
            specialistCallOptions: deps.specialistCallOptions,
            ...(deps.researchInputProcessors
              ? { researchInputProcessors: deps.researchInputProcessors }
              : {}),
            ...(deps.inputProcessors ? { inputProcessors: deps.inputProcessors } : {}),
            ...(deps.scorers ? { scorers: deps.scorers } : {}),
            ledger: generationLedger,
            maxSteps,
          },
        });
      },
    }),
  );

  const verifyStep = createStep({
    id: 'verify',
    inputSchema: z.unknown(),
    outputSchema: VerifyOutputSchema,
    execute: async ({ getStepResult }) => {
      await deps.onProgress?.('verify' as const);
      const failedAgents: MastraSpecialistName[] = [];
      // Inside a step, getStepResult returns the raw step output (not the
      // { status, output } wrapper that appears on the run result's steps).
      for (const name of specialists) {
        const marker = readSpecialistStepResult(getStepResult, name);
        if (marker?.ok === false) failedAgents.push(name);
      }
      if (strict && failedAgents.length > 0) {
        throw new MastraModeStrictFailureError(failedAgents);
      }
      return { failedAgents };
    },
  });

  const fusionStep = createStep({
    id: 'fusion',
    inputSchema: z.unknown(),
    outputSchema: CommitteeWorkflowOutputSchema,
    // Same retry policy as the specialists — no retry regression on fusion.
    retries: 1,
    execute: async ({ requestContext, getStepResult, abortSignal }) => {
      const signal = deps.signal ?? abortSignal;
      await deps.onProgress?.('fusion' as const);
      const collect = readCollectPacketResult(getStepResult);
      if (!collect) throw new Error('Committee workflow is missing collect-packet output.');
      const { packet, prompt, mode: runMode } = collect;
      const failedAgents: MastraSpecialistName[] = [];
      const opinions: MastraModeOpinion[] = [];
      const executionStats: MastraGenerationStats[] = [];

      for (const name of specialists) {
        // Raw step output (getStepResult inside a step returns the output),
        // read once through the typed schema at the workflow boundary.
        const marker = readSpecialistStepResult(getStepResult, name);
        if (marker?.ok === false) {
          failedAgents.push(name);
          continue;
        }
        if (!marker?.ok || !marker.opinion || !marker.stats) continue;
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
        executionStats.push(marker.stats);
      }

      const { finalText, stats } = await synthesizeCommitteeAnswer({
        mode: runMode,
        prompt,
        packet,
        opinions,
        executionStats,
        requestContext: requestContext as RequestContext<ModeRequestContext>,
        signal,
        deps: {
          model: deps.model,
          modelId: deps.modelId,
          providerId: deps.providerId,
          memory: deps.memory,
          fusionCallOptions: deps.fusionCallOptions,
          ...(deps.inputProcessors ? { inputProcessors: deps.inputProcessors } : {}),
          ...(deps.scorers ? { scorers: deps.scorers } : {}),
          ledger: generationLedger,
          maxSteps,
        },
      });

      return {
        status: 'ready' as const,
        finalText,
        opinions,
        packet,
        stats,
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
    .then(verifyStep)
    .then(fusionStep)
    .commit() as unknown as Workflow;

  return workflow;
}
