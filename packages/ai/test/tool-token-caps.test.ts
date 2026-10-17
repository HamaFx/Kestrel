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
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getCandlesTool } from '../src/tools/get-candles';
import { getIndicatorsTool } from '../src/tools/get-indicators';
import { computeMarketStructureOutput } from '../src/tools/get-market-structure';

const mockGetCandles = vi.fn();

vi.mock('@kestrel/data', () => ({
  getCandles: (...args: unknown[]) => mockGetCandles(...args),
}));

const execCandles = getCandlesTool.execute as unknown as (input: {
  symbol: string;
  tf: string;
  count: number;
}) => Promise<{
  symbol: string;
  tf: string;
  candles: Candle[];
  summary?: {
    fromIso: string;
    toIso: string;
    open: number;
    high: number;
    low: number;
    close: number;
    change: number;
    changePct: number;
    avgBarRange: number;
    totalVolume: number;
  } | null;
}>;

const execIndicators = getIndicatorsTool.execute as unknown as (input: {
  symbol: string;
  tf: string;
  count: number;
  indicators: Array<{ kind: string; params?: Record<string, unknown> }>;
}) => Promise<{
  symbol: string;
  tf: string;
  results: Array<{
    kind: string;
    values: unknown[];
  }>;
}>;

function generateCandles(count: number): Candle[] {
  const candles: Candle[] = [];
  const baseTime = Date.now() - count * 60_000;
  for (let i = 0; i < count; i++) {
    candles.push({
      symbol: 'XAUUSD',
      tf: '1h',
      t: baseTime + i * 3600_000,
      o: 2000 + i * 0.5,
      h: 2005 + i * 0.5,
      l: 1995 + i * 0.5,
      c: 2002 + i * 0.5,
      v: 100 + i,
      source: 'test',
      fetchedAt: Date.now(),
    });
  }
  return candles;
}

describe('prevent LLM context token bloat (F-15)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getCandlesTool caps returned candles array to max 30 recent bars and includes summary', async () => {
    const rawCandles = generateCandles(200);
    mockGetCandles.mockResolvedValueOnce(rawCandles);

    const res = await execCandles({
      symbol: 'XAUUSD',
      tf: '1h',
      count: 200,
    });

    expect(res.candles.length).toBeLessThanOrEqual(30);
    expect(res.candles.length).toBe(30);
    expect(res.candles[res.candles.length - 1]!.c).toBe(rawCandles[rawCandles.length - 1]!.c);

    expect(res.summary).toBeDefined();
    expect(res.summary?.open).toBe(rawCandles[0]!.o);
    expect(res.summary?.close).toBe(rawCandles[rawCandles.length - 1]!.c);
    expect(res.summary?.totalVolume).toBeGreaterThan(0);
  });

  it('getIndicatorsTool caps tail points to 15', async () => {
    const rawCandles = generateCandles(100);
    mockGetCandles.mockResolvedValueOnce(rawCandles);

    const res = await execIndicators({
      symbol: 'XAUUSD',
      tf: '1h',
      count: 100,
      indicators: [{ kind: 'sma', params: { period: 10 } }],
    });

    expect(res.results).toHaveLength(1);
    expect(res.results[0]!.values.length).toBeLessThanOrEqual(15);
  });

  it('computeMarketStructureOutput caps returned items to 15', () => {
    const rawCandles = generateCandles(100);
    const res = computeMarketStructureOutput({
      symbol: 'XAUUSD',
      tf: '1h',
      count: 100,
      lookback: 2,
      candles: rawCandles,
    });

    if (res.swings) {
      expect(res.swings.length).toBeLessThanOrEqual(15);
    }
    if (res.events) {
      expect(res.events.length).toBeLessThanOrEqual(15);
    }
  });
});
