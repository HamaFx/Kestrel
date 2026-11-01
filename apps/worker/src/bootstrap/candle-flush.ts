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

// Closed-candle flush rig: wires the 1m aggregator to the persistence layer
// with retries, a durable hand-off, gap backfill, and shutdown draining.
//
// R9 (audit 2026-10-31) — a closed bar is no longer fire-and-forget:
//
//   1. Each bar is written with a bounded retry loop (default 3 attempts,
//      backoff 250ms/1s, per-attempt timeout 10s).
//   2. When the retries are exhausted the bar is handed to the durable
//      pg-boss queue (`persistence/candle-outbox.ts`), which the worker
//      consumes on a later cycle or on the next boot. The write is
//      idempotent, so a replay is a no-op.
//   3. Only when the write AND the queue both fail is the bar logged as
//      lost, with its full OHLC payload, and counted.
//   4. `drain()` closes the open bars, gives in-flight work a bounded grace
//      window, then hands every still-unpersisted bar to the queue. Shutdown
//      no longer silently discards a bar in flight.
//   5. A rollover that skipped minutes reports the gap and asks the REST
//      OHLC adapters for the missing bars; provider-answered bars are
//      written through the same durable path. Nothing is synthesised.
//   6. The first closed bar for a symbol after a restart also compares
//      against the newest row in `candles_1m`, so downtime between two
//      worker processes is detected and backfilled instead of leaving a
//      quiet hole.

import type { DbClient } from '@kestrel/db';
import { candles1m } from '@kestrel/db/schema';
import { desc, eq } from 'drizzle-orm';

import { Candle1mAggregator, type Candle1mBar, type CandleGap } from '../aggregator/candle-1m.js';
import type { Logger } from '../log.js';
import type { GapBackfillResult } from '../persistence/candle-backfill.js';
import { flushClosedCandle } from '../persistence/candles-1m.js';

const MINUTE_MS = 60_000;

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAYS_MS = [250, 1_000];
const DEFAULT_FLUSH_TIMEOUT_MS = 10_000;
const DEFAULT_SHUTDOWN_GRACE_MS = 5_000;
const DEFAULT_HAND_OFF_TIMEOUT_MS = 2_000;
/** How long drain() waits on best-effort gap work before giving up on it. */
const GAP_DRAIN_WAIT_MS = 750;

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

export interface CandleDrainReport {
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
  enqueueFailedBar?: (bar: Candle1mBar, reason: string) => Promise<boolean>;
  /** Gap source. Defaults to the REST OHLC adapters via `@kestrel/data`. */
  fetchGapBars?: (gap: CandleGap, signal?: AbortSignal) => Promise<GapBackfillResult>;
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
  const sleep = (ms: number): Promise<void> =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      timer.unref();
    });

  const enqueueFailedBar =
    options.enqueueFailedBar ??
    (async (bar: Candle1mBar, reason: string): Promise<boolean> => {
      const { enqueueClosedCandle } = await import('../persistence/candle-outbox.js');
      return enqueueClosedCandle(bar, { reason });
    });

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
  let backfilled = 0;
  let backfillMisses = 0;
  let lastError: string | null = null;

  let nextId = 0;
  const pending = new Map<number, PendingBar>();
  const symbolsSeen = new Set<string>();
  const gapFetches = new Set<Promise<void>>();
  const gapAbort = new AbortController();
  let shutdownDeadlineMs: number | null = null;

  const writeWithTimeout = async (bar: Candle1mBar, timeoutMs: number): Promise<void> => {
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

  const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T | 'timeout'> =>
    Promise.race([promise, sleep(timeoutMs).then(() => 'timeout' as const)]);

  const handOff = async (entry: PendingBar, reason: string, err: unknown): Promise<void> => {
    try {
      const outcome = await withTimeout(
        enqueueFailedBar(entry.bar, reason),
        Math.max(250, handOffTimeoutMs),
      );
      if (outcome === true) {
        entry.durable = true;
        queued += 1;
        log.warn('candle bar queued for durable replay', {
          symbol: entry.bar.symbol,
          t: new Date(entry.bar.t).toISOString(),
          reason,
          err: err === undefined ? null : String(err),
        });
        return;
      }
      lastError =
        outcome === 'timeout' ? 'durable queue hand-off timed out' : 'durable queue refused';
    } catch (queueErr) {
      lastError = String(queueErr);
    }
    dropped += 1;
    // Last resort: the write failed and the queue failed. Emit the whole bar
    // so it can be reconstructed from logs instead of vanishing.
    log.error('candle bar LOST (write and durable queue both failed)', {
      symbol: entry.bar.symbol,
      t: new Date(entry.bar.t).toISOString(),
      o: entry.bar.o,
      h: entry.bar.h,
      l: entry.bar.l,
      c: entry.bar.c,
      v: entry.bar.v,
      tickVolume: entry.bar.tickVolume,
      source: entry.bar.source,
      reason,
      lastError,
    });
  };

  const attemptTimeoutMs = (): number => {
    if (shutdownDeadlineMs === null) return flushTimeoutMs;
    const remaining = shutdownDeadlineMs - Date.now();
    return Math.max(250, Math.min(flushTimeoutMs, remaining));
  };

  /** Retry loop, then durable hand-off. Never throws. */
  const persistEntry = async (entry: PendingBar): Promise<void> => {
    const { bar } = entry;
    let attempt = 0;
    let lastErr: unknown;

    while (attempt < maxAttempts) {
      if (attempt > 0) {
        const delay = retryDelaysMs[Math.min(attempt - 1, retryDelaysMs.length - 1)] ?? 0;
        if (shutdownDeadlineMs !== null && Date.now() + delay >= shutdownDeadlineMs) break;
        await sleep(delay);
      }
      if (shutdownDeadlineMs !== null && Date.now() >= shutdownDeadlineMs) break;

      attempt += 1;
      writeAttempts += 1;
      try {
        await writeWithTimeout(bar, attemptTimeoutMs());
        entry.durable = true;
        written += 1;
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
        return;
      } catch (err) {
        lastErr = err;
        log.warn('flushClosedCandle attempt failed', {
          symbol: bar.symbol,
          t: new Date(bar.t).toISOString(),
          attempt,
          maxAttempts,
          err: String(err),
        });
      }
    }

    await handOff(entry, shutdownDeadlineMs !== null ? 'shutdown' : 'flush-failed', lastErr);
  };

  /** Track a bar from now until it is written, queued, or reported lost. */
  const trackBar = (bar: Candle1mBar, opts: { startupCheck: boolean }): PendingBar => {
    const entry: PendingBar = { bar, durable: false, promise: Promise.resolve() };
    const id = nextId++;
    const work = (async () => {
      if (opts.startupCheck) await checkRestartGap(bar);
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

  const reportGap = (gap: CandleGap, origin: 'rollover' | 'restart'): void => {
    if (gap.missingMinutes <= 0) return;
    log.warn('candle gap detected', {
      symbol: gap.symbol,
      from: new Date(gap.fromMs).toISOString(),
      to: new Date(gap.toMs).toISOString(),
      missingMinutes: gap.missingMinutes,
      origin,
    });
    const work = (async () => {
      try {
        const result = await fetchGapBars(gap, gapAbort.signal);
        if (result.bars.length === 0) {
          backfillMisses += 1;
          log.warn('candle gap not backfilled', {
            symbol: gap.symbol,
            from: new Date(gap.fromMs).toISOString(),
            to: new Date(gap.toMs).toISOString(),
            missingMinutes: gap.missingMinutes,
            status: result.status,
            detail: result.detail ?? null,
          });
          return;
        }
        // Register every fetched bar before starting writes so a shutdown
        // mid-backfill still hands the untouched bars to the durable queue.
        const entries = result.bars.map((bar) => trackBar(bar, { startupCheck: false }));
        for (const entry of entries) await entry.promise;
        const fetched = result.bars.length;
        backfilled += fetched;
        if (fetched < gap.missingMinutes) backfillMisses += 1;
        log.info('candle gap backfilled', {
          symbol: gap.symbol,
          from: new Date(gap.fromMs).toISOString(),
          to: new Date(gap.toMs).toISOString(),
          missingMinutes: gap.missingMinutes,
          fetched,
          status: result.status,
          stale: result.stale ?? false,
          origin,
        });
      } catch (err) {
        backfillMisses += 1;
        log.warn('candle gap backfill failed', {
          symbol: gap.symbol,
          from: new Date(gap.fromMs).toISOString(),
          to: new Date(gap.toMs).toISOString(),
          err: String(err),
        });
      }
    })();
    gapFetches.add(work);
    void work.finally(() => gapFetches.delete(work));
  };

  /**
   * Restart gap: on the first closed bar for a symbol, compare with the
   * newest persisted bar. A worker restart (or a stretch where the tick
   * stream was off) leaves a hole the in-process aggregator cannot see.
   */
  const checkRestartGap = async (bar: Candle1mBar): Promise<void> => {
    if (!detectRestartGaps) return;
    if (symbolsSeen.has(bar.symbol)) return;
    symbolsSeen.add(bar.symbol);
    try {
      const [row] = await db
        .select({ t: candles1m.t })
        .from(candles1m)
        .where(eq(candles1m.symbol, bar.symbol))
        .orderBy(desc(candles1m.t))
        .limit(1);
      const newestMs = row?.t ? new Date(row.t).getTime() : null;
      if (newestMs === null) return;
      const fromMs = newestMs + MINUTE_MS;
      const toMs = bar.t - MINUTE_MS;
      if (toMs < fromMs) return;
      reportGap(
        { symbol: bar.symbol, fromMs, toMs, missingMinutes: (toMs - fromMs) / MINUTE_MS + 1 },
        'restart',
      );
    } catch (err) {
      log.warn('candle restart-gap probe failed', { symbol: bar.symbol, err: String(err) });
    }
  };

  const aggregator = new Candle1mAggregator(
    (bar) => {
      barsClosed += 1;
      trackBar(bar, { startupCheck: true });
    },
    (gap) => reportGap(gap, 'rollover'),
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
    if (gapFetches.size > 0) {
      await Promise.race([Promise.allSettled([...gapFetches]), sleep(GAP_DRAIN_WAIT_MS)]);
      gapAbort.abort(new DOMException('worker shutting down', 'AbortError'));
      await waitForPending(GAP_DRAIN_WAIT_MS);
    }

    // 3. Anything still unpersisted at the deadline goes to the durable
    //    queue. A bar whose write is still in flight may be queued as well;
    //    the write is idempotent on (symbol, t), so that is safe.
    const leftovers = [...pending.values()].filter((entry) => !entry.durable);
    for (const entry of leftovers) {
      await handOff(entry, 'shutdown', undefined);
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
    return {
      barsClosed,
      written,
      writeAttempts,
      queued,
      dropped,
      backfilled,
      backfillMisses,
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
