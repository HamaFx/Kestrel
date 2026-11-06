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

// Cron runner entry point. Deliberately a subpath (`@kestrel/ai/cron`) rather
// than a root-barrel export: the worker jobs and the web `/api/cron/*` fallback
// routes run the exact same implementations, while ordinary AI consumers do not
// pull provider/queue modules into their module graph.

export { runCotIngestion, type CotIngestionResult } from '../cot/ingest';
export {
  runBriefingsFanout,
  type BriefingsFanoutResult,
  type RunBriefingsFanoutArgs,
} from './briefings';
export {
  runWeeklyReviewFanout,
  type RunWeeklyReviewFanoutArgs,
  type WeeklyReviewFanoutResult,
} from './weekly-review';
export {
  runSnapshotRefresh,
  type RunSnapshotRefreshArgs,
  type SnapshotRefreshResult,
} from '../snapshots/refresh';
export {
  runFredActualsRefresh,
  type FredActualsRefreshResult,
  type RunFredActualsRefreshArgs,
} from '../calendar/actuals';
export { runNewsRefresh, type NewsRefreshResult } from '../news/refresh';
export {
  runRetentionMaintenance,
  RETENTION_RESERVATION_STALE_MS,
  type RetentionMaintenanceResult,
} from './retention';
export type { CronRunLogger, CronRunOptions } from '../runtime/cron-runner';
