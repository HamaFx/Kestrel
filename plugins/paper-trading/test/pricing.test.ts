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

// R8 (audit 2026-10-31): cache freshness must reach the paper broker's
// tradability gate even when the provider reports no `quoteAgeSeconds`, and a
// zero/near-zero quote must be rejected rather than clamped to 1e-7.

import type { PriceResult } from '@kestrel/data';
import type { Tick } from '@kestrel/shared';
import { describe, expect, it } from 'vitest';

import { quotesFromTick } from '../src/domain/quotes';
import { isTickTradable, toMarketTick } from '../src/services/pricing';

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
  return {
    tick: tick(),
    stale: false,
    producedAt: Date.now(),
    ageMs: 250,
    ...overrides,
  };
}

describe('toMarketTick — cache freshness reaches the broker (R8)', () => {
  it('marks the market tick stale when the adapter served a stale cache entry', () => {
    const market = toMarketTick(tick(), priceResult({ stale: true }));

    expect(market.stale).toBe(true);
    expect(isTickTradable(market).ok).toBe(false);
  });

  it('derives quote age from the cache when the provider omitted quoteAgeSeconds', () => {
    const market = toMarketTick(
      tick(),
      priceResult({ producedAt: Date.now() - 400_000, ageMs: null }),
    );

    expect(market.quoteAgeSeconds).toBeGreaterThan(300);
    expect(isTickTradable(market).ok).toBe(false);
  });

  it('accepts a fresh quote with a small cache and provider age', () => {
    const market = toMarketTick(tick(), priceResult({ ageMs: 2_000, producedAt: Date.now() }));

    expect(market.stale).toBe(false);
    expect(isTickTradable(market).ok).toBe(true);
  });
});

describe('quotesFromTick — unusable prices are rejected, not clamped (R8)', () => {
  it('throws on an all-zero quote instead of returning a 1e-7 fill price', () => {
    expect(() =>
      quotesFromTick({ symbol: 'XAUUSD', bid: 0, ask: 0, mid: 0, ts: Date.now() }, 0.2),
    ).toThrow(/no usable price/);
  });

  it('throws on a non-finite price', () => {
    expect(() =>
      quotesFromTick(
        { symbol: 'XAUUSD', bid: Number.NaN, ask: Number.NaN, mid: Number.NaN, ts: Date.now() },
        0.2,
      ),
    ).toThrow(/no usable price/);
  });

  it('throws when a huge spread drives the bid non-positive', () => {
    expect(() =>
      quotesFromTick({ symbol: 'XAUUSD', bid: 100, ask: 100, mid: 100, ts: Date.now() }, 500),
    ).toThrow(/invalid bid\/ask/);
  });

  it('still synthesises a symmetric spread for a valid mid-only quote', () => {
    const quotes = quotesFromTick(
      { symbol: 'XAUUSD', bid: 2000, ask: 2000, mid: 2000, ts: Date.now() },
      0.2,
    );

    expect(quotes.bid).toBeCloseTo(1999.9, 6);
    expect(quotes.ask).toBeCloseTo(2000.1, 6);
  });
});

describe('isTickTradable — zero and non-finite prices (R8)', () => {
  it('rejects a quote with no positive finite price', () => {
    const result = isTickTradable({
      symbol: 'XAUUSD',
      bid: 0,
      ask: 0,
      mid: 0,
      ts: Date.now(),
    });

    expect(result.ok).toBe(false);
  });

  it('falls back to the bid/ask mid when the mid is zero but the sides are valid', () => {
    const result = isTickTradable({
      symbol: 'XAUUSD',
      bid: 2649,
      ask: 2651,
      mid: 0,
      ts: Date.now(),
    });

    expect(result.ok).toBe(true);
  });
});
