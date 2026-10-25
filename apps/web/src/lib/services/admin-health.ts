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

// Admin health SLO service. In default on-demand BiQuote REST mode
// (`WORKER_ENABLE_TICK_STREAM=0`), empty `live_ticks` is expected and
// reported as healthy on-demand mode rather than a false outage.

import { sql } from 'drizzle-orm';

import type { HealthSloResponse } from './admin-dtos';
import { buildHealthAssessment } from './health/anomaly-builder';
import {
  queryAnalysisAggregate,
  queryChatAggregate,
  queryCronAggregate,
  queryDailySpendRows,
  queryOperationalAggregate,
  queryTickAggregate,
  queryToolAggregate,
} from './health/probe-queries';
import type { HealthSloDb } from './health/probe-types';
import { buildSliSnapshots } from './health/sli-builder';
import { resolveAdminSpendAlertThresholdUsd } from './health/spend-watch';

export type { HealthSloDb } from './health/probe-types';
export {
  DEFAULT_ADMIN_SPEND_ALERT_USD,
  resetAdminSpendAlertDedup,
  resolveAdminSpendAlertThresholdUsd,
  resolveSpendWatch,
  type DailySpendRow,
} from './health/spend-watch';

const ONE_SECOND = 1000;
const ONE_MINUTE = 60 * ONE_SECOND;

export interface ComputeHealthSloOptions {
  hours: number;
  /** §5.3 spend-watch override in USD (tests). Defaults to ADMIN_SPEND_ALERT_USD. */
  spendAlertThresholdUsd?: number;
}

export async function computeHealthSloService(
  db: HealthSloDb,
  { hours, spendAlertThresholdUsd }: ComputeHealthSloOptions,
): Promise<HealthSloResponse> {
  const since = new Date(Date.now() - hours * 60 * ONE_MINUTE).toISOString();

  let dbOk = false;
  let dbLatencyMs = 0;
  try {
    const start = Date.now();
    await db.execute(sql`SELECT 1`);
    dbLatencyMs = Date.now() - start;
    dbOk = true;
  } catch (error) {
    // DB is unreachable — reflected in the overall status below.
    void error;
  }

  const [
    ticksResult,
    cronResult,
    toolResult,
    chatResult,
    analysisResult,
    operationalResult,
    dailySpendResult,
  ] = await Promise.allSettled([
    queryTickAggregate(db),
    queryCronAggregate(db, since),
    queryToolAggregate(db, since),
    queryChatAggregate(db, since),
    queryAnalysisAggregate(db, since),
    queryOperationalAggregate(db, since),
    queryDailySpendRows(db),
  ]);

  const operational = operationalResult.status === 'fulfilled' ? operationalResult.value : null;
  const assessment = buildHealthAssessment({
    ticks: ticksResult.status === 'fulfilled' ? ticksResult.value : null,
    cron: cronResult.status === 'fulfilled' ? cronResult.value : null,
    tools: toolResult.status === 'fulfilled' ? toolResult.value : null,
    chat: chatResult.status === 'fulfilled' ? chatResult.value : null,
    analysis: analysisResult.status === 'fulfilled' ? analysisResult.value : null,
    operational,
    dailySpend: dailySpendResult.status === 'fulfilled' ? dailySpendResult.value : null,
    spendThresholdUsd: spendAlertThresholdUsd ?? resolveAdminSpendAlertThresholdUsd(),
  });

  const langfuseActive = Boolean(
    process.env.LANGFUSE_PUBLIC_KEY &&
    process.env.LANGFUSE_SECRET_KEY &&
    process.env.LANGFUSE_BASE_URL,
  );

  const overall: HealthSloResponse['overall'] = !dbOk
    ? 'unhealthy'
    : assessment.anomalies.length > 0
      ? 'degraded'
      : 'healthy';

  return {
    ts: new Date().toISOString(),
    dbLatencyMs,
    dbOk,
    overall,
    langfuseActive,
    langfuseBaseUrl: process.env.LANGFUSE_BASE_URL ?? null,
    slis: buildSliSnapshots(assessment.metrics, operational, hours),
    anomalies: assessment.anomalies,
    spendWatch: assessment.spendWatch,
  };
}
