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

// Shared comparison-run context (DEC-05 split of comparison-workflow.ts).
// `workflow.ts` builds it once per run and hands it to every step factory so
// the step bodies see exactly the values the former single module closed over.

import type { Symbol } from '@kestrel/shared';

import type { GenerationLedger } from '../../persistence/generation-ledger';
import type { DeadlineSignals } from '../../utils/timeout';
import type {
  CollectComparisonPacketsFn,
  CommitteeStepId,
  MastraAnalysisMode,
  MastraSpecialistName,
} from '../types';
import type { CommitteeRunnerDeps, CommitteeWorkflowDeps } from '../workflow-shared';

export interface ComparisonStepContext {
  deps: CommitteeWorkflowDeps;
  mode: MastraAnalysisMode;
  symbols: readonly Symbol[];
  deskNames: readonly MastraSpecialistName[];
  stepIdFor: (desk: MastraSpecialistName, symbol: string) => string;
  collectComparisonPackets: CollectComparisonPacketsFn;
  specialistDeps: CommitteeRunnerDeps;
  runSignals: DeadlineSignals;
  runSignal: AbortSignal | undefined;
  progressStages: readonly CommitteeStepId[];
  generationLedger: GenerationLedger;
  maxSteps: number;
}
