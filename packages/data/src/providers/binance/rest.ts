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

import { noteBackoff, tryReserve, type ThrottleConfig } from '../../cache/throttle';
import { ProviderError } from '../../errors';
import { isCryptoSymbol, toBinanceInterval } from './map';
import { parseKline, type NormalizedBinanceCandle } from './types';

const PROVIDER = 'binance';
const BASE_URL = 'https://api.binance.com';
const DEFAULT_TIMEOUT_MS = 8_000;

const THROTTLE: ThrottleConfig = { limit: 20, windowMs: 60_000 };

interface CallOptions {
  signal?: AbortSignal;
  skipThrottle?: boolean;
}

export interface BinanceFetchCandlesOptions extends CallOptions {
  includeOpenBar?: boolean;
  now?: number;
}

async function klinesCall(
  query: Record<string, string>,
  opts: CallOptions,
): Promise<NormalizedBinanceCandle[]> {
  if (!opts.skipThrottle && !(await tryReserve(PROVIDER, THROTTLE))) {
    throw new ProviderError(
      'PROVIDER_QUOTA_EXCEEDED',
      PROVIDER,
      `Self-throttle: capped at ${THROTTLE.limit} req / ${THROTTLE.windowMs}ms`,
    );
  }

  const url = new URL(`${BASE_URL}/api/v3/klines`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('timeout')), DEFAULT_TIMEOUT_MS);
  if (opts.signal) {
    if (opts.signal.aborted) ctrl.abort(opts.signal.reason);
    else
      opts.signal.addEventListener('abort', () => ctrl.abort(opts.signal!.reason), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
  } catch (cause) {
    if (opts?.signal?.aborted) {
      throw opts.signal.reason ?? cause;
    }
    const isAbort = (cause as Error)?.name === 'AbortError';
    throw new ProviderError(
      isAbort ? 'PROVIDER_TIMEOUT' : 'PROVIDER_HTTP_ERROR',
      PROVIDER,
      isAbort ? 'request timed out' : 'fetch failed',
      { cause },
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    if (res.status === 429 || res.status === 418) await noteBackoff(PROVIDER, THROTTLE);
    throw new ProviderError(
      res.status === 429 || res.status === 418 ? 'PROVIDER_QUOTA_EXCEEDED' : 'PROVIDER_HTTP_ERROR',
      PROVIDER,
      `HTTP ${res.status} ${res.statusText}`,
      { status: res.status },
    );
  }

  const json: unknown = await res.json().catch(() => null);
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

/** GET /api/v3/ticker/price?symbol=BTCUSDT — lightweight current price fetch. */
export async function fetchTickerPrice(
  symbol: string,
  opts?: { signal?: AbortSignal },
): Promise<number> {
  const canonical = symbol.trim().toUpperCase();
  if (!isCryptoSymbol(canonical)) {
    throw new ProviderError(
      'PROVIDER_HTTP_ERROR',
      PROVIDER,
      `unsupported symbol "${symbol}" — binance only supports canonical crypto pairs`,
    );
  }

  const url = new URL(`${BASE_URL}/api/v3/ticker/price`);
  url.searchParams.set('symbol', getSymbolDefinition(canonical).binance!);

  const allowed = await tryReserve(PROVIDER, THROTTLE);
  if (!allowed) {
    throw new ProviderError(
      'PROVIDER_QUOTA_EXCEEDED',
      PROVIDER,
      `binance self-throttle exhausted (${THROTTLE.limit} requests / ${THROTTLE.windowMs / 1000}s)`,
    );
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('timeout')), DEFAULT_TIMEOUT_MS);
  if (opts?.signal) {
    if (opts.signal.aborted) ctrl.abort(opts.signal.reason);
    else
      opts.signal.addEventListener('abort', () => ctrl.abort(opts.signal!.reason), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
  } catch (cause) {
    if (opts?.signal?.aborted) {
      throw opts.signal.reason ?? cause;
    }
    const isAbort = (cause as Error)?.name === 'AbortError';
    throw new ProviderError(
      isAbort ? 'PROVIDER_TIMEOUT' : 'PROVIDER_HTTP_ERROR',
      PROVIDER,
      isAbort ? 'request timed out' : 'fetch failed',
      { cause },
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    if (res.status === 429 || res.status === 418) await noteBackoff(PROVIDER, THROTTLE);
    throw new ProviderError(
      res.status === 429 || res.status === 418 ? 'PROVIDER_QUOTA_EXCEEDED' : 'PROVIDER_HTTP_ERROR',
      PROVIDER,
      `HTTP ${res.status} ${res.statusText}`,
      { status: res.status },
    );
  }

  const json: unknown = await res.json().catch(() => null);
  if (!json || typeof json !== 'object' || !('price' in json)) {
    throw new ProviderError(
      'PROVIDER_PARSE_ERROR',
      PROVIDER,
      'expected { price: string } response',
    );
  }

  const price = Number.parseFloat((json as { price: string }).price);
  if (Number.isNaN(price)) {
    throw new ProviderError('PROVIDER_PARSE_ERROR', PROVIDER, 'invalid ticker price');
  }
  return price;
}
