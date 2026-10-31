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

// Backtesting query-layer guarantees (P1-2, P1-3, P1-4).
//
// 1. Uninstall-with-wipe removes sweeps too (no orphaned plg_backtesting_sweeps).
// 2. `symbol` filtering happens in SQL before LIMIT and selects summary
//    columns only — recent EURUSD sweeps must not shadow older XAUUSD runs.
// 3. Saved-strategy lookup filters in SQL instead of loading the library.

import type * as dbModule from '@kestrel/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as queriesModule from '../src/db/queries';
import {
  deleteAllBacktestData,
  getBacktestStrategy,
  listBacktestRunSummaryRows,
  type BacktestRunSummaryRow,
} from '../src/db/queries';
import { backtestRuns, backtestStrategies, backtestSweeps } from '../src/db/tables';
import { listRunSummaries } from '../src/services/run-service';

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));

vi.mock('@kestrel/db', async (importOriginal) => {
  const actual = await importOriginal<typeof dbModule>();
  return { ...actual, getDb: mocks.getDb };
});

// Spy on the query-layer summary function while keeping the real SQL builder,
// so delegation from `listRunSummaries` and the emitted predicate are both
// verifiable in one run.
vi.mock('../src/db/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof queriesModule>();
  return {
    ...actual,
    listBacktestRunSummaryRows: vi.fn(actual.listBacktestRunSummaryRows),
  };
});

interface QueryCall {
  method: string;
  args: unknown[];
}

/** Fluent thenable Drizzle stand-in that records every builder call. */
function createDbSpy(rows: unknown[]): { db: unknown; calls: QueryCall[] } {
  const calls: QueryCall[] = [];
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (value: unknown) => void) => resolve(rows);
        }
        return (...args: unknown[]) => {
          calls.push({ method: String(prop), args });
          return proxy;
        };
      },
    },
  );
  return { db: proxy, calls };
}

/** Collect string parameter values out of a Drizzle SQL condition tree. */
function paramStrings(value: unknown, out: string[] = []): string[] {
  if (!value || typeof value !== 'object') return out;
  const record = value as { value?: unknown; queryChunks?: unknown[] };
  if (typeof record.value === 'string') out.push(record.value);
  if (Array.isArray(record.queryChunks)) {
    for (const chunk of record.queryChunks) paramStrings(chunk, out);
  }
  return out;
}

const summaryRow = {
  id: 'run-1',
  tenantId: 'tenant-1',
  userId: 'user-1',
  createdAt: new Date('2026-10-31T10:00:00.000Z'),
  updatedAt: new Date('2026-10-31T10:00:00.000Z'),
  name: 'RSI crossover',
  symbol: 'XAUUSD',
  timeframe: '1h',
  status: 'completed',
  engineVersion: 'kestrel-engine-1',
  bars: 500,
  fromTs: new Date('2026-10-01T00:00:00.000Z'),
  toTs: new Date('2026-10-20T00:00:00.000Z'),
  initialBalance: 10_000,
  finalEquity: 11_420.5,
  metrics: {
    trades: 24,
    winRate: 61.5,
    netPnl: 1_420.5,
    returnPct: 14.2,
    maxDrawdownPct: 4.2,
    profitFactor: 1.8,
    expectancyR: 0.42,
  },
  durationMs: 1_200,
  error: null,
} as BacktestRunSummaryRow;

describe('backtesting query layer', () => {
  beforeEach(() => {
    mocks.getDb.mockReset();
  });

  it('deletes runs, sweeps and strategies when uninstalling with wipe', async () => {
    const spy = createDbSpy([]);
    mocks.getDb.mockReturnValue(spy.db);

    await deleteAllBacktestData('user-1');

    const deletedTables = spy.calls
      .filter((call) => call.method === 'delete')
      .map((call) => call.args[0]);
    expect(deletedTables).toEqual([backtestRuns, backtestSweeps, backtestStrategies]);
  });

  it('pushes an upper-cased symbol predicate into SQL before LIMIT', async () => {
    const spy = createDbSpy([summaryRow]);
    mocks.getDb.mockReturnValue(spy.db);

    const rows = await listBacktestRunSummaryRows('user-1', { symbol: 'xauusd', limit: 3 });

    expect(rows).toEqual([summaryRow]);
    const where = spy.calls.find((call) => call.method === 'where');
    expect(where).toBeDefined();
    expect(paramStrings(where?.args[0])).toEqual(expect.arrayContaining(['user-1', 'XAUUSD']));
    const limit = spy.calls.find((call) => call.method === 'limit');
    expect(limit?.args[0]).toBe(3);

    // Heavy chart/JSON columns must not be selected.
    const select = spy.calls.find((call) => call.method === 'select');
    const columns = Object.keys((select?.args[0] ?? {}) as Record<string, unknown>);
    expect(columns).not.toContain('trades');
    expect(columns).not.toContain('equityCurve');
    expect(columns).not.toContain('source');
    expect(columns).not.toContain('logs');
  });

  it('delegates listRunSummaries to the summary query and maps rows', async () => {
    const spy = createDbSpy([summaryRow]);
    mocks.getDb.mockReturnValue(spy.db);

    const summaries = await listRunSummaries('user-1', { symbol: 'XAUUSD', limit: 3 });

    expect(vi.mocked(listBacktestRunSummaryRows)).toHaveBeenCalledWith('user-1', {
      limit: 3,
      symbol: 'XAUUSD',
    });
    expect(summaries).toEqual([
      {
        id: 'run-1',
        name: 'RSI crossover',
        symbol: 'XAUUSD',
        timeframe: '1h',
        status: 'completed',
        createdAt: '2026-10-31T10:00:00.000Z',
        bars: 500,
        metrics: {
          trades: 24,
          winRate: 61.5,
          netPnl: 1_420.5,
          returnPct: 14.2,
          maxDrawdownPct: 4.2,
          profitFactor: 1.8,
          expectancyR: 0.42,
        },
      },
    ]);
  });

  it('looks saved strategies up in SQL with a single-row LIMIT', async () => {
    const strategy = { id: 'strat-1', slug: 'rsi-cross', name: 'RSI Cross' };
    const spy = createDbSpy([strategy]);
    mocks.getDb.mockReturnValue(spy.db);

    const found = await getBacktestStrategy('user-1', ' rsi-cross ');

    expect(found).toBe(strategy);
    const where = spy.calls.find((call) => call.method === 'where');
    expect(paramStrings(where?.args[0])).toEqual(expect.arrayContaining(['user-1', 'rsi-cross']));
    expect(spy.calls.find((call) => call.method === 'limit')?.args[0]).toBe(1);
  });
});
