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

import type { Candle } from '@kestrel/shared';
import { describe, expect, it } from 'vitest';

import { buildFeatureMatrix, SERIES_NAMES } from '../src/engine/features';
import { runBacktest } from '../src/engine/run';
import { runStrategySandbox, StrategySandboxError } from '../src/engine/sandbox';
import { simulateBacktest } from '../src/engine/simulator';
import type { BacktestOptions, GeneratedSignal } from '../src/engine/types';

const BASE_TIME = Date.UTC(2026, 0, 5, 0, 0, 0);

function makeCandles(
  bars: readonly { o: number; h: number; l: number; c: number }[],
  stepMs = 60 * 60 * 1000,
): Candle[] {
  return bars.map((bar, index) => ({
    symbol: 'XAUUSD',
    tf: '1h',
    t: BASE_TIME + index * stepMs,
    o: bar.o,
    h: bar.h,
    l: bar.l,
    c: bar.c,
    v: 1000 + index,
    source: 'test',
    fetchedAt: BASE_TIME + index * stepMs,
  }));
}

function waveCandles(count: number, stepMs = 60 * 60 * 1000): Candle[] {
  const bars = [];
  for (let index = 0; index < count; index += 1) {
    const mid = 2000 + Math.sin(index / 9) * 30 + index * 0.15;
    bars.push({
      o: mid - 2,
      h: mid + 8 + Math.cos(index / 4) * 3,
      l: mid - 9 - Math.sin(index / 5) * 3,
      c: mid + Math.sin(index / 3) * 2,
    });
  }
  return makeCandles(bars, stepMs);
}

function options(overrides: Partial<BacktestOptions> = {}): BacktestOptions {
  return {
    symbol: 'XAUUSD',
    timeframe: '1h',
    initialBalance: 10_000,
    riskPct: 1,
    spread: 0,
    slippage: 0,
    commissionPerUnit: 0,
    leverage: 10,
    contractSize: 1,
    allowShort: true,
    maxBarsInTrade: 100,
    ...overrides,
  };
}

function signal(index: number, overrides: Partial<GeneratedSignal> = {}): GeneratedSignal {
  return {
    side: 'long',
    entry: 'market',
    stop: 90,
    signalIndex: index,
    signalTime: BASE_TIME + index * 60 * 60 * 1000,
    ...overrides,
  };
}

describe('backtest simulator', () => {
  it('fills a market signal at the next bar open, never the signal bar', () => {
    const candles = makeCandles([
      { o: 100, h: 101, l: 99, c: 100 },
      { o: 100, h: 102, l: 99, c: 101 },
      { o: 101, h: 103, l: 100, c: 102 },
      { o: 103, h: 111, l: 102, c: 110 },
      { o: 110, h: 112, l: 109, c: 111 },
    ]);

    const result = simulateBacktest({
      candles,
      signals: [signal(2, { stop: 95, target: 110 })],
      options: options(),
      atr: candles.map(() => null),
    });

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]!.entryTime).toBe(candles[3]!.t);
    expect(result.trades[0]!.entryPrice).toBe(103);
    expect(result.trades[0]!.exitReason).toBe('take_profit');
    expect(result.trades[0]!.pnl).toBeGreaterThan(0);
  });

  it('takes the stop when a bar touches both stop and target', () => {
    const candles = makeCandles([
      { o: 100, h: 101, l: 99, c: 100 },
      { o: 100, h: 101, l: 99, c: 100 },
      { o: 100, h: 101, l: 99, c: 100 },
      { o: 100, h: 115, l: 90, c: 105 },
      { o: 105, h: 106, l: 104, c: 105 },
    ]);

    const result = simulateBacktest({
      candles,
      signals: [signal(1, { stop: 95, target: 110 })],
      options: options(),
      atr: candles.map(() => null),
    });

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]!.exitReason).toBe('stop_loss');
    expect(result.trades[0]!.exitPrice).toBe(95);
    expect(result.trades[0]!.rMultiple).toBeCloseTo(-1, 6);
  });

  it('sizes risk from equity and enforces the leverage cap', () => {
    const candles = makeCandles([
      { o: 100, h: 101, l: 99, c: 100 },
      { o: 100, h: 101, l: 99, c: 100 },
      { o: 100, h: 101, l: 99, c: 100 },
      { o: 100, h: 101, l: 99, c: 100 },
    ]);

    const result = simulateBacktest({
      candles,
      signals: [signal(1, { stop: 90, target: 120, riskPct: 2, maxBars: 1 })],
      options: options(),
      atr: candles.map(() => null),
    });

    const trade = result.trades[0]!;
    expect(trade.quantity).toBeCloseTo(20, 6);
    expect(trade.riskAmount).toBeCloseTo(200, 2);
    expect(trade.rMultiple).toBeCloseTo(0, 6);
  });

  it('expires a resting limit entry that is never reached', () => {
    const candles = makeCandles(
      Array.from({ length: 8 }, () => ({ o: 100, h: 102, l: 99, c: 100 })),
    );

    const result = simulateBacktest({
      candles,
      signals: [signal(1, { entry: 80, stop: 75, validBars: 2 })],
      options: options(),
      atr: candles.map(() => null),
    });

    expect(result.trades).toHaveLength(0);
    expect(result.rejectedSignals).toHaveLength(1);
    expect(result.rejectedSignals[0]!.reason).toMatch(/expired/i);
  });

  it('fills a limit entry at the limit and exits on maxBars', () => {
    const candles = makeCandles([
      { o: 100, h: 101, l: 99, c: 100 },
      { o: 100, h: 101, l: 99, c: 100 },
      { o: 100, h: 101, l: 97, c: 98 },
      { o: 98, h: 99, l: 97, c: 98 },
      { o: 98, h: 99, l: 97, c: 98 },
      { o: 98, h: 99, l: 97, c: 98 },
    ]);

    const result = simulateBacktest({
      candles,
      signals: [signal(1, { entry: 98, stop: 95, target: 120, validBars: 5, maxBars: 2 })],
      options: options(),
      atr: candles.map(() => null),
    });

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]!.entryPrice).toBe(98);
    expect(result.trades[0]!.entryTime).toBe(candles[2]!.t);
    expect(result.trades[0]!.exitReason).toBe('max_bars');
    expect(result.trades[0]!.barsHeld).toBe(2);
  });

  it('applies spread, slippage and commission to both sides', () => {
    const candles = makeCandles([
      { o: 100, h: 101, l: 99, c: 100 },
      { o: 100, h: 101, l: 99, c: 100 },
      { o: 100, h: 101, l: 99, c: 100 },
      { o: 100, h: 121, l: 99, c: 120 },
    ]);

    const result = simulateBacktest({
      candles,
      signals: [signal(1, { stop: 90, target: 120 })],
      options: options({ spread: 1, slippage: 0.5, commissionPerUnit: 0.1 }),
      atr: candles.map(() => null),
    });

    const trade = result.trades[0]!;
    expect(trade.entryPrice).toBe(101);
    expect(trade.exitPrice).toBe(119);
    expect(trade.fees).toBeCloseTo(trade.quantity * 0.2, 2);
    expect(trade.exitReason).toBe('take_profit');
  });

  it('trails a stop and breakeven without ever loosening it', () => {
    const candles = makeCandles([
      { o: 100, h: 101, l: 99, c: 100 },
      { o: 100, h: 101, l: 99, c: 100 },
      { o: 100, h: 111, l: 99, c: 110 },
      { o: 110, h: 121, l: 109, c: 120 },
      { o: 120, h: 121, l: 114, c: 115 },
    ]);

    const result = simulateBacktest({
      candles,
      signals: [signal(1, { stop: 95, breakEvenAtR: 1, trailing: { type: 'fixed', value: 5 } })],
      options: options(),
      atr: candles.map(() => null),
    });

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]!.exitReason).toBe('stop_loss');
    expect(result.trades[0]!.exitPrice).toBe(115);
    expect(result.trades[0]!.pnl).toBeGreaterThan(0);
  });

  it('closes an open position at the last close', () => {
    const candles = makeCandles([
      { o: 100, h: 101, l: 99, c: 100 },
      { o: 100, h: 101, l: 99, c: 100 },
      { o: 100, h: 101, l: 99, c: 100 },
      { o: 100, h: 103, l: 99, c: 102 },
    ]);

    const result = simulateBacktest({
      candles,
      signals: [signal(1, { stop: 80 })],
      options: options(),
      atr: candles.map(() => null),
    });

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]!.exitReason).toBe('end_of_data');
    expect(result.trades[0]!.exitPrice).toBe(102);
  });
});

describe('feature matrix', () => {
  it('is causal: truncating the window never changes earlier rows', () => {
    const full = waveCandles(320);
    const prefix = full.slice(0, 200);

    const fullMatrix = buildFeatureMatrix({
      symbol: 'XAUUSD',
      timeframe: '1h',
      candles: full,
    });
    const prefixMatrix = buildFeatureMatrix({
      symbol: 'XAUUSD',
      timeframe: '1h',
      candles: prefix,
    });

    for (const name of SERIES_NAMES) {
      expect(prefixMatrix.series[name]).toEqual(fullMatrix.series[name].slice(0, 200));
    }

    const smcKeys = Object.keys(prefixMatrix.smc) as (keyof typeof prefixMatrix.smc)[];
    for (const key of smcKeys) {
      expect(prefixMatrix.smc[key]).toEqual(fullMatrix.smc[key].slice(0, 200));
    }
    expect(prefixMatrix.bars.t).toEqual(fullMatrix.bars.t.slice(0, 200));
    expect(prefixMatrix.bars.o).toEqual(fullMatrix.bars.o.slice(0, 200));
    expect(prefixMatrix.bars.h).toEqual(fullMatrix.bars.h.slice(0, 200));
    expect(prefixMatrix.bars.l).toEqual(fullMatrix.bars.l.slice(0, 200));
    expect(prefixMatrix.bars.c).toEqual(fullMatrix.bars.c.slice(0, 200));
  });

  it('exposes previous-day levels only after the day rolls over', () => {
    const candles = waveCandles(60, 60 * 60 * 1000);
    const matrix = buildFeatureMatrix({ symbol: 'XAUUSD', timeframe: '1h', candles });

    expect(matrix.smc.pdh[0]).toBe(0);
    expect(matrix.smc.pdl[0]).toBe(0);
    expect(matrix.smc.pdh[59]).toBeGreaterThan(0);
    expect(matrix.smc.pdl[59]).toBeGreaterThan(0);
  });
});

describe('strategy sandbox', () => {
  it('runs a getSignal loop and binds signals to their bar', async () => {
    const candles = waveCandles(260);
    const { result, logs } = await runBacktest({
      symbol: 'XAUUSD',
      timeframe: '1h',
      candles,
      source: `
        function getSignal(ctx) {
          if (ctx.i === 210) {
            console.log('entry at', ctx.i, 'rsi', ctx.series('rsi14'));
            return { side: 'long', stop: ctx.close - 5, target: ctx.close + 20, reason: 'sandbox-test' };
          }
          return null;
        }
      `,
    });

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]!.reason).toBe('sandbox-test');
    expect(result.trades[0]!.entryTime).toBe(candles[211]!.t);
    expect(logs[0]).toMatch(/entry at 210/);
  });

  it('rejects forward reads through the series accessor', async () => {
    const candles = waveCandles(60);
    const matrix = buildFeatureMatrix({ symbol: 'XAUUSD', timeframe: '1h', candles });

    await expect(
      runStrategySandbox({
        source: `
          function getSignal(ctx) {
            return ctx.series('rsi14', 1) === null
              ? null
              : { side: 'long', stop: ctx.close - 1 };
          }
        `,
        matrix,
        symbol: 'XAUUSD',
        timeframe: '1h',
      }),
    ).rejects.toThrow(/future/i);
  });

  it('requires a getSignal function with a clear error', async () => {
    const candles = waveCandles(40);
    const matrix = buildFeatureMatrix({ symbol: 'XAUUSD', timeframe: '1h', candles });

    await expect(
      runStrategySandbox({
        source: `const notASignal = 1;`,
        matrix,
        symbol: 'XAUUSD',
        timeframe: '1h',
      }),
    ).rejects.toThrow(/getSignal/);
  });

  it('reports the bar where user code threw', async () => {
    const candles = waveCandles(40);
    const matrix = buildFeatureMatrix({ symbol: 'XAUUSD', timeframe: '1h', candles });

    const error = await runStrategySandbox({
      source: `
        function getSignal(ctx) {
          if (ctx.i === 12) throw new Error('boom');
          return null;
        }
      `,
      matrix,
      symbol: 'XAUUSD',
      timeframe: '1h',
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(StrategySandboxError);
    expect((error as Error).message).toMatch(/bar 13/);
    expect((error as Error).message).toMatch(/boom/);
  });

  it('interrupts a runaway strategy', async () => {
    const candles = waveCandles(40);
    const matrix = buildFeatureMatrix({ symbol: 'XAUUSD', timeframe: '1h', candles });

    await expect(
      runStrategySandbox({
        source: `
          function getSignal(ctx) {
            while (true) {}
          }
        `,
        matrix,
        symbol: 'XAUUSD',
        timeframe: '1h',
        limits: { timeoutMs: 50 },
      }),
    ).rejects.toThrow(/sandbox limits/i);
  });
});
