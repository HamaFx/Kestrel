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

// BiQuote REST client. Thin wrapper around `fetch` that:
//   1. Resolves the base URL (default https://biquote.io, override via env).
//   2. Times out after `signal`/default 8 s.
//   3. Coerces non-2xx + BiQuote's `{ message }` / `{ error }` error envelopes into
//      ProviderError.
//   4. Returns wire-shape objects validated against the schemas in
//      @kestrel/shared/schemas/biquote — DTO mapping happens in the adapter.
//
// Endpoints:
//   - GET /api/{symbol}                      — latest tick (with marketState, quoteAgeSeconds)
//   - GET /api/latest?symbols=A&symbols=B    — batch ticks (repeated symbols param)
//   - GET /api/{symbol}/ohlc?...&from=&to=   — OHLC candles (live + historical range)
//   - GET /api/calendar & /api/calendar/upcoming — 54-country MT5 Economic Calendar
//   - GET /api/news/market                   — symbol & market news
//
// Reference: https://biquote.io/docs/

import {
  BiquoteCalendarEventSchema,
  BiquoteLatestResponseSchema,
  BiquoteNewsArticleSchema,
  BiquoteOhlcBarSchema,
  BiquoteTickSchema,
  type BiquoteCalendarEvent,
  type BiquoteNewsArticle,
  type BiquoteOhlcBar,
  type BiquoteTick,
  type Symbol,
  type Timeframe,
} from '@kestrel/shared';
import { z } from 'zod';

import { noteBackoff, tryReserve, type ThrottleConfig } from '../../cache/throttle';
import { ProviderError } from '../../errors';
import { assertSupportedSymbol } from './filter';
import { toBiquoteSymbol, toBiquoteTimeframe } from './map';

const PROVIDER = 'biquote';
const DEFAULT_BASE_URL = 'https://biquote.io';
const DEFAULT_TIMEOUT_MS = 8_000;

/**
 * Self-throttle config. BiQuote publishes an anonymous REST quota of
 * 15,000 requests/minute per IP (250 req/sec). We cap self-throttle at
 * 1,500 req/min (10% of the upstream quota) to protect against runaway loops
 * while supporting 100% on-demand REST mode without artificial bottlenecks.
 *
 * On 429, the adaptive throttle drops the cap to 80% of `limit` for
 * `cooloffMs` (90 s default), then auto-recovers.
 */
export const BIQUOTE_THROTTLE_LIMIT = 1500;
const THROTTLE: ThrottleConfig = { limit: BIQUOTE_THROTTLE_LIMIT, windowMs: 60_000 };

const ErrorEnvelopeSchema = z.object({
  message: z.string().optional(),
  error: z.string().optional(),
});

/** OHLC response is `{ symbol, interval, bars: [...] }`. */
const OhlcEnvelopeSchema = z.object({
  symbol: z.string().min(1),
  interval: z.string().min(1),
  bars: z.array(BiquoteOhlcBarSchema),
});

const CalendarArraySchema = z.array(BiquoteCalendarEventSchema);
const NewsArraySchema = z.array(BiquoteNewsArticleSchema);

export interface CallOptions {
  signal?: AbortSignal;
  /** Override the base URL (used by tests). Defaults to `https://biquote.io`. */
  baseUrl?: string;
  /** Skip the in-memory throttle reservation (used by tests). */
  skipThrottle?: boolean;
}

type QueryParams = Record<string, string | readonly string[] | undefined> | null;

function resolveBaseUrl(opts: CallOptions): string {
  return opts.baseUrl ?? process.env.BIQUOTE_BASE_URL ?? DEFAULT_BASE_URL;
}

async function call<T>(
  path: string,
  query: QueryParams,
  schema: z.ZodType<T, any, any>,
  opts: CallOptions,
): Promise<T> {
  if (!opts.skipThrottle && !(await tryReserve(PROVIDER, THROTTLE))) {
    throw new ProviderError(
      'PROVIDER_QUOTA_EXCEEDED',
      PROVIDER,
      `Self-throttle: capped at ${THROTTLE.limit} req / ${THROTTLE.windowMs}ms`,
    );
  }

  const url = new URL(path, resolveBaseUrl(opts));
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) {
        for (const item of v) url.searchParams.append(k, item);
      } else {
        url.searchParams.set(k, v as string);
      }
    }
  }

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
    if (res.status === 429) await noteBackoff(PROVIDER, THROTTLE);

    // BiQuote responds with `{ "message": "..." }` or `{ "error": "..." }` on 4xx.
    let message = `HTTP ${res.status} ${res.statusText}`;
    try {
      const json: unknown = await res.json();
      const env = ErrorEnvelopeSchema.safeParse(json);
      if (env.success && (env.data.message || env.data.error)) {
        message = env.data.message ?? env.data.error ?? message;
      }
    } catch {
      /* body not JSON or empty — use the status-text fallback */
    }

    throw new ProviderError(
      res.status === 429 ? 'PROVIDER_QUOTA_EXCEEDED' : 'PROVIDER_HTTP_ERROR',
      PROVIDER,
      message,
      { status: res.status },
    );
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (cause) {
    throw new ProviderError('PROVIDER_PARSE_ERROR', PROVIDER, 'invalid JSON', { cause });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ProviderError(
      'PROVIDER_PARSE_ERROR',
      PROVIDER,
      `unexpected response shape: ${parsed.error.issues
        .map((i) => i.path.join('.'))
        .slice(0, 3)
        .join(', ')}`,
      { cause: parsed.error },
    );
  }
  return parsed.data;
}

// -----------------------------------------------------------------------------
// Tick (single + batch)
// -----------------------------------------------------------------------------

/** Latest tick for a single symbol. */
export async function fetchTick(symbol: Symbol, opts: CallOptions = {}): Promise<BiquoteTick> {
  const validated = assertSupportedSymbol(symbol);
  return call(`/api/${toBiquoteSymbol(validated)}`, null, BiquoteTickSchema, opts);
}

const MAX_LATEST_BATCH = 100;

/**
 * Latest ticks for multiple symbols in one HTTP round trip (up to 100 per call).
 * Per BiQuote docs (`https://biquote.io/docs/`), the `symbols` query parameter
 * MUST be repeated (`?symbols=XAUUSD&symbols=EURUSD`); comma-separated lists
 * are not supported. Response is a symbol-keyed object `{ EURUSD: {...} }`
 * (normalized to `BiquoteTick[]` by `BiquoteLatestResponseSchema`).
 */
export async function fetchLatest(
  symbols: Symbol[],
  opts: CallOptions = {},
): Promise<BiquoteTick[]> {
  if (symbols.length === 0) return [];
  const validated = [...new Set(symbols.map((s) => toBiquoteSymbol(assertSupportedSymbol(s))))];
  const out: BiquoteTick[] = [];
  for (let i = 0; i < validated.length; i += MAX_LATEST_BATCH) {
    const chunk = validated.slice(i, i + MAX_LATEST_BATCH);
    const ticks = await call('/api/latest', { symbols: chunk }, BiquoteLatestResponseSchema, opts);
    out.push(...ticks);
  }
  return out;
}

// -----------------------------------------------------------------------------
// OHLC candles
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// 54-Country MT5 Economic Calendar & Market News
// -----------------------------------------------------------------------------

export interface FetchBiquoteCalendarArgs extends CallOptions {
  /** ISO-8601 UTC start timestamp (-90d max). */
  from?: string;
  /** ISO-8601 UTC end timestamp (+90d max). */
  to?: string;
  /** Comma-separated ISO country codes, e.g. "US,EU,GB,JP,CA,AU,NZ,CH". */
  countries?: string;
  importance?: 'low' | 'medium' | 'high';
  type?: 'event' | 'indicator' | 'holiday';
  /** Max events to return (1..500, default 200). */
  limit?: number;
}

/**
 * Fetch date-bounded economic calendar events from BiQuote (`GET /api/calendar`).
 */
export async function fetchCalendar(
  args: FetchBiquoteCalendarArgs = {},
): Promise<BiquoteCalendarEvent[]> {
  const limit = args.limit ? Math.max(1, Math.min(args.limit, 500)) : 200;
  return call(
    '/api/calendar',
    {
      limit: String(limit),
      ...(args.from ? { from: args.from } : {}),
      ...(args.to ? { to: args.to } : {}),
      ...(args.countries ? { countries: args.countries } : {}),
      ...(args.importance ? { importance: args.importance } : {}),
      ...(args.type ? { type: args.type } : {}),
    },
    CalendarArraySchema,
    args,
  );
}

export interface FetchBiquoteCalendarUpcomingArgs extends CallOptions {
  /** Max events to return (1..500, default 100). */
  limit?: number;
  /** Comma-separated ISO country codes. */
  countries?: string;
  importance?: 'low' | 'medium' | 'high';
}

/**
 * Fetch upcoming economic calendar events over the next 30 days (`GET /api/calendar/upcoming`).
 */
export async function fetchCalendarUpcoming(
  args: FetchBiquoteCalendarUpcomingArgs = {},
): Promise<BiquoteCalendarEvent[]> {
  const limit = args.limit ? Math.max(1, Math.min(args.limit, 500)) : 100;
  return call(
    '/api/calendar/upcoming',
    {
      limit: String(limit),
      ...(args.countries ? { countries: args.countries } : {}),
      ...(args.importance ? { importance: args.importance } : {}),
    },
    CalendarArraySchema,
    args,
  );
}

export interface FetchBiquoteNewsArgs extends CallOptions {
  symbol?: string;
  language?: string;
  country?: string;
  /** Max articles (1..50, default 25). */
  maxResults?: number;
}

/**
 * Fetch symbol or general market news from BiQuote (`GET /api/news/market`).
 */
export async function fetchMarketNews(
  args: FetchBiquoteNewsArgs = {},
): Promise<BiquoteNewsArticle[]> {
  const maxResults = args.maxResults ? Math.max(1, Math.min(args.maxResults, 50)) : 25;
  return call(
    '/api/news/market',
    {
      maxResults: String(maxResults),
      ...(args.symbol ? { symbol: args.symbol } : {}),
      ...(args.language ? { language: args.language } : {}),
      ...(args.country ? { country: args.country } : {}),
    },
    NewsArraySchema,
    args,
  );
}
