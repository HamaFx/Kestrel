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

// @vitest-environment node

import * as ai from '@kestrel/ai';
import * as data from '@kestrel/data';
import { describe, expect, it, vi } from 'vitest';

import { computeReplayWindow, getTradeSetupReplayService } from '@/lib/services/journal';

vi.mock('@kestrel/data', () => ({
  getCandles: vi.fn(),
}));

vi.mock('@kestrel/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kestrel/ai')>();
  return { ...actual, getEntry: vi.fn() };
});

describe('computeReplayWindow & getTradeSetupReplayService', () => {
  it('calculates from/to with 55-bar warmup and 20-bar post-close padding', () => {
    const openedAt = Date.parse('2026-08-12T10:00:00Z'); // Wednesday
    const closedAt = Date.parse('2026-08-12T14:00:00Z'); // 4h later (16 bars of 15m)
    const nowMs = Date.parse('2026-08-20T12:00:00Z');

    const win = computeReplayWindow(openedAt, closedAt, '15m', nowMs);
    expect(Date.parse(win.from)).toBeLessThanOrEqual(openedAt - 55 * 15 * 60_000);
    expect(Date.parse(win.to)).toBe(closedAt + 20 * 15 * 60_000);
    expect(win.count).toBeGreaterThanOrEqual(140);
    expect(win.count).toBeLessThanOrEqual(1000);
  });

  it('pads 48h when the warmup window crosses a weekend', () => {
    const mondayMorning = Date.parse('2026-08-10T02:00:00Z'); // Monday 02:00 UTC
    const mondayAfternoon = Date.parse('2026-08-10T10:00:00Z');
    const win = computeReplayWindow(mondayMorning, mondayAfternoon, '15m', mondayAfternoon + 3600_000);
    // 55 * 15m = 825m (13.75h) + 48h weekend pad
    expect(Date.parse(win.from)).toBe(mondayMorning - 55 * 15 * 60_000 - 48 * 3_600_000);
  });

  it('passes from and to to getCandles and falls back gracefully if historical range is empty', async () => {
    const openedAt = Date.parse('2026-06-10T10:00:00Z');
    const closedAt = Date.parse('2026-06-10T12:00:00Z');
    vi.mocked(ai.getEntry).mockResolvedValueOnce({
      id: 'entry-1',
      userId: 'u1',
      symbol: 'XAUUSD',
      side: 'long',
      entry: 2350,
      exit: 2365,
      stop: 2340,
      target: 2370,
      size: 1,
      notes: null,
      tags: [],
      screenshotUrl: null,
      attachments: [],
      openedAt,
      closedAt,
      outcome: 'win',
      rMultiple: 1.5,
      createdAt: openedAt,
      updatedAt: closedAt,
    });

    vi.mocked(data.getCandles)
      .mockRejectedValueOnce(new Error('empty candle response'))
      .mockResolvedValueOnce([
        {
          symbol: 'XAUUSD',
          tf: '15m',
          t: openedAt,
          o: 2350,
          h: 2368,
          l: 2348,
          c: 2365,
          v: null,
          source: 'biquote',
          fetchedAt: Date.now(),
        },
      ]);

    const res = await getTradeSetupReplayService({ userId: 'u1', id: 'entry-1', timeframe: '15m' });
    expect(res).not.toBeNull();
    expect(data.getCandles).toHaveBeenNthCalledWith(
      1,
      'XAUUSD',
      '15m',
      expect.objectContaining({ from: expect.any(String), to: expect.any(String) }),
    );
    expect(res?.stats.replayWindowFallback).toBe(true);
  });
});
