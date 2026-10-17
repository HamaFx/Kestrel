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

// Batch 4 integration test: AI tools → REAL @kestrel/indicators math.
//
// The previous revision mocked BOTH @kestrel/data and @kestrel/indicators,
// turning this file into duplicate mock-only unit tests. The indicator and
// SMC packages are real workspace code with deterministic math, so the only
// boundary that needs a mock is the external market-data fetch
// (@kestrel/data getCandles / getPrice). Every asserted number below is
// computed by the real @kestrel/indicators package at runtime.

import { computeIndicator, computeStructure } from '@kestrel/indicators';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Cross-package test fixture: the deterministic candle factory lives with the
// indicator tests it feeds (see test_audit_plan.md §4.3, DO NOT DELETE).
// eslint-disable-next-line no-restricted-imports -- cross-package test fixture, not production code
import { makeCandles } from '../../../indicators/test/fixtures';
import { getIndicatorsTool } from '../../src/tools/get-indicators';
import { getMarketStructureTool } from '../../src/tools/get-market-structure';
import { verifyCallTool } from '../../src/tools/verify-call';

const mockGetCandles = vi.fn();
const mockGetPrice = vi.fn();

vi.mock('@kestrel/data', () => ({
  getCandles: (...args: unknown[]) => mockGetCandles(...args),
  getPrice: (...args: unknown[]) => mockGetPrice(...args),
}));

const execIndicators = getIndicatorsTool.execute as unknown as (input: {
  symbol: string;
  tf: string;
  count: number;
  indicators: Array<{ kind: string; params: Record<string, unknown> }>;
}) => Promise<{
  symbol: string;
  tf: string;
  results: Array<{
    kind: string;
    params: Record<string, unknown>;
    values: unknown[];
  }>;
}>;

const execStructure = getMarketStructureTool.execute as unknown as (input: {
  symbol: string;
  tf: string;
  count: number;
  lookback: number;
}) => Promise<{
  symbol: string;
  tf: string;
  bars: number;
  swings?: Array<{ type: string; price: number; index: number }>;
  events?: Array<{ kind: string; direction: string; index: number; level: number }>;
  summary: string;
}>;

const execVerify = verifyCallTool.execute as unknown as (input: {
  symbol: string;
  side: 'long' | 'short';
  entry: number;
  stop: number;
  target?: number | null;
  tf?: string;
  lookbackBars?: number;
}) => Promise<{
  agree: boolean;
  marketPrice: number | null;
  caveats: Array<{ code: string; message: string }>;
  nearestOpposingLiquidity: {
    price: number;
    kind: 'swing_high' | 'swing_low';
    barsAgo: number;
  } | null;
}>;

/** 50-bar gold uptrend with pullbacks — exercises RSI/EMA/MACD on real data. */
const TREND_CLOSES = [
  2610, 2608, 2612, 2615, 2614, 2617, 2620, 2619, 2623, 2626, 2622, 2625, 2629, 2631, 2628, 2632,
  2636, 2634, 2638, 2641, 2639, 2642, 2646, 2644, 2648, 2651, 2649, 2653, 2656, 2654, 2658, 2661,
  2659, 2662, 2666, 2664, 2668, 2671, 2669, 2673, 2676, 2674, 2678, 2681, 2679, 2682, 2686, 2684,
  2688, 2691,
];

/** 40-bar zigzag — produces alternating swing highs/lows plus BOS/CHoCH events. */
const ZIGZAG_CLOSES = [
  100, 101, 102, 103, 102, 101, 100, 99, 98, 99, 100, 101, 102, 103, 104, 105, 104, 103, 102, 101,
  100, 99, 98, 97, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 106, 105, 104, 103,
];

describe('AI tools → real @kestrel/indicators integration', () => {
  beforeEach(() => {
    mockGetCandles.mockReset();
    mockGetPrice.mockReset();
  });

  it('get_indicators computes real RSI/EMA/MACD series and trims each to 15 tail points', async () => {
    const candles = makeCandles(TREND_CLOSES);
    mockGetCandles.mockResolvedValue(candles);

    const requested = [
      { kind: 'rsi', params: { period: 14 } },
      { kind: 'ema', params: { period: 20 } },
      { kind: 'macd', params: { fast: 12, slow: 26, signal: 9 } },
    ] as const;

    const result = await execIndicators({
      symbol: 'XAUUSD',
      tf: '1h',
      count: 50,
      indicators: requested.map((r) => ({ kind: r.kind, params: { ...r.params } })),
    });

    expect(mockGetCandles).toHaveBeenCalledWith('XAUUSD', '1h', { count: 50 });
    expect(result.symbol).toBe('XAUUSD');
    expect(result.tf).toBe('1h');
    expect(result.results).toHaveLength(3);

    for (const [i, request] of requested.entries()) {
      const expected = computeIndicator({
        symbol: 'XAUUSD',
        tf: '1h',
        kind: request.kind,
        params: { ...request.params },
        candles,
      });

      const entry = result.results[i]!;
      expect(entry.kind).toBe(request.kind);
      expect(expected.values.length).toBeGreaterThan(15);
      expect(entry.values.length).toBe(15);
      expect(entry.values).toEqual(expected.values.slice(-15));
    }

    // Ground one concrete number: a steady uptrend must close RSI in
    // overbought territory rather than the neutral 50 band.
    const rsiValues = result.results[0]!.values as Array<number | null>;
    expect(rsiValues[rsiValues.length - 1]).toBeGreaterThan(60);
  });

  it('get_market_structure derives real swings, BOS/CHoCH events and summary from the candle window', async () => {
    const candles = makeCandles(ZIGZAG_CLOSES);
    mockGetCandles.mockResolvedValue(candles);

    const result = await execStructure({ symbol: 'XAUUSD', tf: '1h', count: 40, lookback: 3 });

    const expected = computeStructure({
      symbol: 'XAUUSD',
      tf: '1h',
      candles,
      swings: { lookback: 3 },
    });

    expect(mockGetCandles).toHaveBeenCalledWith('XAUUSD', '1h', { count: 40 });
    expect(result.bars).toBe(40);
    expect(result.swings).toEqual(expected.swings!.slice(-15));
    expect(result.events).toEqual(expected.events!.slice(-15));

    // Real structural features: alternating pivots plus both event kinds.
    expect(result.swings!.some((s) => s.type === 'high')).toBe(true);
    expect(result.swings!.some((s) => s.type === 'low')).toBe(true);
    const kinds = result.events!.map((e) => e.kind);
    expect(kinds).toContain('bos');
    expect(kinds).toContain('choch');
    expect(result.summary).toContain('swings');
    expect(result.summary).toContain('last structure');
  });

  it('verify_call agrees when the nearest real swing high sits beyond the target', async () => {
    mockGetPrice.mockResolvedValue({
      symbol: 'XAUUSD',
      bid: 2599.5,
      ask: 2600.5,
      mid: 2600,
      ts: Date.now(),
      source: 'test',
    });
    const candles = makeCandles([2575, 2585, 2634, 2592, 2570, 2582], {
      highs: [2576, 2586, 2635, 2593, 2571, 2583],
    });
    mockGetCandles.mockResolvedValue(candles);

    const result = await execVerify({
      symbol: 'XAUUSD',
      side: 'long',
      entry: 2600,
      stop: 2590,
      target: 2625,
      tf: '1h',
      lookbackBars: 6,
    });

    expect(mockGetCandles).toHaveBeenCalledWith('XAUUSD', '1h', { count: 6 });
    expect(result.marketPrice).toBe(2600);
    expect(result.agree).toBe(true);
    expect(result.caveats).toEqual([]);
    expect(result.nearestOpposingLiquidity).toEqual({
      price: 2635,
      kind: 'swing_high',
      barsAgo: 3,
    });
  });

  it('verify_call flags opposing liquidity when a real swing high blocks a long target', async () => {
    mockGetPrice.mockResolvedValue({
      symbol: 'XAUUSD',
      bid: 2599.5,
      ask: 2600.5,
      mid: 2600,
      ts: Date.now(),
      source: 'test',
    });
    mockGetCandles.mockResolvedValue(makeCandles([2595, 2605, 2609, 2600, 2590, 2600]));

    const result = await execVerify({
      symbol: 'XAUUSD',
      side: 'long',
      entry: 2600,
      stop: 2590,
      target: 2620,
      tf: '1h',
      lookbackBars: 6,
    });

    expect(result.agree).toBe(false);
    expect(result.caveats).toHaveLength(1);
    expect(result.caveats[0]!.code).toBe('opposing_liquidity_in_path');
    expect(result.nearestOpposingLiquidity).toEqual({
      price: 2610,
      kind: 'swing_high',
      barsAgo: 3,
    });
  });
});
