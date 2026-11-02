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

// get_price tool tests. R8 (audit 2026-10-31): the tool reads the
// meta-returning adapter getter, so these mocks must supply `PriceResult`
// envelopes and the assertions cover the freshness disclosure.
//
// P2-01 removal: the AI SDK shim is gone; this suite now exercises the
// canonical execute core that the native Mastra registration runs.

import type * as DataModule from '@kestrel/data';
import type { PriceResult } from '@kestrel/data';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CanonicalPriceInputSchema } from '../src/mastra-v2/tools/canonical/input-schemas';
import { executeCanonicalPrice } from '../src/mastra-v2/tools/canonical/price';

const exec = executeCanonicalPrice as unknown as (input: { symbols: string[] }) => Promise<{
  ticks: unknown[];
  asOf: string;
  freshness?: Array<{
    symbol: string;
    source: string;
    stale: boolean;
    producedAt: number;
    ageSeconds: number | null;
  }>;
  warnings?: string[];
}>;

const mockGetPrice = vi.fn();

vi.mock('@kestrel/data', async (importOriginal) => {
  const actual = await importOriginal<typeof DataModule>();
  return { ...actual, getPrice: (...args: unknown[]) => mockGetPrice(...args) };
});

function quote(
  overrides: { bid?: number; ask?: number; mid?: number; source?: string } = {},
  meta: Partial<PriceResult> = {},
): PriceResult {
  const bid = overrides.bid ?? 1.08;
  const ask = overrides.ask ?? 1.0802;
  const mid = overrides.mid ?? 1.0801;
  return {
    tick: {
      symbol: 'EURUSD',
      bid,
      ask,
      mid,
      ts: Date.now(),
      source: overrides.source ?? 'biquote',
    },
    stale: false,
    producedAt: Date.now(),
    ageMs: 250,
    ...meta,
  } as PriceResult;
}

describe('get_price — Phase 0.10', () => {
  beforeEach(() => {
    mockGetPrice.mockReset();
  });

  it('returns ticks for a single symbol', async () => {
    mockGetPrice.mockResolvedValue(quote());

    const result = await exec({ symbols: ['EURUSD'] });

    expect(result.ticks).toHaveLength(1);
    expect((result.ticks[0] as { bid: number; mid: number }).bid).toBe(1.08);
    expect((result.ticks[0] as { bid: number; mid: number }).mid).toBe(1.0801);
  });

  it('returns ticks for multiple symbols', async () => {
    mockGetPrice
      .mockResolvedValueOnce(quote())
      .mockResolvedValueOnce(quote({ bid: 2395, ask: 2395.1, mid: 2395.05 }));

    const result = await exec({ symbols: ['EURUSD', 'XAUUSD'] });

    expect(result.ticks).toHaveLength(2);
    expect(mockGetPrice).toHaveBeenCalledTimes(2);
    expect(mockGetPrice).toHaveBeenCalledWith('EURUSD', {});
    expect(mockGetPrice).toHaveBeenCalledWith('XAUUSD', {});
  });

  it('wraps ProviderError in a user-friendly message', async () => {
    const { ProviderError } = await import('@kestrel/data');
    mockGetPrice.mockRejectedValue(
      new ProviderError('PROVIDER_TIMEOUT', 'biquote', 'connection refused'),
    );

    await expect(exec({ symbols: ['EURUSD'] })).rejects.toThrow(
      "Couldn't price EURUSD: connection refused",
    );
  });

  it('re-throws non-ProviderError exceptions', async () => {
    mockGetPrice.mockRejectedValue(new TypeError('unexpected type'));

    await expect(exec({ symbols: ['EURUSD'] })).rejects.toThrow(TypeError);
  });

  it('returns an ISO timestamp asOf the price fetch', async () => {
    const before = new Date().toISOString();
    mockGetPrice.mockResolvedValue(quote());

    const result = await exec({ symbols: ['EURUSD'] });

    expect(result.asOf).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    // Must be at or after the captured "before" moment.
    expect(result.asOf >= before).toBe(true);
  });

  it('surfaces per-symbol freshness so the model can disclose it (R8)', async () => {
    mockGetPrice.mockResolvedValue(quote({ source: 'finnhub' }));

    const result = await exec({ symbols: ['EURUSD'] });

    expect(result.freshness).toEqual([
      {
        symbol: 'EURUSD',
        source: 'finnhub',
        stale: false,
        producedAt: expect.any(Number),
        ageSeconds: expect.any(Number),
      },
    ]);
    // A fresh quote carries no warning.
    expect(result.warnings).toEqual([]);
  });

  it('flags a stale cache fallback with a warning line (R8)', async () => {
    mockGetPrice.mockResolvedValue(quote({ source: 'biquote' }, { stale: true, ageMs: 12_000 }));

    const result = await exec({ symbols: ['EURUSD'] });

    expect(result.freshness?.[0]?.stale).toBe(true);
    expect(result.warnings?.[0]).toMatch(/served from a stale cache/);
    expect(result.warnings?.[0]).toMatch(/EURUSD/);
  });

  it('flags an over-age quote without a stale flag (R8)', async () => {
    mockGetPrice.mockResolvedValue(quote({ source: 'finnhub' }, { ageMs: 5 * 60_000 }));

    const result = await exec({ symbols: ['EURUSD'] });

    expect(result.freshness?.[0]?.stale).toBe(false);
    expect(result.warnings?.[0]).toMatch(/not live/);
  });

  it('validates input schema — min 1 symbol', () => {
    expect(CanonicalPriceInputSchema.safeParse({ symbols: [] }).success).toBe(false);
  });

  it('validates input schema — max canonical catalog size', () => {
    const schema = CanonicalPriceInputSchema;
    const canonicalSymbols = [
      'XAUUSD',
      'EURUSD',
      'GBPUSD',
      'USDJPY',
      'AUDUSD',
      'USDCAD',
      'NZDUSD',
      'USDCHF',
      'EURGBP',
      'EURJPY',
      'GBPJPY',
      'AUDJPY',
      'BTCUSDT',
      'ETHUSDT',
      'SOLUSDT',
      'BNBUSDT',
      'XRPUSDT',
      'ADAUSDT',
    ];
    expect(schema.safeParse({ symbols: canonicalSymbols }).success).toBe(true);
    expect(schema.safeParse({ symbols: [...canonicalSymbols, 'XAUUSD'] }).success).toBe(false);
  });

  it('normalizes aliases and rejects unknown symbols', () => {
    const schema = CanonicalPriceInputSchema as unknown as {
      safeParse: (v: unknown) => { success: boolean; data?: { symbols: string[] } };
    };
    // BTCUSD is a supported catalog alias for the canonical BTCUSDT ticker.
    const aliased = schema.safeParse({ symbols: ['BTCUSD'] });
    expect(aliased.success).toBe(true);
    expect(aliased.data?.symbols[0]).toBe('BTCUSDT');
    expect(schema.safeParse({ symbols: ['INVALID'] }).success).toBe(false);
  });

  it('calls getPrice for each symbol in parallel', async () => {
    let resolveSecond: (v: unknown) => void;
    const secondPromise = new Promise<unknown>((resolve) => {
      resolveSecond = resolve;
    });
    mockGetPrice.mockResolvedValueOnce(quote()).mockReturnValueOnce(secondPromise);

    // Fire the call but don't await yet—it should start both concurrently.
    const resultPromise = exec({ symbols: ['EURUSD', 'GBPUSD'] });

    // Resolve the delayed second call.
    resolveSecond!(quote({ bid: 1.27, ask: 1.2702, mid: 1.2701 }));

    const result = await resultPromise;
    expect(result.ticks).toHaveLength(2);
  });
});
