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

// Candles adapter — public surface for OHLC windows.
//
// Cache discipline:
//   - Latest windows are cached by `hfx:candles:${symbol}:${tf}:n${count}` with
//     `lastBar=true` TTLs (30s..5m).
//   - Date-bounded historical windows (`from` / `to`, e.g. Trade Setup Replay)
//     include `:f${from}:t${to}` in the cache key so historical queries never
//     collide with live latest-bar cache entries, and use `lastBar=false` TTL
//     (10 minutes) when `to` is in the past.

import { SymbolSchema, type Candle, type Symbol, type Timeframe } from '@kestrel/shared';

import { cacheKey, cacheTag, candleTtl, getDefaultCache } from '../cache';
import { ProviderError } from '../errors';
import { runWithFailover, type ProviderAttempt } from '../failover';
import { ensureDataProvidersRegistered } from '../providers/provider-adapters';
import { marketDataProviders } from '../providers/provider-registry';

export interface GetCandlesOptions {
  signal?: AbortSignal;
  /** Number of bars to request (capped at 5000 by upstream). Default 300. */
  count?: number;
  /** Optional ISO-8601 UTC start timestamp for historical range queries (e.g. Trade Setup Replay). */
  from?: string;
  /** Optional ISO-8601 UTC end timestamp for historical range queries (e.g. Trade Setup Replay). */
  to?: string;
  /** Optional flag to include the live open bar when supported by upstream. */
  includeOpenBar?: boolean;
  apiKeys?: Partial<{ finnhub: string; biquoteBaseUrl: string }>;
  marketDataProvider?: string;
}

export interface CandlesResult {
  candles: Candle[];
  stale: boolean;
  producedAt: number;
}

/**
 * Age of a candle window in seconds: time since the adapter produced it,
 * which is the read the staleness gate cares about (R8, audit 2026-10-31).
 */
export function candlesAgeSeconds(result: CandlesResult, now: number = Date.now()): number {
  return Math.max(0, Math.round(((now - result.producedAt) / 1000) * 10) / 10);
}

const DEFAULT_COUNT = 300;
const MAX_COUNT = 5000;

function resolveKeys(opts: GetCandlesOptions) {
  return {
    finnhub: opts.apiKeys?.finnhub ?? process.env.FINNHUB_API_KEY ?? '',
    biquoteBaseUrl:
      opts.apiKeys?.biquoteBaseUrl ?? process.env.BIQUOTE_BASE_URL ?? 'https://biquote.io',
  };
}

/**
 * OHLC candles, oldest-first, length up to `count` (default 300).
 *
 * Returns normalised `Candle[]` with `source` and `fetchedAt` tags. The
 * adapter never throws on partial data — if a provider returns fewer bars
 * than requested, that's what the caller gets. On a primary-provider
 * failure (quota, rate limit, HTTP), we fall back to subsequent attempts.
 * 4H is synthesised from 1H on the Finnhub side.
 *
 * R8 (audit 2026-10-31) — this drops the stale-while-revalidate flag, so it
 * is named `…Unchecked`. Anything the AI, alerts or backtests read must use
 * `getCandlesWithMeta` (or `getCandles`) and gate on `stale`.
 */
export async function getCandlesUnchecked(
  symbolInput: Symbol,
  tf: Timeframe,
  opts: GetCandlesOptions = {},
): Promise<Candle[]> {
  const r = await getCandlesWithMeta(symbolInput, tf, opts);
  return r.candles;
}

/**
 * Default candle read: same window as `getCandlesUnchecked` plus the SWR
 * freshness metadata (`stale`, `producedAt`) consumers must not drop (R8).
 */
export async function getCandles(
  symbolInput: Symbol,
  tf: Timeframe,
  opts: GetCandlesOptions = {},
): Promise<CandlesResult> {
  return getCandlesWithMeta(symbolInput, tf, opts);
}

/** SWR-aware variant. */
export async function getCandlesWithMeta(
  symbolInput: Symbol,
  tf: Timeframe,
  opts: GetCandlesOptions = {},
): Promise<CandlesResult> {
  ensureDataProvidersRegistered();
  const symbol = SymbolSchema.parse(symbolInput);
  const count = Math.max(1, Math.min(opts.count ?? DEFAULT_COUNT, MAX_COUNT));
  const keys = resolveKeys(opts);

  const isHistoricalClosedWindow = Boolean(
    opts.to && Number.isFinite(Date.parse(opts.to)) && Date.parse(opts.to) < Date.now() - 60_000,
  );
  const policy = candleTtl(tf, !isHistoricalClosedWindow);

  const rangeSuffix = opts.from || opts.to ? `:f${opts.from ?? ''}:t${opts.to ?? ''}` : '';
  const openSuffix = opts.includeOpenBar ? ':open1' : '';

  const cache = await getDefaultCache();
  const key = cacheKey({
    resource: 'candles',
    symbol,
    tf,
    extra: `n${count}${rangeSuffix}${openSuffix}`,
  });
  const tags = [cacheTag('candles'), cacheTag('candles', symbol)];

  const r = await cache.fetchWithMeta<Candle[]>(
    key,
    async () => {
      const providers = marketDataProviders.list();
      const attempts: ProviderAttempt<Candle[]>[] = providers
        .filter(
          (p) =>
            typeof p.fetchCandles === 'function' &&
            (p.name === 'finnhub' ? Boolean(keys.finnhub) : (p.supports?.(symbol, tf) ?? true)),
        )
        .map((p) => ({
          name: p.name,
          pinned: p.pinned ?? false,
          run: async () => {
            const c = await p.fetchCandles!(symbol, tf, count, {
              ...(opts.signal ? { signal: opts.signal } : {}),
              ...(opts.from ? { from: opts.from } : {}),
              ...(opts.to ? { to: opts.to } : {}),
              ...(opts.includeOpenBar !== undefined ? { includeOpenBar: opts.includeOpenBar } : {}),
              apiKey: keys.finnhub,
              baseUrl: keys.biquoteBaseUrl,
            });
            if (!c)
              throw new ProviderError(
                'PROVIDER_HTTP_ERROR',
                p.name,
                'provider returned null for symbol/tf',
              );
            return c;
          },
        }));

      if (attempts.length === 0) {
        throw new ProviderError(
          'NO_PROVIDER_AVAILABLE',
          'none',
          'no candle provider configured — set FINNHUB_API_KEY or ensure a provider supports this symbol/timeframe',
        );
      }

      if (opts.marketDataProvider) {
        attempts.forEach((attempt) => {
          if (attempt.name === opts.marketDataProvider) {
            attempt.pinned = true;
          } else {
            attempt.pinned = false;
          }
        });
        attempts.sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1));
      }

      const { value } = await runWithFailover(
        attempts,
        opts.signal ? { signal: opts.signal } : undefined,
      );
      return value;
    },
    { ttlSeconds: policy.ttlSeconds, maxStaleSeconds: policy.maxStaleSeconds, tags },
  );

  return { candles: r.value, stale: r.meta.stale, producedAt: r.meta.producedAt };
}
