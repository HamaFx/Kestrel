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

// R13 (audit 2026-10-31): model-supplied price levels are bounded against the
// live market before any write. These tests cover the shared band helper:
// out-of-band rejection with a reason, a legitimate wide stop passing, and
// the fail-closed path when the market cannot be read.

import type * as KestrelData from '@kestrel/data';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ALERT_LEVEL_BAND_MULTIPLIER,
  checkLevelsAgainstMarket,
  LEVEL_CHECK_MAX_QUOTE_AGE_SECONDS,
  levelBandFor,
  marketDistanceTolerance,
  TRADE_LEVEL_BAND_MULTIPLIER,
} from '../src/mastra-v2/mutation/level-sanity';

const mockGetPrice = vi.hoisted(() => vi.fn());

vi.mock('@kestrel/data', async (importOriginal) => {
  const actual = await importOriginal<typeof KestrelData>();
  return {
    ...actual,
    getPrice: (...args: unknown[]) => mockGetPrice(...args),
  };
});

function quote(overrides: { mid?: number; stale?: boolean; ageMs?: number; producedAt?: number }) {
  const mid = overrides.mid ?? 4000;
  return {
    tick: {
      symbol: 'XAUUSD',
      bid: mid - 0.1,
      ask: mid + 0.1,
      mid,
      ts: Date.now(),
      source: 'test',
    },
    stale: overrides.stale ?? false,
    producedAt: overrides.producedAt ?? Date.now(),
    ageMs: overrides.ageMs ?? 0,
  };
}

describe('levelBandFor', () => {
  it('scales the band with the instrument volatility, not a flat percentage', () => {
    const gold = levelBandFor('XAUUSD', 4000);
    const fx = levelBandFor('EURUSD', 1.08);

    expect(gold.band).toBe(marketDistanceTolerance('XAUUSD', 4000) * TRADE_LEVEL_BAND_MULTIPLIER);
    expect(fx.band).toBe(marketDistanceTolerance('EURUSD', 1.08) * TRADE_LEVEL_BAND_MULTIPLIER);
    // Percent-of-price bands differ per instrument (gold ~15%, FX ~20%).
    expect(gold.band / 4000).toBeCloseTo(0.15, 5);
    expect(fx.band / 1.08).toBeCloseTo(0.2, 5);
  });

  it('gives alert levels a wider band than trade levels', () => {
    const trade = levelBandFor('XAUUSD', 4000, 'trade');
    const alert = levelBandFor('XAUUSD', 4000, 'alert');
    expect(alert.band).toBeGreaterThan(trade.band);
    expect(alert.band).toBe(
      Math.min(marketDistanceTolerance('XAUUSD', 4000) * ALERT_LEVEL_BAND_MULTIPLIER, 4000 * 0.95),
    );
  });

  it('caps the band so the lower edge stays positive for volatile instruments', () => {
    const btc = levelBandFor('BTCUSD', 100_000, 'alert');
    expect(btc.lower).toBeGreaterThanOrEqual(0);
    expect(btc.band).toBeLessThanOrEqual(100_000 * 0.95);
  });
});

describe('checkLevelsAgainstMarket', () => {
  beforeEach(() => {
    mockGetPrice.mockReset();
  });

  it('rejects a level far outside the band with a reason naming the field and range', async () => {
    mockGetPrice.mockResolvedValue(quote({ mid: 4000 }));

    const result = await checkLevelsAgainstMarket({
      symbol: 'XAUUSD',
      levels: [
        { name: 'entry', value: 999_999 },
        { name: 'stop', value: 3900 },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('level_out_of_band');
    expect(result.message).toContain('entry 999999.00');
    expect(result.message).toContain('outside 3400.00 to 4600.00');
    expect(result.message).toContain('live mid 4000.00');
    expect(result.message).toContain('Nothing was saved');
  });

  it('accepts a legitimate wide stop inside the band', async () => {
    mockGetPrice.mockResolvedValue(quote({ mid: 4000 }));

    // A 9% swing stop (360 points on gold) is wider than the soft
    // `verify_call` tolerance but well inside the hard plausibility band.
    const result = await checkLevelsAgainstMarket({
      symbol: 'XAUUSD',
      levels: [
        { name: 'entry', value: 4000 },
        { name: 'stop', value: 3640 },
        { name: 'target', value: 4400 },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mid).toBe(4000);
    expect(result.band).toBe(600);
  });

  it('accepts a forward-looking alert level inside the wider alert band', async () => {
    mockGetPrice.mockResolvedValue(quote({ mid: 4000 }));

    const result = await checkLevelsAgainstMarket({
      symbol: 'XAUUSD',
      levels: [{ name: 'level', value: 3300 }],
      band: 'alert',
    });

    expect(result.ok).toBe(true);
  });

  it('fails closed when the market price cannot be fetched', async () => {
    mockGetPrice.mockRejectedValue(new Error('provider down'));

    const result = await checkLevelsAgainstMarket({
      symbol: 'XAUUSD',
      levels: [{ name: 'entry', value: 4000 }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('market_data_unavailable');
    expect(result.message).toContain('market data is unavailable');
    expect(result.message).toContain('draft was kept');
  });

  it('fails closed on a stale quote', async () => {
    mockGetPrice.mockResolvedValue(quote({ mid: 4000, stale: true }));

    const result = await checkLevelsAgainstMarket({
      symbol: 'XAUUSD',
      levels: [{ name: 'entry', value: 4000 }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('market_data_unavailable');
    expect(result.message).toContain('too old');
  });

  it('fails closed on a quote older than the freshness gate', async () => {
    mockGetPrice.mockResolvedValue(
      quote({
        mid: 4000,
        ageMs: (LEVEL_CHECK_MAX_QUOTE_AGE_SECONDS + 30) * 1000,
      }),
    );

    const result = await checkLevelsAgainstMarket({
      symbol: 'XAUUSD',
      levels: [{ name: 'entry', value: 4000 }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('market_data_unavailable');
  });

  it('fails closed on a fabricated (non-finite) mid', async () => {
    mockGetPrice.mockResolvedValue(quote({ mid: Number.NaN }));

    const result = await checkLevelsAgainstMarket({
      symbol: 'XAUUSD',
      levels: [{ name: 'entry', value: 4000 }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('market_data_unavailable');
  });

  it('rejects a non-finite or non-positive level without touching the market', async () => {
    const result = await checkLevelsAgainstMarket({
      symbol: 'XAUUSD',
      levels: [{ name: 'entry', value: 0 }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('invalid_level');
    expect(mockGetPrice).not.toHaveBeenCalled();
  });
});
