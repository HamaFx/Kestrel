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

// Phase 3 Task 4 — AI chat orchestration service boundary.
//
// Replaces the `api-boundary.ts` pass-through for the chat pipeline: unified
// routing, execution plans, the full-analysis queue, and the confirmed-mutation
// workflow. Route handlers and their `_lib` helpers import from here instead
// of `@kestrel/ai/mastra-v2` so the controller stays on the service layer.

import 'server-only';

export {
  assertMastraMutationAllowed,
  assertRegisteredSystemAction,
  assertSystemActionAuthorized,
  cancelFullAnalysisRun,
  cancelMutationWorkflow,
  createExecutionPlan,
  createMutationWorkflow,
  enqueueFullAnalysis,
  extractMastraSymbols,
  getFullAnalysisQueueHealth,
  getFullAnalysisRun,
  getKestrelMastra,
  isHighConfidenceMutationIntent,
  isInjectionAttempt,
  isMastraMutationEnabled,
  isMastraXauusdFollowupCandidate,
  MAX_COMPARISON_SYMBOLS,
  mastraComparisonScope,
  MutationExtractionError,
  MutationKindSchema,
  parseMutationRunContext,
  resolveMastraModeModel,
  resolveMode,
  routeUnified,
  runMutationWorkflow,
  toMastraRunView,
  verifyMutationConfirmationToken,
  CanonicalEvidenceBlockedError,
  GuardrailUnavailableError,
  TripWire,
  type ExecutionPlan,
  type MutationExecutor,
  type MutationExecutorResult,
} from '@kestrel/ai/mastra-v2';
export {
  extractUserMessageText,
  isBudgetEnforced,
  syncIntermarketResonance,
  withDiagnostics,
} from '@kestrel/ai';
export { BudgetExceededError } from '@kestrel/ai/cost';
export {
  executeMutationOnce,
  getMutationExecution,
  MutationExecutionConflictError,
  MutationExecutionContextError,
} from '@kestrel/db';
