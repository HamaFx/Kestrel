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

// Data sub-barrel: thread/message persistence, news and calendar ingestion,
// alerts, journal, snapshots, briefings, share tokens, CoT, web push, and
// notification noise control. Re-exported by `src/index.ts`.

export {
  upsertArticles,
  listRecentArticles,
  listUpcomingEvents,
  latestArticleTimestampMs,
  backfillEmbeddings,
  countPendingEmbeddings,
} from '../persistence/news';
export {
  upsertEvents,
  listFredEventsMissingActual,
  patchEventActual,
  parseFredEventId,
} from '../persistence/calendar';
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
} from '../persistence';

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
} from '../alerts/persistence';
export {
  evaluateAlerts,
  decideMatch,
  describeRule,
  type EvaluatorEnv,
  type EvaluationResult,
  type RuleReading,
} from '../alerts/evaluator';
export { specFromRule, type AlertSpec, type RuleReading as SpecRuleReading } from '../alerts/spec';
export { deliverAlert, sendDirectNotification, type DeliveryResult } from '../alerts/delivery';
export { simulateAlert, type SimCandle, type SimFire, type SimResult } from '../alerts/simulate';

// Journal
export {
  listEntries,
  getEntry,
  createEntry,
  updateEntry,
  deleteEntry,
  computeRMultiple,
  computeStats,
  summarize,
  type CreateJournalInput,
  type UpdateJournalInput,
} from '../journal/persistence';
export { reviewTrade, type ReviewTradeArgs, type TradeReviewResult } from '../journal/review';
export {
  getCoachInsights,
  type CoachInsightsArgs,
  type CoachInsightsResult,
} from '../journal/coach-insights';

// Snapshots (Phase 2)
export {
  computeDailySnapshot,
  previousUtcMidnight,
  type DailySnapshot,
  type ComputeDailySnapshotArgs,
} from '../snapshots/compute';
export {
  upsertSnapshot,
  getLatestSnapshot,
  type SnapshotRow,
  type UpsertSnapshotArgs,
} from '../snapshots/persistence';

// Briefings (Phase 2)
export {
  emitPreEvent,
  emitPostEvent,
  emitWeeklyReview,
  type BriefingsEnv,
} from '../briefings/generate';
export {
  getOrCreateBriefingsThread,
  wasEmitted,
  recordEmitted,
  listEmittedEventIds,
  findHighImpactEventsInWindow,
  // Phase 1.7 — dashboard surface
  getLatestBriefing,
  type LatestBriefing,
} from '../briefings/persistence';

// Phase 3 — Sharable snapshots
export { signShareToken, verifyShareToken, type ShareTokenPayload } from '../share/sign';
export {
  createSnapshot,
  getSnapshot,
  getActiveSnapshot,
  type SnapshotRow as ShareSnapshotRow,
  type CreateSnapshotArgs as CreateShareSnapshotArgs,
} from '../share/persistence';

// Phase 3 — CFTC CoT
export {
  upsertCoTReport,
  listCoTSamples,
  countCoTRows,
  buildCoTId,
  type UpsertCoTReportArgs,
} from '../cot/persistence';

// Phase 3 — Web Push
export {
  listPushSubscriptions,
  savePushSubscription,
  deletePushSubscription,
  deletePushSubscriptionByEndpoint,
  type PushSubscriptionRow,
  type SavePushSubscriptionArgs,
  PushSubscriptionConflictError,
} from '../push/persistence';
export { sendWebPush, type SendWebPushResult, type VapidEnv } from '../push/send';

// F4 — Notification Noise Control
export {
  evaluateNoise,
  hashContent,
  isQuietHours,
  InMemoryNoiseState,
  DbNoiseState,
  getNoiseConfig,
  saveNoiseConfig,
  getRouteConfig,
  saveRouteConfig,
  type NoiseState,
} from '../notifications';
