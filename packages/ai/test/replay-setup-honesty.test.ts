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

// R8 (audit 2026-10-31): `replay_setup` used to record `rMultiple: 0` when the
// entry-to-stop distance was zero, and it returned `hitRate: 0` / `avgR: 0` /
// `totalR: 0` when nothing had been scored. A fabricated 0R or 0% hit rate is
// accepted by the numeric evidence gate as a measured result. This suite
// proves the unscored case yields nulls (and no exact 0 in those fields),
// while the normal path still returns real numbers.

import { getCandlesUnchecked } from '@kestrel/data';
import type * as IndicatorsModule from '@kestrel/indicators';
import { ReplaySetupOutputSchema, type Candle } from '@kestrel/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { extractNumbersFromToolOutput } from '../src/committee/grounding';
import { replaySetupTool } from '../src/tools/replay-setup';

const mocks = vi.hoisted(() => ({ zeroAtr: false }));

vi.mock('@kestrel/data', () => ({
  getCandlesUnchecked: vi.fn(),
}));

// Force ATR(14) to 0 to reach the unscored-trade path deterministically;
// every other test in this file runs the real indicator math.
vi.mock('@kestrel/indicators', async (importOriginal) => {
  const actual = await importOriginal<typeof IndicatorsModule>();
  return {
    ...actual,
    atr: (candles: Candle[], period = 14) =>
      mocks.zeroAtr ? candles.map(() => 0) : actual.atr(candles, period),
  };
});

const exec = replaySetupTool.execute as unknown as (input: unknown) => Promise<{
  count: number;
  wins: number;
  losses: number;
  hitRate: number | null;
  avgR: number | null;
  totalR: number | null;
  trades: Array<{ rMultiple: number | null; reason: 'tp' | 'sl' | 'time' }>;
  notes: string;
}>;

function bar(o: number, h: number, l: number, c: number, t: number): Candle {
  return { symbol: 'EURUSD', tf: '1h', t, o, h, l, c, v: null, source: 'test', fetchedAt: 0 };
}

/** Declining then sharply rising series: fast EMA crosses above slow. */
function crossingSeries(): Candle[] {
  const seq: Candle[] = [];
  let t = 1_700_000_000_000;
  for (let i = 0; i < 60; i += 1) {
    const c = 1.1 - i * 0.0005;
    seq.push(bar(c, c + 0.0001, c - 0.0001, c, t));
    t += 60 * 60_000;
  }
  for (let i = 0; i < 20; i += 1) {
    const c = 1.07 + i * 0.001;
    seq.push(bar(c, c + 0.001, c - 0.00005, c, t));
    t += 60 * 60_000;
  }
  for (let i = 0; i < 10; i += 1) {
    const c = 1.09 + i * 0.0005;
    seq.push(bar(c, c + 0.001, c - 0.00005, c, t));
    t += 60 * 60_000;
  }
  return seq;
}

const INPUT = {
  symbol: 'EURUSD',
  tf: '1h',
  windowBars: 90,
  rule: { kind: 'ema_cross', fast: 5, slow: 20, side: 'long' },
  // ATR-based exits so zeroing ATR below reaches the unscored-trade path.
  exit: { unit: 'atr', stopMult: 1.5, targetMult: 2, maxBars: 30 },
};

afterEach(() => {
  mocks.zeroAtr = false;
  vi.mocked(getCandlesUnchecked).mockReset();
});

describe('replay_setup — fabricated 0R and 0% hit rate are gone (R8)', () => {
  it('returns null rates and null stopless R when there are no candles', async () => {
    vi.mocked(getCandlesUnchecked).mockResolvedValueOnce([] as Candle[]);
    const output = await exec(INPUT);

    expect(output.count).toBe(0);
    expect(output.hitRate).toBeNull();
    expect(output.avgR).toBeNull();
    expect(output.totalR).toBeNull();
    expect(output.notes).toMatch(/insufficient candles/i);
    expect(ReplaySetupOutputSchema.safeParse(output).success).toBe(true);
  });

  it('reports null rates when trades fire but no trade has a measurable risk', async () => {
    mocks.zeroAtr = true;
    vi.mocked(getCandlesUnchecked).mockResolvedValueOnce(crossingSeries());
    const output = await exec(INPUT);

    expect(output.count).toBeGreaterThan(0);
    expect(output.trades.length).toBeGreaterThan(0);
    expect(output.trades.every((t) => t.rMultiple === null)).toBe(true);
    expect(output.wins).toBe(0);
    expect(output.losses).toBe(0);
    expect(output.hitRate).toBeNull();
    expect(output.avgR).toBeNull();
    expect(output.totalR).toBeNull();
    expect(output.notes).toMatch(/no measurable risk distance|unavailable/i);

    // None of the aggregate fields can ground an "avg 0R / 0% hit rate" claim.
    const evidence = extractNumbersFromToolOutput({
      hitRate: output.hitRate,
      avgR: output.avgR,
      totalR: output.totalR,
    });
    expect(evidence).not.toContain(0);
    expect(ReplaySetupOutputSchema.safeParse(output).success).toBe(true);
  });

  it('still reports real rates when trades can be scored', async () => {
    vi.mocked(getCandlesUnchecked).mockResolvedValueOnce(crossingSeries());
    const output = await exec(INPUT);

    expect(output.count).toBeGreaterThan(0);
    expect(output.trades.some((t) => t.rMultiple !== null)).toBe(true);
    expect(output.hitRate).not.toBeNull();
    expect(output.avgR).not.toBeNull();
    expect(output.totalR).not.toBeNull();
  });
});
