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

// Pseudo-provider that reads the `candles_1m` table maintained by the
// Phase 8 worker (apps/worker/src/persistence/candles-1m.ts).
//
// Only relevant for 1-minute candles. For higher timeframes the Vercel
// `/api/market/candles` route asks BiQuote's `/ohlc` REST endpoint
// directly because the worker only persists 1m bars.
//
// Behaviour:
//   - "Healthy" when the newest bar for the symbol is within 90s of now
//     (1.5× the bar size, so a single missed minute on the worker doesn't
//     trip the fallthrough).
//   - On stale or missing data, throws `ProviderEmptyError` so
//     `runWithFailover` falls through without recording a health
//     failure. Phase 2 hardening §2 — the previous `ProviderError` path
//     dinged the per-provider health score during normal worker
//     restarts and demoted the worker-fed pipeline below the REST
//     fallback.

import type { getDb } from '@kestrel/db';
import { candles1m } from '@kestrel/db/schema';
import type { Symbol } from '@kestrel/shared';
import { desc, eq } from 'drizzle-orm';

import { ProviderEmptyError } from '../../errors';

const PROVIDER = 'candles-1m';
const FRESHNESS_WINDOW_MS = 90_000;

export interface FetchCandles1mArgs {
  symbol: Symbol;
  /** Number of bars to return (oldest-first). */
  count: number;
  /** Inject the drizzle client. Defaults to `getDb()`. */
  db?: ReturnType<typeof getDb>;
  /** Override the freshness window (used by tests). */
  freshnessWindowMs?: number;
}

export interface Candles1mBar {
  /** ms epoch UTC. */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number | null;
}

export interface FetchCandles1mResult {
  bars: Candles1mBar[];
  /** Stable string forwarded to the Candle DTO's `source` field. */
  provider: string;
}

/**
 * Read the latest `count` 1m bars for `symbol`, oldest-first. Throws
 * `ProviderEmptyError` (NOT `ProviderError`) if no bars exist or the
 * freshest bar is stale, so the failover runner falls through without
 * recording a health failure.
 */
export async function fetchCandles1m(args: FetchCandles1mArgs): Promise<FetchCandles1mResult> {
  const db = args.db ?? (await loadDb());
  const window = args.freshnessWindowMs ?? FRESHNESS_WINDOW_MS;
  const limit = Math.max(1, Math.min(args.count, 5000));

  // Query only the `limit` newest rows via the (symbol, t) index, then
  // reverse in memory so callers receive oldest-first ascending order.
  const rowsDesc = await db
    .select({
      t: candles1m.t,
      o: candles1m.o,
      h: candles1m.h,
      l: candles1m.l,
      c: candles1m.c,
      v: candles1m.v,
      source: candles1m.source,
    })
    .from(candles1m)
    .where(eq(candles1m.symbol, args.symbol))
    .orderBy(desc(candles1m.t))
    .limit(limit);

  if (rowsDesc.length === 0) {
    throw new ProviderEmptyError(PROVIDER, `no candles_1m rows for ${args.symbol}`);
  }

  // Ensure ascending order regardless of whether a test stub returned asc or desc
  const ascending = [...rowsDesc].sort((a, b) => a.t.getTime() - b.t.getTime());
  const newestRow = ascending[ascending.length - 1];
  if (!newestRow) {
    throw new ProviderEmptyError(PROVIDER, 'unexpected empty rows');
  }

  const newest = newestRow.t.getTime();
  const ageMs = Date.now() - newest;
  if (ageMs > window) {
    throw new ProviderEmptyError(
      PROVIDER,
      `candles_1m stale for ${args.symbol}: newest bar ${ageMs}ms ago`,
    );
  }

  const slice = ascending.slice(-limit);
  const provider = newestRow.source;

  return {
    bars: slice.map((r) => ({
      t: r.t.getTime(),
      o: r.o,
      h: r.h,
      l: r.l,
      c: r.c,
      v: r.v,
    })),
    provider,
  };
}

async function loadDb(): Promise<ReturnType<typeof getDb>> {
  const mod = await import('@kestrel/db');
  return mod.getDb();
}
