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

// Gap backfill tests (R9, audit 2026-10-31). The REST OHLC adapter is
// mocked; the rules under test are the backfill module's own:
//   - only provider-answered bars inside the gap range are returned
//     (a short answer is reported as `partial`, never padded);
//   - an over-long gap is reported as `cap-exceeded` without a fetch;
//   - an FX weekend gap is not fetched at all;
//   - a provider failure is a reportable result, not a throw.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CandleGap } from '../src/aggregator/candle-1m';
import { fetchGapBars, MAX_GAP_BACKFILL_MINUTES } from '../src/persistence/candle-backfill';

const dataMock = vi.hoisted(() => ({ getCandlesWithMeta: vi.fn() }));

vi.mock('@kestrel/data', () => ({ getCandlesWithMeta: dataMock.getCandlesWithMeta }));

const MINUTE_MS = 60_000;
// A Wednesday, so the weekend guard never interferes.
const BASE_TS = Date.UTC(2026, 0, 7, 10, 0, 0);
// 2026-01-03 is a Saturday (inside the FX weekend).
const SATURDAY_TS = Date.UTC(2026, 0, 3, 12, 0, 0);

const log = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  with: vi.fn(),
} as unknown as Parameters<typeof fetchGapBars>[0]['log'];

function gap(overrides: Partial<CandleGap> = {}): CandleGap {
  return {
    symbol: 'XAUUSD',
    fromMs: BASE_TS,
    toMs: BASE_TS + 2 * MINUTE_MS,
    missingMinutes: 3,
    ...overrides,
  };
}

function candle(t: number, c = 2400) {
  return {
    symbol: 'XAUUSD',
    tf: '1m' as const,
    t,
    o: c,
    h: c + 1,
    l: c - 1,
    c,
    v: null,
    source: 'biquote',
    fetchedAt: BASE_TS,
  };
}

beforeEach(() => {
  dataMock.getCandlesWithMeta.mockReset();
});

describe('fetchGapBars (R9)', () => {
  it('returns only in-range provider bars, tagged as backfilled', async () => {
    dataMock.getCandlesWithMeta.mockResolvedValue({
      candles: [
        // Before the gap (the previous bar) and after it (the new bar) —
        // both must be filtered out.
        candle(BASE_TS - MINUTE_MS, 2399),
        candle(BASE_TS, 2400),
        candle(BASE_TS + MINUTE_MS, 2401),
        candle(BASE_TS + 2 * MINUTE_MS, 2402),
        candle(BASE_TS + 3 * MINUTE_MS, 2403),
      ],
      stale: false,
      producedAt: BASE_TS,
    });

    const result = await fetchGapBars({ gap: gap(), log });

    expect(result.status).toBe('ok');
    expect(result.bars.map((bar) => bar.t)).toEqual([
      BASE_TS,
      BASE_TS + MINUTE_MS,
      BASE_TS + 2 * MINUTE_MS,
    ]);
    expect(result.bars[0]).toMatchObject({
      symbol: 'XAUUSD',
      tickVolume: 0,
      source: 'biquote-backfill',
      c: 2400,
    });
    // The range request excludes the still-open bar.
    expect(dataMock.getCandlesWithMeta).toHaveBeenCalledWith(
      'XAUUSD',
      '1m',
      expect.objectContaining({
        from: new Date(BASE_TS).toISOString(),
        to: new Date(BASE_TS + 3 * MINUTE_MS - 1).toISOString(),
        includeOpenBar: false,
      }),
    );
  });

  it('reports a partial answer without padding the gap', async () => {
    dataMock.getCandlesWithMeta.mockResolvedValue({
      candles: [candle(BASE_TS, 2400)],
      stale: false,
      producedAt: BASE_TS,
    });

    const result = await fetchGapBars({ gap: gap(), log });

    expect(result.status).toBe('partial');
    expect(result.bars).toHaveLength(1);
    expect(result.missingMinutes).toBe(3);
  });

  it('reports no-data when the provider has nothing inside the range', async () => {
    dataMock.getCandlesWithMeta.mockResolvedValue({
      candles: [candle(BASE_TS + 10 * MINUTE_MS, 2400)],
      stale: false,
      producedAt: BASE_TS,
    });

    const result = await fetchGapBars({ gap: gap(), log });

    expect(result.status).toBe('no-data');
    expect(result.bars).toEqual([]);
  });

  it('reports a gap longer than the cap without asking a provider', async () => {
    const result = await fetchGapBars({
      gap: gap({ missingMinutes: MAX_GAP_BACKFILL_MINUTES + 1 }),
      log,
    });

    expect(result.status).toBe('cap-exceeded');
    expect(result.bars).toEqual([]);
    expect(dataMock.getCandlesWithMeta).not.toHaveBeenCalled();
  });

  it('does not fetch an FX gap that ends inside the weekend', async () => {
    const result = await fetchGapBars({
      gap: gap({ fromMs: SATURDAY_TS - 2 * MINUTE_MS, toMs: SATURDAY_TS }),
      log,
    });

    expect(result.status).toBe('market-closed');
    expect(result.bars).toEqual([]);
    expect(dataMock.getCandlesWithMeta).not.toHaveBeenCalled();
  });

  it('still fetches a crypto gap inside the weekend', async () => {
    dataMock.getCandlesWithMeta.mockResolvedValue({
      candles: [
        { ...candle(SATURDAY_TS, 65000), symbol: 'BTCUSDT', source: 'binance' },
        { ...candle(SATURDAY_TS + MINUTE_MS, 65010), symbol: 'BTCUSDT', source: 'binance' },
      ],
      stale: false,
      producedAt: SATURDAY_TS,
    });

    const result = await fetchGapBars({
      gap: {
        symbol: 'BTCUSDT',
        fromMs: SATURDAY_TS,
        toMs: SATURDAY_TS + MINUTE_MS,
        missingMinutes: 2,
      },
      log,
    });

    expect(result.status).toBe('ok');
    expect(result.bars.map((bar) => bar.source)).toEqual(['binance-backfill', 'binance-backfill']);
  });

  it('reports a provider failure instead of throwing', async () => {
    dataMock.getCandlesWithMeta.mockRejectedValue(new Error('upstream down'));

    const result = await fetchGapBars({ gap: gap(), log });

    expect(result.status).toBe('error');
    expect(result.bars).toEqual([]);
    expect(result.detail).toContain('upstream down');
  });
});
