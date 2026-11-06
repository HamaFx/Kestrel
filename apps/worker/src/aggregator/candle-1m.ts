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

// In-process 1-minute candle aggregator.
//
// The SignalR consumer dispatches normalised ticks to `feed(tick)`. The
// aggregator maintains one open bar per symbol. When the next tick lands
// in a NEW minute (per UTC `Math.floor(ts / 60_000)`), the open bar is
// emitted as `CandleClosed` and a fresh bar is started with the tick's
// mid as `o = c`.
//
// Pure data — no IO, no logging — so it's fully golden-testable. The
// flush path that writes closed bars to `candles_1m` lives in
// `persistence/candles-1m.ts` and is wired up at the worker bootstrap.
//
// two corrections to the open-bar rules:
//
//   1. The close only advances with a strictly newer tick time. Both feeds
//      push snapshots of the in-progress minute: Binance kline events carry
//      the cumulative OHLCV so far (`k.c`, `k.v` as of event time `k.E`) and
//      BiQuote pushes a bid/ask mid. A replayed/out-of-order snapshot after
//      a reconnect carries an OLDER close, so applying it unconditionally
//      moved `c` backwards. High/low stay max/min accumulators: those are
//      idempotent under replay, so a stale snapshot can only confirm them.
//   2. A rollover that skips minutes now reports the gap (time range +
//      missing minutes) through `onGap` instead of silently dropping it, so
//      the flush rig can backfill it or record it for operators.

import type { Symbol } from '@kestrel/shared';

import type { NormalizedTick } from '../signalr/consumer/index.js';

/**
 * A 1-minute bar as persisted to `candles_1m`. The aggregator produces
 * `ClosedCandle` (narrow tick source); gap backfill produces the same shape
 * with a REST provider source, hence the wider `source` here.
 */
export interface Candle1mBar {
  symbol: Symbol;
  /** Bar open time, ms epoch UTC. Aligned to the start of the minute. */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  /** Real volume — null for FX (BiQuote returns 0). */
  v: number | null;
  /** Number of ticks observed inside the bar (0 for provider-backfilled bars). */
  tickVolume: number;
  /** Tick-stream source, or `<provider>-backfill` for a REST-backfilled bar. */
  source: string;
}

export interface ClosedCandle extends Candle1mBar {
  /** Source of the tick data — matches the last tick that updated the bar. */
  source: NormalizedTick['source'];
}

/**
 * A stretch of minutes with no ticks between two observed bars. `fromMs`
 * is inclusive, `toMs` is the open time of the last missing minute
 * (inclusive), so `missingMinutes === (toMs - fromMs) / 60_000 + 1`.
 */
export interface CandleGap {
  symbol: Symbol;
  fromMs: number;
  toMs: number;
  missingMinutes: number;
}

export interface CandleAggregatorStats {
  /** Closed bars emitted since process start. */
  barsClosed: number;
  /** Rollovers that skipped at least one full minute. */
  gaps: number;
  /** Total missing minutes across every gap. */
  gapMinutes: number;
  /** Same-minute ticks whose close was ignored because they were older. */
  staleCloseTicks: number;
  /** Most recent gaps, newest last (bounded ring for health payloads). */
  recentGaps: CandleGap[];
}

interface OpenBar {
  bucket: number; // floor(ts / 60_000)
  o: number;
  h: number;
  l: number;
  c: number;
  v: number | null;
  ticks: number;
  source: NormalizedTick['source'];
  /**
   * Tick time of the newest tick applied to this bar. The close (and the
   * cumulative kline volume) may only move when a tick is newer than this.
   */
  lastTickTs: number;
}

const MINUTE_MS = 60_000;
const RECENT_GAP_LIMIT = 5;

export class Candle1mAggregator {
  private readonly bars = new Map<Symbol, OpenBar>();
  private readonly onClosed: (bar: ClosedCandle) => void;
  private readonly onGap: ((gap: CandleGap) => void) | undefined;

  private barsClosed = 0;
  private gaps = 0;
  private gapMinutes = 0;
  private staleCloseTicks = 0;
  private readonly recentGaps: CandleGap[] = [];

  constructor(onClosed: (bar: ClosedCandle) => void, onGap?: (gap: CandleGap) => void) {
    this.onClosed = onClosed;
    this.onGap = onGap;
  }

  /**
   * Feed a tick. Updates the open bar in place; if the tick crosses a
   * minute boundary, the previous bar is closed (and dispatched to
   * `onClosed`) and a fresh one starts.
   *
   * Ticks within the same minute as an existing bar update H/L and, when
   * the tick is newer than every tick already applied, C and the
   * cumulative volume. Out-of-order ticks (`bucket < open.bucket`) are
   * silently ignored — the BiQuote stream is monotonic in practice but
   * we'd rather drop a stray than corrupt the bar.
   */
  feed(tick: NormalizedTick): void {
    const bucket = Math.floor(tick.ts / MINUTE_MS);
    const existing = this.bars.get(tick.symbol);

    if (!existing) {
      this.bars.set(tick.symbol, this.openBar(bucket, tick));
      return;
    }

    if (bucket < existing.bucket) {
      // Stale tick — ignore.
      return;
    }

    if (bucket === existing.bucket) {
      this.applyWithinMinute(existing, tick);
      return;
    }

    // bucket > existing.bucket — rollover. Close the previous bar and
    // start a fresh one. We only emit one closed bar even if `bucket`
    // jumped multiple minutes (gap during BiQuote outage / weekend) —
    // creating empty bars for missing minutes is undesirable. The skip is
    // reported as a gap so the caller can backfill from REST or record it.
    this.emitClosed(tick.symbol, existing);
    if (bucket > existing.bucket + 1) {
      this.reportGap(tick.symbol, existing.bucket + 1, bucket - 1);
    }
    this.bars.set(tick.symbol, this.openBar(bucket, tick));
  }

  /**
   * Force-close every currently-open bar. Used at shutdown so we don't
   * lose the last partial bar (acceptable trade-off; the tick count tells
   * downstream consumers it was partial).
   */
  closeAll(): void {
    for (const [symbol, bar] of this.bars) {
      this.emitClosed(symbol, bar);
    }
    this.bars.clear();
  }

  /** Test introspection. */
  peek(symbol: Symbol): OpenBar | undefined {
    return this.bars.get(symbol);
  }

  /** Counters for logs and the worker health payload. */
  stats(): CandleAggregatorStats {
    return {
      barsClosed: this.barsClosed,
      gaps: this.gaps,
      gapMinutes: this.gapMinutes,
      staleCloseTicks: this.staleCloseTicks,
      recentGaps: [...this.recentGaps],
    };
  }

  /**
   * Same-minute tick: high/low are running extremes (idempotent under
   * replay, so they always apply); close and cumulative volume only move
   * forward in tick time.
   */
  private applyWithinMinute(bar: OpenBar, tick: NormalizedTick): void {
    const candidateHigh = tick.high !== undefined ? Math.max(tick.mid, tick.high) : tick.mid;
    const candidateLow = tick.low !== undefined ? Math.min(tick.mid, tick.low) : tick.mid;
    if (candidateHigh > bar.h) bar.h = candidateHigh;
    if (candidateLow < bar.l) bar.l = candidateLow;
    bar.ticks += 1;

    if (tick.ts > bar.lastTickTs) {
      bar.c = tick.mid;
      if (tick.volume !== undefined) bar.v = tick.volume;
      bar.lastTickTs = tick.ts;
      bar.source = tick.source;
      return;
    }

    // Replay / out-of-order snapshot: keep the last traded price we already
    // saw for this minute rather than regressing it.
    this.staleCloseTicks += 1;
  }

  private reportGap(symbol: Symbol, fromBucket: number, toBucket: number): void {
    const gap: CandleGap = {
      symbol,
      fromMs: fromBucket * MINUTE_MS,
      toMs: toBucket * MINUTE_MS,
      missingMinutes: toBucket - fromBucket + 1,
    };
    this.gaps += 1;
    this.gapMinutes += gap.missingMinutes;
    this.recentGaps.push(gap);
    if (this.recentGaps.length > RECENT_GAP_LIMIT) this.recentGaps.shift();
    this.onGap?.(gap);
  }

  private openBar(bucket: number, tick: NormalizedTick): OpenBar {
    const h = tick.high !== undefined ? Math.max(tick.mid, tick.high) : tick.mid;
    const l = tick.low !== undefined ? Math.min(tick.mid, tick.low) : tick.mid;
    return {
      bucket,
      o: tick.mid,
      h,
      l,
      c: tick.mid,
      v: tick.volume ?? null,
      ticks: 1,
      source: tick.source,
      lastTickTs: tick.ts,
    };
  }

  private emitClosed(symbol: Symbol, bar: OpenBar): void {
    this.barsClosed += 1;
    this.onClosed({
      symbol,
      t: bar.bucket * MINUTE_MS,
      o: bar.o,
      h: bar.h,
      l: bar.l,
      c: bar.c,
      v: bar.v,
      tickVolume: bar.ticks,
      source: bar.source,
    });
  }
}
