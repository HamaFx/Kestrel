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

// R8 (audit 2026-10-31): `get_correlation` used to fabricate
// `dxyProxy: { value: 0, change24h: 0 }` and r = 0 matrix entries when its
// inputs were missing or degenerate. Those zeros were grounding evidence for
// claims like "the correlation is 0". This suite proves an absent input yields
// no number at all, while the normal path still returns real ones.

import type * as DataModule from '@kestrel/data';
import type { Candle } from '@kestrel/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { extractNumbersFromToolOutput } from '../src/committee/grounding';
import { getCorrelationTool } from '../src/tools/get-correlation';

const mocks = vi.hoisted(() => ({ getCandles: vi.fn() }));

vi.mock('@kestrel/data', async (importOriginal) => {
  const actual = await importOriginal<typeof DataModule>();
  return { ...actual, getCandles: mocks.getCandles };
});

const exec = getCorrelationTool.execute as unknown as (input: {
  tf: '1h';
  windowBars: number;
}) => Promise<{
  tf: string;
  windowBars: number;
  asOf: number;
  matrix: Array<{ a: string; b: string; r: number }>;
  dxyProxy: {
    value: number;
    change24h: number | null;
    samples: number;
    formula: string;
  } | null;
  notes?: string;
  partial?: boolean;
  stale?: boolean;
}>;

function bars(symbol: string, count: number, start: number, drift: number, flat = false): Candle[] {
  const barMs = 60 * 60 * 1000;
  const lastOpen = Date.now() - 2 * barMs;
  return Array.from({ length: count }, (_, index) => {
    const close = flat ? start : start + index * drift + Math.sin(index / 3) * drift;
    return {
      symbol: symbol as Candle['symbol'],
      tf: '1h' as const,
      t: lastOpen - (count - index) * barMs,
      o: close - Math.abs(drift) / 2,
      h: close + Math.abs(drift),
      l: close - Math.abs(drift),
      c: close,
      v: 100,
      source: 'test',
      fetchedAt: Date.now(),
    };
  });
}

function window(candles: Candle[], stale = false) {
  return { candles, stale, producedAt: Date.now() };
}

describe('get_correlation — fabricated zeros are gone (R8)', () => {
  beforeEach(() => {
    mocks.getCandles.mockReset();
  });

  it('returns null (not 0) for the proxy when EUR/GBP are unavailable', async () => {
    mocks.getCandles.mockImplementation(async (symbol: string) => {
      if (symbol !== 'XAUUSD') throw new Error('provider down');
      return window(bars('XAUUSD', 120, 2600, 0.4));
    });

    const output = await exec({ tf: '1h', windowBars: 50 });

    expect(output.dxyProxy).toBeNull();
    expect(output.matrix).toEqual([]);
    expect(output.partial).toBe(true);
    expect(output.notes).toMatch(/unavailable/i);
    // The output no longer contains a value that grounds a "DXY proxy is 0"
    // or "correlation is 0" claim.
    const evidence = extractNumbersFromToolOutput(output);
    expect(evidence).not.toContain(0);
  });

  it('omits a pair instead of reporting r = 0 when its window is too short', async () => {
    mocks.getCandles.mockImplementation(async (symbol: string) =>
      window(bars(symbol, 3, 2600, 0.4)),
    );

    const output = await exec({ tf: '1h', windowBars: 50 });

    expect(output.matrix).toEqual([]);
    expect(output.notes).toMatch(/unavailable/i);
  });

  it('omits a pair whose returns have zero variance instead of reporting r = 0', async () => {
    mocks.getCandles.mockImplementation(async (symbol: string) => {
      if (symbol === 'XAUUSD') return window(bars('XAUUSD', 120, 2600, 0, true));
      if (symbol === 'EURUSD') return window(bars('EURUSD', 120, 1.08, 0.0004));
      return window(bars('GBPUSD', 120, 1.27, 0.0003));
    });

    const output = await exec({ tf: '1h', windowBars: 50 });

    // Every pair involving the flat series is absent; the EUR/GBP pair, which
    // has real variance, is still computed.
    expect(output.matrix.some((c) => c.a === 'XAUUSD' || c.b === 'XAUUSD')).toBe(false);
    expect(output.matrix.length).toBeGreaterThan(0);
  });

  it('still returns numeric proxy and correlation when all inputs are present', async () => {
    mocks.getCandles.mockImplementation(async (symbol: string) => {
      if (symbol === 'XAUUSD') return window(bars('XAUUSD', 120, 2600, 0.4));
      if (symbol === 'EURUSD') return window(bars('EURUSD', 120, 1.08, 0.0004));
      return window(bars('GBPUSD', 120, 1.27, 0.0003));
    });

    const output = await exec({ tf: '1h', windowBars: 50 });

    expect(output.partial).toBe(false);
    expect(output.stale).toBe(false);
    expect(output.matrix).toHaveLength(3);
    for (const cell of output.matrix) {
      expect(Number.isFinite(cell.r)).toBe(true);
    }
    expect(output.dxyProxy?.value).toBeGreaterThan(0);
    expect(output.dxyProxy?.samples).toBe(120);
    expect(output.dxyProxy?.change24h).not.toBeNull();
  });

  it('notes when a candle window was served stale', async () => {
    mocks.getCandles.mockImplementation(async (symbol: string) => {
      if (symbol === 'XAUUSD') return window(bars('XAUUSD', 120, 2600, 0.4), true);
      if (symbol === 'EURUSD') return window(bars('EURUSD', 120, 1.08, 0.0004));
      return window(bars('GBPUSD', 120, 1.27, 0.0003));
    });

    const output = await exec({ tf: '1h', windowBars: 50 });

    expect(output.stale).toBe(true);
    expect(output.notes).toMatch(/stale/i);
  });
});
