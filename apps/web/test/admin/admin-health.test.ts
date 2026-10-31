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

import { metrics } from '@kestrel/shared';
import { describe, expect, it, vi } from 'vitest';

import {
  computeHealthSloService,
  resetAdminSpendAlertDedup,
  resolveSpendWatch,
} from '@/lib/services/admin-health';
import { queryChatAggregate } from '@/lib/services/health/probe-queries';
import { buildSliSnapshots } from '@/lib/services/health/sli-builder';

function createMockDb(
  scenario:
    | 'healthy'
    | 'on-demand-empty-ticks'
    | 'missing-live-ticks'
    | 'stale-tick'
    | 'silent'
    | 'spend-over-threshold'
    | 'stale-analysis'
    | 'missing-daily-spend' = 'healthy',
) {
  let callIndex = 0;

  return {
    execute: vi.fn(async () => {
      callIndex += 1;

      if (callIndex === 1) {
        return { rows: [{ '?column?': 1 }] };
      }

      if (callIndex === 2) {
        if (scenario === 'missing-live-ticks') {
          throw new Error('relation "live_ticks" does not exist');
        }
        if (scenario === 'on-demand-empty-ticks') {
          return { rows: [{ symbol_count: 0, oldest_age_s: null }] };
        }
        return scenario === 'stale-tick'
          ? { rows: [{ symbol_count: 3, oldest_age_s: 90 }] }
          : { rows: [{ symbol_count: 2, oldest_age_s: 30 }] };
      }

      if (callIndex === 3) {
        return scenario === 'silent'
          ? { rows: [{ total: '0', done: '0', stuck: '0' }] }
          : { rows: [{ total: '10', done: '9', stuck: '1' }] };
      }

      if (callIndex === 4) {
        return scenario === 'silent'
          ? { rows: [{ total: '0', ok: '0' }] }
          : { rows: [{ total: '100', ok: '99' }] };
      }

      if (callIndex === 5) {
        return scenario === 'silent' ? { rows: [{ turns: '0' }] } : { rows: [{ turns: '50' }] };
      }

      if (callIndex === 6) {
        if (scenario === 'stale-analysis') {
          return { rows: [{ stale: '2', stuck: '1' }] };
        }
        return { rows: [{ stale: '0', stuck: '0' }] };
      }

      if (callIndex === 7) {
        return {
          rows: [
            {
              full_total: '10',
              full_completed: '10',
              full_failed: '0',
              outbox_terminal: '10',
              outbox_completed: '10',
              outbox_dead: '0',
              budget_terminal: '10',
              budget_errors: '0',
              trace_total: '10',
              trace_failed: '0',
              provider_fallback_traces: '1',
            },
          ],
        };
      }

      if (callIndex === 8) {
        if (scenario === 'missing-daily-spend') {
          throw new Error('relation "daily_ai_spend" does not exist');
        }
        if (scenario === 'spend-over-threshold') {
          return {
            rows: [
              { user_id: 'user-1', total_usd_cents: '4100' },
              { user_id: 'user-2', total_usd_cents: '2500' },
              { user_id: 'user-3', total_usd_cents: '900' },
            ],
          };
        }
        return { rows: [] };
      }

      return { rows: [] };
    }),
  };
}

describe('computeHealthSloService', () => {
  it('returns the aggregated live tick symbol count and newest age', async () => {
    const db = createMockDb('healthy');
    const result = await computeHealthSloService(db, { hours: 24 });

    expect(result.dbOk).toBe(true);
    expect(result.overall).toBe('degraded'); // anomalies exist (stuck cron)

    const tickSli = result.slis.find((s) => s.key === 'worker_ticks');
    expect(tickSli).toBeDefined();
    expect(tickSli?.details).toBe('Oldest symbol tick 30s old across 2 symbols');
    expect(tickSli?.success).toBe(1);
    expect(result.slis.find((s) => s.key === 'full_mode_completion')?.current).toBe(1);
    expect(result.slis.find((s) => s.key === 'sentiment_health')).toBeUndefined();
  });

  it('reports healthy on-demand REST mode when live_ticks is empty and WORKER_ENABLE_TICK_STREAM is disabled', async () => {
    const db = createMockDb('on-demand-empty-ticks');
    const result = await computeHealthSloService(db, { hours: 24 });

    const tickSli = result.slis.find((s) => s.key === 'worker_ticks');
    expect(tickSli?.current).toBe(1);
    expect(tickSli?.informational).toBe(true);
    expect(tickSli?.details).toContain('On-demand BiQuote REST mode active');
    expect(result.anomalies).not.toContain('No live tick data — worker may not be running');
  });

  it('does not break other SLIs when live_ticks is missing', async () => {
    const db = createMockDb('missing-live-ticks');
    const result = await computeHealthSloService(db, { hours: 24 });

    expect(result.dbOk).toBe(true);
    expect(result.slis.find((s) => s.key === 'worker_ticks')?.current).toBeNull();
    expect(result.overall).toBe('degraded');
    expect(result.anomalies).toContain(
      'Tick telemetry is unavailable — worker health cannot be verified',
    );
    expect(result.slis.find((s) => s.key === 'cron_jobs')?.total).toBe(10);
    expect(result.slis.find((s) => s.key === 'ai_gateway')?.total).toBe(100);
  });

  it('computes cron and AI gateway SLIs correctly', async () => {
    const db = createMockDb('healthy');
    const result = await computeHealthSloService(db, { hours: 24 });

    const cronSli = result.slis.find((s) => s.key === 'cron_jobs');
    expect(cronSli?.success).toBe(9);
    expect(cronSli?.total).toBe(10);
    expect(cronSli?.current).toBe(0.9);
    expect(result.slis.find((s) => s.key === 'worker_ticks')?.window).toBe('current');
    expect(result.slis.find((s) => s.key === 'cron_jobs')?.window).toBe('24h');

    const toolSli = result.slis.find((s) => s.key === 'ai_gateway');
    expect(toolSli?.success).toBe(99);
    expect(toolSli?.total).toBe(100);
    expect(toolSli?.current).toBe(0.99);
  });

  it('supports postgres-js array results as well as { rows } results', async () => {
    const rowsDb = createMockDb('healthy');
    const db = {
      execute: vi.fn(async () => {
        const result = await rowsDb.execute();
        return result && typeof result === 'object' && 'rows' in result
          ? (result as { rows: unknown[] }).rows
          : result;
      }),
    };
    const result = await computeHealthSloService(db, { hours: 24 });

    expect(result.slis.find((s) => s.key === 'full_mode_completion')?.current).toBe(1);
    expect(result.slis.find((s) => s.key === 'sentiment_health')).toBeUndefined();
    expect(result.anomalies).not.toContain(
      'Recovery telemetry is unavailable — outbox, budget, trace, and Full-mode health cannot be verified',
    );
  });

  it('flags a stale tick anomaly', async () => {
    const db = createMockDb('stale-tick');
    const result = await computeHealthSloService(db, { hours: 24 });

    expect(result.anomalies.some((a) => a.includes('stale'))).toBe(true);
    expect(result.overall).toBe('degraded');
  });

  it('flags stalled Full-mode queue rows, not just Mastra snapshots', async () => {
    const db = createMockDb('stale-analysis');
    const result = await computeHealthSloService(db, { hours: 24 });

    // The 2026-10-28 outage: a job sat `pending` in full_analysis_queue with
    // no Mastra snapshot, so the snapshot-based probe reported zero and no
    // alert fired. The queue-based probe now catches exactly that shape.
    expect(result.anomalies).toContain(
      '2 analysis job(s) pending > 10 minutes — worker may be down',
    );
    expect(result.anomalies).toContain(
      '1 analysis job(s) running with an expired lease — worker may be wedged',
    );
  });

  it('flags silent AI telemetry instead of reporting an unverified healthy window', async () => {
    const db = createMockDb('silent');
    const result = await computeHealthSloService(db, { hours: 1 });

    expect(result.overall).toBe('degraded');
    expect(result.anomalies).toContain(
      'No AI tool calls in the selected window — gateway health cannot be verified',
    );
    expect(result.anomalies).toContain(
      'No chat turns in the selected window — chat health cannot be verified',
    );
    expect(result.anomalies).toContain(
      'No cron runs in the selected window — cron health cannot be verified',
    );
  });

  it('flags users whose daily ledger spend reaches the threshold as anomalies', async () => {
    resetAdminSpendAlertDedup();
    const db = createMockDb('spend-over-threshold');
    const result = await computeHealthSloService(db, { hours: 24, spendAlertThresholdUsd: 25 });

    expect(result.spendWatch?.thresholdUsd).toBe(25);
    expect(result.spendWatch?.usersOverThreshold).toBe(2);
    expect(result.spendWatch?.overThreshold.map((e) => e.userId)).toEqual(['user-1', 'user-2']);
    expect(result.anomalies).toContain(
      'Daily spend alert: user user-1 has spent $41.00 today (threshold $25.00)',
    );
    expect(result.anomalies).toContain(
      'Daily spend alert: user user-2 has spent $25.00 today (threshold $25.00)',
    );
    expect(result.anomalies.some((a) => a.includes('user-3'))).toBe(false);
    expect(result.overall).toBe('degraded');
  });

  it('reads the spend-watch threshold from ADMIN_SPEND_ALERT_USD when no override is given', async () => {
    vi.stubEnv('ADMIN_SPEND_ALERT_USD', '40');
    try {
      const db = createMockDb('spend-over-threshold');
      const result = await computeHealthSloService(db, { hours: 24 });

      expect(result.spendWatch?.thresholdUsd).toBe(40);
      expect(result.spendWatch?.usersOverThreshold).toBe(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('falls back to the $25 default when ADMIN_SPEND_ALERT_USD is empty', async () => {
    vi.stubEnv('ADMIN_SPEND_ALERT_USD', '');
    try {
      const db = createMockDb('spend-over-threshold');
      const result = await computeHealthSloService(db, { hours: 24 });

      expect(result.spendWatch?.thresholdUsd).toBe(25);
      expect(result.spendWatch?.usersOverThreshold).toBe(2);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('keeps other SLIs working and reports zero users when the spend ledger is unavailable', async () => {
    const db = createMockDb('missing-daily-spend');
    const result = await computeHealthSloService(db, { hours: 24 });

    expect(result.dbOk).toBe(true);
    expect(result.spendWatch?.usersOverThreshold).toBe(0);
    expect(result.spendWatch?.overThreshold).toEqual([]);
    expect(result.anomalies).toContain(
      'Daily spend ledger is unavailable — spend-watch alerts cannot be verified',
    );
    expect(result.slis.find((s) => s.key === 'cron_jobs')?.total).toBe(10);
  });

  it('does not block or inflate: no spend anomalies when everyone is under threshold', async () => {
    const db = createMockDb('healthy');
    const result = await computeHealthSloService(db, { hours: 24 });

    expect(result.spendWatch?.usersOverThreshold).toBe(0);
    expect(result.anomalies.some((a) => a.startsWith('Daily spend alert:'))).toBe(false);
  });

  it('increments the spend-threshold metric once per user per day, not per poll', async () => {
    resetAdminSpendAlertDedup();
    metrics.reset();
    const db = createMockDb('spend-over-threshold');

    await computeHealthSloService(db, { hours: 24, spendAlertThresholdUsd: 25 });
    await computeHealthSloService(db, { hours: 24, spendAlertThresholdUsd: 25 });

    expect(metrics.snapshot().counters['admin_spend_threshold_total']).toBe(2);
    metrics.reset();
  });

  it('resolveSpendWatch sorts breaches by spend and skips empty user ids', () => {
    const summary = resolveSpendWatch(
      [
        { userId: '', spendUsdCents: 5000 },
        { userId: 'user-b', spendUsdCents: 2600 },
        { userId: 'user-a', spendUsdCents: 9900 },
      ],
      25,
    );

    expect(summary.usersOverThreshold).toBe(2);
    expect(summary.overThreshold).toEqual([
      { userId: 'user-a', spendUsd: 99 },
      { userId: 'user-b', spendUsd: 26 },
    ]);
  });

  it('counts Mastra v2 chat_telemetry rows in queryChatAggregate and omits the retired sentiment_health SLI', async () => {
    const execute = vi.fn(async (_query: unknown) => ({ rows: [{ turns: '3' }] }));
    const aggregate = await queryChatAggregate({ execute }, '2026-01-01T00:00:00.000Z');

    expect(aggregate).toEqual({ turns: 3 });
    const sqlText = JSON.stringify(execute.mock.calls[0]![0]);
    expect(sqlText).toContain("kind IS NULL OR kind LIKE 'mastra_%'");

    const slis = buildSliSnapshots(
      {
        tickOk: true,
        tickAgeSeconds: null,
        tickSymbolCount: 0,
        onDemandTickMode: true,
        cronSuccessRate: 1,
        cronDone: 10,
        cronTotal: 10,
        toolSuccessRate: 1,
        toolsOk: 20,
        toolsTotal: 20,
        chatTurns: 15,
      },
      {
        fullTotal: 4,
        fullCompleted: 4,
        fullFailed: 0,
        outboxTerminal: 2,
        outboxCompleted: 2,
        outboxDead: 0,
        budgetTerminal: 15,
        budgetErrors: 0,
        traceTotal: 15,
        traceFailed: 0,
        providerFallbackTraces: 0,
      },
      24,
    );
    expect(slis.find((s) => s.key === 'sentiment_health')).toBeUndefined();
    expect(slis.find((s) => s.key === 'chat_api')?.total).toBe(15);
  });
});
