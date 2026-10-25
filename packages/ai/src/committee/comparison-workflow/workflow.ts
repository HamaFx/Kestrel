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
 * Comparison committee step graph (DEC-05 split of comparison-workflow.ts).
 * The former module is now the graph plus one shared run context: the step
 * bodies live in `steps.ts` and receive the same closures this file builds —
 * ledger, deadline signals, comparison desks, and the specialist deps copy.
 */

import { readFeatureFlag, type Symbol } from '@kestrel/shared';
import { Workflow } from '@mastra/core/workflows';

import { collectMultiSymbolPackets } from '../../mastra-v2/packets/packet-cache';
import { createGenerationLedger } from '../../persistence/generation-ledger';
import {
  committeeProgressStages,
  REQUEST_CONTEXT_SCHEMA,
  type CollectComparisonPacketsFn,
  type MastraAnalysisMode,
  type MastraSpecialistName,
} from '../types';
import {
  asParallelSteps,
  CommitteeWorkflowInputSchema,
  CommitteeWorkflowOutputSchema,
  runSignalsFor,
  specialistRunnerDepsFor,
  type CommitteeWorkflowDeps,
} from '../workflow-shared';
import { createComparisonCollectStep } from './collect-step';
import type { ComparisonStepContext } from './context';
import { createComparisonFusionStep } from './fusion-step';
import { createComparisonSpecialistSteps } from './specialist-steps';
import { createComparisonVerifyStep } from './verify-step';

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

  const stepContext: ComparisonStepContext = {
    deps,
    mode,
    symbols: comparisonSymbols,
    deskNames: comparisonDeskNames,
    stepIdFor: comparisonStepId,
    collectComparisonPackets,
    specialistDeps,
    runSignals,
    runSignal,
    progressStages,
    generationLedger,
    maxSteps,
  };

  const comparisonCollectStep = createComparisonCollectStep(stepContext);
  const comparisonSpecialistSteps = createComparisonSpecialistSteps(stepContext);
  const comparisonVerifyStep = createComparisonVerifyStep(stepContext);
  const comparisonFusionStep = createComparisonFusionStep(stepContext);

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
