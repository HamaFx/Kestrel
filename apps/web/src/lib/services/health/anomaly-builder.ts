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

// Turns raw telemetry aggregates into anomalies and the metric flags the SLI
// builder needs. Pure except for the spend-alert dedup counter.

import type { SpendWatchSummary } from '../admin-dtos';
import type {
  AnalysisAggregate,
  ChatAggregate,
  CronAggregate,
  DailySpendRow,
  OperationalAggregate,
  TickAggregate,
  ToolAggregate,
} from './probe-types';
import { recordSpendThresholdMetric, resolveSpendWatch } from './spend-watch';

const SPEND_WATCH_ANOMALY_LIMIT = 10;

export interface HealthAssessmentInput {
  ticks: TickAggregate | null;
  cron: CronAggregate | null;
  tools: ToolAggregate | null;
  chat: ChatAggregate | null;
  analysis: AnalysisAggregate | null;
  operational: OperationalAggregate | null;
  dailySpend: DailySpendRow[] | null;
  spendThresholdUsd: number;
}

export interface HealthMetrics {
  tickOk: boolean;
  tickAgeSeconds: number | null;
  tickSymbolCount: number;
  onDemandTickMode: boolean;
  cronSuccessRate: number | null;
  cronDone: number;
  cronTotal: number;
  toolSuccessRate: number | null;
  toolsOk: number;
  toolsTotal: number;
  chatTurns: number;
}

export interface HealthAssessment {
  anomalies: string[];
  spendWatch: SpendWatchSummary;
  metrics: HealthMetrics;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function buildHealthAssessment(input: HealthAssessmentInput): HealthAssessment {
  const { ticks, cron, tools, chat, analysis, operational, dailySpend } = input;
  const anomalies: string[] = [];

  const TICK_FRESH_S = 60;
  const TICK_OK_S = 300;
  const tickStreamExplicitlyEnabled =
    process.env.WORKER_ENABLE_TICK_STREAM === '1' ||
    process.env.WORKER_ENABLE_TICK_STREAM === 'true';
  const tickStreamExplicitlyDisabled =
    process.env.WORKER_ENABLE_TICK_STREAM === '0' ||
    process.env.WORKER_ENABLE_TICK_STREAM === 'false';

  let tickOk = false;
  let tickAgeSeconds: number | null = null;
  let tickSymbolCount = 0;
  let onDemandTickMode = false;

  if (ticks) {
    tickSymbolCount = ticks.symbolCount;
    tickAgeSeconds = ticks.oldestAgeSeconds;
    if (tickStreamExplicitlyDisabled || (!tickStreamExplicitlyEnabled && tickSymbolCount === 0)) {
      onDemandTickMode = true;
      tickOk = true;
    } else if (tickAgeSeconds !== null) {
      tickOk = tickAgeSeconds <= TICK_OK_S;
      if (tickAgeSeconds > TICK_FRESH_S) {
        anomalies.push(
          `Tick data is stale: oldest symbol tick is ${tickAgeSeconds}s old (threshold: ${TICK_FRESH_S}s)`,
        );
      }
    } else {
      anomalies.push('No live tick data — worker may not be running');
    }
  } else {
    anomalies.push('Tick telemetry is unavailable — worker health cannot be verified');
  }

  let cronSuccessRate: number | null = null;
  if (cron) {
    if (cron.total > 0) {
      cronSuccessRate = cron.done / cron.total;
      if (cronSuccessRate < 0.995) {
        anomalies.push(
          `Cron completion is below SLO: ${cron.done}/${cron.total} completed (target: 99.5%)`,
        );
      }
    } else {
      anomalies.push('No cron runs in the selected window — cron health cannot be verified');
    }
    if (cron.stuck > 0) {
      anomalies.push(`${cron.stuck} cron job(s) stuck in 'started' > 5 minutes`);
    }
  } else {
    anomalies.push('Cron telemetry is unavailable — cron health cannot be verified');
  }

  let toolSuccessRate: number | null = null;
  if (tools && tools.total > 0) {
    toolSuccessRate = tools.ok / tools.total;
    if (toolSuccessRate < 0.99) {
      anomalies.push(
        `AI tool success is below SLO: ${tools.ok}/${tools.total} succeeded (target: 99%)`,
      );
    }
  } else if (!tools) {
    anomalies.push('AI tool telemetry is unavailable — gateway health cannot be verified');
  } else {
    anomalies.push('No AI tool calls in the selected window — gateway health cannot be verified');
  }

  const chatTurns = chat?.turns ?? 0;
  if (!chat) {
    anomalies.push('Chat telemetry is unavailable — chat health cannot be verified');
  } else if (chatTurns === 0) {
    anomalies.push('No chat turns in the selected window — chat health cannot be verified');
  }

  if (analysis) {
    if (analysis.stale > 0) {
      anomalies.push(`${analysis.stale} analysis job(s) pending > 10 minutes — worker may be down`);
    }
    if (analysis.stuck > 0) {
      anomalies.push(`${analysis.stuck} analysis job(s) stuck in 'running' > 30 seconds`);
    }
  }

  if (!operational) {
    anomalies.push(
      'Recovery telemetry is unavailable — outbox, budget, trace, and Full-mode health cannot be verified',
    );
  } else {
    if (operational.fullTotal > 0 && operational.fullCompleted / operational.fullTotal < 0.995) {
      anomalies.push(
        `Full-mode completion is below SLO: ${operational.fullCompleted}/${operational.fullTotal} completed`,
      );
    }
    if (
      operational.sentimentTotal > 0 &&
      operational.sentimentSucceeded / operational.sentimentTotal < 0.95
    ) {
      anomalies.push(
        `Sentiment specialist success is below SLO: ${operational.sentimentSucceeded}/${operational.sentimentTotal} succeeded`,
      );
    }
    if (operational.outboxDead > 0) {
      anomalies.push(`${operational.outboxDead} persistence outbox record(s) are dead-lettered`);
    }
    if (operational.budgetErrors > 0) {
      anomalies.push(`${operational.budgetErrors} budget reservation(s) have recovery errors`);
    }
    if (operational.traceFailed > 0) {
      anomalies.push(`${operational.traceFailed} diagnostic trace(s) failed to complete`);
    }
    if (
      operational.traceTotal > 0 &&
      operational.providerFallbackTraces / operational.traceTotal > 0.05
    ) {
      anomalies.push(
        `Provider fallback usage is above threshold: ${operational.providerFallbackTraces}/${operational.traceTotal} traces used fallback`,
      );
    }
  }

  const spendWatch = resolveSpendWatch(dailySpend ?? [], input.spendThresholdUsd);
  if (!dailySpend) {
    anomalies.push('Daily spend ledger is unavailable — spend-watch alerts cannot be verified');
  } else {
    for (const entry of spendWatch.overThreshold.slice(0, SPEND_WATCH_ANOMALY_LIMIT)) {
      anomalies.push(
        `Daily spend alert: user ${entry.userId} has spent ${formatUsd(entry.spendUsd)} today (threshold ${formatUsd(spendWatch.thresholdUsd)})`,
      );
    }
    if (spendWatch.usersOverThreshold > SPEND_WATCH_ANOMALY_LIMIT) {
      anomalies.push(
        `${spendWatch.usersOverThreshold - SPEND_WATCH_ANOMALY_LIMIT} more user(s) reached the ${formatUsd(spendWatch.thresholdUsd)} daily spend threshold`,
      );
    }
    recordSpendThresholdMetric(spendWatch);
  }

  return {
    anomalies,
    spendWatch,
    metrics: {
      tickOk,
      tickAgeSeconds,
      tickSymbolCount,
      onDemandTickMode,
      cronSuccessRate,
      cronDone: cron?.done ?? 0,
      cronTotal: cron?.total ?? 0,
      toolSuccessRate,
      toolsOk: tools?.ok ?? 0,
      toolsTotal: tools?.total ?? 0,
      chatTurns,
    },
  };
}
