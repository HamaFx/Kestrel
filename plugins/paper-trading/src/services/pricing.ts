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

// Quote acquisition for the paper broker.
//
// Uses the same @kestrel/data failover/cache path as the rest of Kestrel; a
// mid-only provider is widened to a synthetic spread in the domain layer.
//
// R8 (audit 2026-10-31): reads the meta-returning getters so the broker sees
// stale-while-revalidate cache fallbacks and the total quote age. A stale
// quote can no longer look "fresh" just because the provider omitted
// `quoteAgeSeconds`.

import { getPrice, getPrices, priceAgeSeconds, type PriceResult } from '@kestrel/data';
import { pipSize, type Symbol, type Tick } from '@kestrel/shared';

import type { MarketTick } from '../domain';
import type { PaperSettings } from '../settings';

export function spreadFor(symbol: string, settings: PaperSettings): number {
  return settings.spreadPips * pipSize(symbol);
}

export function slippageFor(symbol: string, settings: PaperSettings): number {
  return settings.slippagePips * pipSize(symbol);
}

/**
 * Normalise an adapter tick to the broker's tick shape, folding the adapter's
 * freshness metadata into `stale` / `quoteAgeSeconds` so the tradability gate
 * can act on it even when the provider itself reported neither.
 */
export function toMarketTick(tick: Tick, meta?: PriceResult): MarketTick {
  const ageSeconds = meta ? priceAgeSeconds(meta) : undefined;
  const stale = meta ? meta.stale || tick.stale === true : tick.stale;
  const quoteAgeSeconds = ageSeconds ?? tick.quoteAgeSeconds;
  return {
    symbol: tick.symbol,
    bid: tick.bid,
    ask: tick.ask,
    mid: tick.mid,
    ts: tick.ts,
    ...(tick.source ? { source: tick.source } : {}),
    ...(tick.marketState ? { marketState: tick.marketState } : {}),
    ...(stale !== undefined ? { stale } : {}),
    ...(quoteAgeSeconds !== undefined ? { quoteAgeSeconds } : {}),
  };
}

/** Quotes older than five minutes are never tradable, even without flags. */
const MAX_QUOTE_AGE_SECONDS = 300;

/**
 * A market order or stop trigger may only execute against a live quote.
 *
 * `marketState === 'closed'` (weekend/holiday), an explicit upstream or cache
 * `stale` flag, a quote older than five minutes, or a quote with no positive
 * finite price all block execution. Resting limit/stop orders may still be
 * *placed*; they simply do not fill until the market reopens with a fresh
 * quote.
 */
export function isTickTradable(tick: MarketTick): { ok: true } | { ok: false; reason: string } {
  if (tick.marketState === 'closed') {
    return {
      ok: false,
      reason: `Market for ${tick.symbol} is currently closed; market orders cannot fill until the session opens.`,
    };
  }
  if (tick.stale === true) {
    return {
      ok: false,
      reason: `The quote for ${tick.symbol} is stale; market orders cannot fill until a fresh quote arrives.`,
    };
  }
  if (typeof tick.quoteAgeSeconds === 'number' && tick.quoteAgeSeconds > MAX_QUOTE_AGE_SECONDS) {
    return {
      ok: false,
      reason: `The quote for ${tick.symbol} is ${Math.round(
        tick.quoteAgeSeconds,
      )}s old; market orders cannot fill on a quote older than ${MAX_QUOTE_AGE_SECONDS}s.`,
    };
  }
  // R8 — a zero/near-zero or non-finite price is not a quote. This used to be
  // clamped to 1e-7 downstream, which turned a dead feed into a fillable one.
  const mid = Number.isFinite(tick.mid) && tick.mid > 0 ? tick.mid : (tick.bid + tick.ask) / 2;
  if (!Number.isFinite(mid) || mid <= 0) {
    return {
      ok: false,
      reason: `The quote for ${tick.symbol} has no usable price (bid ${tick.bid}, ask ${tick.ask}, mid ${tick.mid}); market orders cannot fill against it.`,
    };
  }
  return { ok: true };
}

export async function loadTick(symbol: string, signal?: AbortSignal): Promise<MarketTick> {
  const result = await getPrice(symbol as Symbol, signal ? { signal } : {});
  return toMarketTick(result.tick, result);
}

export async function loadTicks(
  symbols: readonly string[],
  signal?: AbortSignal,
): Promise<Map<string, MarketTick>> {
  const result = new Map<string, MarketTick>();
  if (symbols.length === 0) return result;
  try {
    const results = await getPrices(symbols as Symbol[], signal ? { signal } : {});
    for (const r of results) result.set(r.tick.symbol, toMarketTick(r.tick, r));
  } catch {
    // Batch failure: fall back to per-symbol best effort so one bad symbol
    // does not strand every other position.
    await Promise.allSettled(
      symbols.map(async (symbol) => {
        try {
          result.set(symbol, await loadTick(symbol, signal));
        } catch {
          // ignored — the caller will skip symbols without a quote
        }
      }),
    );
  }
  return result;
}
