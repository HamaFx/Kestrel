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

// R8 (audit 2026-10-31): `forecast_volatility` used to substitute ATR = 0 and
// print "expected ±0.0 pips" when it had no candle window, turning an absent
// measurement into an apparently grounded number. This suite proves the tool
// returns nulls and an explicit unavailable note instead.

import { getCandles, getPrice, type PriceResult } from '@kestrel/data';
import type { Candle, Tick } from '@kestrel/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { extractNumbersFromToolOutput, isSupportedByEvidence } from '../src/committee/grounding';
import { forecastVolatilityTool } from '../src/tools/forecast-volatility';

const mocks = vi.hoisted(() => ({ getCandles: vi.fn(), getPrice: vi.fn() }));

vi.mock('@kestrel/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kestrel/data')>();
  return { ...actual, getCandles: mocks.getCandles, getPrice: mocks.getPrice };
});

// The tool joins the economic calendar; an empty result keeps the original
// multiplier and avoids touching a database in a unit test.
vi.mock('../src/runtime/db', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => [],
          }),
        }),
      }),
    }),
  }),
}));

const exec = forecastVolatilityTool.execute as unknown as (input: {
  symbol: 'XAUUSD';
  tf: '1h';
  horizonHours: number;
}) => Promise<{
  atrPips: number | null;
  expectedMovePips: number | null;
  expectedRange: { low: number; high: number; mid: number } | null;
  notes: string;
}>;

function tick(overrides: Partial<Tick> = {}): Tick {
  return {
    symbol: 'XAUUSD',
    bid: 2650,
    ask: 2650.2,
    mid: 2650.1,
    ts: Date.now(),
    source: 'biquote',
    ...overrides,
  };
}

function priceResult(overrides: Partial<PriceResult> = {}): PriceResult {
  return { tick: tick(), stale: false, producedAt: Date.now(), ageMs: 250, ...overrides };
}

function bars(count: number): Candle[] {
  const barMs = 60 * 60 * 1000;
  const lastOpen = Date.now() - 2 * barMs;
  return Array.from({ length: count }, (_, index) => {
    const close = 2600 + Math.sin(index / 2) * 6;
    return {
      symbol: 'XAUUSD' as const,
      tf: '1h' as const,
      t: lastOpen - (count - index) * barMs,
      o: close - 1,
      h: close + 4,
      l: close - 4,
      c: close,
      v: 100,
      source: 'test',
      fetchedAt: Date.now(),
    };
  });
}

describe('forecast_volatility — fabricated ATR zeros are gone (R8)', () => {
  beforeEach(() => {
    mocks.getCandles.mockReset();
    mocks.getPrice.mockReset();
  });

  it('returns null ATR and expected move when no candle window is available', async () => {
    mocks.getCandles.mockResolvedValue({ candles: [], stale: false, producedAt: Date.now() });

    const output = await exec({ symbol: 'XAUUSD', tf: '1h', horizonHours: 24 });

    expect(output.atrPips).toBeNull();
    expect(output.expectedMovePips).toBeNull();
    expect(output.expectedRange).toBeNull();
    expect(output.notes).toMatch(/could not be computed/);
    expect(output.notes).not.toMatch(/±0\.0 pips/);
    // A claim of "0 pips" is no longer supported by this tool output.
    const evidence = extractNumbersFromToolOutput(output);
    expect(evidence).not.toContain(0);
    expect(isSupportedByEvidence(0, evidence)).toBe(false);
  });

  it('omits the projected range when the live mid is stale', async () => {
    mocks.getCandles.mockResolvedValue({ candles: bars(60), stale: false, producedAt: Date.now() });
    mocks.getPrice.mockResolvedValue(priceResult({ stale: true }));

    const output = await exec({ symbol: 'XAUUSD', tf: '1h', horizonHours: 24 });

    expect(output.atrPips).not.toBeNull();
    expect(output.expectedMovePips).not.toBeNull();
    expect(output.expectedRange).toBeNull();
    expect(output.notes).toMatch(/stale/i);
  });

  it('still projects a range from a fresh mid', async () => {
    mocks.getCandles.mockResolvedValue({ candles: bars(60), stale: false, producedAt: Date.now() });
    mocks.getPrice.mockResolvedValue(priceResult());

    const output = await exec({ symbol: 'XAUUSD', tf: '1h', horizonHours: 24 });

    expect(output.atrPips).toBeGreaterThan(0);
    expect(output.expectedMovePips).toBeGreaterThan(0);
    expect(output.expectedRange).not.toBeNull();
  });
});
