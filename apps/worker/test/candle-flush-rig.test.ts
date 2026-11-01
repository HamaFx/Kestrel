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

// Closed-candle flush rig tests (R9, audit 2026-10-31):
//   - a failed write is retried, then handed to the durable queue;
//   - a write that never settles is queued on shutdown, not dropped;
//   - a bar is only counted as lost when the queue also fails;
//   - a multi-minute gap is backfilled from the provider-answered bars;
//   - a gap with no provider data is reported, never fabricated;
//   - a restart gap is detected against the newest persisted bar.

import type { DbClient } from '@kestrel/db';
import { describe, expect, it, vi } from 'vitest';

import type { Candle1mBar, CandleGap } from '../src/aggregator/candle-1m';
import { createCandleFlushRig, type CandleFlushRigOptions } from '../src/bootstrap/candle-flush';
import type { Logger } from '../src/log';
import type { GapBackfillResult } from '../src/persistence/candle-backfill';
import type { NormalizedTick } from '../src/signalr/consumer';

const MINUTE_MS = 60_000;
const BASE_MIN = 28_000_000; // arbitrary minute bucket
const BASE_TS = BASE_MIN * MINUTE_MS;

interface LogLine {
  level: 'info' | 'warn' | 'error';
  msg: string;
  meta: Record<string, unknown>;
}

function makeLogger(): { logger: Logger; lines: LogLine[] } {
  const lines: LogLine[] = [];
  const logger = {
    info: (msg: string, meta?: Record<string, unknown>) =>
      lines.push({ level: 'info', msg, meta: meta ?? {} }),
    warn: (msg: string, meta?: Record<string, unknown>) =>
      lines.push({ level: 'warn', msg, meta: meta ?? {} }),
    error: (msg: string, meta?: Record<string, unknown>) =>
      lines.push({ level: 'error', msg, meta: meta ?? {} }),
    with: () => logger,
  } as unknown as Logger;
  return { logger, lines };
}

function tick(mid: number, tsOffsetMs: number): NormalizedTick {
  return {
    symbol: 'XAUUSD',
    bid: mid - 0.05,
    ask: mid + 0.05,
    mid,
    ts: BASE_TS + tsOffsetMs,
    source: 'biquote-signalr',
  };
}

function makeBar(overrides: Partial<Candle1mBar> & { t: number }): Candle1mBar {
  return {
    symbol: 'XAUUSD',
    o: 2390,
    h: 2391,
    l: 2389,
    c: 2390.5,
    v: null,
    tickVolume: 0,
    source: 'biquote-backfill',
    ...overrides,
  };
}

/** The writer converts `t` to a Date for the timestamptz column. */
function toMs(t: unknown): number {
  return t instanceof Date ? t.getTime() : Number(t);
}

async function waitUntil(cond: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error('waitUntil timed out');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

interface FakeDbBehavior {
  /** Called per write attempt; return an Error to fail that attempt. */
  onInsert?: (row: Candle1mBar, attempt: number) => Error | null;
  /** Insert promises never settle (a hung connection pool). */
  hang?: boolean;
  /** Newest persisted candle returned by the restart-gap probe. */
  newest?: Date | null;
}

function makeFakeDb(behavior: FakeDbBehavior = {}) {
  const rows: Candle1mBar[] = [];
  let attempts = 0;
  let newestProbes = 0;

  const db = {
    insert: () => ({
      values: (row: Candle1mBar) => ({
        onConflictDoNothing: async () => {
          attempts += 1;
          if (behavior.hang) return new Promise<void>(() => {});
          const err = behavior.onInsert?.(row, attempts) ?? null;
          if (err) throw err;
          rows.push({ ...row, t: toMs(row.t) });
        },
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => {
              newestProbes += 1;
              return behavior.newest ? [{ t: behavior.newest }] : [];
            },
          }),
        }),
      }),
    }),
  };

  return {
    db: db as unknown as DbClient,
    rows,
    attempts: () => attempts,
    newestProbes: () => newestProbes,
  };
}

function makeRig(args: { db: DbClient; logger: Logger; options?: CandleFlushRigOptions }) {
  return createCandleFlushRig({
    db: args.db,
    log: args.logger,
    options: {
      retryDelaysMs: [1, 1],
      flushTimeoutMs: 100,
      shutdownGraceMs: 300,
      handOffTimeoutMs: 50,
      detectRestartGaps: false,
      ...args.options,
    },
  });
}

describe('candle flush rig (R9)', () => {
  it('retries a failed write with backoff and then succeeds without queueing', async () => {
    const { logger } = makeLogger();
    const fake = makeFakeDb({
      onInsert: (_row, attempt) => (attempt <= 2 ? new Error(`transient ${attempt}`) : null),
    });
    const enqueue = vi.fn<(bar: Candle1mBar, reason: string) => Promise<boolean>>(async () => true);
    const rig = makeRig({ db: fake.db, logger, options: { enqueueFailedBar: enqueue } });

    rig.aggregator.feed(tick(2390, 0));
    rig.aggregator.closeAll();
    const report = await rig.drain();

    expect(fake.attempts()).toBe(3);
    expect(fake.rows).toHaveLength(1);
    expect(fake.rows[0]).toMatchObject({ symbol: 'XAUUSD', t: BASE_TS, c: 2390 });
    expect(enqueue).not.toHaveBeenCalled();
    expect(rig.stats()).toMatchObject({
      written: 1,
      queued: 0,
      dropped: 0,
      writeAttempts: 3,
      lastError: null,
    });
    expect(report).toMatchObject({ written: 1, queued: 0, dropped: 0 });
  });

  it('hands the bar to the durable queue once the retries are exhausted', async () => {
    const { logger, lines } = makeLogger();
    const fake = makeFakeDb({ onInsert: () => new Error('db down') });
    const enqueue = vi.fn<(bar: Candle1mBar, reason: string) => Promise<boolean>>(async () => true);
    const rig = makeRig({ db: fake.db, logger, options: { enqueueFailedBar: enqueue } });

    rig.aggregator.feed(tick(2390, 0));
    rig.aggregator.closeAll();

    // Let the retry loop exhaust while the process is still running, so this
    // exercises the normal `flush-failed` hand-off, not the shutdown one.
    await waitUntil(() => rig.stats().queued === 1);

    expect(fake.attempts()).toBe(3);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0]?.[0]).toMatchObject({ symbol: 'XAUUSD', t: BASE_TS, c: 2390 });
    expect(enqueue.mock.calls[0]?.[1]).toBe('flush-failed');
    expect(rig.stats()).toMatchObject({ written: 0, queued: 1, dropped: 0 });
    expect(lines.some((line) => line.msg === 'candle bar queued for durable replay')).toBe(true);

    await rig.drain();
  });

  it('counts a bar as lost only when the write and the queue both fail', async () => {
    const { logger, lines } = makeLogger();
    const fake = makeFakeDb({ onInsert: () => new Error('db down') });
    const enqueue = vi.fn<(bar: Candle1mBar, reason: string) => Promise<boolean>>(
      async () => false,
    );
    const rig = makeRig({ db: fake.db, logger, options: { enqueueFailedBar: enqueue } });

    rig.aggregator.feed(tick(2390, 0));
    rig.aggregator.closeAll();
    await waitUntil(() => rig.stats().dropped === 1);

    expect(rig.stats()).toMatchObject({ written: 0, queued: 0, dropped: 1 });
    const lost = lines.find((line) => line.msg.includes('candle bar LOST'));
    expect(lost?.level).toBe('error');
    // The full bar is in the log so it can be reconstructed.
    expect(lost?.meta).toMatchObject({ symbol: 'XAUUSD', c: 2390, tickVolume: 1 });

    await rig.drain();
  });

  it('queues an in-flight write on shutdown instead of dropping it', async () => {
    const { logger, lines } = makeLogger();
    const fake = makeFakeDb({ hang: true });
    const enqueue = vi.fn<(bar: Candle1mBar, reason: string) => Promise<boolean>>(async () => true);
    const rig = makeRig({ db: fake.db, logger, options: { enqueueFailedBar: enqueue } });

    rig.aggregator.feed(tick(2390, 0));
    // The bar stays open (one tick). Shutdown closes it and must not lose it.
    const report = await rig.drain();

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0]?.[0]).toMatchObject({ symbol: 'XAUUSD', t: BASE_TS });
    expect(enqueue.mock.calls[0]?.[1]).toBe('shutdown');
    expect(rig.stats()).toMatchObject({ written: 0, queued: 1, dropped: 0, pending: 0 });
    expect(report).toMatchObject({ closed: 1, written: 0, queued: 1, dropped: 0, stillPending: 0 });
    const attempt = lines.find((line) => line.msg === 'flushClosedCandle attempt failed');
    expect(attempt?.meta).toMatchObject({ symbol: 'XAUUSD', attempt: 1 });
  });

  it('backfills a multi-minute gap through the durable write path', async () => {
    const { logger, lines } = makeLogger();
    const fake = makeFakeDb();
    const gaps: CandleGap[] = [];
    const fetchGapBars = vi.fn(async (gap: CandleGap): Promise<GapBackfillResult> => {
      gaps.push(gap);
      return {
        status: 'ok',
        missingMinutes: gap.missingMinutes,
        bars: [
          makeBar({ t: gap.fromMs, c: 2391 }),
          makeBar({ t: gap.fromMs + MINUTE_MS, c: 2392 }),
        ],
      };
    });
    const rig = makeRig({ db: fake.db, logger, options: { fetchGapBars } });

    // Minute 0, then a tick in minute 3: minutes 1 and 2 are missing.
    rig.aggregator.feed(tick(2390, 0));
    rig.aggregator.feed(tick(2395, 3 * MINUTE_MS + 1_000));
    rig.aggregator.closeAll();
    await rig.drain();

    expect(gaps).toEqual([
      {
        symbol: 'XAUUSD',
        fromMs: BASE_TS + MINUTE_MS,
        toMs: BASE_TS + 2 * MINUTE_MS,
        missingMinutes: 2,
      },
    ]);
    const backfilled = fake.rows.filter((row) => row.source === 'biquote-backfill');
    expect(backfilled.map((row) => row.t)).toEqual([BASE_TS + MINUTE_MS, BASE_TS + 2 * MINUTE_MS]);
    expect(backfilled.every((row) => row.tickVolume === 0)).toBe(true);
    expect(rig.stats()).toMatchObject({ backfilled: 2, backfillMisses: 0, gaps: 1, gapMinutes: 2 });
    expect(rig.stats().lastGap).toMatchObject({ fromMs: BASE_TS + MINUTE_MS, missingMinutes: 2 });
    expect(lines.some((line) => line.msg === 'candle gap detected')).toBe(true);
    expect(lines.some((line) => line.msg === 'candle gap backfilled')).toBe(true);
  });

  it('reports a gap instead of fabricating bars when the provider has no data', async () => {
    const { logger, lines } = makeLogger();
    const fake = makeFakeDb();
    const fetchGapBars = vi.fn(async (gap: CandleGap): Promise<GapBackfillResult> => ({
      status: 'no-data',
      bars: [],
      missingMinutes: gap.missingMinutes,
    }));
    const rig = makeRig({ db: fake.db, logger, options: { fetchGapBars } });

    rig.aggregator.feed(tick(2390, 0));
    rig.aggregator.feed(tick(2395, 4 * MINUTE_MS + 1_000));
    rig.aggregator.closeAll();
    await rig.drain();

    expect(fetchGapBars).toHaveBeenCalledTimes(1);
    const backfilled = fake.rows.filter((row) => row.source === 'biquote-backfill');
    expect(backfilled).toHaveLength(0);
    expect(rig.stats()).toMatchObject({ backfilled: 0, backfillMisses: 1, gaps: 1 });
    const miss = lines.find((line) => line.msg === 'candle gap not backfilled');
    expect(miss?.meta).toMatchObject({ status: 'no-data', missingMinutes: 3 });
  });

  it('persists backfilled bars that arrive during shutdown', async () => {
    const { logger } = makeLogger();
    const fake = makeFakeDb({ hang: true });
    const enqueue = vi.fn<(bar: Candle1mBar, reason: string) => Promise<boolean>>(async () => true);
    // The gap fetch resolves after the write grace window has closed, so the
    // backfilled bar must still be caught by the shutdown hand-off.
    const fetchGapBars = vi.fn(async (gap: CandleGap): Promise<GapBackfillResult> => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return {
        status: 'ok',
        missingMinutes: gap.missingMinutes,
        bars: [makeBar({ t: gap.fromMs })],
      };
    });
    const rig = makeRig({
      db: fake.db,
      logger,
      options: { enqueueFailedBar: enqueue, fetchGapBars, shutdownGraceMs: 100 },
    });

    rig.aggregator.feed(tick(2390, 0));
    rig.aggregator.feed(tick(2395, 3 * MINUTE_MS + 1_000)); // gap over minutes 1-2
    const report = await rig.drain();

    expect(fetchGapBars).toHaveBeenCalledTimes(1);
    // Both closed bars (the rollover and the bar closeAll() emits) plus the
    // backfilled bar are handed off rather than dropped.
    expect(enqueue).toHaveBeenCalledTimes(3);
    expect(enqueue.mock.calls.every((call) => call[1] === 'shutdown')).toBe(true);
    const queuedMinutes = enqueue.mock.calls.map((call) => call[0].t).sort((a, b) => a - b);
    expect(queuedMinutes).toEqual([BASE_TS, BASE_TS + MINUTE_MS, BASE_TS + 3 * MINUTE_MS]);
    expect(rig.stats()).toMatchObject({ queued: 3, dropped: 0, backfilled: 1, pending: 0 });
    expect(report.stillPending).toBe(0);
  });

  it('detects a restart gap against the newest persisted bar', async () => {
    const { logger, lines } = makeLogger();
    // The DB's newest bar is three minutes before the bar about to close.
    const fake = makeFakeDb({ newest: new Date(BASE_TS - 3 * MINUTE_MS) });
    const gaps: CandleGap[] = [];
    const fetchGapBars = vi.fn(async (gap: CandleGap): Promise<GapBackfillResult> => {
      gaps.push(gap);
      return { status: 'ok', missingMinutes: gap.missingMinutes, bars: [] };
    });
    const rig = makeRig({
      db: fake.db,
      logger,
      options: { fetchGapBars, detectRestartGaps: true },
    });

    rig.aggregator.feed(tick(2390, 0));
    rig.aggregator.feed(tick(2391, MINUTE_MS + 1_000));
    rig.aggregator.closeAll();
    await rig.drain();

    // Minutes BASE-2 and BASE-1 are missing between the persisted bar and
    // the closing bar; the probe runs once per symbol.
    expect(gaps).toEqual([
      {
        symbol: 'XAUUSD',
        fromMs: BASE_TS - 2 * MINUTE_MS,
        toMs: BASE_TS - MINUTE_MS,
        missingMinutes: 2,
      },
    ]);
    expect(fake.newestProbes()).toBe(1);
    expect(lines.some((line) => line.msg === 'candle gap detected')).toBe(true);
  });

  it('does not report a restart gap when the pipeline was already current', async () => {
    const { logger } = makeLogger();
    const fake = makeFakeDb({ newest: new Date(BASE_TS - MINUTE_MS) });
    const fetchGapBars = vi.fn(async (gap: CandleGap): Promise<GapBackfillResult> => ({
      status: 'ok',
      missingMinutes: gap.missingMinutes,
      bars: [],
    }));
    const rig = makeRig({
      db: fake.db,
      logger,
      options: { fetchGapBars, detectRestartGaps: true },
    });

    rig.aggregator.feed(tick(2390, 0));
    rig.aggregator.closeAll();
    await rig.drain();

    expect(fetchGapBars).not.toHaveBeenCalled();
    expect(rig.stats()).toMatchObject({ gaps: 0, gapMinutes: 0 });
    expect(fake.rows).toHaveLength(1);
  });
});
