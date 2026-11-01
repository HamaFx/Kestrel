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

// Phase 3 (roadmap Phase 4) — deployed-strategy signal parity.
//
// The runner must translate every `StrategySignal` field the Backtesting Lab
// honours: limit `entry`, `validBars` expiry, `breakEvenAtR`, `trailing`,
// `maxBars` time stops, and `flip`/`exit` position rules.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '../src/settings';
import { evaluateLatestStrategySignal, runStrategyRunsForUser } from '../src/strategy-runner';

const mocks = vi.hoisted(() => ({
  getCandles: vi.fn(),
  listStrategyRuns: vi.fn(),
  updateStrategyRun: vi.fn(),
  getPosition: vi.fn(),
  listOpenPositionsForSymbol: vi.fn(),
  listOrders: vi.fn(),
  placeOrderForUser: vi.fn(),
  closePositionForUser: vi.fn(),
  cancelOrderForUser: vi.fn(),
}));

vi.mock('@kestrel/data', () => ({ getCandles: mocks.getCandles }));

vi.mock('../src/db/queries', () => ({
  listStrategyRuns: mocks.listStrategyRuns,
  updateStrategyRun: mocks.updateStrategyRun,
  getPosition: mocks.getPosition,
  listOpenPositionsForSymbol: mocks.listOpenPositionsForSymbol,
  listOrders: mocks.listOrders,
}));

vi.mock('../src/services/trading', () => ({
  placeOrderForUser: mocks.placeOrderForUser,
  closePositionForUser: mocks.closePositionForUser,
  cancelOrderForUser: mocks.cancelOrderForUser,
}));

const BAR_MS = 60 * 60 * 1000;
const CANDLE_COUNT = 320;

function candles(count = CANDLE_COUNT) {
  const now = Date.now();
  return Array.from({ length: count }, (_, index) => {
    const close = 2000 + index * 0.5;
    return {
      t: now - (count - index + 2) * BAR_MS,
      o: close - 0.2,
      h: close + 1,
      l: close - 1,
      c: close,
      v: 100,
      source: 'fixture',
      fetchedAt: now,
    };
  });
}

function runRow(overrides: Record<string, unknown> = {}) {
  const latest = candles().at(-1)!;
  return {
    id: 'run-1',
    accountId: 'acct-1',
    name: 'Parity strategy',
    strategyId: null,
    symbol: 'XAUUSD',
    timeframe: '1h',
    source: 'function getSignal() { return null; }',
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
    createdAt: new Date(latest.t),
    updatedAt: new Date(latest.t),
    ...overrides,
  };
}

const LIMIT_SOURCE = `
function getSignal(ctx) {
  if (ctx.i !== ctx.bars - 1) return null;
  return {
    side: 'long',
    entry: ctx.close - 5,
    stop: ctx.close - 15,
    target: ctx.close + 25,
    breakEvenAtR: 1,
    trailing: { type: 'atr', value: 1.5 },
    validBars: 5,
    maxBars: 20,
  };
}
`;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCandles.mockResolvedValue({ candles: candles(), stale: false, producedAt: Date.now() });
  mocks.updateStrategyRun.mockResolvedValue(undefined);
  mocks.listOpenPositionsForSymbol.mockResolvedValue([]);
  mocks.listOrders.mockResolvedValue([]);
  mocks.placeOrderForUser.mockImplementation(async (args: { input: { type: string } }) => ({
    ok: true,
    message: 'placed',
    account: {},
    order: args.input.type === 'limit' ? { id: 'order-1' } : null,
    position: args.input.type === 'market' ? { id: 'position-1' } : null,
    warnings: [],
  }));
  mocks.closePositionForUser.mockResolvedValue({
    position: { id: 'pos-1', status: 'closed' },
    fill: null,
  });
  mocks.cancelOrderForUser.mockResolvedValue({ order: null, message: 'cancelled' });
});

describe('paper strategy runner parity', () => {
  it('translates limit entry, ATR trailing stop, breakEvenAtR and validBars expiry into the order', async () => {
    mocks.listStrategyRuns.mockResolvedValue([runRow({ source: LIMIT_SOURCE })]);
    const evaluation = await evaluateLatestStrategySignal({
      symbol: 'XAUUSD',
      timeframe: '1h',
      source: LIMIT_SOURCE,
      params: {},
    });
    expect(evaluation.latestAtr).toBeGreaterThan(0);

    const result = await runStrategyRunsForUser('user-1', DEFAULT_SETTINGS);

    expect(result.entered).toBe(1);
    expect(mocks.placeOrderForUser).toHaveBeenCalledTimes(1);
    const args = mocks.placeOrderForUser.mock.calls[0]![0] as {
      expiresAt: Date;
      source: string;
      input: Record<string, unknown>;
    };
    expect(args.source).toBe('strategy');
    expect(args.input['type']).toBe('limit');
    expect(args.input['price']).toBeCloseTo(evaluation.latestClose - 5, 8);
    expect(args.input['breakEvenAtR']).toBe(1);
    expect(args.input['trailingStop']).toBeCloseTo(1.5 * evaluation.latestAtr!, 8);
    expect(args.input['notes']).toContain('[run:run-1]');
    expect(args.input['notes']).toContain('[maxBars:20]');
    expect(args.expiresAt.getTime()).toBe(evaluation.barTime + 5 * BAR_MS);
  });

  it('cancels a stale resting strategy order before placing a new limit entry', async () => {
    mocks.listStrategyRuns.mockResolvedValue([runRow({ source: LIMIT_SOURCE })]);
    mocks.listOrders.mockResolvedValue([
      { id: 'stale-1', notes: 'Deployed strategy: Parity strategy [run:run-1] [maxBars:20]' },
      { id: 'other-1', notes: 'Deployed strategy: Another run [run:run-2]' },
    ]);

    await runStrategyRunsForUser('user-1', DEFAULT_SETTINGS);

    expect(mocks.cancelOrderForUser).toHaveBeenCalledTimes(1);
    expect(mocks.cancelOrderForUser).toHaveBeenCalledWith({
      userId: 'user-1',
      orderId: 'stale-1',
    });
  });

  it('closes the run position with reason max_bars once barsHeld reaches the tagged limit', async () => {
    const latest = candles().at(-1)!;
    mocks.listStrategyRuns.mockResolvedValue([runRow({ positionId: 'pos-1' })]);
    mocks.getPosition.mockResolvedValue({
      id: 'pos-1',
      status: 'open',
      side: 'long',
      notes: 'Deployed strategy: Parity strategy [run:run-1] [maxBars:20]',
      entryTime: new Date(latest.t - 25 * BAR_MS),
    });

    const result = await runStrategyRunsForUser('user-1', DEFAULT_SETTINGS);

    expect(result.closed).toBe(1);
    expect(mocks.closePositionForUser).toHaveBeenCalledWith(
      expect.objectContaining({ positionId: 'pos-1', closeReason: 'max_bars' }),
    );
  });

  it('blocks an opposing signal without flip but closes and reverses with flip', async () => {
    const shortSource = (flip: boolean) => `
      function getSignal(ctx) {
        if (ctx.i !== ctx.bars - 1) return null;
        return { side: 'short', stop: ctx.close + 15, target: ctx.close - 25${flip ? ', flip: true' : ''} };
      }
    `;
    const latest = candles().at(-1)!;
    const openLong = {
      id: 'pos-1',
      status: 'open',
      side: 'long',
      notes: 'Deployed strategy: Parity strategy [run:run-1] [maxBars:100]',
      entryTime: new Date(latest.t - BAR_MS),
    };

    mocks.listStrategyRuns.mockResolvedValue([
      runRow({ source: shortSource(false), positionId: 'pos-1' }),
    ]);
    mocks.getPosition.mockResolvedValue(openLong);
    await runStrategyRunsForUser('user-1', DEFAULT_SETTINGS);
    expect(mocks.closePositionForUser).not.toHaveBeenCalled();
    expect(mocks.placeOrderForUser).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mocks.getCandles.mockResolvedValue({
      candles: candles(),
      stale: false,
      producedAt: Date.now(),
    });
    mocks.updateStrategyRun.mockResolvedValue(undefined);
    mocks.listOpenPositionsForSymbol.mockResolvedValue([]);
    mocks.listOrders.mockResolvedValue([]);
    mocks.placeOrderForUser.mockResolvedValue({
      ok: true,
      message: 'placed',
      account: {},
      order: null,
      position: { id: 'position-2' },
      warnings: [],
    });
    mocks.closePositionForUser.mockResolvedValue({
      position: { id: 'pos-1', status: 'closed' },
      fill: null,
    });
    mocks.listStrategyRuns.mockResolvedValue([
      runRow({ source: shortSource(true), positionId: 'pos-1' }),
    ]);
    mocks.getPosition.mockResolvedValue(openLong);

    const flipped = await runStrategyRunsForUser('user-1', DEFAULT_SETTINGS);
    expect(flipped.closed).toBe(1);
    expect(mocks.closePositionForUser).toHaveBeenCalledTimes(1);
    expect(mocks.placeOrderForUser).toHaveBeenCalledTimes(1);
    const args = mocks.placeOrderForUser.mock.calls[0]![0] as { input: Record<string, unknown> };
    expect(args.input['side']).toBe('sell');
  });
});
