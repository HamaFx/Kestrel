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

// Price adapter — public surface for "what's the latest mid price?".
//
// Pipeline:
//   zod-validate → cache → primary (on-demand BiQuote REST / Binance REST) → fallback → DTO
//
// Multi-symbol batching (`getPrices` / `getPricesWithMeta`):
//   - Collapses N FX/Gold symbols into a single `GET /api/latest?symbols=A&symbols=B`
//     round-trip when ≥2 FX/Gold symbols miss the 3s cache, populating per-symbol
//     cache entries and falling back seamlessly to `getPriceWithMeta` per symbol.

import { SymbolSchema, type Symbol, type Tick } from '@kestrel/shared';

import { cacheKey, cacheTag, getDefaultCache, PRICE_TTL } from '../cache';
import { runWithFailover, type ProviderAttempt } from '../failover';
import { recordFailure, recordSuccess } from '../health';
import '../providers/provider-adapters'; // side-effect: register providers
import { isTickStreamEnabled } from '../providers/provider-adapters';
import {
  marketDataProviders,
  type ProviderPriceSnapshot,
} from '../providers/provider-registry';

export interface GetPriceOptions {
  signal?: AbortSignal;
  /** Override TTL in seconds (defaults to 3 s per docs/06). */
  ttlSeconds?: number;
  /** Override stale-while-error ceiling in seconds. Defaults to PRICE_TTL.maxStaleSeconds. */
  maxStaleSeconds?: number;
  /**
   * Adapter resolves API keys from env unless an injected `apiKeys` object is
   * provided — used by tests to avoid touching `process.env` and by the route
   * handler to centralise env access via `getServerEnv()`.
   */
  apiKeys?: Partial<{
    finnhub: string;
    biquoteBaseUrl: string;
  }>;
  /** @deprecated — provider ordering is now handled by the plugin registry. */
  marketDataProvider?: string;
}

export interface PriceResult {
  /** Normalised tick. */
  tick: Tick;
  /** True iff served from a stale-while-error fallback. */
  stale: boolean;
  /** ms epoch UTC the upstream produced this value. */
  producedAt: number;
  /**
   * Milliseconds since the upstream observed the tick (either from worker
   * `live_ticks` or BiQuote's `quoteAgeSeconds * 1000`).
   */
  ageMs: number | null;
}

function resolveKeys(opts: GetPriceOptions) {
  return {
    finnhub: opts.apiKeys?.finnhub ?? process.env.FINNHUB_API_KEY ?? '',
    biquoteBaseUrl:
      opts.apiKeys?.biquoteBaseUrl ?? process.env.BIQUOTE_BASE_URL ?? 'https://biquote.io',
  };
}

function snapshotToTick(symbol: Symbol, value: ProviderPriceSnapshot, fetchedAt: number): Tick {
  return {
    symbol,
    bid: value.price,
    ask: value.price,
    mid: value.price,
    ts: fetchedAt,
    source: value.provider,
    ...(value.marketState ? { marketState: value.marketState } : {}),
    ...(value.quoteAgeSeconds !== undefined ? { quoteAgeSeconds: value.quoteAgeSeconds } : {}),
    ...(value.dayDiffPercent !== undefined ? { dayDiffPercent: value.dayDiffPercent } : {}),
  };
}

/**
 * Latest mid price for `symbol`. Cached at the 3-second tier; this means
 * the 1.5 s polling browser hits the upstream provider at most ~1× per
 * 3 seconds across the entire deployment.
 */
export async function getPrice(symbolInput: Symbol, opts: GetPriceOptions = {}): Promise<Tick> {
  const r = await getPriceWithMeta(symbolInput, opts);
  return r.tick;
}

/**
 * Same as `getPrice` but returns SWR / freshness metadata so the route
 * handler / chart UI can decide whether to flag staleness.
 */
export async function getPriceWithMeta(
  symbolInput: Symbol,
  opts: GetPriceOptions = {},
): Promise<PriceResult> {
  const symbol = SymbolSchema.parse(symbolInput);
  const keys = resolveKeys(opts);
  const ttl = opts.ttlSeconds ?? PRICE_TTL.ttlSeconds;
  const swr = opts.maxStaleSeconds ?? PRICE_TTL.maxStaleSeconds;

  const cache = await getDefaultCache();
  const key = cacheKey({ resource: 'price', symbol });
  const tags = [cacheTag('price'), cacheTag('price', symbol)];

  const r = await cache.fetchWithMeta<{ tick: Tick; ageMs: number | null }>(
    key,
    async () => {
      const providers = marketDataProviders.list();
      const attempts: ProviderAttempt<ProviderPriceSnapshot>[] = providers
        .filter((p) => p.supports?.(symbol) ?? true)
        .map((p) => ({
          name: p.name,
          pinned: p.pinned ?? false,
          run: async () => {
            const result = await p.fetchPrice(symbol, {
              ...(opts.signal ? { signal: opts.signal } : {}),
              baseUrl: keys.biquoteBaseUrl,
              apiKey: keys.finnhub,
            });
            return {
              price: result.price,
              provider: result.provider,
              ageMs: result.ageMs ?? null,
              ...(result.marketState ? { marketState: result.marketState } : {}),
              ...(result.quoteAgeSeconds !== undefined
                ? { quoteAgeSeconds: result.quoteAgeSeconds }
                : {}),
              ...(result.dayDiffPercent !== undefined
                ? { dayDiffPercent: result.dayDiffPercent }
                : {}),
            };
          },
        }));

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

      const { value } = await runWithFailover(attempts);
      const fetchedAt = Date.now();
      const tick = snapshotToTick(symbol, value, fetchedAt);
      return { tick, ageMs: value.ageMs ?? null };
    },
    { ttlSeconds: ttl, maxStaleSeconds: swr, tags },
  );

  return {
    tick: r.value.tick,
    stale: r.meta.stale,
    producedAt: r.meta.producedAt,
    ageMs: r.value.ageMs,
  };
}

/**
 * Batch price lookup for multiple symbols with SWR metadata.
 *
 * When 2 or more FX/Gold symbols miss the fresh cache tier in on-demand mode,
 * this issues a single `GET /api/latest?symbols=A&symbols=B` batch request via
 * `biquoteProvider.fetchPrices()`, populates each symbol's cache entry, and
 * falls back to `getPriceWithMeta()` for any unquoted or crypto symbols.
 */
export async function getPricesWithMeta(
  symbolsInput: readonly Symbol[],
  opts: GetPriceOptions = {},
): Promise<PriceResult[]> {
  if (symbolsInput.length === 0) return [];
  const symbols = symbolsInput.map((s) => SymbolSchema.parse(s));
  if (symbols.length === 1) {
    return [await getPriceWithMeta(symbols[0]!, opts)];
  }

  const keys = resolveKeys(opts);
  const ttl = opts.ttlSeconds ?? PRICE_TTL.ttlSeconds;
  const swr = opts.maxStaleSeconds ?? PRICE_TTL.maxStaleSeconds;
  const cache = await getDefaultCache();

  const biquoteProvider = marketDataProviders.has('biquote')
    ? marketDataProviders.get('biquote')
    : null;
  const canBatchBiquote =
    !isTickStreamEnabled() &&
    Boolean(biquoteProvider?.fetchPrices) &&
    (!opts.marketDataProvider || opts.marketDataProvider === 'biquote');

  if (canBatchBiquote && biquoteProvider?.fetchPrices) {
    // Identify unique BiQuote-supported symbols that are not fresh in cache.
    const coldBiquoteSymbols: Symbol[] = [];
    const seen = new Set<Symbol>();
    for (const s of symbols) {
      if (seen.has(s)) continue;
      seen.add(s);
      if (!(biquoteProvider.supports?.(s) ?? false)) continue;
      const existing = await cache.getWithMeta<{ tick: Tick; ageMs: number | null }>(
        cacheKey({ resource: 'price', symbol: s }),
      );
      if (!existing || existing.meta.stale) {
        coldBiquoteSymbols.push(s);
      }
    }

    if (coldBiquoteSymbols.length >= 2) {
      try {
        const batchMap = await biquoteProvider.fetchPrices(coldBiquoteSymbols, {
          ...(opts.signal ? { signal: opts.signal } : {}),
          baseUrl: keys.biquoteBaseUrl,
        });
        recordSuccess('biquote');
        const fetchedAt = Date.now();
        await Promise.all(
          [...batchMap.entries()].map(async ([sym, snap]) => {
            const tick = snapshotToTick(sym, snap, fetchedAt);
            await cache.set(
              cacheKey({ resource: 'price', symbol: sym }),
              { tick, ageMs: snap.ageMs ?? null },
              {
                ttlSeconds: ttl,
                maxStaleSeconds: swr,
                tags: [cacheTag('price'), cacheTag('price', sym)],
              },
            );
          }),
        );
      } catch (err) {
        recordFailure('biquote', err);
        // Fall through to per-symbol getPriceWithMeta with full failover + SWR.
      }
    }
  }

  return Promise.all(symbols.map((s) => getPriceWithMeta(s, opts)));
}

/**
 * Batch price lookup returning normalized `Tick[]` in input order.
 */
export async function getPrices(
  symbolsInput: readonly Symbol[],
  opts: GetPriceOptions = {},
): Promise<Tick[]> {
  const results = await getPricesWithMeta(symbolsInput, opts);
  return results.map((r) => r.tick);
}
