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

// Gap handling for the 1m candle pipeline (R9, audit 2026-10-31).
//
// The aggregator reports a `CandleGap` whenever a rollover skips minutes;
// this tracker turns that into something recoverable:
//
//   1. Log the gap with its time range and missing-minute count, and count
//      it, so a quiet hole becomes visible in the logs and the health payload.
//   2. Ask the configured gap source (`persistence/candle-backfill.ts`, i.e.
//      the REST OHLC adapters) for the missing minutes. Provider-answered
//      bars are persisted through the caller's durable write path; a short or
//      empty answer is reported, never padded with a synthesised bar.
//   3. On the first closed bar per symbol after a restart, compare with the
//      newest persisted bar, so downtime between two worker processes is
//      detected instead of leaving a hole the in-process aggregator cannot
//      see.
//
// Backfill work is best-effort and coalesced into `inFlight` so shutdown can
// stop waiting on it: an unfetched range is re-detected by the next boot's
// restart check.

import type { DbClient } from '@kestrel/db';
import { candles1m } from '@kestrel/db/schema';
import { desc, eq } from 'drizzle-orm';

import type { Candle1mBar, CandleGap } from '../aggregator/candle-1m.js';
import type { Logger } from '../log.js';
import type { GapBackfillResult } from '../persistence/candle-backfill.js';

const MINUTE_MS = 60_000;

/** Sleep for `ms`, without holding the event loop open. */
export function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref();
  });
}

/** How long drain() waits on best-effort gap work before giving up on it. */
export const GAP_DRAIN_WAIT_MS = 750;

/** Gap source. Defaults to the REST OHLC adapters via `@kestrel/data`. */
export type FetchGapBars = (gap: CandleGap, signal?: AbortSignal) => Promise<GapBackfillResult>;

interface CandleGapStats {
  /** Bars fetched from the REST adapters to fill a gap. */
  backfilled: number;
  /** Gaps where the provider could not cover the missing minutes. */
  backfillMisses: number;
}

export interface CandleGapTracker {
  /** Log, count and (where possible) backfill one detected gap. */
  report(gap: CandleGap, origin: 'rollover' | 'restart'): void;
  /** Compare the first closed bar per symbol against the newest persisted bar. */
  checkRestartGap(bar: Candle1mBar): Promise<void>;
  /**
   * Wait (bounded) for in-flight backfills, then abort whatever is left.
   * Resolves true when there was work to wait for, so the caller knows
   * whether a follow-up wait on the freshly written bars is worthwhile.
   */
  drain(): Promise<boolean>;
  stats(): CandleGapStats;
}

export interface CreateCandleGapTrackerArgs {
  db: DbClient;
  log: Logger;
  fetchGapBars: FetchGapBars;
  /**
   * Register one provider-answered bar with the caller's durable write path,
   * synchronously (the write starts before this returns), and give back a
   * promise that settles when the bar is written, queued or reported lost.
   * Registering every fetched bar up front is what lets a shutdown
   * mid-backfill still hand the untouched bars over.
   */
  trackBackfilledBar: (bar: Candle1mBar) => Promise<void>;
  /** Compare the first closed bar per symbol against `candles_1m`. */
  detectRestartGaps: boolean;
}

export function createCandleGapTracker(args: CreateCandleGapTrackerArgs): CandleGapTracker {
  const { db, log } = args;
  let backfilled = 0;
  let backfillMisses = 0;
  const symbolsSeen = new Set<string>();
  const inFlight = new Set<Promise<void>>();
  const abort = new AbortController();

  const report = (gap: CandleGap, origin: 'rollover' | 'restart'): void => {
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
        const result = await args.fetchGapBars(gap, abort.signal);
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
        // Register every fetched bar before starting to await writes so a
        // shutdown mid-backfill still persists the untouched bars.
        const tracked = result.bars.map((bar) => args.trackBackfilledBar(bar));
        for (const pending of tracked) await pending;
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
    inFlight.add(work);
    void work.finally(() => inFlight.delete(work));
  };

  const checkRestartGap = async (bar: Candle1mBar): Promise<void> => {
    if (!args.detectRestartGaps) return;
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
      report(
        { symbol: bar.symbol, fromMs, toMs, missingMinutes: (toMs - fromMs) / MINUTE_MS + 1 },
        'restart',
      );
    } catch (err) {
      log.warn('candle restart-gap probe failed', { symbol: bar.symbol, err: String(err) });
    }
  };

  const drain = async (): Promise<boolean> => {
    if (inFlight.size === 0) return false;
    await Promise.race([Promise.allSettled([...inFlight]), sleep(GAP_DRAIN_WAIT_MS)]);
    abort.abort(new DOMException('worker shutting down', 'AbortError'));
    return true;
  };

  return {
    report,
    checkRestartGap,
    drain,
    stats: () => ({ backfilled, backfillMisses }),
  };
}
