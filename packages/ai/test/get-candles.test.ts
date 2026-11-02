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

// get_candles tool tests. R8 (audit 2026-10-31): the tool reads the
// meta-returning adapter getter, so mocks supply `CandlesResult` envelopes
// and the assertions cover the freshness disclosure.
//
// P2-01 removal: the AI SDK shim is gone; this suite now exercises the
// canonical execute core that the native Mastra registration runs.

import type * as DataModule from '@kestrel/data';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeCanonicalCandles } from '../src/mastra-v2/tools/canonical/candles';
import { CanonicalCandlesInputSchema } from '../src/mastra-v2/tools/canonical/input-schemas';

const exec = executeCanonicalCandles as unknown as (input: {
  symbol: string;
  tf: string;
  count?: number;
}) => Promise<{
  symbol: string;
  tf: string;
  candles: unknown[];
  freshness?: {
    stale: boolean;
    producedAt: number;
    ageSeconds: number;
    lastClosedBarAgeSeconds: number | null;
  };
  warnings?: string[];
}>;

const mockGetCandles = vi.fn();

vi.mock('@kestrel/data', async (importOriginal) => {
  const actual = await importOriginal<typeof DataModule>();
  return { ...actual, getCandles: (...args: unknown[]) => mockGetCandles(...args) };
});

function makeCandle(overrides: {
  time?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  tf?: string;
}) {
  return {
    t: overrides.time ?? Date.now(),
    o: overrides.open ?? 1.08,
    h: overrides.high ?? 1.09,
    l: overrides.low ?? 1.07,
    c: overrides.close ?? 1.085,
    symbol: 'EURUSD',
    tf: overrides.tf ?? '1h',
    v: null,
    source: 'test',
    fetchedAt: Date.now(),
  };
}

function candlesResult(candles: unknown[], overrides: { stale?: boolean } = {}) {
  return {
    candles,
    stale: overrides.stale ?? false,
    producedAt: Date.now(),
  };
}

describe('get_candles — Phase 0.10', () => {
  beforeEach(() => {
    mockGetCandles.mockReset();
  });

  it('returns candles for a symbol and timeframe', async () => {
    const candles = [makeCandle({}), makeCandle({ time: Date.now() - 3600_000 })];
    mockGetCandles.mockResolvedValue(candlesResult(candles));

    const result = await exec({ symbol: 'EURUSD', tf: '1h' });

    expect(result.symbol).toBe('EURUSD');
    expect(result.tf).toBe('1h');
    expect(result.candles).toEqual(candles);
  });

  it('passes count through to getCandles (defaults applied by the tool schema, not execute itself)', async () => {
    mockGetCandles.mockResolvedValue(candlesResult([]));

    // When calling execute() directly (bypassing the tool input boundary),
    // the Zod .default(120) is not applied — that's the tool layer's job.
    // The execute function just passes through whatever it receives.
    await exec({ symbol: 'EURUSD', tf: '1h', count: 120 });

    expect(mockGetCandles).toHaveBeenCalledWith('EURUSD', '1h', { count: 120 });
  });

  it('passes a custom count when provided', async () => {
    mockGetCandles.mockResolvedValue(candlesResult([]));

    await exec({ symbol: 'EURUSD', tf: '15m', count: 50 });

    expect(mockGetCandles).toHaveBeenCalledWith('EURUSD', '15m', { count: 50 });
  });

  it('returns XAUUSD candles with correct symbol', async () => {
    const candles = [
      makeCandle({ time: Date.now(), open: 2400, high: 2405, low: 2395, close: 2402 }),
    ];
    mockGetCandles.mockResolvedValue(candlesResult(candles));

    const result = await exec({ symbol: 'XAUUSD', tf: '4h' });

    expect(result.symbol).toBe('XAUUSD');
    expect(result.tf).toBe('4h');
    expect(result.candles).toHaveLength(1);
  });

  it('returns GBPUSD candles', async () => {
    const candles = [
      makeCandle({ time: Date.now(), open: 1.27, high: 1.275, low: 1.265, close: 1.272 }),
    ];
    mockGetCandles.mockResolvedValue(candlesResult(candles));

    const result = await exec({ symbol: 'GBPUSD', tf: '1d' });

    expect(result.symbol).toBe('GBPUSD');
    expect(result.candles).toHaveLength(1);
  });

  it('surfaces window freshness without a warning for a fresh window (R8)', async () => {
    mockGetCandles.mockResolvedValue(candlesResult([makeCandle({ time: Date.now() - 7200_000 })]));

    const result = await exec({ symbol: 'EURUSD', tf: '1h' });

    expect(result.freshness?.stale).toBe(false);
    expect(result.freshness?.ageSeconds).toBeGreaterThanOrEqual(0);
    expect(result.freshness?.lastClosedBarAgeSeconds).toBeGreaterThan(0);
    expect(result.warnings).toEqual([]);
  });

  it('flags a stale-while-revalidate window with a warning (R8)', async () => {
    mockGetCandles.mockResolvedValue(
      candlesResult([makeCandle({ time: Date.now() - 7200_000 })], { stale: true }),
    );

    const result = await exec({ symbol: 'EURUSD', tf: '1h' });

    expect(result.freshness?.stale).toBe(true);
    expect(result.warnings?.[0]).toMatch(/stale cache/);
    expect(result.warnings?.[0]).toMatch(/EURUSD 1h/);
  });

  it('never fabricates a 0% change when the window open is zero (R8)', async () => {
    mockGetCandles.mockResolvedValue(
      candlesResult([
        makeCandle({ time: Date.now() - 7200_000, open: 0, close: 1 }),
        makeCandle({ time: Date.now() - 3600_000, open: 0, close: 1 }),
      ]),
    );

    const result = (await exec({ symbol: 'EURUSD', tf: '1h' })) as {
      summary?: { changePct: number | null };
    };

    expect(result.summary?.changePct).toBeNull();
  });

  it('validates input schema — count min 10', () => {
    expect(
      CanonicalCandlesInputSchema.safeParse({ symbol: 'EURUSD', tf: '1h', count: 5 }).success,
    ).toBe(false);
  });

  it('validates input schema — count max 500', () => {
    const schema = CanonicalCandlesInputSchema;
    expect(schema.safeParse({ symbol: 'EURUSD', tf: '1h', count: 500 }).success).toBe(true);
    expect(schema.safeParse({ symbol: 'EURUSD', tf: '1h', count: 501 }).success).toBe(false);
  });

  it('validates input schema — count defaults to 120', () => {
    const schema = CanonicalCandlesInputSchema;
    const parsed = schema.safeParse({ symbol: 'EURUSD', tf: '1h' });
    expect(parsed.success).toBe(true);
    if (parsed.data) {
      expect(parsed.data.count).toBe(120);
    }
  });

  it('validates input schema — unknown symbol rejected', () => {
    expect(CanonicalCandlesInputSchema.safeParse({ symbol: 'UNKNOWN', tf: '1h' }).success).toBe(
      false,
    );
  });

  it('validates input schema — unknown timeframe rejected', () => {
    expect(CanonicalCandlesInputSchema.safeParse({ symbol: 'EURUSD', tf: '7h' }).success).toBe(
      false,
    );
  });

  it('accepts all standard timeframes', () => {
    // TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w']
    for (const tf of ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w']) {
      expect(CanonicalCandlesInputSchema.safeParse({ symbol: 'EURUSD', tf }).success).toBe(true);
    }
  });
});
