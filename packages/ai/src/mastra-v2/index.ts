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
 * Public barrel for the Kestrel Mastra foundation and shared workflows.
 *
 * Durable execution, streaming agents, guardrails, evals, mutation approvals,
 * and observability are registered through `./registry.ts` so the capability
 * policy stays the single fail-closed gate.
 */

export {
  createMastraStorage,
  initializeMastraStorage,
  mastraDirectConnectionString,
  mastraSslOptions,
  pruneMastraStorage,
  type MastraStorageKind,
  type MastraStorageResult,
} from './storage';
export {
  MastraPinoLogger,
  createRunLogger,
  logWorkflowEnd,
  logWorkflowError,
  logWorkflowStart,
  type RunStepLogIdentity,
  type WorkflowStepLogArgs,
} from './logger';
export {
  createMastraObservability,
  flushMastraObservability,
  isLangfuseConfigured,
  langfuseBaseUrl,
  langfuseSamplingRatio,
  langfuseTraceUrl,
  mastraTraceTags,
  runTracingOptions,
  shutdownMastraObservability,
  type MastraRunTraceIdentity,
} from './telemetry';
export {
  createKestrelMastra,
  getKestrelMastra,
  initializeKestrelMastra,
  _resetKestrelMastra,
  _setKestrelMastraForTest,
  MASTRA_DEFAULT_HOST,
  MASTRA_DEFAULT_PORT,
  type KestrelMastra,
  type KestrelMastraOptions,
} from './instance';
export {
  MASTRA_WORKFLOW_IDS,
  providerFromModel,
  summarizeWorkflowRunState,
  toMastraRunView,
  workflowIdForKind,
  type MastraRunScoreView,
  type MastraRunView,
  type RunTelemetryRow,
  type WorkflowRunStatusView,
} from './observability-view';
export {
  createKestrelEmbedder,
  createKestrelMemory,
  createKestrelVectorStore,
  getKestrelVectorStore,
  kestrelMemoryOptions,
  observationalMemoryAllowanceUsd,
  _resetKestrelVectorStore,
  KESTREL_MEMORY_LAST_MESSAGES,
  KESTREL_MEMORY_SEMANTIC_TOP_K,
  KESTREL_WORKING_MEMORY_TEMPLATE,
  OBSERVATIONAL_MEMORY_REFINEMENTS_PER_MESSAGE,
  OBSERVATIONAL_MEMORY_REFINING_STEP_USD,
  type CreateKestrelMemoryArgs,
  type KestrelEmbedderArgs,
  type KestrelMemoryOptionsArgs,
} from './memory';
export {
  backfillThreadHistoryIfNeeded,
  memoryCallOptions,
  prepareKestrelMemory,
  seedWorkingMemoryFromSettings,
  type MemoryCallOptionsArgs,
  type PrepareKestrelMemoryArgs,
  type PreparedKestrelMemory,
  type WorkingMemorySeedArgs,
} from './context';
export {
  FullAnalysisLeaseLostError,
  FullAnalysisPayloadSchema,
  FULL_ANALYSIS_LEASE_MS,
  updateFullAnalysisProgress,
} from './workflows/full-analysis';
export {
  assertMastraRegistryComplete,
  mastraRegistrationFor,
  resolveMastraAgent,
  resolveMastraWorkflow,
  MASTRA_COMPONENT_REGISTRY,
  MastraComponentKindMismatchError,
  MastraComponentNotRegisteredError,
  type MastraComponentRegistration,
  type MastraCapabilityRegistrationId,
} from './registry';
export {
  buildConversationGuardrails,
  buildGuardrailInputProcessors,
  buildResearchGuardrails,
  buildResearchGuardrailsAvailability,
  GuardrailUnavailableError,
  type GuardrailMode,
  type GuardrailOptions,
  type GuardrailStrategy,
} from './guardrails';
export {
  buildConversationScorers,
  buildCustomScorers,
  buildPrebuiltScorers,
  buildResearchScorers,
  createDeterministicScorer,
  resolveJudgeModel,
  PREBUILT_SCORER_IDS,
  type BuiltScorers,
  type BuildScorersOptions,
  type ScorerId,
  type ScorerSampling,
} from './evals/scorers';
export {
  createCitationScorer,
  createGroundingScorer,
  CUSTOM_SCORER_IDS,
  type CitationScorerRunInput,
  type GroundingScorerRunInput,
} from './evals/custom';
export {
  createMastraEvalGate,
  createScoreThresholdGate,
  recordsToGateObserved,
  type MastraGateScoreInput,
} from './evals/gate';
export { listScoresForRun, toScoreRecord, type ScoreRecord } from './evals/scores';
export {
  loadLegacyEvalCases,
  migrateLegacyEvalCasesToDatasets,
  runDatasetExperiment,
  DATASET_IDS,
  DATASET_LABELS,
  type DatasetExperimentSummary,
  type DatasetMigrationSummary,
  type EvalDatasetId,
  type RunDatasetExperimentOptions,
} from './evals/datasets';
export {
  createCommitteeWorkflow,
  CommitteeWorkflowInputSchema,
  CommitteeWorkflowOutputSchema,
  type CommitteeWorkflowDeps,
} from '../committee/workflow';
export {
  MastraModeStrictFailureError,
  MastraAnalysisModeSchema,
  MastraModeOpinionSchema,
  MastraSpecialistNameSchema,
  REQUEST_CONTEXT_SCHEMA,
  SPECIALISTS_BY_MODE,
  MODE_POLICY,
  committeeModePolicy,
  committeeProgressStages,
  type CommitteeStepId,
  type CommitteeModePolicy,
  type CommitteeModelMetadata,
  type CollectPacketFn,
  type MastraAnalysisMode,
  type MastraModeOpinion,
  type MastraSpecialistName,
  type ModeRequestContext,
} from '../committee/types';
export {
  createXauusdReportWorkflow,
  XauusdReportWorkflowInputSchema,
  XauusdReportWorkflowOutputSchema,
  type XauusdReportWorkflowDeps,
} from './workflows/xauusd-report';
export {
  cancelMutationWorkflow,
  createMutationWorkflow,
  runMutationWorkflow,
  MutationInputSchema,
  MutationKindSchema,
  MutationOutputSchema,
  MutationResumeSchema,
  MutationSuspendPayloadSchema,
  mutationInputDigest,
  parseMutationRunContext,
  type MutationExecutor,
  type MutationExecutorResult,
  type MutationAtomicExecutor,
  type MutationRunContext,
  type MutationInput,
  type MutationKind,
  type MutationOutput,
  type MutationResumeInput,
  type MutationSuspendPayload,
  type MutationWorkflowDeps,
  type RunMutationResult,
} from './workflows/mutation';
