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

// SLI snapshot construction for the admin health dashboard.

import type { SliSnapshot } from '../admin-dtos';
import type { HealthMetrics } from './anomaly-builder';
import type { OperationalAggregate } from './probe-types';

function pct(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function computeErrorBudget(current: number | null, sloTarget: number): number | null {
  if (current === null) return null;
  if (current >= 1) return 1;
  if (sloTarget >= 1) return current >= 1 ? 1 : 0;
  return pct(Math.max(0, Math.min(1, (current - sloTarget) / (1 - sloTarget))));
}

export function buildSliSnapshots(
  metrics: HealthMetrics,
  operational: OperationalAggregate | null,
  hours: number,
): SliSnapshot[] {
  const HOUR_LABEL =
    hours <= 1 ? '1 hour' : hours <= 24 ? `${hours}h` : `${hours}h (${Math.round(hours / 24)}d)`;
  const {
    onDemandTickMode,
    tickOk,
    tickAgeSeconds,
    tickSymbolCount,
    cronSuccessRate,
    cronDone,
    cronTotal,
    toolSuccessRate,
    toolsOk,
    toolsTotal,
    chatTurns,
  } = metrics;

  const operationalSlis: SliSnapshot[] = operational
    ? [
        {
          key: 'full_mode_completion',
          label: 'Full-mode Completion',
          current:
            operational.fullTotal > 0 ? operational.fullCompleted / operational.fullTotal : null,
          sloTarget: 0.995,
          window: HOUR_LABEL,
          success: operational.fullCompleted,
          total: operational.fullTotal,
          errorBudget: computeErrorBudget(
            operational.fullTotal > 0 ? operational.fullCompleted / operational.fullTotal : null,
            0.995,
          ),
          details: `${operational.fullCompleted}/${operational.fullTotal} Full-mode jobs completed`,
        },
        {
          key: 'sentiment_health',
          label: 'Sentiment Specialist',
          current:
            operational.sentimentTotal > 0
              ? operational.sentimentSucceeded / operational.sentimentTotal
              : null,
          sloTarget: 0.95,
          window: HOUR_LABEL,
          success: operational.sentimentSucceeded,
          total: operational.sentimentTotal,
          errorBudget: computeErrorBudget(
            operational.sentimentTotal > 0
              ? operational.sentimentSucceeded / operational.sentimentTotal
              : null,
            0.95,
          ),
          details: `${operational.sentimentSucceeded}/${operational.sentimentTotal} sentiment calls succeeded`,
        },
        {
          key: 'persistence_outbox',
          label: 'Persistence Recovery',
          current:
            operational.outboxTerminal > 0
              ? operational.outboxCompleted / operational.outboxTerminal
              : null,
          sloTarget: 0.999,
          window: HOUR_LABEL,
          success: operational.outboxCompleted,
          total: operational.outboxTerminal,
          errorBudget: computeErrorBudget(
            operational.outboxTerminal > 0
              ? operational.outboxCompleted / operational.outboxTerminal
              : null,
            0.999,
          ),
          details: `${operational.outboxCompleted} completed, ${operational.outboxDead} dead-lettered`,
        },
        {
          key: 'budget_recovery',
          label: 'Budget Recovery',
          current:
            operational.budgetTerminal > 0
              ? 1 - operational.budgetErrors / operational.budgetTerminal
              : null,
          sloTarget: 0.999,
          window: HOUR_LABEL,
          success: operational.budgetTerminal - operational.budgetErrors,
          total: operational.budgetTerminal,
          errorBudget: computeErrorBudget(
            operational.budgetTerminal > 0
              ? 1 - operational.budgetErrors / operational.budgetTerminal
              : null,
            0.999,
          ),
          details: `${operational.budgetErrors} recovery errors across ${operational.budgetTerminal} terminal reservations`,
        },
        {
          key: 'trace_sink',
          label: 'Diagnostic Trace Sink',
          current:
            operational.traceTotal > 0
              ? (operational.traceTotal - operational.traceFailed) / operational.traceTotal
              : null,
          sloTarget: 0.999,
          window: HOUR_LABEL,
          success: operational.traceTotal - operational.traceFailed,
          total: operational.traceTotal,
          errorBudget: computeErrorBudget(
            operational.traceTotal > 0
              ? (operational.traceTotal - operational.traceFailed) / operational.traceTotal
              : null,
            0.999,
          ),
          details: `${operational.traceFailed} failed of ${operational.traceTotal} traces`,
        },
        {
          key: 'provider_fallback_free',
          label: 'Provider Fallback-free',
          current:
            operational.traceTotal > 0
              ? 1 - operational.providerFallbackTraces / operational.traceTotal
              : null,
          sloTarget: 0.95,
          window: HOUR_LABEL,
          success: operational.traceTotal - operational.providerFallbackTraces,
          total: operational.traceTotal,
          errorBudget: computeErrorBudget(
            operational.traceTotal > 0
              ? 1 - operational.providerFallbackTraces / operational.traceTotal
              : null,
            0.95,
          ),
          details: `${operational.providerFallbackTraces} trace(s) used provider fallback`,
        },
      ]
    : [];

  return [
    onDemandTickMode
      ? {
          key: 'worker_ticks',
          label: 'Worker / Tick Freshness',
          current: 1,
          sloTarget: 0.999,
          window: 'current',
          success: 1,
          total: 1,
          errorBudget: 1,
          informational: true,
          details: 'On-demand BiQuote REST mode active (tick stream disabled)',
        }
      : {
          key: 'worker_ticks',
          label: 'Worker / Tick Freshness',
          current: tickSymbolCount > 0 ? (tickOk ? 1 : 0) : null,
          sloTarget: 0.999,
          window: 'current',
          success: tickOk ? 1 : 0,
          total: tickSymbolCount > 0 ? 1 : 0,
          errorBudget: tickSymbolCount > 0 ? (tickOk ? 1 : 0) : null,
          details:
            tickSymbolCount > 0 && tickAgeSeconds !== null
              ? `Oldest symbol tick ${tickAgeSeconds}s old across ${tickSymbolCount} symbols`
              : 'No tick data',
        },
    {
      key: 'cron_jobs',
      label: 'Cron Job Completion',
      current: cronSuccessRate,
      sloTarget: 0.995,
      window: HOUR_LABEL,
      success: cronDone,
      total: cronTotal,
      errorBudget: computeErrorBudget(cronSuccessRate, 0.995),
      details: cronTotal > 0 ? `${cronDone}/${cronTotal} completed` : 'No cron runs in window',
    },
    {
      key: 'ai_gateway',
      label: 'AI Tool Gateway',
      current: toolSuccessRate,
      sloTarget: 0.99,
      window: HOUR_LABEL,
      success: toolsOk,
      total: toolsTotal,
      errorBudget: computeErrorBudget(toolSuccessRate, 0.99),
      details:
        toolsTotal > 0 ? `${toolsOk}/${toolsTotal} tools succeeded` : 'No tool calls in window',
    },
    {
      key: 'chat_api',
      label: 'Chat API',
      current: chatTurns > 0 ? 1 : null,
      sloTarget: 0.995,
      window: HOUR_LABEL,
      success: chatTurns,
      total: chatTurns,
      errorBudget: null,
      informational: true,
      details:
        chatTurns > 0
          ? `${chatTurns} turns in window — error rate tracked via Sentry`
          : 'No chat turns in window',
    },
    ...operationalSlis,
  ];
}
