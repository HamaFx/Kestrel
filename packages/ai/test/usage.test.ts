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

// Batch 4: drives the REAL `computeUsage` and `listTelemetry` from
// src/usage.ts. The previous revision defined a local `reduce()` clone and
// never imported the production module — it could not catch the
// daily_ai_spend/chat_telemetry split that actually ships. Only the DB
// boundary (getDb + the tenant lookup) is mocked here; every aggregation,
// bucketing, provider-mapping and row-mapping decision is production code.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { computeUsage, listTelemetry } from '../src/usage';

const mockRequireTenantIdForUser = vi.fn(async (..._args: unknown[]) => 'tenant-1');

vi.mock('@kestrel/db', () => ({
  requireTenantIdForUser: (...args: unknown[]) => mockRequireTenantIdForUser(...args),
  schema: {
    chatTelemetry: {
      userId: 'chatTelemetry.userId',
      tenantId: 'chatTelemetry.tenantId',
      createdAt: 'chatTelemetry.createdAt',
    },
    dailyAiSpend: {
      userId: 'dailyAiSpend.userId',
      tenantId: 'dailyAiSpend.tenantId',
      day: 'dailyAiSpend.day',
    },
  },
}));

// Each entry mirrors a `db.select()` call in the order usage.ts issues them.
let selectQueue: unknown[] = [];

vi.mock('../src/db', () => ({
  getDb: () => ({
    select: () => {
      const chain = selectQueue.shift();
      if (!chain) throw new Error('unexpected db.select() call — selectQueue is empty');
      return chain;
    },
  }),
}));

/** First query in computeUsage: select telemetry ordered by createdAt desc. */
function telemetryChain(rows: unknown[]) {
  const tail = Object.assign(Promise.resolve(rows), {
    limit: () => Promise.resolve(rows),
  });
  return { from: () => ({ where: () => ({ orderBy: () => tail }) }) };
}

/** Second query in computeUsage: select daily spend limited to 30 rows. */
function spendChain(rows: unknown[]) {
  return { from: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) }) };
}

function telemetryRow(overrides: Record<string, unknown>) {
  return {
    kind: null,
    model: 'google/gemini-2.5-flash',
    inputTokens: 0,
    outputTokens: 0,
    estCostUsd: 0,
    createdAt: new Date('2026-05-26T12:00:00Z'),
    ...overrides,
  };
}

describe('usage aggregation (real computeUsage)', () => {
  beforeEach(() => {
    selectQueue = [];
    mockRequireTenantIdForUser.mockClear();
  });

  it('computes authoritative todayUsd, sevenDayUsd, and thirtyDayUsd from daily_ai_spend cents', async () => {
    selectQueue = [
      telemetryChain([]),
      spendChain([
        { day: '2026-05-26', totalUsdCents: 250 },
        { day: '2026-05-25', totalUsdCents: 150 },
        { day: '2026-05-12', totalUsdCents: 500 },
      ]),
    ];

    const stats = await computeUsage('user-1', new Date('2026-05-26T15:00:00Z'));

    expect(mockRequireTenantIdForUser).toHaveBeenCalledWith('user-1', expect.anything());
    expect(stats.todayUsd).toBeCloseTo(2.5);
    expect(stats.sevenDayUsd).toBeCloseTo(4.0);
    expect(stats.thirtyDayUsd).toBeCloseTo(9.0);

    // Exactly 7 ordered UTC buckets ending on `now`.
    expect(stats.daily7.map((bucket) => bucket.date)).toEqual([
      '2026-05-20',
      '2026-05-21',
      '2026-05-22',
      '2026-05-23',
      '2026-05-24',
      '2026-05-25',
      '2026-05-26',
    ]);
    const costByDate = new Map(stats.daily7.map((bucket) => [bucket.date, bucket.costUsd]));
    expect(costByDate.get('2026-05-26')).toBeCloseTo(2.5);
    expect(costByDate.get('2026-05-25')).toBeCloseTo(1.5);
    expect(costByDate.get('2026-05-24')).toBe(0);
  });

  it('separates user turn counts from auxiliary specialist/planner token breakdowns', async () => {
    selectQueue = [
      telemetryChain([
        telemetryRow({
          kind: null,
          model: 'google/gemini-2.5-flash',
          inputTokens: 100,
          outputTokens: 50,
          estCostUsd: 0.01,
        }),
        telemetryRow({
          kind: 'multi_agent_turn',
          model: 'google/gemini-2.5-flash',
          inputTokens: 200,
          outputTokens: 100,
          estCostUsd: 0.02,
        }),
        telemetryRow({
          kind: 'multi_specialist_technical',
          model: 'anthropic/claude-sonnet-4-5',
          inputTokens: 300,
          outputTokens: 150,
          estCostUsd: 0.03,
        }),
        telemetryRow({
          kind: 'title_gen',
          model: 'gemini-2.5-flash',
          inputTokens: 10,
          outputTokens: 5,
          estCostUsd: 0.001,
        }),
      ]),
      spendChain([]),
    ];

    const stats = await computeUsage('user-1', new Date('2026-05-26T15:00:00Z'));

    // Only the null-kind and multi_agent_turn rows count as user turns.
    expect(stats.thirtyDayTurns).toBe(2);
    expect(stats.daily7.find((b) => b.date === '2026-05-26')?.turns).toBe(2);

    // Token/cost totals combine user, specialist, and title-generation rows.
    expect(stats.thirtyDayInputTokens).toBe(410);
    expect(stats.thirtyDayOutputTokens).toBe(205);

    // The multi_agent_turn row must NOT inflate the model breakdown:
    // its tokens are the same turn already counted above.
    const byModel = new Map(stats.byModel.map((entry) => [entry.model, entry]));
    expect(byModel.get('google/gemini-2.5-flash')).toMatchObject({
      turns: 1,
      inputTokens: 100,
      outputTokens: 50,
    });
    expect(byModel.get('anthropic/claude-sonnet-4-5')).toMatchObject({
      turns: 1,
      inputTokens: 300,
      outputTokens: 150,
    });

    // Bare 'gemini-2.5-flash' canonicalizes to the google BYOK provider and
    // merges with the 'google/...' prefix bucket.
    const google = stats.byProvider.find((p) => p.byokProviderId === 'google');
    expect(google).toMatchObject({ turns: 2, inputTokens: 110, outputTokens: 55 });
    expect(google?.costUsd).toBeCloseTo(0.011);

    const anthropic = stats.byProvider.find((p) => p.byokProviderId === 'anthropic');
    expect(anthropic).toMatchObject({ turns: 1, inputTokens: 300, outputTokens: 150 });
    expect(anthropic?.costUsd).toBeCloseTo(0.03);
  });

  it('listTelemetry maps DB rows to TelemetryRow with epoch-ms createdAt and null coalescing', async () => {
    selectQueue = [
      telemetryChain([
        {
          id: 't1',
          threadId: 'thread-1',
          messageId: null,
          traceId: null,
          runId: null,
          jobId: null,
          model: 'google/gemini-2.5-flash',
          inputTokens: 10,
          outputTokens: 5,
          toolCalls: 2,
          ms: 1234,
          estCostUsd: 0.005,
          createdAt: new Date('2026-05-26T12:00:00Z'),
        },
        {
          id: 't2',
          threadId: null,
          messageId: 'message-2',
          traceId: 'trace-2',
          runId: 'run-2',
          jobId: 'job-2',
          model: 'gemini-2.5-flash',
          inputTokens: null,
          outputTokens: null,
          toolCalls: null,
          ms: null,
          estCostUsd: '0.007',
          createdAt: new Date('2026-05-26T11:00:00Z'),
        },
      ]),
    ];

    const rows = await listTelemetry('user-1', 10);

    expect(rows).toEqual([
      {
        id: 't1',
        threadId: 'thread-1',
        messageId: null,
        traceId: null,
        runId: null,
        jobId: null,
        model: 'google/gemini-2.5-flash',
        inputTokens: 10,
        outputTokens: 5,
        toolCalls: 2,
        ms: 1234,
        estCostUsd: 0.005,
        createdAt: Date.parse('2026-05-26T12:00:00Z'),
      },
      {
        id: 't2',
        threadId: null,
        messageId: 'message-2',
        traceId: 'trace-2',
        runId: 'run-2',
        jobId: 'job-2',
        model: 'gemini-2.5-flash',
        inputTokens: 0,
        outputTokens: 0,
        toolCalls: 0,
        ms: 0,
        estCostUsd: 0.007,
        createdAt: Date.parse('2026-05-26T11:00:00Z'),
      },
    ]);
  });

  it('returns zeroed totals when there is no telemetry and no spend', async () => {
    selectQueue = [telemetryChain([]), spendChain([])];

    const stats = await computeUsage('user-1', new Date('2026-05-26T15:00:00Z'));

    expect(stats.todayUsd).toBe(0);
    expect(stats.sevenDayUsd).toBe(0);
    expect(stats.thirtyDayUsd).toBe(0);
    expect(stats.thirtyDayTurns).toBe(0);
    expect(stats.byModel).toEqual([]);
    expect(stats.byProvider).toEqual([]);
    expect(stats.daily7).toHaveLength(7);
  });
});
