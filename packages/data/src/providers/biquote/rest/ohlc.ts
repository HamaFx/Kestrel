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

import { ProviderError } from '../../../errors';
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
  /** Bar count, capped at BiQuote's documented 1000-per-series limit. */
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

/**
 * Fetch up to `count` recent or date-bounded (`from`/`to`) OHLC bars from BiQuote.
 *
 * Throws ProviderError on:
 *   - Unsupported timeframe (W1) — BiQuote doesn't expose weekly.
 *   - Quota / HTTP failure / parse error.
 *   - Empty array (treated as "no data" so failover can move on).
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

  const limit = Math.max(1, Math.min(args.count, 1000));
  const path = `/api/${toBiquoteSymbol(validated)}/ohlc`;
  const env = await call(
    path,
    {
      interval: tf,
      limit: String(limit),
      ...(args.from ? { from: args.from } : {}),
      ...(args.to ? { to: args.to } : {}),
    },
    OhlcEnvelopeSchema,
    args,
  );
  const raw = env.bars;

  // BiQuote returns bars NEWEST-first; flip to oldest-first
  // for downstream consumers (indicators, charts) that expect that order.
  // Also drop the in-progress bar unless the caller asked to keep it.
  const ascending = [...raw].reverse();
  const filtered = args.includeOpenBar ? ascending : ascending.filter((b) => !b.isOpen);
  if (filtered.length === 0) {
    throw new ProviderError('PROVIDER_HTTP_ERROR', PROVIDER, 'empty candle response');
  }

  // Final monotonicity guard — if BiQuote ever flips ordering again,
  // surface it loudly instead of shipping mixed-order bars to indicators.
  for (let i = 1; i < filtered.length; i += 1) {
    if (Date.parse(filtered[i]!.openTime) < Date.parse(filtered[i - 1]!.openTime)) {
      throw new ProviderError(
        'PROVIDER_PARSE_ERROR',
        PROVIDER,
        'OHLC bars are not in ascending-time order — upstream contract changed',
      );
    }
  }

  return filtered;
}
