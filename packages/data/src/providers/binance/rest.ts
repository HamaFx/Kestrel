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

import { getSymbolDefinition, type Symbol, type Timeframe } from '@kestrel/shared';
import { z } from 'zod';

import type { ThrottleConfig } from '../../cache/throttle';
import { ProviderError } from '../../errors';
import { providerFetchJson } from '../http';
import { isCryptoSymbol, toBinanceInterval } from './map';
import { parseKline, type NormalizedBinanceCandle } from './types';

const PROVIDER = 'binance';
const BASE_URL = 'https://api.binance.com';
const DEFAULT_TIMEOUT_MS = 8_000;
/**
 * Price quotes are a poll-loop read: a stalled exchange must fail over to the
 * next provider quickly, not hold the request for the full candle timeout.
 */
const PRICE_TIMEOUT_MS = 3_000;

const THROTTLE: ThrottleConfig = { limit: 20, windowMs: 60_000 };

interface CallOptions {
  signal?: AbortSignal;
  skipThrottle?: boolean;
  /** Override the transport timeout (price reads use a shorter budget). */
  timeoutMs?: number;
}

export interface BinanceFetchCandlesOptions extends CallOptions {
  includeOpenBar?: boolean;
  now?: number;
}

async function klinesCall(
  query: Record<string, string>,
  opts: CallOptions,
): Promise<NormalizedBinanceCandle[]> {
  const url = new URL(`${BASE_URL}/api/v3/klines`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

  const json = await providerFetchJson<unknown>({
    provider: PROVIDER,
    url,
    schema: z.unknown(),
    throttle: THROTTLE,
    ...(opts.skipThrottle !== undefined ? { skipThrottle: opts.skipThrottle } : {}),
    ...(opts.signal ? { signal: opts.signal } : {}),
    timeoutMs: DEFAULT_TIMEOUT_MS,
    quotaStatuses: [429, 418],
  });

  if (!Array.isArray(json)) {
    throw new ProviderError('PROVIDER_PARSE_ERROR', PROVIDER, 'expected array response');
  }

  const out: NormalizedBinanceCandle[] = [];
  for (const item of json) {
    if (!Array.isArray(item) || item.length < 11) {
      throw new ProviderError('PROVIDER_PARSE_ERROR', PROVIDER, 'invalid kline array');
    }
    const k = parseKline(item as unknown[]);
    out.push({
      t: k.openTime,
      o: Number.parseFloat(k.open),
      h: Number.parseFloat(k.high),
      l: Number.parseFloat(k.low),
      c: Number.parseFloat(k.close),
      v: Number.parseFloat(k.volume),
      closeTime: k.closeTime,
    });
  }

  if (out.length === 0) {
    throw new ProviderError('PROVIDER_HTTP_ERROR', PROVIDER, 'empty kline response');
  }

  out.sort((a, b) => a.t - b.t);
  return out;
}

/** Binance caps a single klines response at 1,000 bars. */
const MAX_BARS_PER_PAGE = 1000;
/** Hard ceiling keeps a single call at 5 pages of history plus one guard page. */
const MAX_KLINE_PAGES = 6;
const MAX_KLINE_BARS = 5000;

export async function fetchCandles(
  symbol: Symbol,
  tf: Timeframe,
  count: number,
  opts: BinanceFetchCandlesOptions = {},
): Promise<NormalizedBinanceCandle[]> {
  const canonical = symbol.trim().toUpperCase();
  if (!isCryptoSymbol(canonical)) {
    throw new ProviderError(
      'PROVIDER_HTTP_ERROR',
      PROVIDER,
      `unsupported symbol "${symbol}" — binance only supports crypto pairs`,
    );
  }

  const interval = toBinanceInterval(tf);
  const targetCount = Math.max(1, Math.min(count, MAX_KLINE_BARS));
  // One extra raw bar because the live (open) bar is dropped by default.
  const requested = targetCount + (opts.includeOpenBar ? 0 : 1);

  // Binance returns at most 1,000 bars per call, so larger windows page
  // backward via `endTime` (oldest t - 1ms), deduplicating by open time.
  const byTime = new Map<number, NormalizedBinanceCandle>();
  let endTime: string | undefined;

  for (let page = 0; page < MAX_KLINE_PAGES && byTime.size < requested; page += 1) {
    const limit = String(Math.min(MAX_BARS_PER_PAGE, requested - byTime.size));
    const raw = await klinesCall(
      {
        symbol: getSymbolDefinition(canonical).binance!,
        interval,
        limit,
        ...(endTime ? { endTime } : {}),
      },
      opts,
    );

    const before = byTime.size;
    for (const candle of raw) byTime.set(candle.t, candle);
    // A short page means upstream ran out of older klines — stop paging.
    if (raw.length < Number(limit)) break;
    // No meaningful new bars — upstream has no older history left.
    if (byTime.size - before < 2) break;
    endTime = String(Math.min(...byTime.keys()) - 1);
  }

  const nowMs = opts.now ?? Date.now();
  const ascending = [...byTime.values()].sort((a, b) => a.t - b.t);
  const filtered = opts.includeOpenBar
    ? ascending
    : ascending.filter((c) => c.closeTime !== undefined && c.closeTime <= nowMs);

  return filtered.slice(-targetCount);
}

const TickerPriceSchema = z.object({ symbol: z.string(), price: z.string() });
const TickerPricesSchema = z.union([TickerPriceSchema, z.array(TickerPriceSchema)]);

/**
 * GET /api/v3/ticker/price — lightweight current price fetch for one symbol or
 * a JSON `symbols` batch. Returns a map keyed by the exchange symbol so the
 * adapter can restore Kestrel's internal symbol names.
 */
export async function fetchTickerPrices(
  symbols: readonly string[],
  opts?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<Map<string, number>> {
  const canonical = [
    ...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(isCryptoSymbol)),
  ];
  if (canonical.length === 0) return new Map();

  const url = new URL(`${BASE_URL}/api/v3/ticker/price`);
  if (canonical.length === 1) {
    url.searchParams.set('symbol', getSymbolDefinition(canonical[0]!).binance!);
  } else {
    url.searchParams.set('symbols', JSON.stringify(canonical));
  }

  const json = await providerFetchJson({
    provider: PROVIDER,
    url,
    schema: TickerPricesSchema,
    throttle: THROTTLE,
    ...(opts?.signal ? { signal: opts.signal } : {}),
    timeoutMs: opts?.timeoutMs ?? PRICE_TIMEOUT_MS,
    quotaStatuses: [429, 418],
    quotaMessage: `binance self-throttle exhausted (${THROTTLE.limit} requests / ${THROTTLE.windowMs / 1000}s)`,
  });

  const items = Array.isArray(json) ? json : [json];
  const prices = new Map<string, number>();
  for (const item of items) {
    const price = Number.parseFloat(item.price);
    if (Number.isFinite(price) && price > 0) prices.set(item.symbol, price);
  }
  return prices;
}

/** Single-symbol convenience wrapper over {@link fetchTickerPrices}. */
export async function fetchTickerPrice(
  symbol: string,
  opts?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<number> {
  const canonical = symbol.trim().toUpperCase();
  if (!isCryptoSymbol(canonical)) {
    throw new ProviderError(
      'PROVIDER_HTTP_ERROR',
      PROVIDER,
      `unsupported symbol "${symbol}" — binance only supports canonical crypto pairs`,
    );
  }

  const prices = await fetchTickerPrices([canonical], opts);
  const price = prices.get(canonical) ?? prices.get(getSymbolDefinition(canonical).binance!);
  if (price === undefined) {
    throw new ProviderError('PROVIDER_PARSE_ERROR', PROVIDER, 'invalid ticker price');
  }
  return price;
}
