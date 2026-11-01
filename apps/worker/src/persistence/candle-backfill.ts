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

// Gap backfill for the 1m candle pipeline (R9, audit 2026-10-31).
//
// When the aggregator jumps more than one minute it reports a `CandleGap`.
// This module asks the existing REST OHLC adapters (`@kestrel/data`
// `getCandlesWithMeta`, which routes 1m to BiQuote `/ohlc` for FX/gold and
// to Binance klines for crypto) for the missing minutes and returns only the
// bars the provider actually produced inside the gap range.
//
// Rules:
//   - Never synthesise a bar. A flat bar interpolated from the previous
//     close is a fabricated price and indicators would happily compute over
//     it; if the provider has nothing for a minute, the gap is reported and
//     left empty instead.
//   - Never ask the database for its own missing rows in a way that could
//     echo back a partial bar: the open (unfinished) bar is excluded and the
//     range is clamped to the missing minutes.
//   - Cap the range: a weekend or a long outage is an outage, not a
//     backfill job. Over the cap we report the range and stop.

import { getCandlesWithMeta } from '@kestrel/data';
import { isForexWeekend, symbolCategory } from '@kestrel/shared';

import type { Candle1mBar, CandleGap } from '../aggregator/candle-1m.js';
import type { Logger } from '../log.js';

const MINUTE_MS = 60_000;

/** Longest gap we will ask a provider to backfill in one call. */
export const MAX_GAP_BACKFILL_MINUTES = 240;

export type GapBackfillStatus =
  | 'ok'
  /** Provider answered but covered only part of the gap (thin/no-trade minutes). */
  | 'partial'
  /** Gap ends inside the FX weekend; there are no bars to fetch. */
  | 'market-closed'
  /** Gap is longer than MAX_GAP_BACKFILL_MINUTES — reported, not fetched. */
  | 'cap-exceeded'
  /** Provider answered with nothing inside the range. */
  | 'no-data'
  /** Provider call failed (network, quota, unknown symbol). */
  | 'error';

export interface GapBackfillResult {
  status: GapBackfillStatus;
  /**
   * Provider-sourced bars inside the gap range, oldest first. Always empty
   * unless the provider returned them — this function never fabricates.
   */
  bars: Candle1mBar[];
  missingMinutes: number;
  /** Provider served a stale SWR window (the bars are still real). */
  stale?: boolean;
  detail?: string;
}

export interface FetchGapBarsArgs {
  gap: CandleGap;
  log: Logger;
  signal?: AbortSignal;
}

/**
 * Fetch the missing minutes of `gap` from the REST OHLC adapters.
 * Never throws: a provider failure is a `status: 'error'` result the caller
 * reports.
 */
export async function fetchGapBars(args: FetchGapBarsArgs): Promise<GapBackfillResult> {
  const { gap, log } = args;
  const missingMinutes = gap.missingMinutes;

  if (missingMinutes > MAX_GAP_BACKFILL_MINUTES) {
    return { status: 'cap-exceeded', bars: [], missingMinutes };
  }

  // FX/gold have no bars while the market is closed; asking a provider for a
  // weekend range would return the surrounding sessions' bars at best.
  if (symbolCategory(gap.symbol) !== 'crypto' && isForexWeekend(new Date(gap.toMs))) {
    return { status: 'market-closed', bars: [], missingMinutes };
  }

  const toExclusiveMs = gap.toMs + MINUTE_MS;
  try {
    const { candles, stale } = await getCandlesWithMeta(gap.symbol, '1m', {
      from: new Date(gap.fromMs).toISOString(),
      to: new Date(toExclusiveMs - 1).toISOString(),
      count: Math.min(missingMinutes + 2, MAX_GAP_BACKFILL_MINUTES + 2),
      includeOpenBar: false,
      ...(args.signal ? { signal: args.signal } : {}),
    });

    const inRange = candles.filter((c) => c.t >= gap.fromMs && c.t < toExclusiveMs);
    if (inRange.length === 0) {
      return { status: 'no-data', bars: [], missingMinutes, stale };
    }

    const bars: Candle1mBar[] = inRange.map((c) => ({
      symbol: gap.symbol,
      t: c.t,
      o: c.o,
      h: c.h,
      l: c.l,
      c: c.c,
      v: c.v,
      // 0 = "not observed by this worker's tick aggregator". The bar came
      // from the provider, not from local ticks, and tickVolume is
      // informational (readers use `v`).
      tickVolume: 0,
      source: `${c.source}-backfill`,
    }));

    return {
      status: bars.length >= missingMinutes ? 'ok' : 'partial',
      bars,
      missingMinutes,
      stale,
    };
  } catch (err) {
    log.warn('gap backfill fetch failed', {
      symbol: gap.symbol,
      from: new Date(gap.fromMs).toISOString(),
      to: new Date(gap.toMs).toISOString(),
      err: String(err),
    });
    return { status: 'error', bars: [], missingMinutes, detail: String(err) };
  }
}
