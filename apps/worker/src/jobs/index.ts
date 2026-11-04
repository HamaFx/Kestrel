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

// Job registry. The systemd one-shot units invoke `node dist/runner/cli.js
// <name>`, which looks up the run function here. Adding a new job means
// (a) writing a `<name>.ts` file with `runX(ctx)`, (b) listing it here,
// and (c) extending `JobName` in ./types.ts.

import { runAlerts } from './alerts.js';
import { runBriefings } from './briefings.js';
import { runCoT } from './cot.js';
import { runEmbeddingBackfill } from './embedding-backfill.js';
import { runFredActuals } from './fred-actuals.js';
import { runNews } from './news.js';
import { runResonanceSync } from './resonance-sync.js';
import { runRetention } from './retention.js';
import type { JobName, JobRegistration } from './types.js';

/**
 * PF-04 — Job command registry.
 *
 * Each entry defines the job's run function, schedule, description,
 * and healthchecks.io env var. The scheduler and runner CLI iterate
 * this registry instead of using if/else or switch statements.
 * Adding a new job means adding an entry here — no other files change.
 *
 * Schedule notes:
 *   - `null` means no cron schedule.
 *   - Minute-level jobs (alerts, briefings) are inherently idempotent and
 *     skip the daily lock.
 *   - Daily+ cadence jobs use acquireCronLock for idempotency.
 */
export const JOBS: Record<JobName, JobRegistration> = {
  alerts: {
    name: 'alerts',
    run: runAlerts,
    description: 'Evaluates user alerts every minute.',
    schedule: '* * * * *',
    hcUuidEnvVar: 'HC_JOB_ALERTS_UUID',
  },
  'embedding-backfill': {
    name: 'embedding-backfill',
    run: runEmbeddingBackfill,
    description: 'Embed news_articles missing embeddings via the AI Gateway.',
    schedule: '0 */6 * * *',
    hcUuidEnvVar: 'HC_JOB_EMBEDDING_BACKFILL_UUID',
  },
  briefings: {
    name: 'briefings',
    run: runBriefings,
    description:
      'Pre/post-event briefings — scan economic_events for windows around high-impact releases.',
    schedule: '*/5 * * * *',
    hcUuidEnvVar: 'HC_JOB_BRIEFINGS_UUID',
  },
  cot: {
    name: 'cot',
    run: runCoT,
    description: 'Weekly CFTC Commitment-of-Traders ingestion.',
    schedule: '0 22 * * 5',
    hcUuidEnvVar: 'HC_JOB_COT_UUID',
  },
  'fred-actuals': {
    name: 'fred-actuals',
    run: runFredActuals,
    description:
      'Daily FRED actuals backfill — patches economic_events.actual where it was null at ingestion.',
    schedule: '30 1 * * *',
    hcUuidEnvVar: 'HC_JOB_FRED_ACTUALS_UUID',
  },
  news: {
    name: 'news',
    run: runNews,
    description:
      'News ingestion — fetches new Marketaux/Finnhub articles since the high-water mark.',
    schedule: '*/10 * * * *',
    hcUuidEnvVar: 'HC_JOB_NEWS_UUID',
  },
  'resonance-sync': {
    name: 'resonance-sync',
    run: runResonanceSync,
    description:
      'Daily intermarket resonance sync — computes and stores real yield and DXY gold divergences.',
    schedule: '0 23 * * *',
    hcUuidEnvVar: 'HC_JOB_RESONANCE_SYNC_UUID',
  },
  retention: {
    name: 'retention',
    run: runRetention,
    description:
      'Daily retention: telemetry, traces, quota, shared snapshots, stale AI budget reservations, and candle pruning.',
    schedule: '15 3 * * *',
    hcUuidEnvVar: 'HC_JOB_RETENTION_UUID',
  },
};

export type { JobRegistration, JobName } from './types.js';
