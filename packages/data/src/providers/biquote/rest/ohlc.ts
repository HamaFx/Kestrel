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

// OHLC candle endpoint (`GET /api/{symbol}/ohlc`) plus the bar-ordering guards.

import {
  BiquoteOhlcBarSchema,
  type BiquoteOhlcBar,
  type Symbol,
  type Timeframe,
} from '@kestrel/shared';
import { z } from 'zod';

import { ProviderError } from '@data/errors';

import { assertSupportedSymbol } from '../filter';
import { toBiquoteSymbol, toBiquoteTimeframe } from '../map';
import { call, PROVIDER, type CallOptions } from './call';

/** OHLC response is `{ symbol, interval, bars: [...] }`. */
const OhlcEnvelopeSchema = z.object({
  symbol: z.string().min(1),
  interval: z.string().min(1),
  bars: z.array(BiquoteOhlcBarSchema),
});

export interface FetchOhlcArgs extends CallOptions {
  symbol: Symbol;
  tf: Timeframe;
  /** Bar count; values above 1000 are paged backward (up to 5,000 bars). */
  count: number;
  /**
   * If false (default), drop the live unfinished bar (`isOpen=true`).
   * Set to `true` only when the caller explicitly wants the head bar.
   */
  includeOpenBar?: boolean;
  /** Optional ISO-8601 UTC start timestamp (e.g. "2026-05-01T00:00:00.000Z"). */
  from?: string;
  /** Optional ISO-8601 UTC end timestamp (e.g. "2026-05-02T00:00:00.000Z"). */
  to?: string;
}

/** BiQuote caps a single OHLC response at 1,000 bars. */
const MAX_BARS_PER_PAGE = 1000;
/** Hard ceiling keeps a single call at 5 pages of history plus one guard page. */
const MAX_OHLC_PAGES = 6;
const MAX_OHLC_BARS = 5000;

/**
 * Fetch up to `count` recent or date-bounded (`from`/`to`) OHLC bars from BiQuote.
 *
 * BiQuote returns at most 1,000 bars per HTTP call, so windows above that are
 * paged backward using the oldest bar's `openTime - 1ms` as the `to` cursor,
 * deduplicated by `openTime` (bounded by `MAX_OHLC_PAGES`).
 *
 * Throws ProviderError on:
 *   - Unsupported timeframe (W1) — callers must synthesize weekly bars from
 *     daily ones (`synth1WFrom1D`); this endpoint has no W1 interval.
 *   - Quota / HTTP failure / parse error.
 *   - Empty array on the first page (treated as "no data" so failover can move on).
 *
 * Returns oldest-first bars.
 */
export async function fetchOhlc(args: FetchOhlcArgs): Promise<BiquoteOhlcBar[]> {
  const validated = assertSupportedSymbol(args.symbol);
  const tf = toBiquoteTimeframe(args.tf);
  if (tf === null) {
    throw new ProviderError(
      'PROVIDER_HTTP_ERROR',
      PROVIDER,
      `unsupported timeframe "${args.tf}" — biquote does not provide weekly bars`,
    );
  }

  const targetCount = Math.max(1, Math.min(args.count, MAX_OHLC_BARS));
  const path = `/api/${toBiquoteSymbol(validated)}/ohlc`;

  // BiQuote returns bars NEWEST-first. We collect pages keyed by openTime so
  // overlapping boundary bars dedupe, then sort ascending at the end.
  const byTime = new Map<number, BiquoteOhlcBar>();
  let pageTo = args.to;
  let oldestMs = Number.POSITIVE_INFINITY;

  for (let page = 0; page < MAX_OHLC_PAGES && byTime.size < targetCount; page += 1) {
    // Request one extra bar on the first page because the live (open) bar is
    // dropped unless the caller opted in — same for every top-up page.
    const limit = String(
      Math.min(MAX_BARS_PER_PAGE, targetCount - byTime.size + (args.includeOpenBar ? 0 : 1)),
    );
    const env = await call(
      path,
      {
        interval: tf,
        limit,
        ...(page === 0 && args.from ? { from: args.from } : {}),
        ...(pageTo ? { to: pageTo } : {}),
      },
      OhlcEnvelopeSchema,
      args,
    );

    if (env.bars.length === 0) {
      if (page === 0) {
        throw new ProviderError('PROVIDER_HTTP_ERROR', PROVIDER, 'empty candle response');
      }
      break;
    }

    for (const bar of env.bars) byTime.set(Date.parse(bar.openTime), bar);

    // A short page means upstream ran out of older bars — stop paging.
    if (env.bars.length < Number(limit)) break;

    const pageOldest = env.bars.reduce(
      (min, bar) => Math.min(min, Date.parse(bar.openTime)),
      Number.POSITIVE_INFINITY,
    );
    // No older bars upstream, or the cursor was ignored — stop paging.
    if (!(pageOldest < oldestMs)) break;
    oldestMs = pageOldest;
    if (args.from && oldestMs <= Date.parse(args.from)) break;
    pageTo = new Date(oldestMs - 1).toISOString();
  }

  const ascending = [...byTime.values()].sort(
    (a, b) => Date.parse(a.openTime) - Date.parse(b.openTime),
  );
  const filtered = args.includeOpenBar ? ascending : ascending.filter((b) => !b.isOpen);
  if (filtered.length === 0) {
    throw new ProviderError('PROVIDER_HTTP_ERROR', PROVIDER, 'empty candle response');
  }

  // Keep the most recent `targetCount` bars in strict ascending order.
  return filtered.slice(-targetCount);
}
