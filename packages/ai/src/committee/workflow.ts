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
 * Committee workflow: one N-symbol pipeline.
 *
 * A single-symbol committee is the `symbols.length === 1` case of the same
 * collect → parallel desk passes → verify → fusion graph used for comparisons.
 * The collect step decides whether to fetch one packet or a healthy subset;
 * the specialist/verify/fusion steps are parameterized over the run's slots,
 * so there is no second workflow to keep in sync.
 */

import { readFeatureFlag, type Symbol } from '@kestrel/shared';
import { Workflow as WorkflowBuilder, type Workflow } from '@mastra/core/workflows';

import {
  collectMultiSymbolPackets,
  collectSymbolResearchPacketCached,
} from '../mastra-v2/packets/packet-cache';
import { createGenerationLedger } from '../persistence/generation-ledger';
import {
  committeeModePolicy,
  committeeProgressStages,
  REQUEST_CONTEXT_SCHEMA,
  SPECIALISTS_BY_MODE,
  type MastraAnalysisMode,
  type MastraSpecialistName,
} from './types';
import {
  asParallelSteps,
  CommitteeWorkflowInputSchema,
  CommitteeWorkflowOutputSchema,
  runSignalsFor,
  specialistRunnerDepsFor,
  type CommitteeWorkflowDeps,
} from './workflow-shared';
import {
  createCollectStep,
  createFusionStep,
  createSpecialistStep,
  createVerifyStep,
  type WorkflowContext,
  type WorkflowSlot,
} from './workflow-steps';

export {
  CommitteeWorkflowInputSchema,
  CommitteeWorkflowOutputSchema,
  type CommitteeWorkflowDeps,
} from './workflow-shared';

/**
 * Specialist desks for a comparison run.
 *
 * Full mode runs the same four desks as the single-symbol committee. Single
 * mode keeps the lean technical pass; the risk desk rides behind the
 * `ENABLE_COMPARISON_RISK_DESK` rollout flag.
 */
export function comparisonDeskNamesForMode(
  mode: MastraAnalysisMode,
  riskDeskEnabled: boolean,
): readonly MastraSpecialistName[] {
  if (mode === 'full') return SPECIALISTS_BY_MODE.full;
  return riskDeskEnabled ? ['technical', 'risk'] : ['technical'];
}

export function createCommitteeWorkflow(
  deps: CommitteeWorkflowDeps,
  mode: MastraAnalysisMode,
  workflowId: string = 'symbol-research',
): Workflow {
  const comparisonSymbols: readonly Symbol[] = [...new Set(deps.comparisonSymbols ?? [])];
  const comparison = comparisonSymbols.length >= 2;
  const policy = committeeModePolicy(mode);
  const deskNames = comparison
    ? comparisonDeskNamesForMode(mode, readFeatureFlag('ENABLE_COMPARISON_RISK_DESK'))
    : policy.specialists;
  const slots: readonly WorkflowSlot[] = comparison
    ? comparisonSymbols.flatMap((symbol) =>
        deskNames.map((desk) => ({
          desk,
          symbol,
          stepId: `${desk}-${symbol.toLowerCase()}`,
        })),
      )
    : deskNames.map((desk) => ({ desk, stepId: desk }));

  const generationLedger = deps.ledger ?? createGenerationLedger();
  const maxSteps = deps.maxSteps ?? 1;
  const { runSignals, runSignal } = runSignalsFor(deps);
  const specialistDeps = specialistRunnerDepsFor(deps, generationLedger, maxSteps);

  const ctx: WorkflowContext = {
    deps,
    mode,
    comparison,
    symbols: comparison ? comparisonSymbols : [],
    slots,
    strict: policy.strict,
    progressStages: committeeProgressStages(mode),
    generationLedger,
    maxSteps,
    collectPacket: deps.collectPacket ?? collectSymbolResearchPacketCached,
    collectComparisonPackets: deps.collectComparisonPackets ?? collectMultiSymbolPackets,
    runSignals,
    runSignal,
    specialistDeps,
  };

  const workflow = new WorkflowBuilder({
    id: workflowId,
    inputSchema: CommitteeWorkflowInputSchema,
    outputSchema: CommitteeWorkflowOutputSchema,
    requestContextSchema: REQUEST_CONTEXT_SCHEMA,
    ...(deps.mastra ? { mastra: deps.mastra } : {}),
  })
    .then(createCollectStep(ctx))
    .parallel(asParallelSteps(slots.map((slot) => createSpecialistStep(ctx, slot))))
    .then(createVerifyStep(ctx))
    .then(createFusionStep(ctx))
    .commit() as unknown as Workflow;

  return workflow;
}
