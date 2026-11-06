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

// Public barrel for @kestrel/ai. Export blocks are grouped by domain so the
// route handler and packages keep one stable import path.

// ── Budget ─────────────────────────────────────────────────────────────────
export {
  acquireBudget,
  effectiveDailyCap,
  isBudgetEnforced,
  reserveTurnBudget,
  resumeTurnBudget,
  UNCAPPED_DAILY_USD,
  type AcquireBudgetArgs,
  type AcquireBudgetResult,
  type BudgetHandle,
} from './budget';
export {
  estimateCostUsd,
  estimateKnownCostUsd,
  resolveModelRate,
  UnknownModelPricingError,
  DEFAULT_TURN_ESTIMATE_USD,
  DEFAULT_MAX_DAILY_USD,
} from './budget/pricing-catalog';
export {
  dailySpendUsd,
  reservedSpendUsd,
  enforceDailyBudget,
  applyBudgetDelta,
  BudgetExceededError,
} from './budget/budget-spend';
export {
  tryReserveBudget,
  reconcileBudgetReservation,
  releaseBudgetReservation,
  recoverStaleBudgetReservations,
  type BudgetReservation,
} from './budget/budget-reservations';

// Usage
export {
  listTelemetry,
  computeUsage,
  providerIdFromModel,
  type TelemetryRow,
  type UsageStats,
  type ModelBreakdown,
  type ProviderBreakdown,
  type DayBucket,
} from './budget/usage';

export { extractRateLimits, type RateLimitData } from './budget/rate-limits';
export { noteLlmRateLimit, awaitLlmHeadroom } from './budget/llm-throttle';

// ── Agents and models ──────────────────────────────────────────────────────
export {
  hasUserKeyForProvider,
  resolveProviderMode,
  type ProviderMode,
} from './models/byok-providers';
export {
  createExecutionLifecycle,
  terminalMetadata,
  type ExecutionTerminalState,
  type ExecutionAnswerOutcome,
  type ExecutionTerminalMetadata,
} from './runtime/execution-lifecycle';
export {
  createGenerationLedger,
  restoreGenerationLedger,
  type GenerationKind,
  type GenerationLedger,
  type GenerationLedgerEntry,
  type GenerationLedgerSnapshot,
} from './persistence/generation-ledger';
export {
  BYOK_PROVIDERS,
  BYOK_PROVIDERS_LIST,
  getProvider,
  defaultModelFor,
  lookupModelRate,
  buildCatalogRateTable,
  type ByokProviderSpec,
  type ByokProviderModels,
  type ModelDomain,
  type ModelSpec,
} from './models/byok-providers';
export {
  resolveChatModel,
  resolveModelForProvider,
  resolveMastraModel,
  resolveMastraExecutionModel,
  resolveVisionModel,
  resolveEmbeddingModel,
  resolveEmbeddingModelDetails,
  derivePlannerModel,
  deriveTitleModel,
  testProviderKey,
  validateProviderConfig,
  type ChatModelResolution,
  type MastraModelPurpose,
  type MastraModelSnapshot,
  type ResolveMastraModelInput,
  type MastraResolvedModel,
  type VisionModelResolution,
  type EmbeddingModelResolution,
  type EmbeddingModelResolutionDetails,
} from './models/model';
export { embedTexts, type EmbedTextsArgs, type EmbedResult } from './models/embeddings';

// Phase 7a — domain routing + rolling thread summary
export {
  resolveSemanticRoutingConfig,
  routeTurn,
  type RoutingDecision,
  type RoutingDomain,
} from './routing';
export type { SemanticRoutingAccounting } from './routing/semantic';

// Phase 7b — memory index
export {
  rememberJournalEntry,
  rememberBriefing,
  // JEPA-style market-regime memories.
  composeRegimeStateText,
  rememberMarketRegime,
  searchMemory,
  countMemory,
  type MemoryKind,
  type MemoryRow,
  type RegimeOutcome,
  type RememberMarketRegimeArgs,
} from './memory/memory-index';
export { runMemoryQuery, memoryRowToItem, type RunMemoryQueryArgs } from './models/rag';

// M4 — Model circuit breaker for repeated failures.
export {
  recordModelSuccess,
  recordModelFailure,
  isCircuitOpen,
  _resetCircuits,
} from './models/circuit-breaker';

// Phase 2 — one serializable Mastra execution plan.
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
} from './mastra-v2/planning/execution-plan';

// Canonical Mastra execution decision facade.
export {
  decideMastraExecution,
  capabilityForRoute,
  capabilityDefinitionForRoute,
  type MastraExecutionDecision,
  type MastraExecutionDecisionInput,
  type MastraExecutionRoute,
} from './mastra-v2/planning/execution-decision';

// Canonical Mastra routing.
export {
  resolveMode,
  type AnalysisMode,
  type ResolvedMode,
} from './mastra-v2/planning/routing-policy';
export {
  saveAgentOpinions,
  saveAgentOpinionsBestEffort,
  type SaveOpinionsArgs,
} from './committee/opinion-history';

// F3 — Social Sentiment Integration
export {
  SocialSentimentService,
  getSentimentService,
  resetSentimentService,
  type SentimentEnv,
} from './sentiment';

// ── Tools ──────────────────────────────────────────────────────────────────
export { buildToolCatalogue, type CatalogueEntry } from './models/catalogue';

// ── Runtime ────────────────────────────────────────────────────────────────
export * from './runtime/workflow-status';
export * from './mastra-v2/shared/telemetry-startup';
export {
  isMastraTelemetryDegraded,
  resetMastraTelemetryHealth,
} from './mastra-v2/shared/telemetry';

export * from './runtime/wait-until';

// Langfuse / OpenTelemetry instrumentation
export { initLangfuse, flushLangfuse, shutdownLangfuse } from './runtime/instrumentation';
export { telemetryConfig, type TelemetryConfigOptions } from './runtime/telemetry';

// Exponential-backoff retry helper.
export { withRetry, type RetryOptions } from './runtime/retry';

export { extractUserMessageText } from './runtime/message-text';

// F5 — Run Diagnostics with Secret Redaction
export {
  withDiagnostics,
  persistDiagnosticContext,
  getDiagnosticContext,
  recordStep,
  recordLifecycleStep,
  completeStep,
  recordError,
  exportDiagnosticContext,
  redactSecrets,
  redactString,
  type RunDiagnosticContext,
  type DiagnosticStep,
  type DiagnosticError,
  type DiagnosticOptions,
} from './diagnostics';

// ── Data: persistence, alerts, journal, snapshots, briefings, push ─────────
export {
  upsertArticles,
  listRecentArticles,
  listUpcomingEvents,
  latestArticleTimestampMs,
  backfillEmbeddings,
  countPendingEmbeddings,
} from './persistence/news';
export {
  upsertEvents,
  listFredEventsMissingActual,
  patchEventActual,
  parseFredEventId,
} from './persistence/calendar';
export {
  listThreads,
  getThread,
  createThread,
  updateThreadTitle,
  updateThreadPinnedSymbol,
  deleteThread,
  deleteAllThreads,
  listMessages,
  appendUserMessage,
  appendAssistantMessage,
  forkThread,
  deriveForkedTitle,
  type ForkThreadInput,
  type ForkThreadResult,
  recordTelemetry,
  recordToolTelemetry,
  TELEMETRY_KINDS,
  type DbThread,
  type DbMessage,
  type TelemetryInput,
  type TelemetryKind,
  type ToolTelemetryInput,
} from './persistence';

// Alerts
export {
  listAlerts,
  listEvaluable,
  getAlert,
  createAlert,
  updateAlert,
  markFired,
  markFiredSnoozed,
  markFiredForAlert,
  isInSnooze,
  deleteAlert,
  type CreateAlertInput,
  type UpdateAlertInput,
} from './alerts/persistence';
export {
  evaluateAlerts,
  describeRule,
  type EvaluatorEnv,
  type EvaluationResult,
  type RuleReading,
} from './alerts/evaluator';
export { specFromRule, type AlertSpec, type RuleReading as SpecRuleReading } from './alerts/spec';
export { deliverAlert, sendDirectNotification, type DeliveryResult } from './alerts/delivery';
export { simulateAlert, type SimCandle, type SimFire, type SimResult } from './alerts/simulate';

// Journal
export {
  listEntries,
  getEntry,
  createEntry,
  updateEntry,
  deleteEntry,
  classifyTradeOutcome,
  computeRMultiple,
  computeStats,
  summarize,
  type JournalStatsSummary,
  type CreateJournalInput,
  type UpdateJournalInput,
} from './journal/persistence';
export { reviewTrade, type ReviewTradeArgs, type TradeReviewResult } from './journal/review';
export {
  CoachInsightsUnavailableError,
  getCoachInsights,
  type CoachInsightsArgs,
  type CoachInsightsResult,
} from './journal/coach-insights';

// Snapshots (Phase 2)
export {
  computeDailySnapshot,
  previousUtcMidnight,
  type DailySnapshot,
  type ComputeDailySnapshotArgs,
} from './snapshots/compute';
export {
  upsertSnapshot,
  getLatestSnapshot,
  type SnapshotRow,
  type UpsertSnapshotArgs,
} from './snapshots/persistence';

// Briefings (Phase 2)
export {
  emitPreEvent,
  emitPostEvent,
  emitWeeklyReview,
  type BriefingsEnv,
} from './briefings/generate';
export {
  getOrCreateBriefingsThread,
  wasEmitted,
  recordEmitted,
  listEmittedEventIds,
  findHighImpactEventsInWindow,
  // Phase 1.7 — dashboard surface
  getLatestBriefing,
  type LatestBriefing,
} from './briefings/persistence';

// Phase 3 — Sharable snapshots
export { signShareToken, verifyShareToken, type ShareTokenPayload } from './share/sign';
export {
  createSnapshot,
  getSnapshot,
  getActiveSnapshot,
  type SnapshotRow as ShareSnapshotRow,
  type CreateSnapshotArgs as CreateShareSnapshotArgs,
} from './share/persistence';

// Phase 3 — CFTC CoT
export {
  upsertCoTReport,
  listCoTSamples,
  countCoTRows,
  buildCoTId,
  type UpsertCoTReportArgs,
} from './cot/persistence';

// Phase 3 — Web Push
export {
  listPushSubscriptions,
  savePushSubscription,
  deletePushSubscription,
  deletePushSubscriptionByEndpoint,
  type PushSubscriptionRow,
  type SavePushSubscriptionArgs,
  PushSubscriptionConflictError,
} from './push/persistence';
export { sendWebPush, type SendWebPushResult, type VapidEnv } from './push/send';

// F4 — Notification Noise Control
export {
  evaluateNoise,
  hashContent,
  isQuietHours,
  InMemoryNoiseState,
  getNoiseConfig,
  saveNoiseConfig,
  getRouteConfig,
  saveRouteConfig,
  type NoiseState,
} from './notifications';

// ── Eval ───────────────────────────────────────────────────────────────────
export type { PromptResult, PromptDef, RunEvalsResult, EvaluationScore } from './eval/runner';
export { computeDrift, type DriftReport, type DriftBucket } from './eval/drift';
export { emitEvalMetrics, isEvalCaseOk } from './eval/eval-metrics';
export { consumeUIMessageStream, type ParsedStreamResult } from './eval/parse-stream';

export {
  syncIntermarketResonance,
  type ResonanceSyncStatus,
  type SyncIntermarketResonanceOptions,
  type SyncIntermarketResonanceResult,
} from './services/resonance-sync';
