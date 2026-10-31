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

// P2-2 — Market Data Provider Plugin Registry.
//
// Replaces hardcoded provider imports in price.ts / candles.ts adapters
// with a plugin discovery system. Adding a new market data provider
// (e.g. Polygon, Alpha Vantage) means registering a plugin — no adapter
// code changes (OCP).
//
// Pattern mirrors ToolRegistry, IndicatorRegistry, and AlertRuleRegistry.

import type { BiquoteMarketState, Candle, Symbol, Timeframe } from '@kestrel/shared';

// --- Plugin interface -----------------------------------------------------

/** Options passed to every provider fetch call. */
export interface ProviderFetchOptions {
  signal?: AbortSignal;
  /** Per-call API key overrides (for tests / multi-tenant). */
  apiKey?: string;
  /**
   * Per-call base URL override. **Operator configuration only** — never pass a
   * value that originated from a request body, query string or user setting.
   *
   * Audit 2026-10-31 (R12): `/api/settings/test-market-provider` forwarded the
   * caller's `apiKey` field into this option, which turned an authenticated
   * user into an SSRF proxy (`baseUrl: 'http://169.254.169.254/…'`). Provider
   * endpoints come from `<PROVIDER>_BASE_URL` env vars or the adapter default.
   */
  baseUrl?: string;
  /** Optional ISO-8601 UTC start timestamp for historical candle queries. */
  from?: string;
  /** Optional ISO-8601 UTC end timestamp for historical candle queries. */
  to?: string;
  /** Optional flag to include the live open bar on OHLC requests. */
  includeOpenBar?: boolean;
}

export interface ProviderPriceSnapshot {
  price: number;
  provider: string;
  /** Best bid when the provider reports a real bid/ask spread (e.g. BiQuote MT5). */
  bid?: number;
  /** Best ask when the provider reports a real bid/ask spread (e.g. BiQuote MT5). */
  ask?: number;
  /** Exact observation timestamp (ms epoch) reported by the upstream provider. */
  observedAt?: number;
  /** ms since the upstream observed the value. null for REST providers that don't report quote age. */
  ageMs?: number | null;
  /** Market session state ('open' | 'closed') when reported by the provider. */
  marketState?: BiquoteMarketState;
  /** Upstream staleness flag when reported (BiQuote). */
  stale?: boolean;
  /** Quote age in seconds when reported by BiQuote. */
  quoteAgeSeconds?: number | null;
  /** Daily percentage change since session open (null when marketState === 'closed'). */
  dayDiffPercent?: number | null;
}

/**
 * A market data provider plugin.
 *
 * Each provider implements fetchPrice (latest tick), optionally fetchPrices
 * (multi-symbol batch quote), and optionally fetchCandles (OHLCV history).
 * Providers that don't support candles are skipped by the candles adapter.
 */
export interface MarketDataProvider {
  /** Unique provider name (e.g. 'biquote', 'finnhub', 'binance'). */
  readonly name: string;
  /** Human-readable label for catalogues / debugging. */
  readonly label: string;
  /** Whether this provider should always be tried first (pinned). */
  readonly pinned?: boolean;
  /**
   * Fetch the latest price for a symbol.
   * Returns the price, provider name, and optionally the data age in ms
   * and market-closure metadata.
   */
  fetchPrice(symbol: Symbol, opts?: ProviderFetchOptions): Promise<ProviderPriceSnapshot>;
  /**
   * Optional batch price fetch for multiple symbols in a single HTTP round-trip
   * (e.g. BiQuote `GET /api/latest?symbols=XAUUSD&symbols=EURUSD`).
   */
  fetchPrices?(
    symbols: Symbol[],
    opts?: ProviderFetchOptions,
  ): Promise<Map<Symbol, ProviderPriceSnapshot>>;
  /**
   * Fetch OHLCV candles. Returns null when the provider cannot serve this
   * symbol/timeframe (no throw — callers skip null gracefully).
   */
  fetchCandles?(
    symbol: Symbol,
    tf: Timeframe,
    count: number,
    opts?: ProviderFetchOptions,
  ): Promise<Candle[] | null>;
  /**
   * Optional connectivity probe for the settings "test provider" button.
   * Returns { ok: true } on success, { ok: false, error } on failure.
   */
  testConnection?(opts?: ProviderFetchOptions): Promise<{ ok: boolean; error?: string }>;
  /**
   * Optional per-provider guard: can this provider serve this symbol/tf?
   * Defaults to true when not implemented (provider is tried unconditionally).
   */
  supports?(symbol: Symbol, tf?: Timeframe): boolean;
}

// --- Registry -------------------------------------------------------------

export class MarketDataProviderRegistry {
  private providers = new Map<string, MarketDataProvider>();

  register(provider: MarketDataProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): MarketDataProvider {
    const p = this.providers.get(name);
    if (!p)
      throw new Error(
        `Unknown market data provider: "${name}". Registered: ${this.listNames().join(', ')}`,
      );
    return p;
  }

  has(name: string): boolean {
    return this.providers.has(name);
  }

  /** List all registered providers in priority order (pinned first). */
  list(): MarketDataProvider[] {
    return [...this.providers.values()].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return 0;
    });
  }

  listNames(): string[] {
    return this.list().map((p) => p.name);
  }
}

/** Global singleton. */
export const marketDataProviders = new MarketDataProviderRegistry();
