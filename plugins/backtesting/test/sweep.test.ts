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

import type * as KestrelData from '@kestrel/data';
import type { Candle } from '@kestrel/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as QueriesModule from '../src/db/queries';
import type * as FeaturesModule from '../src/engine/features';
import { SweepInputSchema, SweepResultSchema } from '../src/schemas';
import { executeSweep, expandParameterSpace } from '../src/services/sweep-service';

const { getCandlesSpy, buildMatrixSpy, sweepRows } = vi.hoisted(() => ({
  getCandlesSpy: vi.fn(),
  buildMatrixSpy: vi.fn(),
  sweepRows: new Map<string, Record<string, unknown>>(),
}));

vi.mock('@kestrel/data', async (importOriginal) => {
  const actual = await importOriginal<typeof KestrelData>();
  return { ...actual, getCandles: getCandlesSpy };
});

vi.mock('../src/engine/features', async (importOriginal) => {
  const actual = await importOriginal<typeof FeaturesModule>();
  buildMatrixSpy.mockImplementation(actual.buildFeatureMatrix);
  return { ...actual, buildFeatureMatrix: buildMatrixSpy };
});

vi.mock('../src/db/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof QueriesModule>();
  return {
    ...actual,
    getBacktestSweep: vi.fn(
      async (_userId: string, sweepId: string) => sweepRows.get(sweepId) ?? null,
    ),
    updateBacktestSweep: vi.fn(
      async (_userId: string, sweepId: string, patch: Record<string, unknown>) => {
        const existing = sweepRows.get(sweepId);
        if (!existing) return undefined;
        const updated = { ...existing, ...patch };
        sweepRows.set(sweepId, updated);
        return updated;
      },
    ),
  };
});

const SOURCE = `
function getSignal(ctx) {
  if (ctx.i === 10 || ctx.i === 290) {
    return { side: 'long', stop: ctx.close - 10, target: ctx.close + 20, maxBars: 30 };
  }
  return null;
}`;

function closedCandles(count: number): Candle[] {
  const stepMs = 3_600_000;
  const end = Math.floor((Date.now() - 2 * stepMs) / stepMs) * stepMs;
  return Array.from({ length: count }, (_, index) => {
    const t = end - (count - 1 - index) * stepMs;
    const mid = 2000 + Math.sin(index / 7) * 25 + index * 0.1;
    return {
      symbol: 'XAUUSD',
      tf: '1h',
      t,
      o: mid - 1,
      h: mid + 6,
      l: mid - 7,
      c: mid + Math.sin(index / 3) * 2,
      v: 1000 + index,
      source: 'test',
      fetchedAt: t,
    } as Candle;
  });
}

function sweepRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'sweep-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    name: 'Test sweep',
    strategyId: null,
    symbol: 'XAUUSD',
    timeframe: '1h',
    source: SOURCE,
    baseParams: {},
    parameterSpace: [{ name: 'threshold', values: [1, 2] }],
    objective: 'expectancyR',
    count: 400,
    initialBalance: 10_000,
    riskPct: 1,
    minTrades: 1,
    persistRuns: false,
    status: 'queued',
    total: 2,
    completed: 0,
    bestParams: null,
    bestMetrics: null,
    bestScore: null,
    results: [],
    error: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('parameter sweeps', () => {
  it('expands a cartesian product over the base params', () => {
    const combinations = expandParameterSpace(
      { riskPct: 1, threshold: 0.5 },
      [
        { name: 'threshold', values: [0.5, 0.75] },
        { name: 'atrMult', values: [1, 2, 3] },
      ],
      20,
    );
    expect(combinations).toHaveLength(6);
    expect(combinations[0]).toMatchObject({ riskPct: 1, threshold: 0.5, atrMult: 1 });
    expect(combinations.at(-1)).toMatchObject({ threshold: 0.75, atrMult: 3 });
  });

  it('fails closed when the grid exceeds the cap', () => {
    expect(() =>
      expandParameterSpace(
        {},
        [
          { name: 'a', values: [1, 2, 3, 4] },
          { name: 'b', values: [1, 2, 3, 4] },
        ],
        10,
      ),
    ).toThrow(/exceeds the 10-combination limit/);
  });

  it('requires a saved strategy or inline source', () => {
    const result = SweepInputSchema.safeParse({
      symbol: 'XAUUSD',
      timeframe: '1h',
      parameterSpace: [{ name: 'threshold', values: [1, 2] }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts a saved strategy with a parameter grid', () => {
    const result = SweepInputSchema.safeParse({
      strategyId: 'strategy-1',
      symbol: 'XAUUSD',
      timeframe: '1h',
      parameterSpace: [{ name: 'threshold', values: [1, 2] }],
      objective: 'expectancyR',
    });
    expect(result.success).toBe(true);
  });

  it('accepts an out-of-sample train ratio between 0.5 and 0.9', () => {
    const valid = SweepInputSchema.safeParse({
      source: 'x'.repeat(40),
      symbol: 'XAUUSD',
      timeframe: '1h',
      parameterSpace: [{ name: 'threshold', values: [1, 2] }],
      trainRatio: 0.7,
    });
    expect(valid.success).toBe(true);
    if (valid.success) expect(valid.data.trainRatio).toBe(0.7);

    const tooSmall = SweepInputSchema.safeParse({
      source: 'x'.repeat(40),
      symbol: 'XAUUSD',
      timeframe: '1h',
      parameterSpace: [{ name: 'threshold', values: [1] }],
      trainRatio: 0.2,
    });
    expect(tooSmall.success).toBe(false);
  });

  it('parses sweep results carrying out-of-sample metrics', () => {
    const parsed = SweepResultSchema.safeParse({
      params: { threshold: 1 },
      score: 1.2,
      metrics: null,
      oosMetrics: {
        trades: 4,
        winRate: 50,
        netPnl: 10,
        returnPct: 1,
        maxDrawdownPct: 2,
        profitFactor: 1.5,
        sharpeRatio: 0.8,
        expectancyR: 0.3,
      },
      error: null,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.oosMetrics?.trades).toBe(4);
  });
});

describe('sweep execution', () => {
  beforeEach(() => {
    getCandlesSpy.mockReset();
    buildMatrixSpy.mockClear();
    sweepRows.clear();
  });

  it('fetches candles once per sweep and computes out-of-sample metrics when trainRatio is set', async () => {
    getCandlesSpy.mockResolvedValue({
      candles: closedCandles(400),
      stale: false,
      producedAt: Date.now(),
    });
    sweepRows.set('sweep-1', sweepRow({ baseParams: { __trainRatio: 0.7 } }));

    const detail = await executeSweep({ userId: 'user-1', sweepId: 'sweep-1', settings: {} });

    expect(getCandlesSpy).toHaveBeenCalledTimes(1);
    const results = detail.results as Array<Record<string, unknown>>;
    expect(results).toHaveLength(2);
    expect(results[0]!.metrics).not.toBeNull();
    expect(results[0]!.oosMetrics).not.toBeNull();
  });

  it('builds the feature matrix once for a sweep without an OOS split', async () => {
    getCandlesSpy.mockResolvedValue({
      candles: closedCandles(400),
      stale: false,
      producedAt: Date.now(),
    });
    sweepRows.set('sweep-1', sweepRow());

    const detail = await executeSweep({ userId: 'user-1', sweepId: 'sweep-1', settings: {} });

    expect(getCandlesSpy).toHaveBeenCalledTimes(1);
    expect(buildMatrixSpy).toHaveBeenCalledTimes(1);
    expect(detail.results).toHaveLength(2);
    for (const result of detail.results as Array<Record<string, unknown>>) {
      expect(result.metrics).not.toBeNull();
    }
  });

  it('lets the event loop turn between combinations (R16)', async () => {
    getCandlesSpy.mockResolvedValue({
      candles: closedCandles(200),
      stale: false,
      producedAt: Date.now(),
    });
    sweepRows.set(
      'sweep-1',
      sweepRow({
        source: 'function getSignal(ctx) { return null; }',
        parameterSpace: [{ name: 'threshold', values: [1, 2, 3, 4] }],
        total: 4,
      }),
    );

    // Count event-loop turns with a self-rescheduling immediate while the
    // sweep runs. Each combination must yield at least one macrotask turn;
    // without the yields this counter only advances after the whole sweep.
    let turns = 0;
    let counting = true;
    const count = () => {
      if (!counting) return;
      turns += 1;
      setImmediate(count);
    };
    setImmediate(count);

    const detail = await executeSweep({ userId: 'user-1', sweepId: 'sweep-1', settings: {} });
    counting = false;

    expect(detail.results).toHaveLength(4);
    expect(turns).toBeGreaterThanOrEqual(4);
  });
});
