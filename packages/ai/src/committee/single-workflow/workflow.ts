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
 * Single-symbol committee step graph (DEC-05 split of single-workflow.ts).
 *
 *   collect-packet (deterministic, fail closed on blocked)
 *     → parallel(technical[, fundamental, risk, sentiment])
 *     → critique (full only; cross-critique round, see ENABLE_COMMITTEE_CRITIQUE)
 *     → debate (full only; ENABLE_COMMITTEE_DEBATE)
 *     → verify (both modes strict: any required specialist failure is terminal)
 *     → fusion (LLM synthesis, grounded by the fusion verifier)
 *
 * The step bodies live in the sibling `*-step.ts` files and receive the same
 * closures this file builds — policy, deadline signals, ledger, and the
 * specialist deps copy.
 */

import { readFeatureFlag } from '@kestrel/shared';
import { Workflow } from '@mastra/core/workflows';

import { collectSymbolResearchPacketCached } from '../../mastra-v2/packets/packet-cache';
import { createGenerationLedger } from '../../persistence/generation-ledger';
import { createCritiqueStep, createDebateStep, type CritiqueStepContext } from '../critique-steps';
import {
  committeeModePolicy,
  committeeProgressStages,
  REQUEST_CONTEXT_SCHEMA,
  type MastraAnalysisMode,
} from '../types';
import {
  asParallelSteps,
  CommitteeWorkflowInputSchema,
  CommitteeWorkflowOutputSchema,
  runSignalsFor,
  specialistRunnerDepsFor,
  type CommitteeWorkflowDeps,
} from '../workflow-shared';
import { createSingleCollectStep } from './collect-step';
import type { SingleStepContext, SingleVerifyStepContext } from './context';
import { createSingleFusionStep } from './fusion-step';
import { createSingleSpecialistSteps } from './specialist-steps';
import { createSingleVerifyStep } from './verify-step';

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

  const stepContext: SingleStepContext = {
    deps,
    mode,
    specialists,
    strict,
    progressStages,
    generationLedger,
    maxSteps,
    collectPacket,
    runSignals,
    runSignal,
    specialistDeps,
  };

  const collectPacketStep = createSingleCollectStep(stepContext);
  const specialistSteps = createSingleSpecialistSteps(stepContext);

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

  const verifyContext: SingleVerifyStepContext = { ...stepContext, critiqueEnabled, debateEnabled };
  const verifyStep = createSingleVerifyStep(verifyContext);
  const fusionStep = createSingleFusionStep(verifyContext);

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
