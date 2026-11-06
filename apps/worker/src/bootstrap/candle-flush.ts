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

// Closed-candle flush rig: wires the 1m aggregator to persistence with a
// bounded write retry, a durable pg-boss hand-off, gap backfill, and shutdown
// draining.
//
// A closed bar is never fire-and-forget:
//   1. writeCandleBar retries the direct write (default 3 attempts).
//   2. When retries are exhausted, handOffBar sends the bar to the durable
//      `candle-flush` outbox queue. Writes are idempotent, so replay is safe.
//   3. Only when both the write and the queue fail is the bar logged as lost
//      with its full OHLC payload and counted.
//   4. drain() closes open bars, waits a bounded grace window, then queues
//      anything still unpersisted before shutdown.

import type { DbClient } from '@kestrel/db';

import { Candle1mAggregator, type Candle1mBar, type CandleGap } from '../aggregator/candle-1m.js';
import type { Logger } from '../log.js';
import type { GapBackfillResult } from '../persistence/candle-backfill.js';
import { flushClosedCandle } from '../persistence/candles-1m.js';
import {
  createCandleGapTracker,
  GAP_DRAIN_WAIT_MS,
  sleep,
  type FetchGapBars,
} from './candle-gaps.js';

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAYS_MS = [250, 1_000];
const DEFAULT_FLUSH_TIMEOUT_MS = 10_000;
const DEFAULT_HAND_OFF_TIMEOUT_MS = 2_000;

/** Floor for a per-attempt timeout, even after the shutdown window closes. */
const ATTEMPT_TIMEOUT_FLOOR_MS = 250;
/** Floor for one hand-off attempt: a slow pool must not abandon the bar. */
const HAND_OFF_TIMEOUT_FLOOR_MS = 250;
const DEFAULT_SHUTDOWN_GRACE_MS = 5_000;

/** Resolve with the promise's value, or `'timeout'` after `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> {
  return Promise.race([promise, sleep(ms).then(() => 'timeout' as const)]);
}

/** Hands one unpersisted bar to the durable queue. Injected by tests. */
type EnqueueFailedBar = (bar: Candle1mBar, reason: string) => Promise<boolean>;

/**
 * Default hand-off: the pg-boss `candle-flush` queue. Imported lazily so the
 * pure rig tests never load pg-boss.
 */
async function defaultEnqueueFailedBar(bar: Candle1mBar, reason: string): Promise<boolean> {
  const { enqueueClosedCandle } = await import('../persistence/candle-outbox.js');
  return enqueueClosedCandle(bar, { reason });
}

type HandOffOutcome = { status: 'queued' } | { status: 'dropped'; reason: string };

interface HandOffBarArgs {
  bar: Candle1mBar;
  /** Why the bar reached the queue: 'flush-failed' or 'shutdown'. */
  reason: string;
  /** Error that exhausted the write attempts (diagnostics only). */
  cause: unknown;
  /** Configured cap for the insert; floored at HAND_OFF_TIMEOUT_FLOOR_MS. */
  timeoutMs: number;
  enqueue: EnqueueFailedBar;
  log: Logger;
}

/**
 * Queue one unpersisted bar. Never throws: the caller maps the outcome to
 * counters so a total failure (write + queue) is visible rather than lost.
 */
async function handOffBar(args: HandOffBarArgs): Promise<HandOffOutcome> {
  const { bar, log } = args;
  let failure: string;
  try {
    const outcome = await withTimeout(
      args.enqueue(bar, args.reason),
      Math.max(HAND_OFF_TIMEOUT_FLOOR_MS, args.timeoutMs),
    );
    if (outcome === true) {
      log.warn('candle bar queued for durable replay', {
        symbol: bar.symbol,
        t: new Date(bar.t).toISOString(),
        reason: args.reason,
        err: args.cause === undefined ? null : String(args.cause),
      });
      return { status: 'queued' };
    }
    failure = outcome === 'timeout' ? 'durable queue hand-off timed out' : 'durable queue refused';
  } catch (queueErr) {
    failure = String(queueErr);
  }

  log.error('candle bar LOST (write and durable queue both failed)', {
    symbol: bar.symbol,
    t: new Date(bar.t).toISOString(),
    o: bar.o,
    h: bar.h,
    l: bar.l,
    c: bar.c,
    v: bar.v,
    tickVolume: bar.tickVolume,
    source: bar.source,
    reason: args.reason,
    lastError: failure,
  });
  return { status: 'dropped', reason: failure };
}

interface CandleWriteOutcome {
  /** 'written' to `candles_1m`, 'queued' for durable replay, or 'dropped'. */
  status: 'written' | 'queued' | 'dropped';
  /** DB write attempts made (1..maxAttempts, plus any made before shutdown). */
  attempts: number;
  /** Why the bar was dropped (status 'dropped' only). */
  failure: string | null;
}

interface WriteCandleBarArgs {
  bar: Candle1mBar;
  db: DbClient;
  log: Logger;
  maxAttempts: number;
  retryDelaysMs: number[];
  flushTimeoutMs: number;
  handOffTimeoutMs: number;
  /** Milliseconds left in the shutdown grace window, or null while running. */
  remainingShutdownMs: () => number | null;
  enqueue: EnqueueFailedBar;
}

/**
 * Write one closed bar, retrying within the policy above and falling back to
 * the durable queue. Never throws.
 */
async function writeCandleBar(args: WriteCandleBarArgs): Promise<CandleWriteOutcome> {
  const { bar, db, log } = args;

  const writeOnce = async (timeoutMs: number): Promise<void> => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new DOMException('candle flush timed out', 'TimeoutError'));
    }, timeoutMs);
    timer.unref();
    try {
      await flushClosedCandle({ db, log, bar, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  const attemptTimeoutMs = (remainingShutdownMs: number | null): number => {
    if (remainingShutdownMs === null) return args.flushTimeoutMs;
    return Math.max(ATTEMPT_TIMEOUT_FLOOR_MS, Math.min(args.flushTimeoutMs, remainingShutdownMs));
  };

  let attempt = 0;
  let lastErr: unknown;

  while (attempt < args.maxAttempts) {
    if (attempt > 0) {
      const delay = args.retryDelaysMs[Math.min(attempt - 1, args.retryDelaysMs.length - 1)] ?? 0;
      const remaining = args.remainingShutdownMs();
      if (remaining !== null && remaining <= delay) break;
      await sleep(delay);
    }
    const remaining = args.remainingShutdownMs();
    if (remaining !== null && remaining <= 0) break;

    attempt += 1;
    try {
      await writeOnce(attemptTimeoutMs(remaining));
      log.info('candle closed', {
        symbol: bar.symbol,
        t: new Date(bar.t).toISOString(),
        o: bar.o,
        h: bar.h,
        l: bar.l,
        c: bar.c,
        ticks: bar.tickVolume,
        attempts: attempt,
      });
      return { status: 'written', attempts: attempt, failure: null };
    } catch (err) {
      lastErr = err;
      log.warn('flushClosedCandle attempt failed', {
        symbol: bar.symbol,
        t: new Date(bar.t).toISOString(),
        attempt,
        maxAttempts: args.maxAttempts,
        err: String(err),
      });
    }
  }

  const reason = args.remainingShutdownMs() !== null ? 'shutdown' : 'flush-failed';
  const outcome = await handOffBar({
    bar,
    reason,
    cause: lastErr,
    timeoutMs: args.handOffTimeoutMs,
    enqueue: args.enqueue,
    log,
  });
  if (outcome.status === 'queued') return { status: 'queued', attempts: attempt, failure: null };
  return { status: 'dropped', attempts: attempt, failure: outcome.reason };
}

export interface CandlePipelineStats {
  /** Bars emitted by the aggregator (rollover + closeAll). */
  barsClosed: number;
  /** Bars confirmed in `candles_1m`. */
  written: number;
  /** DB write attempts including retries. */
  writeAttempts: number;
  /** Bars handed to the durable queue after the write failed. */
  queued: number;
  /** Bars neither written nor queued — real data loss, logged with payload. */
  dropped: number;
  /** Bars fetched from the REST adapters to fill a gap. */
  backfilled: number;
  /** Gaps where the provider could not cover the missing minutes. */
  backfillMisses: number;
  /** Rollovers that skipped at least one minute. */
  gaps: number;
  gapMinutes: number;
  /** Same-minute replay ticks whose close was refused (kept monotonic). */
  staleCloseTicks: number;
  lastGap: CandleGap | null;
  recentGaps: CandleGap[];
  lastError: string | null;
  /** Bars still being written right now. */
  pending: number;
}

interface CandleDrainReport {
  closed: number;
  written: number;
  queued: number;
  dropped: number;
  stillPending: number;
}

export interface CandleFlushRigOptions {
  /** Total write attempts per bar before the durable queue takes over. */
  maxAttempts?: number;
  /** Delay before retry N (index 0 is the delay before attempt 2). */
  retryDelaysMs?: number[];
  /** Timeout for one DB write attempt. */
  flushTimeoutMs?: number;
  /** How long drain() waits for in-flight writes before queueing them. */
  shutdownGraceMs?: number;
  /** Timeout for one durable hand-off attempt. */
  handOffTimeoutMs?: number;
  /** Durable hand-off. Defaults to the pg-boss `candle-flush` queue. */
  enqueueFailedBar?: EnqueueFailedBar;
  /** Gap source. Defaults to the REST OHLC adapters via `@kestrel/data`. */
  fetchGapBars?: FetchGapBars;
  /** Compare the first closed bar per symbol against `candles_1m`. Default true. */
  detectRestartGaps?: boolean;
}

export interface CandleFlushRig {
  aggregator: Candle1mAggregator;
  /**
   * Close all open bars, wait a bounded grace window for their writes, then
   * hand anything still unpersisted to the durable queue. Resolves only when
   * every bar is written, queued, or counted as dropped.
   */
  drain(): Promise<CandleDrainReport>;
  stats(): CandlePipelineStats;
}

interface PendingBar {
  bar: Candle1mBar;
  /** Written or handed to the durable queue. */
  durable: boolean;
  promise: Promise<void>;
}

export function createCandleFlushRig({
  db,
  log,
  options = {},
}: {
  db: DbClient;
  log: Logger;
  options?: CandleFlushRigOptions;
}): CandleFlushRig {
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const flushTimeoutMs = options.flushTimeoutMs ?? DEFAULT_FLUSH_TIMEOUT_MS;
  const shutdownGraceMs = options.shutdownGraceMs ?? DEFAULT_SHUTDOWN_GRACE_MS;
  const handOffTimeoutMs = options.handOffTimeoutMs ?? DEFAULT_HAND_OFF_TIMEOUT_MS;
  const detectRestartGaps = options.detectRestartGaps ?? true;

  const enqueueFailedBar = options.enqueueFailedBar ?? defaultEnqueueFailedBar;
  const fetchGapBars =
    options.fetchGapBars ??
    (async (gap: CandleGap, signal?: AbortSignal): Promise<GapBackfillResult> => {
      const { fetchGapBars: impl } = await import('../persistence/candle-backfill.js');
      return impl({ gap, log, ...(signal ? { signal } : {}) });
    });

  let barsClosed = 0;
  let written = 0;
  let writeAttempts = 0;
  let queued = 0;
  let dropped = 0;
  let lastError: string | null = null;

  let nextId = 0;
  const pending = new Map<number, PendingBar>();
  let shutdownDeadlineMs: number | null = null;

  const remainingShutdownMs = (): number | null =>
    shutdownDeadlineMs === null ? null : shutdownDeadlineMs - Date.now();

  /** Write one tracked bar, then map the outcome to the rig's counters. */
  const persistEntry = async (entry: PendingBar): Promise<void> => {
    const outcome = await writeCandleBar({
      bar: entry.bar,
      db,
      log,
      maxAttempts,
      retryDelaysMs,
      flushTimeoutMs,
      handOffTimeoutMs,
      remainingShutdownMs,
      enqueue: enqueueFailedBar,
    });
    writeAttempts += outcome.attempts;

    if (outcome.status === 'written') {
      entry.durable = true;
      written += 1;
      return;
    }
    if (outcome.status === 'queued') {
      entry.durable = true;
      queued += 1;
      return;
    }
    dropped += 1;
    lastError = outcome.failure;
  };

  /**
   * Shutdown hand-off for a bar whose write never settled in the grace
   * window. The writer's own path already covers a bar that failed while
   * running; this is the last chance before the process exits.
   */
  const handOffLeftover = async (entry: PendingBar): Promise<void> => {
    const outcome = await handOffBar({
      bar: entry.bar,
      reason: 'shutdown',
      cause: undefined,
      timeoutMs: handOffTimeoutMs,
      enqueue: enqueueFailedBar,
      log,
    });
    if (outcome.status === 'queued') {
      entry.durable = true;
      queued += 1;
      return;
    }
    dropped += 1;
    lastError = outcome.reason;
  };

  /** Track a bar from now until it is written, queued, or reported lost. */
  const trackBar = (bar: Candle1mBar, opts: { startupCheck: boolean }): PendingBar => {
    const entry: PendingBar = { bar, durable: false, promise: Promise.resolve() };
    const id = nextId++;
    const work = (async () => {
      if (opts.startupCheck) await gaps.checkRestartGap(bar);
      await persistEntry(entry);
    })();
    entry.promise = work
      .catch((err) => {
        // persistEntry never throws; this guards the restart-gap check and
        // any future addition so a single bad bar cannot wedge drain().
        lastError = String(err);
        log.error('candle flush worker crashed', { symbol: bar.symbol, err: String(err) });
      })
      .finally(() => {
        pending.delete(id);
      });
    pending.set(id, entry);
    return entry;
  };

  const gaps = createCandleGapTracker({
    db,
    log,
    fetchGapBars,
    detectRestartGaps,
    // The tracker registers every fetched bar synchronously, then awaits the
    // guarantees below, so a shutdown mid-backfill still hands them over.
    trackBackfilledBar: (bar) => trackBar(bar, { startupCheck: false }).promise,
  });

  const aggregator = new Candle1mAggregator(
    (bar) => {
      barsClosed += 1;
      trackBar(bar, { startupCheck: true });
    },
    (gap) => gaps.report(gap, 'rollover'),
  );

  const waitForPending = async (budgetMs: number): Promise<void> => {
    const deadline = Date.now() + budgetMs;
    for (;;) {
      const entries = [...pending.values()].map((entry) => entry.promise);
      if (entries.length === 0) return;
      const remaining = deadline - Date.now();
      if (remaining <= 0) return;
      await Promise.race([Promise.allSettled(entries), sleep(remaining)]);
      if (pending.size === 0) return;
      if (Date.now() >= deadline) return;
    }
  };

  const drain = async (): Promise<CandleDrainReport> => {
    shutdownDeadlineMs = Date.now() + shutdownGraceMs;
    aggregator.closeAll();

    const writtenBefore = written;
    const queuedBefore = queued;
    const droppedBefore = dropped;

    // 1. Give the closed bars' writes the grace window (their retry loop
    //    stops early and hands off once the deadline passes).
    await waitForPending(shutdownGraceMs);

    // 2. Let in-flight gap backfills land, then abort whatever is left. The
    //    next boot's restart-gap check re-detects an unfetched range.
    if (await gaps.drain()) {
      await waitForPending(GAP_DRAIN_WAIT_MS);
    }

    // 3. Anything still unpersisted at the deadline goes to the durable
    //    queue. A bar whose write is still in flight may be queued as well;
    //    the write is idempotent on (symbol, t), so that is safe.
    const leftovers = [...pending.values()].filter((entry) => !entry.durable);
    for (const entry of leftovers) {
      await handOffLeftover(entry);
    }

    const report: CandleDrainReport = {
      closed: barsClosed,
      written: written - writtenBefore,
      queued: queued - queuedBefore,
      dropped: dropped - droppedBefore,
      stillPending: [...pending.values()].filter((entry) => !entry.durable).length,
    };
    log.info('candle flush drained', { ...report });
    return report;
  };

  const stats = (): CandlePipelineStats => {
    const agg = aggregator.stats();
    const gapStats = gaps.stats();
    return {
      barsClosed,
      written,
      writeAttempts,
      queued,
      dropped,
      backfilled: gapStats.backfilled,
      backfillMisses: gapStats.backfillMisses,
      gaps: agg.gaps,
      gapMinutes: agg.gapMinutes,
      staleCloseTicks: agg.staleCloseTicks,
      lastGap: agg.recentGaps.at(-1) ?? null,
      recentGaps: agg.recentGaps,
      lastError,
      pending: [...pending.values()].filter((entry) => !entry.durable).length,
    };
  };

  return { aggregator, drain, stats };
}
