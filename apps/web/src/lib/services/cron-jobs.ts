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

// Route-facing cron runners.
//
// The worker jobs and the `/api/cron/*` fallbacks call the same shared runners
// in `@kestrel/ai/cron`. This module owns the per-job logger and the response
// shape, so the routes stay one-line controllers and the manual and scheduled
// paths cannot drift in logging or note formatting.

import 'server-only';

import {
  runBriefingsFanout,
  runCotIngestion,
  runFredActualsRefresh,
  runSnapshotRefresh,
  runWeeklyReviewFanout,
} from '@kestrel/ai/cron';

import { getServerEnv } from '@/lib/env';
import { createScopedLoggerWithContext } from '@/lib/logger';

export interface CronJobResult {
  processed: number;
  note?: string;
}

function loggerFor(job: string) {
  return createScopedLoggerWithContext({ component: 'cron', job });
}

export async function runBriefingsCronService(): Promise<CronJobResult> {
  const result = await runBriefingsFanout({ log: loggerFor('briefings') });
  return { processed: result.processed, note: result.note };
}

export async function runCotCronService(): Promise<CronJobResult> {
  const result = await runCotIngestion({ log: loggerFor('cot') });
  return { processed: result.processed, note: result.note };
}

export async function runSnapshotsCronService(): Promise<CronJobResult> {
  const result = await runSnapshotRefresh({ log: loggerFor('snapshots') });
  return { processed: result.processed, note: result.note };
}

export async function runWeeklyReviewCronService(): Promise<CronJobResult> {
  const result = await runWeeklyReviewFanout({ log: loggerFor('weekly-review') });
  return {
    processed: result.processed,
    ...(result.reasons.length > 0 ? { note: result.reasons.join(', ') } : {}),
  };
}

export async function runFredActualsCronService(): Promise<CronJobResult> {
  const env = getServerEnv();
  const result = await runFredActualsRefresh({
    fredApiKey: env.FRED_API_KEY ?? null,
    log: loggerFor('fred-actuals'),
  });
  return { processed: result.processed, note: result.note };
}
