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

// R8 (audit 2026-10-31): the backtest market-data gate. These assertions pin
// the exact operator-facing messages so the gate can move between modules
// without the wording drifting.

import type * as KestrelData from '@kestrel/data';
import type { Candle } from '@kestrel/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadBacktestCandleWindow, staleWindowWarning } from '../src/services/market-data-gate';

const { getCandlesSpy } = vi.hoisted(() => ({ getCandlesSpy: vi.fn() }));

vi.mock('@kestrel/data', async (importOriginal) => {
  const actual = await importOriginal<typeof KestrelData>();
  return { ...actual, getCandles: getCandlesSpy };
});

const REFUSAL_MESSAGE =
  'The XAUUSD 1h candle window was served from a stale cache after an upstream failure (age 45s), ' +
  'so recent bars may be missing and the run was refused. Re-run when the provider is reachable, ' +
  'or pass allowStaleData: true to accept a stale window (legitimate for archived historical ' +
  'windows whose closed bars cannot change).';

const WARNING_MESSAGE =
  'Market data window was served stale (age 45s) with allowStaleData enabled — verify the window ' +
  'before trusting these results.';

function candle(): Candle {
  return {
    symbol: 'XAUUSD',
    tf: '1h',
    t: Date.now() - 2 * 3_600_000,
    o: 2600,
    h: 2605,
    l: 2595,
    c: 2602,
    v: 100,
    source: 'test',
    fetchedAt: Date.now(),
  };
}

describe('market-data-gate (R8)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-31T12:00:00Z'));
    getCandlesSpy.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refuses a stale window with the exact operator-facing message', async () => {
    getCandlesSpy.mockResolvedValue({ candles: [], stale: true, producedAt: Date.now() - 45_000 });

    const err = await loadBacktestCandleWindow({
      symbol: 'XAUUSD',
      timeframe: '1h',
      count: 120,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe(REFUSAL_MESSAGE);
  });

  it('accepts a stale window with allowStaleData and returns the age', async () => {
    getCandlesSpy.mockResolvedValue({
      candles: [candle()],
      stale: true,
      producedAt: Date.now() - 45_000,
    });

    const window = await loadBacktestCandleWindow({
      symbol: 'XAUUSD',
      timeframe: '1h',
      count: 120,
      allowStaleData: true,
    });

    expect(window.staleWindowSeconds).toBe(45);
    expect(window.candles).toHaveLength(1);
  });

  it('renders the exact warning line for an accepted stale window', () => {
    expect(staleWindowWarning(45)).toBe(WARNING_MESSAGE);
  });

  it('reports null age for a fresh window', async () => {
    getCandlesSpy.mockResolvedValue({
      candles: [candle()],
      stale: false,
      producedAt: Date.now(),
    });

    const window = await loadBacktestCandleWindow({
      symbol: 'XAUUSD',
      timeframe: '1h',
      count: 120,
    });

    expect(window.staleWindowSeconds).toBeNull();
    expect(window.candles).toHaveLength(1);
  });

  it('wraps a load failure with the exact message and preserves the cause', async () => {
    const cause = new Error('provider down');
    getCandlesSpy.mockRejectedValue(cause);

    const err = await loadBacktestCandleWindow({
      symbol: 'XAUUSD',
      timeframe: '1h',
      count: 120,
    }).catch((e: unknown) => e);

    expect((err as Error).message).toBe('Could not load XAUUSD 1h candles: provider down');
    expect((err as Error).cause).toBe(cause);
  });
});
