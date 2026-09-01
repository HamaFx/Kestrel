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

export {
  decideMastraExecution,
  capabilityForRoute,
  capabilityDefinitionForRoute,
  type MastraExecutionDecision,
  type MastraExecutionDecisionInput,
  type MastraExecutionRoute,
} from './execution-decision';
export { PERSISTENCE_OWNERSHIP, persistenceOwnerFor } from './persistence-boundary';
export type { DrizzlePersistenceOwner, MastraPersistenceOwner } from './persistence-boundary';
export {
  MASTRA_CAPABILITIES,
  CANONICAL_READ_ONLY_TOOL_NAMES,
  LEGACY_DOMAIN_TOOL_NAMES,
  evaluateMastraCapability,
  getMastraCapability,
  type MastraCapability,
  type MastraCapabilityDecision,
  type MastraCapabilityId,
  type MastraCapabilityMode,
  type MastraCapabilityRequest,
  type MastraCapabilityRejectionReason,
  type MastraCapabilityScope,
  type MastraCapabilityToolName,
  type MastraContentTrust,
  type MastraEvidencePolicy,
} from './capabilities';
export {
  CAPABILITY_REGISTRY,
  CANONICAL_TOOL_REGISTRY,
  canonicalReadOnlyToolNames,
  isReadOnlyCapability,
  toolsForCapability,
  toolsForRoutingDomain,
  readOnlyToolsForRoutingDomain,
} from './capability-registry';
export {
  collectSymbolResearchPacket,
  serializeSymbolResearchPacket,
  SymbolResearchPacketSchema,
  SymbolResearchInputSchema,
  extractSymbolFromPrompt,
  isSafeSymbolResearchPrompt,
  type SymbolResearchPacket,
  type SymbolResearchEvidence,
} from './symbol-research';
export {
  verifyMastraOpinion,
  type OpinionVerification,
} from '../mastra-v2/workflows/opinion-verifier';
export { checkCanonicalEvidence, type CanonicalEvidenceCheck } from './canonical-evidence';
export {
  summarizeConfidenceCalibration,
  type ConfidenceObservation,
  type ConfidenceCalibrationSummary,
} from './confidence';
export {
  runMastraMode,
  MastraModeStrictFailureError,
  resolveMastraModeModel,
  type MastraAnalysisMode,
  type MastraModeResult,
  type MastraModeOpinion,
  type RunMastraModeArgs,
} from './mode-runner';
export {
  claimNextFullAnalysisRun,
  completeFullAnalysisRun,
  FullAnalysisLeaseLostError,
  enqueueFullAnalysis,
  failFullAnalysisRun,
  fullAnalysisRunId,
  getFullAnalysisQueueHealth,
  getFullAnalysisRun,
  purgeOldFullAnalysisRuns,
  recoverStaleFullAnalysisRuns,
  FullAnalysisPayloadSchema,
  FULL_ANALYSIS_LEASE_MS,
  requeueFullAnalysisRun,
  touchFullAnalysisRun,
  updateFullAnalysisProgress,
  FULL_ANALYSIS_WORKFLOW_ID,
  type FullAnalysisClaim,
  type FullAnalysisEnqueueInput,
  type FullAnalysisPayload,
  type FullAnalysisRunView,
} from '../mastra-v2/workflows/full-analysis';
export {
  createXauusdMastraAgent,
  runXauusdMastraProof,
  type RunXauusdMastraProofArgs,
  type XauusdMastraAgentOptions,
} from './agent';
export {
  resolveXauusdMastraModel,
  runXauusdMastra,
  runXauusdMastraConversation,
  runXauusdMastraConversationStream,
  type RunXauusdMastraArgs,
  type XauusdMastraConversationStream,
  type XauusdMastraModel,
  type XauusdMastraSettings,
  type XauusdMastraRunResult,
} from './run';
export {
  xauusdCalendarTool,
  xauusdCandlesTool,
  xauusdCorrelationTool,
  xauusdFundamentalContextTool,
  xauusdIndicatorsTool,
  xauusdIntermarketTool,
  xauusdMastraConversationToolNames,
  xauusdMastraTools,
  xauusdMarketStructureTool,
  xauusdPriceTool,
  xauusdResearchPacketTool,
  xauusdSessionLevelsTool,
  xauusdTechnicalAnalysisTool,
  xauusdVolatilityTool,
  xauusdNewsTool,
  xauusdSocialSentimentTool,
} from './tools';
export { collectXauusdResearchPacket } from './research-packet';
export {
  runMastraBackgroundText,
  type RunMastraBackgroundTextArgs,
  type MastraBackgroundTextResult,
} from './background-text';
export {
  assertMastraMutationAllowed,
  assertMastraMutationDraftAllowed,
  assertRegisteredSystemAction,
  assertSystemActionAuthorized,
  isRegisteredSystemAction,
  SYSTEM_ACTION_REGISTRY,
  evaluateMastraMutation,
  issueMutationConfirmationToken,
  storedConfirmationForToken,
  verifyMutationConfirmationToken,
  confirmationSecret,
  MastraMutationNameSchema,
  MUTATION_TOKEN_TTL_MS,
  type MastraMutationDecision,
  type MastraMutationName,
  type MastraMutationRequest,
  type MastraMutationVerificationOptions,
  type MutationConfirmationToken,
  type StoredMutationConfirmation,
  type SystemActionId,
} from './mutation-policy';
export {
  createKestrelMastra,
  getKestrelMastra,
  initializeKestrelMastra,
  _setKestrelMastraForTest,
  type KestrelMastra,
} from '../mastra-v2/instance';
export { pruneMastraStorage } from '../mastra-v2/storage';
export {
  createRunLogger,
  logWorkflowEnd,
  logWorkflowError,
  logWorkflowStart,
  type RunStepLogIdentity,
  type WorkflowStepLogArgs,
} from '../mastra-v2/logger';
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
} from '../mastra-v2/telemetry';
export {
  toMastraRunView,
  providerFromModel,
  summarizeWorkflowRunState,
  workflowIdForKind,
  MASTRA_WORKFLOW_IDS,
  type MastraRunScoreView,
  type MastraRunView,
  type WorkflowRunStatusView,
  type RunTelemetryRow,
} from '../mastra-v2/observability-view';
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
} from '../mastra-v2/workflows/mutation';
export {
  mastraCotTool,
  mastraKnowledgeTool,
  mastraReadOnlyTools,
  mastraResonanceTool,
  mastraSeasonalityTool,
  mastraWebSearchTool,
} from './read-only-tools';
export { XauusdResearchPacketSchema, type XauusdResearchPacket } from './research-types';
export {
  runMastraCanonicalChat,
  runMastraCanonicalChatStream,
  type MastraCanonicalChatResult,
  type MastraCanonicalChatStream,
  type RunMastraCanonicalChatArgs,
} from './canonical-chat';
export {
  runMastraStructured,
  runMastraText,
  type MastraStructuredRunArgs,
  type MastraTextRunArgs,
  type MastraTextRunResult,
} from './text-runner';
export {
  generateThreadTitle,
  deterministicFallbackTitle,
  cleanTitleForPersistence,
  type GenerateThreadTitleArgs,
  type GenerateThreadTitleResult,
} from './title';
export { maybeGenerateThreadTitle, type MaybeGenerateThreadTitleArgs } from './title-service';
export { classifyMutationRequest, isMastraMutationEnabled } from './mutation-detect';
export type { SemanticRoutingAccounting } from '../semantic-routing';
export { resolveModel, type ResolveModelEnv } from '../model';
export {
  buildMutationInput,
  extractMutationInput,
  mutationExtractionSchemaFor,
  MutationExtractionError,
  MUTATION_EXTRACTION_SCHEMAS,
  type ExtractMutationInputArgs,
} from './mutation-extract';
export { XauusdResearchReportSchema, type XauusdResearchReport } from './report-types';
export {
  requireVerifiedXauusdReport,
  verifyXauusdReport,
  XauusdReportVerificationError,
  type XauusdReportVerification,
} from './report-verifier';
export {
  evaluateXauusdReportCase,
  summarizeXauusdReportEvaluations,
  type XauusdReportEvaluation,
  type XauusdReportEvaluationCase,
  type XauusdReportEvaluationSummary,
} from './report-evaluation';
export {
  createEvidenceId,
  freshnessFromAge,
  qualityFromWarnings,
  requireXauusdUserContext,
} from './evidence';
export {
  buildConversationGuardrails,
  buildGuardrailInputProcessors,
  buildResearchGuardrails,
  buildResearchGuardrailsAvailability,
  GuardrailUnavailableError,
  type GuardrailMode,
  type GuardrailOptions,
  type GuardrailStrategy,
} from '../mastra-v2/guardrails';
export {
  beginMastraRun,
  createMastraRunFinalizer,
  errorCodeForMastra,
  executeMastraTool,
  finishMastraRun,
  isMastraTelemetryDegraded,
  resetMastraTelemetryHealth,
  getMastraGenerationStats,
  mastraOutcomeForError,
  MASTRA_XAUUSD_AGENT_ID,
  MASTRA_XAUUSD_AGENT_VERSION,
  type MastraGenerationStats,
  type MastraRunObservation,
  type MastraRunOutcome,
  type MastraUsageLike,
} from './telemetry';
export type { MastraGenerationResultLike } from './stats';
export {
  buildXauusdModelEvidenceContext,
  serializeXauusdModelEvidenceContext,
  MODEL_CONTEXT_CANDLE_LIMIT,
  MODEL_CONTEXT_INDICATOR_LIMIT,
} from './model-context';
export {
  XAUUSD,
  EvidenceFreshnessSchema,
  EvidenceMetadataSchema,
  EvidenceQualitySchema,
  XauusdCandlesEvidenceSchema,
  XauusdIndicatorsEvidenceSchema,
  XauusdPriceEvidenceSchema,
  XauusdMacroEvidenceSchema,
  XauusdRequestContextSchema,
  type XauusdCandlesEvidence,
  type XauusdIndicatorsEvidence,
  type XauusdPriceEvidence,
  type XauusdMacroEvidence,
  type XauusdRequestContext,
} from './types';
