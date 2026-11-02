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

// PF-01 — Query/repository layer barrel.
//
// All query helpers live here. Consumers import from this barrel instead
// of importing `schema` directly. This decouples high-level modules
// from Drizzle ORM internals and makes the data-access surface explicit.
//
// Ownership rule (Phase 3): domains owned by `@kestrel/ai` persistence
// (alerts CRUD, journal, threads/messages, news, push, CoT, telemetry) do
// NOT have a second implementation here. This barrel keeps only queries
// with no AI-layer owner plus narrow helpers (e.g. `batchDeleteThreads`,
// `countActiveAlerts`) that the AI layer does not provide.
//
// Namespace conventions:
//   queries.threads.batchDeleteThreads(userId, ids) — bulk thread delete
//   queries.alerts.countActiveAlerts(tenantId)      — active alert count

export * as users from './user-settings';
export * as threads from './threads';
export * as alerts from './alerts';
export * as userSymbols from './user-symbols';
export * as toolTelemetry from './tool-telemetry';
export * as diagnosticTraces from './diagnostic-traces';
export * as cronRuns from './cron-runs';
export * as verificationTokens from './verification-tokens';
export * as adminUsers from './users';
export * as watchlist from './watchlist';
export * as onboarding from './onboarding';
export * as providerTests from './provider-tests';
export * as auth from './auth';
export * as userSessions from './user-sessions';
export * as candles from './candles';
export * as agentOpinions from './agent-opinions';
export * as aiFeedback from './ai-feedback';
export * as aiRegressionCases from './ai-regression-cases';
export * as evalDatasets from './eval-datasets';
export * as memoryBackfill from './memory-backfill';
export * as memoryProjection from './memory-projection';
export * as plugins from './plugins';
