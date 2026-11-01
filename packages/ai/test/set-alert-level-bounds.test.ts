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

/* eslint-disable @typescript-eslint/no-explicit-any */
// R13 (audit 2026-10-31): the direct `set_alert` tool path bounds a model-
// supplied price level against the live market, the same way the journal path
// bounds entry/stop/target. Alert levels are forward-looking, so the band is
// deliberately wide; only a value no market could print is refused. Refusal is
// a hard failure with a named reason and never a clamped substitute, and an
// unreadable market fails closed with nothing written.

import type * as KestrelData from '@kestrel/data';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createToolContext, withToolContext } from '../src/runtime/tool-context';
import { setAlertTool } from '../src/tools/set-alert';

const mockGetPrice = vi.hoisted(() => vi.fn());
const mocks = vi.hoisted(() => ({ createAlertMock: vi.fn() }));

vi.mock('@kestrel/data', async (importOriginal) => {
  const actual = await importOriginal<typeof KestrelData>();
  return {
    ...actual,
    getPrice: (...args: unknown[]) => mockGetPrice(...args),
  };
});

vi.mock('../src/alerts/persistence', () => ({
  createAlert: (...args: unknown[]) => mocks.createAlertMock(...args),
}));

function quote(mid: number) {
  return {
    tick: { symbol: 'XAUUSD', bid: mid - 0.1, ask: mid + 0.1, mid, ts: Date.now(), source: 'test' },
    stale: false,
    producedAt: Date.now(),
    ageMs: 0,
  };
}

function context() {
  return createToolContext({
    threadId: 'thread-1',
    userId: 'user-1',
    latestUserMessageText: 'Tell me when XAUUSD is above 2400.',
    budget: { spent: 0, max: 5 },
  });
}

function run(rule: Record<string, unknown>) {
  return withToolContext(context(), () =>
    Promise.resolve(
      setAlertTool.execute!({ rule, channels: ['email'], note: null } as any, {} as any),
    ),
  );
}

describe('set_alert tool — price level bounds (R13)', () => {
  beforeEach(() => {
    mockGetPrice.mockReset();
    mocks.createAlertMock.mockReset();
    mocks.createAlertMock.mockResolvedValue({ id: 'alert_1' });
  });

  it('refuses a level no market could print, naming field, value, range and mid', async () => {
    mockGetPrice.mockResolvedValue(quote(4000));

    const error = await run({
      type: 'priceCross',
      symbol: 'XAUUSD',
      level: 999_999,
      direction: 'above',
    }).catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'VALIDATION' });
    expect((error as Error).message).toContain('Alert not created');
    expect((error as Error).message).toContain('level 999999.00');
    expect((error as Error).message).toContain('outside 1000.00 to 7000.00');
    expect((error as Error).message).toContain('live mid 4000.00');
    // Never clamped, never written.
    expect(mocks.createAlertMock).not.toHaveBeenCalled();
  });

  it('accepts a legitimately distant but plausible alert level', async () => {
    mockGetPrice.mockResolvedValue(quote(4000));

    // Gold at 4,000: "tell me when it reaches 3,300" is a valid alert even
    // though the trade band would refuse that level as an entry.
    const result = await run({
      type: 'priceCross',
      symbol: 'XAUUSD',
      level: 3300,
      direction: 'below',
    });

    expect(result).toMatchObject({ alertId: 'alert_1' });
    expect(mocks.createAlertMock).toHaveBeenCalledWith(
      expect.objectContaining({ rule: expect.objectContaining({ level: 3300 }) }),
    );
  });

  it('applies the same check to candleClose rules', async () => {
    mockGetPrice.mockResolvedValue(quote(4000));

    const error = await run({
      type: 'candleClose',
      symbol: 'XAUUSD',
      tf: '1h',
      level: 0.0001,
      direction: 'below',
    }).catch((e: unknown) => e);

    expect((error as Error).message).toContain('Alert not created');
    expect((error as Error).message).toContain('level 0.00');
    expect(mocks.createAlertMock).not.toHaveBeenCalled();
  });

  it('fails closed when market data is unavailable and writes nothing', async () => {
    mockGetPrice.mockRejectedValue(new Error('provider down'));

    const error = await run({
      type: 'priceCross',
      symbol: 'XAUUSD',
      level: 2392,
      direction: 'above',
    }).catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'VALIDATION' });
    expect((error as Error).message).toContain('market data is unavailable');
    expect((error as Error).message).toContain('draft was kept');
    expect(mocks.createAlertMock).not.toHaveBeenCalled();
  });

  it('does not market-check indicator levels: an RSI threshold is not a price', async () => {
    const result = await run({
      type: 'indicatorCross',
      symbol: 'XAUUSD',
      tf: '1h',
      indicator: 'rsi:14',
      level: 30,
      direction: 'above',
    });

    expect(result).toMatchObject({ alertId: 'alert_1' });
    expect(mockGetPrice).not.toHaveBeenCalled();
    expect(mocks.createAlertMock).toHaveBeenCalledOnce();
  });

  it('keeps previously valid oscillator alerts working (negative MACD level)', async () => {
    const result = await run({
      type: 'indicatorCross',
      symbol: 'XAUUSD',
      tf: '1h',
      indicator: 'macd',
      level: -0.5,
      direction: 'above',
    });

    expect(result).toMatchObject({ alertId: 'alert_1' });
    expect(mockGetPrice).not.toHaveBeenCalled();
    expect(mocks.createAlertMock).toHaveBeenCalledOnce();
  });
});
