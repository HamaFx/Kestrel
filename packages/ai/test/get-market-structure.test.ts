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

// P2-01 removal: the AI SDK shim is gone; this suite now exercises the
// canonical execute core that the native Mastra registration runs.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CanonicalMarketStructureInputSchema } from '../src/mastra-v2/tools/canonical/input-schemas';
import { executeCanonicalMarketStructure } from '../src/mastra-v2/tools/canonical/market-structure';

const exec = executeCanonicalMarketStructure as unknown as (input: {
  symbol: string;
  tf: string;
  count?: number;
  lookback?: number;
}) => Promise<{
  symbol: string;
  tf: string;
  bars: number;
  swings: Array<{ type: string; price: number; index: number }>;
  recentSwingHigh: number | null;
  recentSwingLow: number | null;
  rangeSize: number | null;
  summary: string;
}>;

const mockGetCandles = vi.fn();
const mockComputeStructure = vi.fn();

vi.mock('@kestrel/data', () => ({
  getCandlesUnchecked: (...args: unknown[]) => mockGetCandles(...args),
}));

vi.mock('@kestrel/indicators', () => ({
  computeStructure: (...args: unknown[]) => mockComputeStructure(...args),
}));

function makeCandle(time: number, close: number) {
  return {
    t: time,
    o: close - 0.001,
    h: close + 0.005,
    l: close - 0.005,
    c: close,
    symbol: 'EURUSD',
    tf: '1h',
    v: null,
    source: 'test',
    fetchedAt: Date.now(),
  };
}

function swing(type: 'high' | 'low', price: number, index: number) {
  return { type, price, index, time: 1_700_000_000_000 + index, lookback: 5 };
}

describe('get_market_structure — Phase 3', () => {
  beforeEach(() => {
    mockGetCandles.mockReset();
    mockComputeStructure.mockReset();
  });

  it('returns swings and the recent swing range', async () => {
    mockGetCandles.mockResolvedValue([makeCandle(Date.now(), 1.085)]);
    mockComputeStructure.mockReturnValue({
      symbol: 'EURUSD',
      tf: '1h',
      bars: 1,
      fetchedAt: Date.now(),
      swings: [
        swing('high', 1.08, 5),
        swing('low', 1.06, 10),
        swing('high', 1.095, 40),
        swing('low', 1.058, 60),
      ],
    });

    const result = await exec({ symbol: 'EURUSD', tf: '1h', lookback: 5 });

    expect(result.symbol).toBe('EURUSD');
    expect(result.tf).toBe('1h');
    expect(result.swings).toHaveLength(4);
    expect(result.recentSwingHigh).toBe(1.095);
    expect(result.recentSwingLow).toBe(1.058);
    expect(result.rangeSize).toBeCloseTo(0.037, 5);
    expect(result.summary).toBe('4 swings · recent high 1.09500 · recent low 1.05800');
  });

  it('caps the returned swing list at the last 15 pivots', async () => {
    const swings = Array.from({ length: 20 }, (_, i) =>
      swing(i % 2 === 0 ? 'high' : 'low', 1 + i * 0.001, i * 2),
    );
    // Last swing is a low, so both sides qualify.
    swings.push(swing('low', 1.0005, 80));
    mockGetCandles.mockResolvedValue([makeCandle(Date.now(), 1.085)]);
    mockComputeStructure.mockReturnValue({
      symbol: 'EURUSD',
      tf: '1h',
      bars: 90,
      fetchedAt: Date.now(),
      swings,
    });

    const result = await exec({ symbol: 'EURUSD', tf: '1h' });

    expect(result.swings).toHaveLength(15);
    expect(result.summary.startsWith(`${swings.length} swings`)).toBe(true);
  });

  it('reports null range fields when only one pivot side qualified', async () => {
    mockGetCandles.mockResolvedValue([makeCandle(Date.now(), 1.085)]);
    mockComputeStructure.mockReturnValue({
      symbol: 'EURUSD',
      tf: '1h',
      bars: 1,
      fetchedAt: Date.now(),
      swings: [swing('high', 1.09, 5)],
    });

    const result = await exec({ symbol: 'EURUSD', tf: '1h' });

    expect(result.recentSwingHigh).toBe(1.09);
    expect(result.recentSwingLow).toBeNull();
    expect(result.rangeSize).toBeNull();
    expect(result.summary).toContain('1 swing ·');
    expect(result.summary).toContain('recent low n/a');
  });

  it('calls getCandlesUnchecked with correct parameters', async () => {
    mockGetCandles.mockResolvedValue([]);
    mockComputeStructure.mockReturnValue({
      symbol: 'EURUSD',
      tf: '4h',
      bars: 0,
      fetchedAt: Date.now(),
      swings: [],
    });

    await exec({ symbol: 'EURUSD', tf: '4h', count: 300 });

    expect(mockGetCandles).toHaveBeenCalledWith('EURUSD', '4h', { count: 300 });
  });

  it('validates input schema — count min 50', () => {
    expect(
      CanonicalMarketStructureInputSchema.safeParse({ symbol: 'EURUSD', tf: '1h', count: 49 })
        .success,
    ).toBe(false);
    expect(
      CanonicalMarketStructureInputSchema.safeParse({ symbol: 'EURUSD', tf: '1h', count: 50 })
        .success,
    ).toBe(true);
  });

  it('validates input schema — count max 1000', () => {
    expect(
      CanonicalMarketStructureInputSchema.safeParse({ symbol: 'EURUSD', tf: '1h', count: 1000 })
        .success,
    ).toBe(true);
    expect(
      CanonicalMarketStructureInputSchema.safeParse({ symbol: 'EURUSD', tf: '1h', count: 1001 })
        .success,
    ).toBe(false);
  });

  it('validates input schema — count defaults to 300', () => {
    const parsed = CanonicalMarketStructureInputSchema.safeParse({ symbol: 'EURUSD', tf: '1h' });
    expect(parsed.success).toBe(true);
    if (parsed.data) expect(parsed.data.count).toBe(300);
  });

  it('validates input schema — lookback range 2 to 10', () => {
    expect(
      CanonicalMarketStructureInputSchema.safeParse({ symbol: 'EURUSD', tf: '1h', lookback: 1 })
        .success,
    ).toBe(false);
    expect(
      CanonicalMarketStructureInputSchema.safeParse({ symbol: 'EURUSD', tf: '1h', lookback: 2 })
        .success,
    ).toBe(true);
    expect(
      CanonicalMarketStructureInputSchema.safeParse({ symbol: 'EURUSD', tf: '1h', lookback: 10 })
        .success,
    ).toBe(true);
    expect(
      CanonicalMarketStructureInputSchema.safeParse({ symbol: 'EURUSD', tf: '1h', lookback: 11 })
        .success,
    ).toBe(false);
  });

  it('passes only the swing lookback through to computeStructure', async () => {
    mockGetCandles.mockResolvedValue([makeCandle(Date.now(), 1.085)]);
    mockComputeStructure.mockReturnValue({
      symbol: 'EURUSD',
      tf: '1h',
      bars: 1,
      fetchedAt: Date.now(),
      swings: [],
    });

    await exec({ symbol: 'EURUSD', tf: '1h', lookback: 5 });

    expect(mockComputeStructure).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: 'EURUSD',
        tf: '1h',
        swings: { lookback: 5 },
      }),
    );
    expect(mockComputeStructure.mock.calls[0]![0]).not.toHaveProperty('kinds');
  });
});
