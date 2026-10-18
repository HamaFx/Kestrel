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
 * Cross-critique and debate steps (audit 2026-10-18, Phase 4 split).
 * Extracted verbatim from the single-symbol god workflow: the critique round
 * (§3.2, `ENABLE_COMMITTEE_CRITIQUE`) has each desk review its peers'
 * verified opinions, and the optional debate round (`ENABLE_COMMITTEE_DEBATE`)
 * lets a desk revise its own opinion after reading them. Both are Full-mode
 * only and keep their rollback flags; the factories receive one shared
 * context so the single workflow file stays under the size budget.
 */

import type { RequestContext } from '@mastra/core/request-context';
import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';

import type { GenerationLedger } from '../generation-ledger';
import { isDeadlineAbort, type DeadlineSignals } from '../utils/timeout';
import {
  CritiqueStepOutputSchema,
  DebateStepOutputSchema,
  readCritiqueStepResult,
  runCritiqueGeneration,
  runDebateRevision,
  type CritiqueStepResult,
  type DebateStepResult,
} from './critique';
import { readCollectPacketResult, readSpecialistStepResult } from './specialist-runner';
import { recordCommitteeStepSpan } from './step-spans';
import {
  committeeModelMetadata,
  type CommitteeCritique,
  type MastraAnalysisMode,
  type MastraModeOpinion,
  type MastraSpecialistName,
  type ModeRequestContext,
} from './types';
import { specialistRunnerDepsFor, type CommitteeWorkflowDeps } from './workflow-shared';

/** Shared context for the Full-mode critique/debate steps. */
export interface CritiqueStepContext {
  deps: CommitteeWorkflowDeps;
  specialists: readonly MastraSpecialistName[];
  mode: MastraAnalysisMode;
  generationLedger: GenerationLedger;
  maxSteps: number;
  runSignals: DeadlineSignals;
  runSignal: AbortSignal | undefined;
}

/** One cross-critique round step (no-op when `enabled` is false). */
export function createCritiqueStep(
  ctx: CritiqueStepContext,
  options: { enabled: boolean },
) {
  const { deps, specialists, mode, generationLedger, maxSteps, runSignals, runSignal } = ctx;
  const critiqueEnabled = options.enabled;
  const specialistDeps = specialistRunnerDepsFor(deps, generationLedger, maxSteps);

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
            deps: specialistDeps,
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

  
  return critiqueStep;
}

/** One optional debate/revision round step (no-op when `enabled` is false). */
export function createDebateStep(ctx: CritiqueStepContext, options: { enabled: boolean }) {
  const { deps, specialists, mode, generationLedger, maxSteps, runSignals, runSignal } = ctx;
  const debateEnabled = options.enabled;
  const specialistDeps = specialistRunnerDepsFor(deps, generationLedger, maxSteps);

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
            deps: specialistDeps,
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

  return debateStep;
}
