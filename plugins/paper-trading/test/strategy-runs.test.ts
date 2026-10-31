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

// Phase 4 (roadmap Phase 5) — `paper_deploy_strategy` may reference a saved
// backtest strategy or a completed backtest run without the model re-emitting
// the JavaScript source.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DeployStrategyRunInputSchema } from '../src/schemas';
import { deployStrategyRunForUser, StrategyRunError } from '../src/services/strategy-runs';

const mocks = vi.hoisted(() => ({
  getBacktestStrategy: vi.fn(),
  getBacktestRun: vi.fn(),
  insertStrategyRun: vi.fn(),
  resolvePaperAccount: vi.fn(),
}));

vi.mock('@kestrel/plugin-backtesting/server', () => ({
  getBacktestStrategy: mocks.getBacktestStrategy,
  getBacktestRun: mocks.getBacktestRun,
}));

vi.mock('../src/db/queries', () => ({
  insertStrategyRun: mocks.insertStrategyRun,
  getStrategyRun: vi.fn(),
  listStrategyRuns: vi.fn(),
  updateStrategyRun: vi.fn(),
  deleteStrategyRun: vi.fn(),
}));

vi.mock('../src/services/accounts', () => ({
  resolvePaperAccount: mocks.resolvePaperAccount,
}));

const SOURCE = 'function getSignal(ctx) { return null; }';

function insertedRow(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-10-31T00:00:00.000Z');
  return {
    id: 'paper-run-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    accountId: 'acct-1',
    name: 'Resolved run',
    strategyId: null,
    symbol: 'XAUUSD',
    timeframe: '1h',
    source: SOURCE,
    params: {},
    riskPct: 1,
    status: 'active',
    lastBarTime: null,
    lastSignal: null,
    lastSignalAt: null,
    positionId: null,
    signalCount: 0,
    orderCount: 0,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolvePaperAccount.mockResolvedValue({ id: 'acct-1', mode: 'autonomous_sandbox' });
  mocks.insertStrategyRun.mockImplementation(async (input: Record<string, unknown>) =>
    insertedRow(input),
  );
});

describe('deployStrategyRunForUser source resolution', () => {
  it('resolves a saved strategy slug server-side', async () => {
    mocks.getBacktestStrategy.mockResolvedValue({
      id: 'strategy-uuid',
      slug: 'london-sweep',
      name: 'London Sweep',
      source: SOURCE,
      params: { atrMult: 1.5 },
    });
    mocks.getBacktestRun.mockResolvedValue(undefined);

    const input = DeployStrategyRunInputSchema.parse({
      strategyId: 'london-sweep',
      symbol: 'XAUUSD',
      timeframe: '15m',
    });
    const run = await deployStrategyRunForUser({
      userId: 'user-1',
      input,
      settings: {} as never,
    });

    expect(run.id).toBe('paper-run-1');
    expect(mocks.insertStrategyRun).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'London Sweep',
        strategyId: 'london-sweep',
        symbol: 'XAUUSD',
        timeframe: '15m',
        source: SOURCE,
        params: { atrMult: 1.5 },
      }),
    );
  });

  it('resolves a completed backtest run id including symbol and timeframe', async () => {
    mocks.getBacktestStrategy.mockResolvedValue(undefined);
    mocks.getBacktestRun.mockResolvedValue({
      id: 'run-42',
      name: 'RSI pullback v2',
      symbol: 'EURUSD',
      timeframe: '4h',
      source: SOURCE,
      params: { rsiPeriod: 14 },
    });

    const input = DeployStrategyRunInputSchema.parse({ strategyId: 'run-42' });
    const run = await deployStrategyRunForUser({
      userId: 'user-1',
      input,
      settings: {} as never,
    });

    expect(run.strategyId).toBe('run-42');
    expect(mocks.insertStrategyRun).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'RSI pullback v2',
        strategyId: 'run-42',
        symbol: 'EURUSD',
        timeframe: '4h',
        source: SOURCE,
        params: { rsiPeriod: 14 },
      }),
    );
  });

  it('asks for symbol/timeframe when a saved strategy is deployed without them', async () => {
    mocks.getBacktestStrategy.mockResolvedValue({
      id: 'strategy-uuid',
      slug: 'london-sweep',
      name: 'London Sweep',
      source: SOURCE,
      params: {},
    });
    mocks.getBacktestRun.mockResolvedValue(undefined);

    const input = DeployStrategyRunInputSchema.parse({ strategyId: 'london-sweep' });
    await expect(
      deployStrategyRunForUser({ userId: 'user-1', input, settings: {} as never }),
    ).rejects.toThrow(StrategyRunError);
    expect(mocks.insertStrategyRun).not.toHaveBeenCalled();
  });

  it('rejects an unknown strategy or run reference', async () => {
    mocks.getBacktestStrategy.mockResolvedValue(undefined);
    mocks.getBacktestRun.mockResolvedValue(undefined);

    const input = DeployStrategyRunInputSchema.parse({ strategyId: 'nope' });
    await expect(
      deployStrategyRunForUser({ userId: 'user-1', input, settings: {} as never }),
    ).rejects.toThrow(/No saved strategy or backtest run/);
  });

  it('accepts inline source exactly as before (regression)', async () => {
    const input = DeployStrategyRunInputSchema.parse({
      name: 'Inline',
      symbol: 'XAUUSD',
      timeframe: '1h',
      source: SOURCE,
      params: { keep: true },
    });
    await deployStrategyRunForUser({ userId: 'user-1', input, settings: {} as never });

    expect(mocks.getBacktestStrategy).not.toHaveBeenCalled();
    expect(mocks.insertStrategyRun).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Inline',
        strategyId: null,
        source: SOURCE,
        params: { keep: true },
      }),
    );
  });
});
