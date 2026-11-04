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

// Public barrel for @kestrel/db.

export * from './schema/index';
export { getTenantIdForUser, requireTenantIdForUser } from './tenant';
export * from './schema/ai/memory-backfill';
// PF-15 — Export `getDbRO` so consumers can route read queries to
// read replicas. `withTenantDbRO` also uses `getDbRO` internally.
export {
  getDb,
  getDbRO,
  getAdminDb,
  closeAdminDb,
  closeDb,
  closeReplicaDb,
  withTenantDb,
  withTenantDbFresh,
  withTenantDbRO,
  withAdminDb,
  withDbRetry,
  checkDbHealth,
  isRlsEnabled,
  hasAdminDbScope,
  hasTenantDbScope,
  setDbForTest,
  getTenantDbScope,
  schema,
  type DbClient,
} from './client';
export { withUserTenant, withUserTenantRO } from './tenant/with-user-tenant';
export { withRateLimit, type RateLimitResult } from './ops/rate-limit';
export {
  runRetentionCleanup,
  runVacuumAnalyze,
  getRetentionConfigFromEnv,
  type RetentionConfig,
  type RetentionResult,
} from './retention';
export { getActiveUserIds } from './ops/active-users';
export { checkAndIncrementDailyQuota, type DailyQuotaResult } from './ops/provider-quota';
// PF-01 — Query/repository layer. Every helper is exported by name so
// consumers tree-shake what they do not use.
export {
  getPlatformAdminSettings,
  getPlatformAdminUserId,
  getOwnUserSettings,
  getUserWithSettings,
  updateUserSettingsField,
  type UserWithSettings,
} from './queries/user-settings';
export { batchDeleteThreads } from './queries/threads';
export { countActiveAlerts } from './queries/alerts';
// Additional query helpers
export {
  listUserSymbols,
  listDistinctSymbols,
  addUserSymbol,
  removeUserSymbol,
  type UserSymbolRow,
} from './queries/user-symbols';
export { getToolStats, listToolTelemetry, type ToolStats } from './queries/tool-telemetry';
export {
  listDiagnosticTraces,
  getDiagnosticTrace,
  listDiagnosticTracesForAdmin,
  getDiagnosticTraceForAdmin,
  listTraceExplorerEvents,
  type DiagnosticTraceRow,
  type TraceExplorerEvent,
  type TraceExplorerFilters,
} from './queries/diagnostic-traces';
export { listCronRuns, deleteOldCronRuns, type CronRunRow } from './queries/cron-runs';
export { lazyPurgeExpiredTokens } from './queries/verification-tokens';
export {
  getUserById,
  getUserRole,
  getUserPasswordHash,
  listUsersWithSettings,
  countUsers,
  countAdmins,
  updateUserRole,
  type UserRow,
  type UserWithSettingsRow,
} from './queries/users';
export { recordAdminAudit, listAdminAuditLogs } from './queries/admin-audit';
export type {
  MutationExecutionRow,
  MutationExecutionInsert,
} from './schema/ai/mutation-executions';
export {
  executeMutationOnce,
  getMutationExecution,
  MutationExecutionConflictError,
  MutationExecutionContextError,
  type ExecuteMutationOnceInput,
  type ExecuteMutationOnceResult,
  type MutationExecutionBusinessResult,
} from './queries/mutation-executions';
export type { AdminAuditLogRow, AdminAuditLogInsert } from './schema/ops/admin-audit';
export type {
  AiMessageFeedbackRow,
  AiMessageFeedbackInsert,
  FeedbackRating,
  FeedbackReviewStatus,
  FeedbackLabel,
} from './schema/ai/ai-feedback';
export {
  getWatchlistWithCatalog,
  isSymbolInCatalog,
  getNextDisplayOrder,
  reorderWatchlist,
  type WatchlistEntry,
} from './queries/watchlist';
export { resetOnboarding, type ResetMode } from './queries/onboarding';
export { getProviderHealthForUser, getUserApiKeys } from './queries/provider-tests';
export {
  recordProviderTestResult,
  replaceProviderTestResults,
  deleteProviderTestResult,
  type ProviderTestRecord,
  type ProviderTestRateLimit,
  type ProviderTestScope,
} from './queries/provider-tests';
export {
  applyUserByokPatch,
  mergeUserByokKeys,
  readUserByokState,
  removeUserByokKey,
  type MergeUserByokKeysOptions,
  type UserByokPatch,
  type UserByokPatchResult,
  type UserByokState,
} from './queries/user-byok';
export {
  getUserByEmail,
  userExistsByEmail,
  createUserWithSettings,
  FirstUserRegistrationClosedError,
  incrementFailedLogins,
  resetLoginLockout,
  updateUserPassword,
  updatePasswordByEmail,
  createVerificationToken,
  findVerificationToken,
  deleteVerificationToken,
  verifyUserEmail,
  getTokenVersion,
  findSession,
  updateSessionLastActive,
  createUserSession,
  updateTwoFactorSecret,
  getTwoFactorSecret,
  setTwoFactorEnabled,
  updateUserApiKeys,
  createAuditLog,
  incrementTokenVersion,
  updateUserDisplayName,
  deleteUserAccount,
  type AuthUserRow,
} from './queries/auth';
export {
  listUserSessions,
  revokeUserSession,
  deleteUserSessions,
  type SessionRow,
} from './queries/user-sessions';
export { getRecentCandles, listActiveSymbols, type CandleRow } from './queries/candles';
export { listMtdAgentOpinions, type AgentOpinionRow } from './queries/agent-opinions';
export {
  upsertMessageFeedback,
  getMessageFeedback,
  deleteMessageFeedback,
  listFeedbackForReview,
  reviewMessageFeedback,
  type SaveMessageFeedbackInput,
  type ListFeedbackOptions,
  type ReviewMessageFeedbackInput,
} from './queries/ai-feedback';
export {
  claimMemoryBackfill,
  completeMemoryBackfill,
  failMemoryBackfill,
  getMemoryBackfillState,
  type MemoryBackfillClaim,
} from './queries/memory-backfill';
// Plugin platform — per-user installation + zero-migration storage
export {
  listInstalledPlugins,
  getInstalledPlugin,
  getInstalledPluginIdsForUser,
  installPlugin,
  setPluginEnabled,
  updatePluginSettings,
  uninstallPlugin,
  listEnabledPluginUsers,
  pluginStorageGet,
  pluginStorageSet,
  pluginStorageList,
  pluginStorageDelete,
  pluginStorageClear,
  type InstalledPluginRow,
  type InstallPluginInput,
  type PluginStorageScope,
  type PluginStorageValue,
  type UpdatePluginSettingsInput,
} from './queries/plugins';
export {
  withCancellablePostgresQuery,
  abortError,
  type CancellableQueryOptions,
} from './ops/query-cancellation';
