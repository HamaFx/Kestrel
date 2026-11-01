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

// Durable hand-off tests (R9, audit 2026-10-31). The rig tests drive this
// through `createCandleFlushRig`; these pin the three outcomes directly so
// the last-resort logging is covered on its own.

import { describe, expect, it, vi } from 'vitest';

import type { Candle1mBar } from '../src/aggregator/candle-1m';
import { handOffBar } from '../src/bootstrap/candle-queue';
import type { Logger } from '../src/log';

const BAR: Candle1mBar = {
  symbol: 'XAUUSD',
  t: 1_700_000_000_000,
  o: 2390,
  h: 2391,
  l: 2389,
  c: 2390.5,
  v: null,
  tickVolume: 47,
  source: 'biquote-signalr',
};

function makeLogger() {
  const lines: Array<{ level: string; msg: string; meta: Record<string, unknown> }> = [];
  const logger = {
    info: vi.fn(),
    warn: (msg: string, meta?: Record<string, unknown>) =>
      lines.push({ level: 'warn', msg, meta: meta ?? {} }),
    error: (msg: string, meta?: Record<string, unknown>) =>
      lines.push({ level: 'error', msg, meta: meta ?? {} }),
    with: () => logger,
  } as unknown as Logger;
  return { logger, lines };
}

describe('handOffBar (R9)', () => {
  it('reports the bar as queued and logs the reason', async () => {
    const { logger, lines } = makeLogger();
    const enqueue = vi.fn(async () => true);

    const outcome = await handOffBar({
      bar: BAR,
      reason: 'flush-failed',
      cause: new Error('db down'),
      timeoutMs: 2_000,
      enqueue,
      log: logger,
    });

    expect(outcome).toEqual({ status: 'queued' });
    expect(enqueue).toHaveBeenCalledWith(BAR, 'flush-failed');
    expect(lines).toHaveLength(1);
    expect(lines[0]?.msg).toBe('candle bar queued for durable replay');
    expect(lines[0]?.meta).toMatchObject({ reason: 'flush-failed', err: 'Error: db down' });
  });

  it('logs the full payload and reports the reason when the queue refuses', async () => {
    const { logger, lines } = makeLogger();
    const enqueue = vi.fn(async () => false);

    const outcome = await handOffBar({
      bar: BAR,
      reason: 'shutdown',
      cause: undefined,
      timeoutMs: 2_000,
      enqueue,
      log: logger,
    });

    expect(outcome).toEqual({ status: 'dropped', reason: 'durable queue refused' });
    const lost = lines.find((line) => line.msg.includes('candle bar LOST'));
    expect(lost?.level).toBe('error');
    expect(lost?.meta).toMatchObject({
      symbol: 'XAUUSD',
      o: 2390,
      h: 2391,
      l: 2389,
      c: 2390.5,
      tickVolume: 47,
      source: 'biquote-signalr',
      reason: 'shutdown',
      lastError: 'durable queue refused',
    });
  });

  it('times out a hung queue insert, floored so a slow pool is still given time', async () => {
    const { logger, lines } = makeLogger();
    const enqueue = vi.fn(() => new Promise<boolean>(() => {}));

    const startedAt = Date.now();
    const outcome = await handOffBar({
      bar: BAR,
      reason: 'flush-failed',
      cause: undefined,
      timeoutMs: 0,
      enqueue,
      log: logger,
    });

    expect(outcome).toEqual({ status: 'dropped', reason: 'durable queue hand-off timed out' });
    // The configured cap is floored at 250ms, so a 0ms cap cannot abandon
    // the bar instantly.
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(200);
    expect(lines[0]?.meta).toMatchObject({ lastError: 'durable queue hand-off timed out' });
  });

  it('reports a thrown enqueue error verbatim', async () => {
    const { logger } = makeLogger();
    const enqueue = vi.fn(async () => {
      throw new Error('queue unavailable');
    });

    const outcome = await handOffBar({
      bar: BAR,
      reason: 'flush-failed',
      cause: undefined,
      timeoutMs: 2_000,
      enqueue,
      log: logger,
    });

    expect(outcome).toEqual({ status: 'dropped', reason: 'Error: queue unavailable' });
  });
});
