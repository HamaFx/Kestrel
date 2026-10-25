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
});
