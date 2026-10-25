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

// Jobs that run more often than once-per-day are inherently idempotent
// at the application layer (briefings uses (eventId, kind) PK; alerts
// evaluates current state each minute). Skip the daily lock for them.
//
// embedding-backfill is also excluded: it fires every 6 hours but the
// daily acquireCronLock meant a failed 00:00 run blocked all 3 same-day
// retries. The job is already idempotent per-article (query filters for
// `embedding IS NULL`), so removing the daily lock lets each 6-hour
// timer firing run independently and self-heal within the same day.

import type { JOBS } from '../jobs/index.js';

export const SKIP_DAILY_LOCK = new Set<keyof typeof JOBS>([
  'alerts',
  'briefings',
  'embedding-backfill',
  'multi-agent-analysis',
  'budget-recovery',
  'persistence-recovery',
  'metrics-flush',
]);
