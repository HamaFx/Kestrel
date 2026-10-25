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
 * XAUUSD verified-report workflow graph (DEC-05 split of xauusd-report.ts).
 *
 *   collect-packet (deterministic, fail closed on blocked)
 *     → generate (structured output, no tools — deterministic packet only)
 *     → repair (bounded dowhile: re-generate with verifier findings, then
 *               re-verify; each attempt is an observable workflow step)
 *     → finalize (ready, deterministic disclosure patch, or terminal error)
 *
 * The step bodies live in `steps.ts`; the workflow stays a per-request
 * factory: the BYOK agent, memory, provider id, and abort signal are closed
 * over at build time.
 */

import { Workflow } from '@mastra/core/workflows';

import { XauusdRequestContextSchema } from '../../shared/types';
import {
  XauusdReportWorkflowInputSchema,
  XauusdReportWorkflowOutputSchema,
  type XauusdReportWorkflowDeps,
} from './schemas';
import {
  createCollectPacketStep,
  createFinalizeStep,
  createGenerateStep,
  createRepairStep,
  MAX_REPAIR_ATTEMPTS,
} from './steps';

/**
 * Build a per-request XAUUSD verified-report workflow. The generate step
 * carries no retries (matching the pre-workflow behavior: provider errors
 * surface immediately); the repair loop is the bounded, observable retry
 * for verification/structured-output failures.
 */
export function createXauusdReportWorkflow(deps: XauusdReportWorkflowDeps): Workflow {
  const collectPacketStep = createCollectPacketStep(deps);
  const generateStep = createGenerateStep(deps);
  const repairStep = createRepairStep(deps);
  const finalizeStep = createFinalizeStep();

  const workflow = new Workflow({
    id: 'xauusd-research',
    inputSchema: XauusdReportWorkflowInputSchema,
    outputSchema: XauusdReportWorkflowOutputSchema,
    requestContextSchema: XauusdRequestContextSchema,
    ...(deps.mastra ? { mastra: deps.mastra } : {}),
  })
    .then(collectPacketStep)
    .then(generateStep)
    .dowhile(repairStep, async ({ getStepResult, iterationCount }) => {
      const repair = getStepResult('repair') as { verified?: boolean };
      return repair?.verified !== true && iterationCount < MAX_REPAIR_ATTEMPTS;
    })
    .then(finalizeStep)
    .commit() as unknown as Workflow;

  return workflow;
}
