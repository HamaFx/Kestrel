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
 * Committee workflow entry point (audit 2026-10-18, Phase 4 split).
 *
 * The former 1,100-line god workflow now dispatches to one of two graphs:
 *
 *   single-workflow.ts       single-symbol committee
 *                            (collect → specialists → critique → debate →
 *                             verify → fusion)
 *   comparison-workflow.ts   bounded multi-symbol comparison
 *                            (per-symbol packets → per-symbol desk passes →
 *                             verify → cross-symbol fusion)
 *
 * This module stays the module's public surface: it re-exports the shared
 * input/output schemas and deps contract, and `createCommitteeWorkflow` picks
 * a graph from `deps.comparisonSymbols`. The dispatcher is transparent — every
 * existing import site and integration test is unchanged.
 */

import type { Symbol } from '@kestrel/shared';
import type { Workflow } from '@mastra/core/workflows';

import { createComparisonCommitteeWorkflow } from './comparison-workflow';
import { createSingleCommitteeWorkflow } from './single-workflow';
import type { MastraAnalysisMode } from './types';
import type { CommitteeWorkflowDeps } from './workflow-shared';

export {
  CommitteeWorkflowInputSchema,
  CommitteeWorkflowOutputSchema,
  type CommitteeWorkflowDeps,
} from './workflow-shared';

export function createCommitteeWorkflow(
  deps: CommitteeWorkflowDeps,
  mode: MastraAnalysisMode,
  workflowId: string = 'symbol-research',
): Workflow {
  const comparisonSymbols: readonly Symbol[] = [...new Set(deps.comparisonSymbols ?? [])];
  if (comparisonSymbols.length >= 2) {
    return createComparisonCommitteeWorkflow(deps, comparisonSymbols, mode, workflowId);
  }
  return createSingleCommitteeWorkflow(deps, mode, workflowId);
}
