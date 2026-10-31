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

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  maxBarsFromNotes,
  resolveMaxBars,
  resolveTrailingDistance,
  resolveValidBars,
} from '../src/strategy-parity';
import { evaluateLatestStrategySignal } from '../src/strategy-runner';

const mocks = vi.hoisted(() => ({ getCandles: vi.fn() }));

vi.mock('@kestrel/data', () => ({
  getCandles: mocks.getCandles,
}));

const SOURCE = `
function getSignal(ctx) {
  if (ctx.i !== ctx.bars - 1) return null;
  const p = ctx.price(0).close;
  return { side: 'long', stop: p * 0.99, target: p * 1.02, reason: 'last-bar smoke' };
}
`;

function candles(count: number) {
  const now = Date.now();
  const barMs = 60 * 60 * 1000;
  return Array.from({ length: count }, (_, index) => {
    const close = 2000 + index * 0.5;
    return {
      t: now - (count - index + 2) * barMs,
      o: close - 0.2,
      h: close + 1,
      l: close - 1,
      c: close,
      v: 100,
      source: 'fixture',
      fetchedAt: now,
    };
  });
}

describe('paper strategy runner', () => {
  beforeEach(() => {
    mocks.getCandles.mockReset();
    mocks.getCandles.mockResolvedValue(candles(320));
  });

  it('evaluates the latest closed bar inside the shared sandbox', async () => {
    const result = await evaluateLatestStrategySignal({
      symbol: 'XAUUSD',
      timeframe: '1h',
      source: SOURCE,
      params: {},
    });
    expect(result.candleCount).toBeGreaterThanOrEqual(300);
    expect(result.signal?.side).toBe('long');
    expect(result.signal?.stop).toBeGreaterThan(0);
    expect(result.barTime).toBeGreaterThan(0);
  });

  it('returns no signal when the strategy stays flat', async () => {
    const result = await evaluateLatestStrategySignal({
      symbol: 'XAUUSD',
      timeframe: '1h',
      source: 'function getSignal() { return null; }',
      params: {},
    });
    expect(result.signal).toBeNull();
  });

  it('translates limit entry, ATR trailing stop, and breakEvenAtR from getSignal into the paper order', async () => {
    const result = await evaluateLatestStrategySignal({
      symbol: 'XAUUSD',
      timeframe: '1h',
      source: `
        function getSignal(ctx) {
          if (ctx.i !== ctx.bars - 1) return null;
          return {
            side: 'long',
            entry: ctx.close - 5,
            stop: ctx.close - 15,
            target: ctx.close + 25,
            breakEvenAtR: 1.5,
            trailing: { type: 'atr', value: 2 },
            validBars: 4,
            maxBars: 12,
          };
        }
      `,
      params: {},
    });

    expect(result.signal?.entry).toBeTypeOf('number');
    expect(result.latestAtr).toBeGreaterThan(0);
    expect(result.latestClose).toBeGreaterThan(0);
    expect(result.signal?.trailing).toEqual({ type: 'atr', value: 2 });
    expect(result.signal?.breakEvenAtR).toBe(1.5);
    expect(result.signal?.validBars).toBe(4);
    expect(result.signal?.maxBars).toBe(12);
  });
});

describe('paper strategy parity helpers', () => {
  it('translates atr, percent and fixed trailing modes into price distances', () => {
    expect(resolveTrailingDistance({ trailing: { type: 'atr', value: 2 } }, 3.5, 2000)).toBe(7);
    expect(resolveTrailingDistance({ trailing: { type: 'percent', value: 1 } }, null, 2000)).toBe(
      20,
    );
    expect(resolveTrailingDistance({ trailing: { type: 'fixed', value: 12.5 } }, null, 2000)).toBe(
      12.5,
    );
    // Without a usable ATR an `atr` trailing stop cannot be translated.
    expect(
      resolveTrailingDistance({ trailing: { type: 'atr', value: 2 } }, null, 2000),
    ).toBeUndefined();
    expect(resolveTrailingDistance({}, 5, 2000)).toBeUndefined();
  });

  it('reads and defaults the maxBars time stop and validBars expiry', () => {
    expect(maxBarsFromNotes('Deployed strategy: X [run:1] [maxBars:12]')).toBe(12);
    expect(maxBarsFromNotes('Deployed strategy: X')).toBe(100);
    expect(maxBarsFromNotes(null)).toBe(100);
    expect(resolveMaxBars(undefined)).toBe(100);
    expect(resolveMaxBars(12.6)).toBe(13);
    expect(resolveMaxBars(0)).toBe(1);
    expect(resolveValidBars(undefined)).toBe(5);
    expect(resolveValidBars(0)).toBe(1);
    expect(resolveValidBars(900)).toBe(500);
  });
});
