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

// R8 (audit 2026-10-31): a backtest must refuse a stale-while-revalidate
// candle window unless the caller explicitly accepts it, and the accepted run
// must carry the caveat in its warnings.

import type * as KestrelData from '@kestrel/data';
import type { Candle } from '@kestrel/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runBacktestForUser } from '../src/services/run-service';

const { getCandlesSpy } = vi.hoisted(() => ({ getCandlesSpy: vi.fn() }));

vi.mock('@kestrel/data', async (importOriginal) => {
  const actual = await importOriginal<typeof KestrelData>();
  return { ...actual, getCandles: getCandlesSpy };
});

const SOURCE = `
  function getSignal(ctx) {
    return null;
  }
`;

function closedCandles(count: number): Candle[] {
  const barMs = 60 * 60 * 1000;
  const lastOpen = Date.now() - 2 * barMs;
  return Array.from({ length: count }, (_, index) => {
    const close = 2600 + index * 0.5;
    return {
      symbol: 'XAUUSD' as const,
      tf: '1h' as const,
      t: lastOpen - (count - index) * barMs,
      o: close - 0.2,
      h: close + 1,
      l: close - 1,
      c: close,
      v: 100,
      source: 'test',
      fetchedAt: Date.now(),
    };
  });
}

const settings = {};

describe('runBacktestForUser — stale candle window gate (R8)', () => {
  beforeEach(() => {
    getCandlesSpy.mockReset();
  });

  it('refuses a stale-while-revalidate window by default', async () => {
    getCandlesSpy.mockResolvedValue({
      candles: closedCandles(120),
      stale: true,
      producedAt: Date.now() - 45_000,
    });

    await expect(
      runBacktestForUser({
        userId: 'user-1',
        settings,
        input: {
          symbol: 'XAUUSD',
          timeframe: '1h',
          source: SOURCE,
          count: 120,
          persist: false,
          initialBalance: 10_000,
          riskPct: 1,
        },
      }),
    ).rejects.toThrow(/stale cache.*allowStaleData: true/s);
  });

  it('runs with an explicit override and records the caveat as a warning', async () => {
    getCandlesSpy.mockResolvedValue({
      candles: closedCandles(120),
      stale: true,
      producedAt: Date.now() - 45_000,
    });

    const response = await runBacktestForUser({
      userId: 'user-1',
      settings,
      input: {
        symbol: 'XAUUSD',
        timeframe: '1h',
        source: SOURCE,
        count: 120,
        persist: false,
        initialBalance: 10_000,
        riskPct: 1,
        allowStaleData: true,
      },
    });

    expect(response.result.warnings[0]).toMatch(/served stale/);
    expect(response.result.warnings[0]).toMatch(/allowStaleData/);
    expect(response.result.status).toBe('completed');
  });

  it('does not add a caveat for a fresh window', async () => {
    getCandlesSpy.mockResolvedValue({
      candles: closedCandles(120),
      stale: false,
      producedAt: Date.now(),
    });

    const response = await runBacktestForUser({
      userId: 'user-1',
      settings,
      input: {
        symbol: 'XAUUSD',
        timeframe: '1h',
        source: SOURCE,
        count: 120,
        persist: false,
        initialBalance: 10_000,
        riskPct: 1,
      },
    });

    expect(response.result.warnings.some((w) => /served stale/.test(w))).toBe(false);
  });
});
