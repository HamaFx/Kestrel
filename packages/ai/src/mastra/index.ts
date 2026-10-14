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
  createExecutionPlan,
  parseExecutionPlan,
  serializeExecutionPlan,
  resolvedModelSnapshotForPlan,
  requireExecutionPlanModel,
  assertExecutionPlanRoute,
  ExecutionPlanSchema,
  type ExecutionPlan,
  type CreateExecutionPlanInput,
} from '../mastra-v2/planning/execution-plan';
export {
  extractMastraSymbol,
  autoDetectMode,
  resolveMode,
  isInjectionAttempt,
  isMastraSymbolCandidate,
  isMastraXauusdCandidate,
  isMastraXauusdFollowupCandidate,
  isMutationIntent,
  mastraXauusdChatKind,
  messageText,
} from '../mastra-v2/planning/routing-policy';
export {
  routeUnified,
  type UnifiedRoutingDecision,
  type UnifiedRouterInput,
  type UnifiedMutationKind,
} from '../mastra-v2/planning/router';
export { isHighConfidenceMutationIntent, isReadOnlyContext } from '../routing-keywords';
export {
  decideMastraExecution,
  capabilityForRoute,
  capabilityDefinitionForRoute,
  type MastraExecutionDecision,
  type MastraExecutionDecisionInput,
  type MastraExecutionRoute,
} from '../mastra-v2/planning/execution-decision';
export { PERSISTENCE_OWNERSHIP, persistenceOwnerFor } from '../mastra-v2/shared/persistence-boundary';
export type { DrizzlePersistenceOwner, MastraPersistenceOwner } from '../mastra-v2/shared/persistence-boundary';
export {
  MASTRA_CAPABILITIES,
  manifestForCapability,
  manifestToolNames,
  manifestToolsForDomain,
  capabilityUiMetadata,
  capabilityTelemetryLabels,
  assertCapabilityManifestIntegrity,
  SENSITIVE_USER_READ_TOOL_NAMES,
  evaluateMastraCapability,
  getMastraCapability,
  type MastraCapability,
  type MastraCapabilityDecision,
  type MastraCapabilityId,
  type MastraCapabilityMode,
  type MastraCapabilityRequest,
  type MastraCapabilityRejectionReason,
  type MastraCapabilityScope,
  type MastraRoutingDomain,
  type MastraCapabilityToolName,
  type MastraContentTrust,
  type MastraManifestTool,
  type MastraToolCategory,
  type MastraToolAccess,
  type MastraEvidencePolicy,
} from '../mastra-v2/capabilities/index';
export {
  collectSymbolResearchPacket,
  serializeSymbolResearchPacket,
  SymbolResearchPacketSchema,
  SymbolResearchInputSchema,
  extractSymbolFromPrompt,
  isSafeSymbolResearchPrompt,
  type SymbolResearchPacket,
  type SymbolResearchEvidence,
} from '../mastra-v2/packets/symbol-research';
export { verifyMastraOpinion, type OpinionVerification } from '../committee/verifier';
export {
  FusionAnswerSchema,
  renderFusionAnswer,
  type FusionAnswer,
} from '../committee/synthesizer';
export {
  assertCanonicalEvidence,
  CANONICAL_EVIDENCE_BLOCKED_MESSAGE,
  CanonicalEvidenceBlockedError,
  checkCanonicalEvidence,
  type CanonicalEvidenceCheck,
  type CanonicalToolEvidence,
} from '../mastra-v2/agents/canonical/evidence';
export { committeeProgressSnapshot } from '../mastra-v2/shared/progress';
export {
  summarizeConfidenceCalibration,
  type ConfidenceObservation,
  type ConfidenceCalibrationSummary,
} from '../mastra-v2/shared/confidence';
export {
  runMastraMode,
  MastraModeStrictFailureError,
  resolveMastraModeModel,
  type MastraAnalysisMode,
  type MastraModeResult,
  type MastraModeOpinion,
  type RunMastraModeArgs,
} from '../mastra-v2/planning/mode-runner';
export {
  claimNextFullAnalysisRun,
  completeFullAnalysisRun,
  FullAnalysisLeaseLostError,
  FullAnalysisHeartbeatError,
  enqueueFullAnalysis,
  failFullAnalysisRun,
  fullAnalysisRunId,
  getFullAnalysisQueueHealth,
  getFullAnalysisRun,
  purgeOldFullAnalysisRuns,
  recoverStaleFullAnalysisRuns,
  FullAnalysisPayloadSchema,
  FULL_ANALYSIS_ESTIMATE_USD,
  FULL_ANALYSIS_LEASE_MS,
  FULL_ANALYSIS_TURN_ESTIMATE_USD,
  requeueFullAnalysisRun,
  touchFullAnalysisRun,
  updateFullAnalysisProgress,
  validateFullAnalysisPlanIdentity,
  FULL_ANALYSIS_WORKFLOW_ID,
  type FullAnalysisClaim,
  type FullAnalysisEnqueueInput,
  type FullAnalysisPayload,
  type FullAnalysisRunView,
} from '../mastra-v2/workflows/full-analysis';
export {
  classifyFullAnalysisFailure,
  fullAnalysisRetryAction,
  FullAnalysisBudgetAdmissionError,
  FullAnalysisQuotaExceededError,
  isRetryableAnalysisError,
  type FullAnalysisFailureCategory,
  type FullAnalysisRetryAction,
  type FullAnalysisRetryDecision,
} from '../mastra-v2/workflows/full-analysis-retry';
export {
  createCommitteeWorkflow,
  CommitteeWorkflowInputSchema,
  CommitteeWorkflowOutputSchema,
  type CommitteeWorkflowDeps,
} from '../committee/workflow';
export {
  MastraAnalysisModeSchema,
  MastraModeOpinionSchema,
  MastraSpecialistNameSchema,
  REQUEST_CONTEXT_SCHEMA,
  SPECIALISTS_BY_MODE,
  MODE_POLICY,
  committeeModePolicy,
  committeeProgressStages,
  COMMITTEE_DEADLINE_MS,
  type CommitteeStepId,
  type MastraSpecialistName,
  type CommitteeModePolicy,
  type CommitteeModelMetadata,
  type CollectPacketFn,
  type ModeRequestContext,
} from '../committee/types';
export { createXauusdMastraAgent, type XauusdMastraAgentOptions } from '../mastra-v2/agents/xauusd/agent';
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
  type XauusdTurnMode,
} from '../mastra-v2/agents/xauusd/run';
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
} from '../mastra-v2/agents/xauusd/tools';
export { collectXauusdResearchPacket } from '../mastra-v2/packets/research-packet';
export {
  runMastraBackgroundText,
  type RunMastraBackgroundTextArgs,
  type MastraBackgroundTextResult,
} from '../mastra-v2/agents/xauusd/background-text';
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
} from '../mastra-v2/mutation/mutation-policy';
export {
  createKestrelMastra,
  getKestrelMastra,
  initializeKestrelMastra,
  closeKestrelMastra,
  _setKestrelMastraForTest,
  type KestrelMastra,
} from '../mastra-v2/instance';
export {
  getSharedMastraStorage,
  _resetMastraStorageCache,
  pruneMastraStorage,
  closeMastraStorage,
} from '../mastra-v2/storage';
export { closeKestrelVectorStore } from '../mastra-v2/memory';
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
} from '../mastra-v2/agents/xauusd/read-only-tools';
export { XauusdResearchPacketSchema, type XauusdResearchPacket } from '../mastra-v2/packets/research-types';
export {
  runMastraCanonicalChat,
  runMastraCanonicalChatStream,
  type MastraCanonicalChatResult,
  type MastraCanonicalChatStream,
  type RunMastraCanonicalChatArgs,
} from '../mastra-v2/agents/canonical/index';
export {
  runMastraStructured,
  runMastraText,
  type MastraStructuredRunArgs,
  type MastraTextRunArgs,
  type MastraTextRunResult,
} from '../mastra-v2/agents/xauusd/text-runner';
export {
  generateThreadTitle,
  deterministicFallbackTitle,
  cleanTitleForPersistence,
  type GenerateThreadTitleArgs,
  type GenerateThreadTitleResult,
} from '../mastra-v2/shared/title';
export { maybeGenerateThreadTitle, type MaybeGenerateThreadTitleArgs } from '../mastra-v2/shared/title-service';
export { classifyMutationRequest, isMastraMutationEnabled } from '../mastra-v2/mutation/mutation-detect';
export type { SemanticRoutingAccounting } from '../semantic-routing';
export {
  resolveModel,
  MastraModelSnapshotSchema,
  type ResolveModelEnv,
  type MastraModelSnapshot,
} from '../model';
export {
  buildMutationInput,
  extractMutationInput,
  mutationExtractionSchemaFor,
  MutationExtractionError,
  MUTATION_EXTRACTION_SCHEMAS,
  type ExtractMutationInputArgs,
} from '../mastra-v2/mutation/mutation-extract';
export { XauusdResearchReportSchema, type XauusdResearchReport } from '../mastra-v2/agents/xauusd/report/report-types';
export {
  requireVerifiedXauusdReport,
  verifyXauusdReport,
  XauusdReportVerificationError,
  type XauusdReportVerification,
} from '../mastra-v2/agents/xauusd/report/report-verifier';
export {
  evaluateXauusdReportCase,
  summarizeXauusdReportEvaluations,
  type XauusdReportEvaluation,
  type XauusdReportEvaluationCase,
  type XauusdReportEvaluationSummary,
} from '../mastra-v2/agents/xauusd/report/report-evaluation';
export { toUntrustedExternalEvidence } from '../mastra-v2/packets/external-content';
export {
  createEvidenceId,
  freshnessFromAge,
  qualityFromWarnings,
  requireXauusdUserContext,
} from '../mastra-v2/packets/evidence';
export {
  EvidenceFreshnessSchema,
  EvidenceProvenanceSchema,
  EvidenceQualitySchema,
  EvidenceTrustSchema,
  ModelGeneratedEvidenceSchema,
  SynthesisEvidenceSchema,
  TrustedDeterministicEvidenceSchema,
  UntrustedExternalEvidenceSchema,
  UserMemoryEvidenceSchema,
  type EvidenceFreshness,
  type EvidenceProvenance,
  type EvidenceQuality,
  type EvidenceTrust,
  type ModelGeneratedEvidence,
  type SynthesisEvidence,
  type TrustedDeterministicEvidence,
  type UntrustedExternalEvidence,
  type UserMemoryEvidence,
} from '../mastra-v2/packets/evidence-types';
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
// Audit plan §1.9: re-export Mastra's tripwire error so web route boundaries
// can map a blocked injection (detector strategy 'block') to a clean 422
// without depending on @mastra/core directly.
export { TripWire } from '@mastra/core/agent';
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
  type MastraMemoryMode,
  type MastraRunObservation,
  type MastraRunOutcome,
  type MastraAnswerOutcome,
  type MastraUsageLike,
} from '../mastra-v2/shared/telemetry';
export type { MastraGenerationResultLike } from '../mastra-v2/shared/stats';
export {
  buildXauusdModelEvidenceContext,
  serializeXauusdModelEvidenceContext,
  MODEL_CONTEXT_CANDLE_LIMIT,
  MODEL_CONTEXT_INDICATOR_LIMIT,
} from '../mastra-v2/agents/xauusd/model-context';
export {
  XAUUSD,
  EvidenceMetadataSchema,
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
} from '../mastra-v2/shared/types';
export {
  adaptLegacyReadOnlyTool,
  adaptLegacyReadOnlyTools,
  extractToolPartsFromMessages,
  type MastraToolInvocationPart,
  type MastraToolStreamEvent,
} from '../mastra-v2/agents/xauusd/legacy-tool-adapter';
