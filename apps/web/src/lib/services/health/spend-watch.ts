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

// Per-user daily spend watch (non-blocking Q4 alerts).

import { metrics } from '@kestrel/shared';

import type { SpendWatchSummary } from '../admin-dtos';
import type { DailySpendRow } from './probe-types';

export type { DailySpendRow } from './probe-types';

export const DEFAULT_ADMIN_SPEND_ALERT_USD = 25;

export function resolveAdminSpendAlertThresholdUsd(): number {
  const raw = process.env.ADMIN_SPEND_ALERT_USD;
  if (raw === undefined || raw === '') return DEFAULT_ADMIN_SPEND_ALERT_USD;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ADMIN_SPEND_ALERT_USD;
}

export function resolveSpendWatch(rows: DailySpendRow[], thresholdUsd: number): SpendWatchSummary {
  const thresholdCents = Math.round(thresholdUsd * 100);
  const overThreshold = rows
    .filter((row) => row.userId !== '' && row.spendUsdCents >= thresholdCents)
    .map((row) => ({ userId: row.userId, spendUsd: row.spendUsdCents / 100 }))
    .sort((a, b) => b.spendUsd - a.spendUsd);

  return {
    thresholdUsd,
    usersOverThreshold: overThreshold.length,
    overThreshold,
  };
}

const spendThresholdObserved = new Set<string>();

export function resetAdminSpendAlertDedup(): void {
  spendThresholdObserved.clear();
}

export function recordSpendThresholdMetric(spendWatch: SpendWatchSummary): void {
  const day = new Date().toISOString().slice(0, 10);
  for (const entry of spendWatch.overThreshold) {
    const key = `${day}:${entry.userId}`;
    if (spendThresholdObserved.has(key)) continue;
    spendThresholdObserved.add(key);
    metrics.increment('admin_spend_threshold_total');
  }
}
