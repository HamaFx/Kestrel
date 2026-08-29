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

import 'server-only';

import {
  getDiagnosticTrace as getDiagnosticTraceDb,
  listDiagnosticTraces as listDiagnosticTracesDb,
  getDiagnosticTraceForAdmin as getDiagnosticTraceForAdminDb,
  listDiagnosticTracesForAdmin as listDiagnosticTracesForAdminDb,
  updatePaymentStatus as updatePaymentStatusDb,
  updateSubscriptionFromPayment as updateSubscriptionFromPaymentDb,
} from '@kestrel/db';

/**
 * Server-only API boundary.
 *
 * API controllers should validate HTTP input and call services rather than
 * importing domain packages directly. This boundary is the composition edge
 * for endpoints that have not yet acquired a dedicated domain service. It
 * deliberately contains no HTTP logic; it only exposes the established
 * package APIs through the web application's service layer.
 */

// AI agent and persistence APIs.
export {
  assertMastraMutationAllowed,
  assertRegisteredSystemAction,
  cancelMutationWorkflow,
  createMutationWorkflow,
  getKestrelMastra,
  MutationKindSchema,
  parseMutationRunContext,
  runMutationWorkflow,
  type MutationExecutor,
  verifyMutationConfirmationToken,
  resolveMastraModeModel,
  classifyMutationRequest,
  isMastraMutationEnabled,
  MutationExtractionError,
  enqueueFullAnalysis,
  getFullAnalysisQueueHealth,
  getFullAnalysisRun,
  toMastraRunView,
  fullAnalysisRunId,
  type FullAnalysisRunView,
} from '@kestrel/ai/mastra';
export {
  BYOK_PROVIDERS,
  assembleTrainingDataset,
  resolveEvaluationAnnotations,
  testProviderKey,
  resolveMode,
  extractUserMessageText,
  computeUsage,
  getDb,
  getSentimentService,
  getNoiseConfig,
  saveNoiseConfig,
  getRouteConfig,
  saveRouteConfig,
  evaluateAlerts,
  emitPostEvent,
  emitPreEvent,
  emitWeeklyReview,
  findHighImpactEventsInWindow,
  upsertEvents,
  upsertCoTReport,
  backfillEmbeddings,
  countPendingEmbeddings,
  latestArticleTimestampMs,
  upsertArticles,
  listRecentArticles,
  computeDailySnapshot,
  previousUtcMidnight,
  upsertSnapshot,
  listFredEventsMissingActual,
  parseFredEventId,
  patchEventActual,
  savePushSubscription,
  deletePushSubscriptionByEndpoint,
  PushSubscriptionConflictError,
  getEntry,
  reviewTrade,
  handleTelegramWebhook,
  telegramApiCall,
  createLinkCode,
  getBotLink,
  unlinkBot,
  listAgentOpinions,
  withDiagnostics,
  flushLangfuse,
  appendAssistantMessage,
  getTelemetryStartupCheck,
  isMastraTelemetryDegraded,
  validateTelemetryStartup,
} from '@kestrel/ai';

// These persistence functions use the supported AI persistence subpath so the
// global package lint rule cannot accidentally reintroduce barrel coupling.
export {
  getThread,
  createThread,
  listThreads,
  listMessages,
  forkThread,
} from '@kestrel/ai/persistence';
export type { FeedbackAnnotationInput, PromptResult } from '@kestrel/ai';
export type { RunTelemetryRow } from '@kestrel/ai/mastra';
export { BudgetExceededError } from '@kestrel/ai/cost';

// Database queries and infrastructure used by controllers that do not yet
// have a dedicated domain service.
export {
  withRateLimit,
  batchDeleteThreads,
  getActiveUserIds,
  runRetentionCleanup,
  lazyPurgeExpiredTokens,
  getUserWithSettings,
  requireTenantIdForUser,
  createAuditLog,
  getMutationExecution,
  executeMutationOnce,
  MutationExecutionConflictError,
  MutationExecutionContextError,
  updateUserSettingsField,
  getUserApiKeys,
  getUserById,
  createUserWithSettings,
  findVerificationToken,
  deleteVerificationToken,
  verifyUserEmail,
  listActivePlans,
  getPlan,
  getUserSubscription,
  getUserPayments,
  upsertSubscription,
  createPayment,
  createJournalEntry,
  claimCheckoutAttempt,
  saveCheckoutInvoice,
  completeCheckoutAttempt,
  failCheckoutAttempt,
  claimIpnEvent,
  getPaymentByNowpaymentsId,
  markIpnFailed,
  markIpnProcessed,
  recordBillingWebhookFailure,
  countStaleBillingWebhookFailures,
  claimBillingWebhookReplay,
  markBillingWebhookReplayed,
  releaseBillingWebhookReplay,
  listTraceExplorerEvents,
  listToolTelemetry,
  listAdminAuditLogs,
  upsertMessageFeedback,
  getMessageFeedback,
  deleteMessageFeedback,
  listFeedbackForReview,
  reviewMessageFeedback,
  listAiRegressionCases,
  updateAiRegressionCaseStatus,
  listReviewedTrainingPairs,
  registerEvalDataset,
  getEvalDataset,
  listEvalDatasets,
  approveEvalDataset,
  listCronRuns,
  deleteOldCronRuns,
  listUserSymbols,
  resetOnboarding,
  getWatchlistWithCatalog,
  isSymbolInCatalog,
  getNextDisplayOrder,
  reorderWatchlist,
  addUserSymbol,
  removeUserSymbol,
  schema,
} from '@kestrel/db';

export type { PaymentRow, DiagnosticTraceRow } from '@kestrel/db';
export const updatePaymentStatus = updatePaymentStatusDb;
export const updateSubscriptionFromPayment = updateSubscriptionFromPaymentDb;

// Market-data adapters and provider-specific cron helpers.
export {
  getCandles,
  getCandlesWithMeta,
  getPriceWithMeta,
  fetchNews,
  fetchUpcomingEvents,
  ProviderError,
  marketDataProviders,
} from '@kestrel/data';
export { fetchObservations, fredMeta } from '@kestrel/data/providers/fred';
export { fetchLatestRows, parseCftcInt, toCftcName } from '@kestrel/data/providers/cftc';

// Shared domain values, schemas, errors, and server-only helpers.
export {
  SYMBOLS,
  ALL_SYMBOLS,
  BUILTIN_SYMBOLS,
  DEFAULT_WATCHLIST_SYMBOLS,
  SymbolSchema,
  NoiseConfigSchema,
  RouteConfigSchema,
  CreatePositionInputSchema,
  ClosePositionInputSchema,
  AppError,
  conflict,
  validationError,
  providerUnavailable,
  AnalysisQueuedEventSchema,
  ChatStreamEventSchema,
  logStreamHub,
  pickAiEnv,
  metrics,
  TimeframeSchema,
  isTimeframe,
  UserMessagePartsSchema,
} from '@kestrel/shared';
export { configuredProviders, decryptByok, PROVIDER_IDS } from '@kestrel/shared/encryption';
export { REQUIRED_HEALTH_ENV_VARS } from '@kestrel/shared/env-secrets';
export { traceIdStorage } from '@kestrel/shared/logger';

// Type-only facade exports used by a few server controllers.
export type { TelegramUpdate } from '@kestrel/ai';
export type { ProviderId, NoiseConfig, RouteConfig, Symbol, Timeframe } from '@kestrel/shared';
export type { UIMessage } from 'ai';

/** Admin-only diagnostic query wrappers. */
export async function getDiagnosticTrace(
  _user: { userId: string },
  id: string,
) {
  return getDiagnosticTraceDb(_user.userId, id);
}

export async function listDiagnosticTraces(
  _user: { userId: string },
  opts: { threadId?: string; limit?: number } = {},
) {
  return listDiagnosticTracesDb(_user.userId, opts);
}

/** Admin-only trace detail read after `withAdminAuth` has authorized the caller. */
export async function getDiagnosticTraceForAdmin(id: string) {
  return getDiagnosticTraceForAdminDb(id);
}

/** Admin-only cross-user trace list after `withAdminAuth` has authorized the caller. */
export async function listDiagnosticTracesForAdmin(
  opts: { threadId?: string; limit?: number } = {},
) {
  return listDiagnosticTracesForAdminDb(opts);
}
