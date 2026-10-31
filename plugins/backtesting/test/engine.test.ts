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
import { computeMetrics } from '../src/engine/metrics';
import { downsample, runBacktest } from '../src/engine/run';
import { runStrategySandbox, StrategySandboxError } from '../src/engine/sandbox';
import { simulateBacktest } from '../src/engine/simulator';
import type { BacktestOptions, BacktestTrade, GeneratedSignal } from '../src/engine/types';

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
      { o: 100, h: 101, l: 89, c: 90 },
    ]);

    const result = simulateBacktest({
      candles,
      signals: [signal(1, { stop: 90 })],
      options: options({ spread: 1, slippage: 0.5, commissionPerUnit: 0.1 }),
      atr: candles.map(() => null),
    });

    const trade = result.trades[0]!;
    expect(trade.entryPrice).toBe(101);
    expect(trade.exitPrice).toBe(89);
    expect(trade.fees).toBeCloseTo(trade.quantity * 0.2, 2);
    expect(trade.exitReason).toBe('stop_loss');
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

  it('does not charge adverse slippage on resting limit entries or take-profit exits', () => {
    const candles = makeCandles([
      { o: 100, h: 101, l: 99, c: 100 },
      { o: 100, h: 101, l: 99, c: 100 },
      { o: 100, h: 101, l: 97, c: 99 },
      { o: 99, h: 121, l: 98, c: 120 },
    ]);

    const result = simulateBacktest({
      candles,
      signals: [signal(1, { entry: 98, stop: 90, target: 120 })],
      options: options({ spread: 1, slippage: 0.5, commissionPerUnit: 0 }),
      atr: candles.map(() => null),
    });

    const trade = result.trades[0]!;
    // Limit entry pays halfSpread (+0.5) only, not slippage (+0.5).
    expect(trade.entryPrice).toBe(98.5);
    // Take-profit exit pays halfSpread (-0.5) only, not slippage (-0.5).
    expect(trade.exitPrice).toBe(119.5);
  });

  it('does not let a mid-bar limit entry take profit on the same bar high unless close clears target', () => {
    const candles = makeCandles([
      { o: 100, h: 101, l: 99, c: 100 },
      { o: 100, h: 101, l: 99, c: 100 },
      // Bar 2 touches both the limit (98) and the target (104), but closes at 99.
      { o: 100, h: 105, l: 97, c: 99 },
      { o: 99, h: 100, l: 98, c: 99 },
    ]);

    const result = simulateBacktest({
      candles,
      signals: [signal(1, { entry: 98, stop: 90, target: 104, maxBars: 1 })],
      options: options(),
      atr: candles.map(() => null),
    });

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]!.exitReason).toBe('max_bars');
  });

  it('still stops out a limit entry on the bar it fills (pessimistic ordering)', () => {
    const candles = makeCandles([
      { o: 100, h: 101, l: 99, c: 100 },
      { o: 100, h: 101, l: 99, c: 100 },
      // Bar 2 fills the 98 limit and also drives through the 90 stop.
      { o: 100, h: 101, l: 88, c: 89 },
      { o: 89, h: 90, l: 88, c: 89 },
    ]);

    const result = simulateBacktest({
      candles,
      signals: [signal(1, { entry: 98, stop: 90, target: 120 })],
      options: options(),
      atr: candles.map(() => null),
    });

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]!.exitReason).toBe('stop_loss');
    expect(result.trades[0]!.exitPrice).toBe(90);
  });

  it('flips an open position at the next bar open when signal.flip is true', () => {
    const candles = makeCandles([
      { o: 100, h: 101, l: 99, c: 100 },
      { o: 100, h: 101, l: 99, c: 100 },
      { o: 100, h: 106, l: 99, c: 105 },
      { o: 105, h: 106, l: 94, c: 95 },
      { o: 95, h: 96, l: 89, c: 90 },
    ]);

    const result = simulateBacktest({
      candles,
      signals: [
        signal(1, { side: 'long', stop: 90, target: 130 }),
        signal(2, { side: 'short', stop: 115, target: 90, flip: true }),
      ],
      options: options(),
      atr: candles.map(() => null),
    });

    expect(result.trades).toHaveLength(2);
    expect(result.trades[0]!.side).toBe('long');
    expect(result.trades[0]!.exitReason).toBe('manual');
    expect(result.trades[0]!.exitPrice).toBe(105);
    expect(result.trades[1]!.side).toBe('short');
    expect(result.trades[1]!.entryPrice).toBe(105);
    expect(result.trades[1]!.exitReason).toBe('take_profit');
  });

  it('closes an open position on signal.exit without reversing', () => {
    const candles = makeCandles([
      { o: 100, h: 101, l: 99, c: 100 },
      { o: 100, h: 101, l: 99, c: 100 },
      { o: 100, h: 106, l: 99, c: 105 },
      { o: 105, h: 106, l: 104, c: 105 },
      { o: 105, h: 106, l: 104, c: 105 },
    ]);

    const result = simulateBacktest({
      candles,
      signals: [
        signal(1, { side: 'long', stop: 90, target: 130 }),
        signal(2, { side: 'long', stop: 90, target: 130, exit: true }),
      ],
      options: options(),
      atr: candles.map(() => null),
    });

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]!.exitReason).toBe('manual');
    expect(result.trades[0]!.exitPrice).toBe(105);
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

  it('keeps order blocks causal when more than 10 order blocks form across the series', () => {
    // Construct 400 alternating impulse candles producing > 25 bullish and bearish OBs.
    const bars: { o: number; h: number; l: number; c: number }[] = [];
    let price = 2000;
    for (let i = 0; i < 400; i += 1) {
      const mod = i % 6;
      if (mod === 0) {
        bars.push({ o: price + 2, h: price + 3, l: price - 2, c: price - 1 });
      } else if (mod === 1 || mod === 2) {
        price += 3;
        bars.push({ o: price - 3, h: price + 1, l: price - 3, c: price });
      } else if (mod === 3) {
        bars.push({ o: price - 2, h: price + 2, l: price - 3, c: price + 1 });
      } else {
        price -= 2.5;
        bars.push({ o: price + 2.5, h: price + 3, l: price - 1, c: price });
      }
    }
    const full = makeCandles(bars);
    const prefix = full.slice(0, 180);

    const fullMatrix = buildFeatureMatrix({ symbol: 'XAUUSD', timeframe: '1h', candles: full });
    const prefixMatrix = buildFeatureMatrix({
      symbol: 'XAUUSD',
      timeframe: '1h',
      candles: prefix,
    });

    expect(prefixMatrix.smc.obBullTop).toEqual(fullMatrix.smc.obBullTop.slice(0, 180));
    expect(prefixMatrix.smc.obBearTop).toEqual(fullMatrix.smc.obBearTop.slice(0, 180));
    expect(fullMatrix.smc.obBullStrength.some((s) => s > 0)).toBe(true);
    expect(fullMatrix.smc.obBearStrength.some((s) => s > 0)).toBe(true);
  });

  it('resets VWAP at the UTC day boundary so later days do not depend on earlier start bars', () => {
    const full = waveCandles(120, 60 * 60 * 1000); // 5 days of 1h bars
    const sliced = full.slice(24); // drop day 1
    const mFull = buildFeatureMatrix({ symbol: 'XAUUSD', timeframe: '1h', candles: full });
    const mSliced = buildFeatureMatrix({ symbol: 'XAUUSD', timeframe: '1h', candles: sliced });
    expect(mSliced.series.vwap.slice(24)).toEqual(mFull.series.vwap.slice(48));
  });
});

describe('backtest metrics', () => {
  it('tracks maxDrawdownPct independently of max dollar drawdown', () => {
    const metrics = computeMetrics({
      trades: [],
      equityCurve: [
        { t: 1000, equity: 10_000, drawdown: 0, drawdownPct: 0 },
        { t: 2000, equity: 7_000, drawdown: 3_000, drawdownPct: 30 }, // 30% DD ($3,000)
        { t: 3000, equity: 50_000, drawdown: 0, drawdownPct: 0 },
        { t: 4000, equity: 46_500, drawdown: 3_500, drawdownPct: 7 }, // 7% DD ($3,500)
      ],
      initialBalance: 10_000,
      finalEquity: 46_500,
      bars: 4,
      barsWithPosition: 2,
    });

    expect(metrics.maxDrawdown).toBe(3500);
    expect(metrics.maxDrawdownPct).toBe(30);
  });

  it('falls back to SQN for Sharpe and Sortino when the equity curve is too short to annualise', () => {
    const trades = [
      { pnl: 100, rMultiple: 1, fees: 0, side: 'long', barsHeld: 1 },
      { pnl: 50, rMultiple: 0.5, fees: 0, side: 'long', barsHeld: 1 },
    ] as unknown as BacktestTrade[];

    const metrics = computeMetrics({
      trades,
      equityCurve: [
        { t: 0, equity: 10_000, drawdown: 0, drawdownPct: 0 },
        { t: 60_000, equity: 10_100, drawdown: 0, drawdownPct: 0 },
        { t: 120_000, equity: 10_150, drawdown: 0, drawdownPct: 0 },
      ],
      initialBalance: 10_000,
      finalEquity: 10_150,
      bars: 3,
      barsWithPosition: 2,
    });

    expect(metrics.sqn).toBeGreaterThan(0);
    expect(metrics.sharpeRatio).toBe(metrics.sqn);
    expect(metrics.sortinoRatio).toBe(metrics.sqn);
  });

  it('annualises Sharpe and Sortino from bar returns once the equity curve is long enough', () => {
    const equityCurve = Array.from({ length: 200 }, (_, index) => {
      const equity = 10_000 + index * 10 + Math.sin(index / 3) * 40;
      const peak = 10_000 + index * 10 + 40;
      return {
        t: index * 60_000,
        equity,
        drawdown: Math.max(0, peak - equity),
        drawdownPct: peak > 0 ? (Math.max(0, peak - equity) / peak) * 100 : 0,
      };
    });

    const metrics = computeMetrics({
      trades: [],
      equityCurve,
      initialBalance: 10_000,
      finalEquity: equityCurve.at(-1)!.equity,
      bars: 200,
      barsWithPosition: 0,
    });

    expect(metrics.sharpeRatio).toBeGreaterThan(0);
    expect(metrics.sortinoRatio).toBeGreaterThan(0);
    // The equity-curve Sharpe is annualised from bar returns, so it must not
    // equal the trade-scaled SQN (which is 0 with no trades).
    expect(metrics.sharpeRatio).not.toBe(metrics.sqn);
  });

  it('downsamples the equity curve while preserving the peak and worst drawdown', () => {
    const points = Array.from({ length: 1000 }, (_, index) => ({
      t: index * 60_000,
      equity: 10_000 + Math.sin(index / 20) * 300 + index * 0.5,
      drawdown: 0,
      drawdownPct: 0,
    }));
    // Deep worst-drawdown trough in the middle of a bucket and a later peak.
    points[523] = { t: 523 * 60_000, equity: 6_000, drawdown: 4_500, drawdownPct: 42 };
    points[777] = { t: 777 * 60_000, equity: 12_500, drawdown: 0, drawdownPct: 0 };

    const sampled = downsample(points, 100);
    expect(sampled.length).toBeLessThanOrEqual(102);
    expect(sampled).toContainEqual(points[523]);
    expect(sampled).toContainEqual(points[777]);
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

  it('exposes execution costs to the strategy via ctx.costs', async () => {
    const candles = waveCandles(40);
    const matrix = buildFeatureMatrix({ symbol: 'XAUUSD', timeframe: '1h', candles });

    const { logs } = await runStrategySandbox({
      source: `
        function getSignal(ctx) {
          if (ctx.i === 5) console.log(JSON.stringify(ctx.costs));
          return null;
        }
      `,
      matrix,
      symbol: 'XAUUSD',
      timeframe: '1h',
      costs: { spread: 2, slippage: 0.5, commissionPerUnit: 0.1 },
    });

    expect(logs[0]).toContain('"spread":2');
    expect(logs[0]).toContain('"slippage":0.5');
    expect(logs[0]).toContain('"commissionPerUnit":0.1');
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
