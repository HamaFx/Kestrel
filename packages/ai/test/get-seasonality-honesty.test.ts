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

// R8 (audit 2026-10-31): `get_seasonality` used to default an empty bucket's
// median, IQR and win rate to 0, so "no samples" rendered as a measured flat
// return that the evidence gate would accept.
//
// Note the one deliberate exception: `count` and `sampleSize` are real counts,
// so 0 remains honest there. This suite checks the *measurements* are absent.

import { getCandles } from '@kestrel/data';
import type { Candle } from '@kestrel/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getSeasonalityTool } from '../src/tools/get-seasonality';

const mocks = vi.hoisted(() => ({ getCandles: vi.fn() }));

vi.mock('@kestrel/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kestrel/data')>();
  return { ...actual, getCandles: mocks.getCandles };
});

const exec = getSeasonalityTool.execute as unknown as (input: {
  symbol: 'XAUUSD';
  granularity: 'month';
}) => Promise<{
  sampleSize: number;
  thin: boolean;
  stale?: boolean;
  notes?: string;
  buckets: Array<{
    key: number;
    label: string;
    count: number;
    medianReturnPct: number | null;
    q1Pct: number | null;
    q3Pct: number | null;
    winRate: number | null;
  }>;
}>;

function window(candles: Candle[], stale = false) {
  return { candles, stale, producedAt: Date.now() };
}

function dailyBars(count: number): Candle[] {
  const dayMs = 24 * 60 * 60 * 1000;
  return Array.from({ length: count }, (_, index) => {
    const close = 2600 + Math.sin(index / 2) * 12 + index * 0.1;
    return {
      symbol: 'XAUUSD' as const,
      tf: '1d' as const,
      t: Date.now() - (count - index) * dayMs,
      o: close - 2,
      h: close + 4,
      l: close - 4,
      c: close,
      v: 100,
      source: 'test',
      fetchedAt: Date.now(),
    };
  });
}

describe('get_seasonality — fabricated zero statistics are gone (R8)', () => {
  beforeEach(() => {
    mocks.getCandles.mockReset();
  });

  it('returns null bucket statistics (not 0) when the candle window is empty', async () => {
    mocks.getCandles.mockResolvedValue(window([]));

    const output = await exec({ symbol: 'XAUUSD', granularity: 'month' });

    expect(output.sampleSize).toBe(0);
    expect(output.buckets).toHaveLength(12);
    expect(output.buckets.every((b) => b.count === 0)).toBe(true);
    expect(
      output.buckets.every(
        (b) =>
          b.medianReturnPct === null && b.q1Pct === null && b.q3Pct === null && b.winRate === null,
      ),
    ).toBe(true);
    expect(output.notes).toMatch(/unavailable/i);
  });

  it('states the window could not be fetched instead of zero-filling a distribution', async () => {
    mocks.getCandles.mockRejectedValue(new Error('provider down'));

    const output = await exec({ symbol: 'XAUUSD', granularity: 'month' });

    expect(output.buckets).toEqual([]);
    expect(output.sampleSize).toBe(0);
    expect(output.notes).toMatch(/unavailable/i);
  });

  it('still returns measured statistics when candles are present', async () => {
    mocks.getCandles.mockResolvedValue(window(dailyBars(400)));

    const output = await exec({ symbol: 'XAUUSD', granularity: 'month' });

    const measured = output.buckets.filter((b) => b.count > 0);
    expect(measured.length).toBeGreaterThan(0);
    for (const bucket of measured) {
      expect(bucket.medianReturnPct).not.toBeNull();
      expect(Number.isFinite(bucket.medianReturnPct!)).toBe(true);
      expect(bucket.winRate).not.toBeNull();
    }
    for (const bucket of output.buckets.filter((b) => b.count === 0)) {
      expect(bucket.medianReturnPct).toBeNull();
      expect(bucket.winRate).toBeNull();
    }
  });

  it('discloses a stale candle window as provisional', async () => {
    mocks.getCandles.mockResolvedValue(window(dailyBars(400), true));

    const output = await exec({ symbol: 'XAUUSD', granularity: 'month' });

    expect(output.stale).toBe(true);
    expect(output.notes).toMatch(/stale/i);
  });
});
