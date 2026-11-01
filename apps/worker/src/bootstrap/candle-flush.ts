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
// R9 (audit 2026-10-31) — a closed bar is no longer fire-and-forget. This
// file owns the wiring and lifecycle; the cohesive pieces live next door:
//
//   1. `candle-writer.ts` writes each bar with a bounded retry loop
//      (default 3 attempts, backoff 250ms/1s, per-attempt timeout 10s).
//   2. When the retries are exhausted `candle-queue.ts` hands the bar to the
//      durable pg-boss queue (`persistence/candle-outbox.ts`), which the
//      worker consumes on a later cycle or on the next boot. The write is
//      idempotent, so a replay is a no-op. Only when the write AND the queue
//      both fail is the bar logged as lost, with its full OHLC payload, and
//      counted.
//   3. `candle-gaps.ts` reports a rollover that skipped minutes and asks the
//      REST OHLC adapters for the missing bars; provider-answered bars are
//      written through the same durable path. Nothing is synthesised, and
//      the first closed bar per symbol after a restart is compared against
//      `candles_1m` so downtime between processes is detected too.
//   4. `drain()` closes the open bars, gives in-flight work a bounded grace
//      window, then hands every still-unpersisted bar to the queue. Shutdown
//      no longer silently discards a bar in flight.
//
// This rig only tracks bars; it never inspects their prices, so it stays
// testable with a fake db and injected writer/gap seams.

import type { DbClient } from '@kestrel/db';

import { Candle1mAggregator, type Candle1mBar, type CandleGap } from '../aggregator/candle-1m.js';
import type { Logger } from '../log.js';
import type { GapBackfillResult } from '../persistence/candle-backfill.js';
import { createCandleGapTracker, GAP_DRAIN_WAIT_MS, type FetchGapBars } from './candle-gaps.js';
import {
  DEFAULT_HAND_OFF_TIMEOUT_MS,
  defaultEnqueueFailedBar,
  handOffBar,
  type EnqueueFailedBar,
} from './candle-queue.js';
import { sleep } from './candle-timing.js';
import {
  DEFAULT_FLUSH_TIMEOUT_MS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_RETRY_DELAYS_MS,
  writeCandleBar,
} from './candle-writer.js';

const DEFAULT_SHUTDOWN_GRACE_MS = 5_000;

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

  /** Milliseconds left in the shutdown grace window, null while running. */
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
