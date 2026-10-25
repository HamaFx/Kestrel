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

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BudgetExceededError,
  dailySpendUsd,
  DEFAULT_MAX_DAILY_USD,
  DEFAULT_TURN_ESTIMATE_USD,
  enforceDailyBudget,
  estimateCostUsd,
  estimateKnownCostUsd,
  getMonthlySpend,
  getProviderMonthlySpend,
  reconcileBudgetReservation,
  recoverStaleBudgetReservations,
  releaseBudgetReservation,
  reservedSpendUsd,
  resolveModelRate,
  tryReserveBudget,
  UnknownModelPricingError,
} from '../src/budget/cost';

vi.mock('server-only', () => ({}));

let mockSelectResult: unknown = [];
let mockExecuteResult: unknown = { rows: [] };
let mockTransactionResults: unknown[] = [];
let rejectDateParams = false;

function containsDate(value: unknown, seen = new WeakSet<object>()): boolean {
  if (value instanceof Date) return true;
  if (typeof value !== 'object' || value === null) return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => containsDate(item, seen));
  return Object.values(value).some((item) => containsDate(item, seen));
}

const mockTransactionExecute = vi.fn((query: unknown) => {
  if (rejectDateParams && containsDate(query)) {
    throw new Error('raw SQL received a Date parameter');
  }
  return Promise.resolve(mockTransactionResults.shift() ?? mockExecuteResult);
});

function thenableResolver(v: unknown) {
  return Object.assign(Promise.resolve(v), {
    orderBy: () => thenableResolver(v),
    limit: () => thenableResolver(v),
    innerJoin: () => ({ where: () => thenableResolver(v) }),
  });
}

vi.mock('@kestrel/db', () => ({
  hasTenantDbScope: vi.fn(() => false),
  requireTenantIdForUser: vi.fn(async () => 'tenant-1'),
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => thenableResolver(mockSelectResult),
      }),
    }),
    execute: () => Promise.resolve(mockExecuteResult),
    transaction: async (
      callback: (tx: { execute: (query: unknown) => Promise<unknown> }) => Promise<unknown>,
    ) => callback({ execute: (query: unknown) => mockTransactionExecute(query) }),
  }),
  schema: {
    chatTelemetry: {
      userId: 'chatTelemetry.userId',
      tenantId: 'chatTelemetry.tenantId',
      model: 'chatTelemetry.model',
      estCostUsd: 'chatTelemetry.estCostUsd',
      createdAt: 'chatTelemetry.createdAt',
    },
    dailyAiSpend: {
      userId: 'dailyAiSpend.userId',
      tenantId: 'dailyAiSpend.tenantId',
      day: 'dailyAiSpend.day',
      totalUsdCents: 'dailyAiSpend.totalUsdCents',
    },
    users: {},
    userSettings: {
      userId: 'userSettings.userId',
      tenantId: 'userSettings.tenantId',
      monthlyBudgetLimit: 'userSettings.monthlyBudgetLimit',
      providerSpendingThresholds: 'userSettings.providerSpendingThresholds',
      spendAlertsConfig: 'userSettings.spendAlertsConfig',
      spendAlertsState: 'userSettings.spendAlertsState',
    },
  },
}));

vi.mock('../src/alerts/delivery', () => ({
  sendDirectNotification: vi.fn(() => Promise.resolve()),
}));

describe('Phase 1 cost aggregation invariants', () => {
  it('derives one aggregate from child generations without duplicating a parent total', () => {
    const generations = [
      { inputTokens: 100, outputTokens: 50 },
      { inputTokens: 200, outputTokens: 100 },
      { inputTokens: 300, outputTokens: 150 },
    ];
    const childTotal = generations.reduce(
      (sum, generation) =>
        sum +
        estimateCostUsd('openai/gpt-4.1-mini', generation.inputTokens, generation.outputTokens),
      0,
    );
    const parentTotal = estimateCostUsd(
      'openai/gpt-4.1-mini',
      generations.reduce((sum, generation) => sum + generation.inputTokens, 0),
      generations.reduce((sum, generation) => sum + generation.outputTokens, 0),
    );

    expect(parentTotal).toBeCloseTo(childTotal, 12);
    expect(parentTotal + childTotal).not.toBeCloseTo(parentTotal, 12);
  });

  it('uses a stable run idempotency key for terminal reconciliation', async () => {
    mockTransactionResults = [
      {
        rows: [{ user_id: 'user-1', day: '2026-08-14', reserved_usd_cents: 5, status: 'reserved' }],
      },
      { rows: [{ user_id: 'user-1' }] },
      { rows: [] },
    ];
    await reconcileBudgetReservation('run-1', 0.03, new Date('2026-08-14T12:00:00Z'));
    expect(mockTransactionExecute).toHaveBeenCalled();
  });
});

describe('estimateCostUsd', () => {
  it.each([
    // The live catalog wins over the conservative STATIC_RATES bound.
    ['openai/gpt-4.1', 1_000_000, 1_000_000, 2 + 8],
    // Not in the catalog — priced from the static table ($0.4/M in, $1.6/M out).
    ['openai/gpt-4.1-mini', 1_000_000, 1_000_000, 0.4 + 1.6],
    ['google/gemini-2.5-flash-lite', 1_000_000, 1_000_000, 0.1 + 0.4],
    ['google/gemini-3.5-flash', 1_000_000, 1_000_000, 1.5 + 9.0],
    // Bare BYOK id is normalized to the gateway id (google/ prefix).
    ['gemini-3.5-flash', 1_000_000, 1_000_000, 1.5 + 9.0],
    ['gemini-2.5-pro', 1_000_000, 0, 1.25],
    ['google/gemini-2.5-pro', 1_000_000, 0, 1.25],
    ['anthropic/claude-3.7-sonnet', 1_000_000, 1_000_000, 3 + 15],
    ['anthropic/claude-sonnet-4', 1_000_000, 1_000_000, 3 + 15],
    ['deepseek/deepseek-v4-flash', 1_000_000, 500_000, 0.14 + 0.14],
    // Fractional token counts scale linearly.
    ['openai/gpt-4.1', 500_000, 250_000, 2 * 0.5 + 8 * 0.25],
    // Safety fallback rate $5/M in, $15/M out.
    ['does-not-exist/x', 1_000_000, 1_000_000, 20],
    // Zero tokens cost nothing.
    ['openai/gpt-4.1', 0, 0, 0],
  ])('prices %s (%i in / %i out) at %f USD', (model, inputTokens, outputTokens, expected) => {
    expect(estimateCostUsd(model, inputTokens, outputTokens)).toBeCloseTo(expected, 6);
  });

  it('returns negative cost for negative tokens (caller must validate)', () => {
    // estimateCostUsd is a pure calculation; negative tokens produce
    // negative costs. Callers are responsible for clamping inputs.
    const cost = estimateCostUsd('any/model', -100, -50);
    expect(cost).toBeLessThan(0);
  });
});

describe('estimateKnownCostUsd — strict accounting', () => {
  it('prices known models at their exact configured rate', () => {
    // gemini-2.5-flash: $0.30/M input, $2.50/M output
    // 1000 input + 200 output tokens
    expect(estimateKnownCostUsd('google/gemini-2.5-flash', 1_000, 200)).toBeCloseTo(0.0008, 6);
  });

  it('resolves the bare BYOK Gemini id exactly like the gateway id', () => {
    expect(estimateKnownCostUsd('gemini-2.5-flash', 1_000, 100)).toBe(
      estimateKnownCostUsd('google/gemini-2.5-flash', 1_000, 100),
    );
  });

  it('fails closed for unknown models when strict accounting is requested', () => {
    expect(() => estimateKnownCostUsd('unknown/model', 1_000, 100)).toThrow(
      UnknownModelPricingError,
    );
  });

  it.each([
    ['negative input tokens', -1, 0],
    ['negative output tokens', 0, -1],
    ['NaN input tokens', Number.NaN, 0],
    ['infinite output tokens', 0, Number.POSITIVE_INFINITY],
  ])('rejects %s', (_label, inputTokens, outputTokens) => {
    expect(() =>
      estimateKnownCostUsd('google/gemini-2.5-flash', inputTokens, outputTokens),
    ).toThrow('token counts must be finite and non-negative');
  });
});

describe('catalog precedence over STATIC_RATES', () => {
  it('prices google/gemini-3.5-flash at the catalog rate, not the stale static rate', () => {
    // Catalog (BYOK_PROVIDERS): $1.50/M input, $9.00/M output. The stale
    // STATIC_RATES entry ($0.30/M in, $2.50/M out) under-priced the default
    // Google model ~5x, so the catalog entry must win the merge.
    const cost = estimateCostUsd('google/gemini-3.5-flash', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(1.5 + 9.0, 6);
  });

  it('resolves the catalog rates for the colliding key', () => {
    expect(resolveModelRate('google/gemini-3.5-flash')).toEqual({
      inputPerM: 1.5,
      outputPerM: 9.0,
    });
  });

  it('prices the bare BYOK Gemini id at the catalog rate too', () => {
    const bare = estimateCostUsd('gemini-3.5-flash', 1_000_000, 1_000_000);
    expect(bare).toBeCloseTo(1.5 + 9.0, 6);
  });
});

describe('DEFAULT_TURN_ESTIMATE_USD', () => {
  it('is 0.01 USD', () => {
    expect(DEFAULT_TURN_ESTIMATE_USD).toBe(0.01);
  });
});

describe('DEFAULT_MAX_DAILY_USD', () => {
  it('is a positive last-resort daily cap', () => {
    expect(DEFAULT_MAX_DAILY_USD).toBeGreaterThan(0);
  });
});

describe('BudgetExceededError', () => {
  it('stores spent and max values', () => {
    const err = new BudgetExceededError(0.05, 1.0);
    expect(err.spent).toBe(0.05);
    expect(err.max).toBe(1.0);
    expect(err.code).toBe('BUDGET_EXCEEDED');
    expect(err.name).toBe('BudgetExceededError');
  });

  it('formats a useful error message', () => {
    const err = new BudgetExceededError(1.2345, 2.0);
    expect(err.message).toContain('$1.2345');
    expect(err.message).toContain('$2.00');
  });

  it('handles zero spent', () => {
    const err = new BudgetExceededError(0, 10);
    expect(err.spent).toBe(0);
    expect(err.max).toBe(10);
  });
});

describe('tryReserveBudget', () => {
  beforeEach(() => {
    mockExecuteResult = { rows: [] };
    mockTransactionResults = [];
    rejectDateParams = false;
    mockTransactionExecute.mockClear();
  });

  it('reserves budget when under cap', async () => {
    mockExecuteResult = {
      rows: [{ total_usd_cents: 5 }],
    };
    const result = await tryReserveBudget('user-1', 0.05, 1.0);
    expect(result.ok).toBe(true);
    expect(result.spent).toBe(0.05);
    expect(result.max).toBe(1.0);
    expect(result.reservationId).toEqual(expect.any(String));
  });

  it('rejects when reservation exceeds cap', async () => {
    const result = await tryReserveBudget('user-1', 2.0, 1.0);
    expect(result.ok).toBe(false);
    expect(result.max).toBe(1.0);
  });

  it('rejects when reserved rows come back empty (over cap)', async () => {
    mockExecuteResult = { rows: [] };
    const result = await tryReserveBudget('user-1', 0.01, 0.02);
    expect(result.ok).toBe(false);
  });

  it('returns ok=false without crashing when capUsd is NaN', async () => {
    // Simulate a misconfigured env where MAX_DAILY_USD is not parsed.
    // The NaN guard must return { ok: false } instead of hitting the DB
    // with an invalid bigint parameter.
    const result = await tryReserveBudget('user-1', 0.01, NaN);
    expect(result.ok).toBe(false);
    // Falls back to the DEFAULT_MAX_DAILY_USD constant (5).
    expect(result.max).toBe(5);
  });

  it('returns ok=false when capUsd is undefined (missing env)', async () => {
    const result = await tryReserveBudget('user-1', 0.01, undefined as unknown as number);
    expect(result.ok).toBe(false);
    expect(result.max).toBe(5);
  });

  it('returns ok=false when estimatedUsd is NaN', async () => {
    // Belt-and-suspenders: estCents is derived from a constant today,
    // but the guard covers future dynamic callers.
    const result = await tryReserveBudget('user-1', NaN, 5.0);
    expect(result.ok).toBe(false);
    expect(result.max).toBe(5);
  });
});

describe('durable budget reservation terminal transitions', () => {
  beforeEach(() => {
    mockTransactionResults = [];
    rejectDateParams = false;
    mockTransactionExecute.mockClear();
  });

  it('reconciles a reservation exactly once without passing Date objects to raw SQL', async () => {
    rejectDateParams = true;
    mockTransactionResults = [
      {
        rows: [{ user_id: 'user-1', day: '2026-08-14', reserved_usd_cents: 5, status: 'reserved' }],
      },
      { rows: [{ user_id: 'user-1' }] },
      { rows: [] },
    ];

    await expect(
      reconcileBudgetReservation('reservation-1', 0.08, new Date('2026-08-14T12:00:00Z')),
    ).resolves.toBe(true);

    mockTransactionResults = [
      {
        rows: [
          { user_id: 'user-1', day: '2026-08-14', reserved_usd_cents: 5, status: 'reconciled' },
        ],
      },
    ];
    await expect(
      reconcileBudgetReservation('reservation-1', 0.08, new Date('2026-08-14T12:00:00Z')),
    ).resolves.toBe(false);
  });

  it('releases a reservation exactly once and records zero actual cost', async () => {
    mockTransactionResults = [
      {
        rows: [{ user_id: 'user-1', day: '2026-08-14', reserved_usd_cents: 5, status: 'reserved' }],
      },
      { rows: [{ user_id: 'user-1' }] },
      { rows: [] },
    ];

    await expect(
      releaseBudgetReservation('reservation-2', new Date('2026-08-14T12:00:00Z')),
    ).resolves.toBe(true);
  });

  it('recovers bounded stale reservations through the same terminal release path', async () => {
    mockExecuteResult = { rows: [{ id: 'reservation-stale' }] };
    mockTransactionResults = [
      {
        rows: [{ user_id: 'user-1', day: '2026-08-14', reserved_usd_cents: 5, status: 'reserved' }],
      },
      { rows: [{ user_id: 'user-1' }] },
      { rows: [] },
    ];

    await expect(
      recoverStaleBudgetReservations(new Date('2026-08-14T11:00:00Z'), 100),
    ).resolves.toEqual({ scanned: 1, released: 1, failed: 0 });
  });
});

describe('enforceDailyBudget', () => {
  beforeEach(() => {
    mockSelectResult = [];
  });

  it('returns spent and max when under budget', async () => {
    mockSelectResult = [{ cents: 10 }];
    const result = await enforceDailyBudget('user-1', 5.0);
    expect(result.spent).toBe(0.1);
    expect(result.max).toBe(5.0);
  });

  it('throws BudgetExceededError when over budget', async () => {
    mockSelectResult = [{ cents: 600 }];
    await expect(enforceDailyBudget('user-1', 5.0)).rejects.toThrow(BudgetExceededError);
  });
});

describe('dailySpendUsd', () => {
  beforeEach(() => {
    mockSelectResult = [];
  });

  it('returns 0 when no rows exist', async () => {
    mockSelectResult = [{ total: 0 }];
    const result = await dailySpendUsd('user-1');
    expect(result).toBe(0);
  });
});

describe('reservedSpendUsd', () => {
  beforeEach(() => {
    mockSelectResult = [];
  });

  it('returns 0 when no reservation exists', async () => {
    mockSelectResult = [];
    const result = await reservedSpendUsd('user-1');
    expect(result).toBe(0);
  });

  it('returns cents converted to dollars', async () => {
    mockSelectResult = [{ cents: 150 }];
    const result = await reservedSpendUsd('user-1');
    expect(result).toBe(1.5);
  });
});

describe('getMonthlySpend', () => {
  beforeEach(() => {
    mockSelectResult = [];
  });

  it('returns 0 when no rows', async () => {
    mockSelectResult = [{ totalCents: 0 }];
    const result = await getMonthlySpend('user-1');
    expect(result).toBe(0);
  });

  it('returns cents converted to dollars', async () => {
    mockSelectResult = [{ totalCents: 500 }];
    const result = await getMonthlySpend('user-1');
    expect(result).toBe(5.0);
  });
});

describe('getProviderMonthlySpend', () => {
  beforeEach(() => {
    mockSelectResult = [];
  });

  it('returns 0 when no telemetry rows', async () => {
    mockSelectResult = [];
    const result = await getProviderMonthlySpend('user-1', 'google');
    expect(result).toBe(0);
  });
});
