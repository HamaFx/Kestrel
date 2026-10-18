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

// BiQuote (https://biquote.io) wire-format schemas.
//
// BiQuote is a free, no-key REST + SignalR market-data service (15,000 req/min/IP).
// These schemas mirror BiQuote's response shapes verbatim — the provider adapter
// (packages/data/src/providers/biquote/map.ts) maps them to our internal
// Tick / Candle / EconomicEvent / NewsArticle DTOs.
//
// References:
//   - https://biquote.io/docs#models
//   - https://biquote.io/docs#ticks
//   - https://biquote.io/docs#ohlc
//   - https://biquote.io/docs#calendar
//   - https://biquote.io/docs#news
//
// Tolerance: BiQuote's wire format may grow extra fields (e.g. additional
// telemetry on tick payloads). Schemas are deliberately permissive on extras
// (zod's default `passthrough` discarded — we strip unknowns) but strict on
// the fields we depend on.

import { z } from 'zod';

/** Market session state reported by BiQuote ('open' | 'closed'). */
export const BiquoteMarketStateSchema = z.enum(['open', 'closed']);
export type BiquoteMarketState = z.infer<typeof BiquoteMarketStateSchema>;

/**
 * BiQuote tick payload — REST `GET /api/{symbol}` and `/api/latest` response item.
 *
 * The REST shape evolved from earlier docs:
 *   - `time` is a dot-separated local-format string ("2026.05.27 22:09:20"),
 *     NOT ISO. Don't `Date.parse` it. The `timestamp` field carries the
 *     ISO-8601 UTC value we actually want.
 *   - `source` is a free-form string like "MetaTrader 5 (Broker 1)" — not
 *     the older 'MT5'|'MTX' enum.
 *   - `last` is `0.0` for FX (BiQuote intentionally suppresses last-traded
 *     price for spot markets); use `mid` for downstream consumers.
 *   - `direction` is a string ('UP'|'DOWN'|'FLAT'), not a number.
 *   - `marketState` ('open'|'closed'), `stale` (boolean), `quoteAgeSeconds`
 *     (number), and `lastQuoteAt` (ISO-8601 UTC) report market-closure state.
 */
export const BiquoteTickSchema = z.object({
  symbol: z.string().min(1),
  bid: z.number().finite(),
  ask: z.number().finite(),
  /**
   * Mid price. BiQuote computes this server-side, so callers should
   * prefer `mid` over `last` (which is 0 for FX) or the bid/ask average.
   * Optional — not in BiQuote's official documented tick schema, so we
   * compute a fallback (bid+ask)/2 when missing. (BUG-3 fix)
   */
  mid: z.number().finite().optional(),
  /** Last traded price. 0 for FX (suppressed by BiQuote). */
  last: z.number().finite(),
  volume: z.number().finite(),
  /** ISO-8601 UTC. */
  timestamp: z.string().min(1),
  /** Free-form source label. */
  source: z.string().min(1),
  high: z.number().finite().nullable().optional(),
  low: z.number().finite().nullable().optional(),
  direction: z.union([z.string(), z.number(), z.null()]).optional(),
  dayDiffPercent: z.number().finite().nullable().optional(),
  description: z.string().nullable().optional(),
  /** Dot-separated local-format time string. NOT parseable by Date.parse. */
  time: z.string().optional(),
  spread: z.number().finite().nullable().optional(),
  marketState: BiquoteMarketStateSchema.optional(),
  stale: z.boolean().optional(),
  quoteAgeSeconds: z.number().finite().nonnegative().nullable().optional(),
  lastQuoteAt: z.string().nullable().optional(),
});

export type BiquoteTick = z.infer<typeof BiquoteTickSchema>;

/**
 * BiQuote `GET /api/latest?symbols=EURUSD&symbols=XAUUSD` response envelope.
 * Live BiQuote returns a symbol-keyed object `{ EURUSD: BiquoteTick, XAUUSD: BiquoteTick }`.
 * We also accept `BiquoteTick[]` for backward compatibility and normalize to `BiquoteTick[]`.
 */
export const BiquoteLatestResponseSchema = z
  .union([z.array(BiquoteTickSchema), z.record(z.string(), BiquoteTickSchema)])
  .transform((val): BiquoteTick[] => (Array.isArray(val) ? val : Object.values(val)));

/**
 * BiQuote SignalR `ReceiveTick` push payload. Differs from the REST
 * shape:
 *   - `timestamp` (ms epoch number), not `time` (ISO string).
 *   - `source` is a numeric enum (0/1), not a string.
 *   - `type` field is absent; the server stops sending it on the hot path.
 *   - extra fields (`high`, `low`, `direction`, `dayDiffPercent`,
 *     `description`) are forwarded but optional from our point of view.
 *
 * We map both shapes into the same internal `NormalizedTick` shape in
 * the consumer.
 */
export const BiquoteSignalRTickSchema = z.object({
  symbol: z.string().min(1),
  bid: z.number().finite(),
  ask: z.number().finite(),
  last: z.number().finite(),
  volume: z.number().finite(),
  /**
   * Per BiQuote's wire format, the SignalR push timestamp is either
   * milliseconds since epoch (number) or an ISO string. Accept both so
   * a future server-side change doesn't trip the consumer.
   */
  timestamp: z.union([z.int().nonnegative(), z.string().min(1)]),
  /** Numeric enum or string — accept either. */
  source: z.union([z.int(), z.string().min(1)]),
  // Extras BiQuote forwards. We accept anything that's a finite number /
  // string / null / missing — the consumer never reads them, but failing
  // to validate them would drop every tick.
  high: z.number().finite().nullable().optional(),
  low: z.number().finite().nullable().optional(),
  /** Direction is sometimes a number (1, 0, -1), sometimes a string. */
  direction: z.union([z.number(), z.string(), z.null()]).optional(),
  dayDiffPercent: z.number().finite().nullable().optional(),
  description: z.string().nullable().optional(),
});

export type BiquoteSignalRTick = z.infer<typeof BiquoteSignalRTickSchema>;

/**
 * BiQuote OHLC bar — `GET /api/{symbol}/ohlc?interval=&limit=` response item.
 *
 * `volume` is real volume (0 for FX). `tickVolume` is the count of ticks
 * that produced the bar, which we surface as a non-null integer everywhere
 * (FX feeds always have ≥1 tick or the bar wouldn't exist).
 *
 * `isOpen` is `true` for the live unfinished bar at the head of the array.
 * The provider adapter drops it before mapping to our `Candle` DTO unless
 * the caller explicitly opts into open bars.
 */
export const BiquoteOhlcBarSchema = z.object({
  /** ISO-8601 UTC timestamp at bar open. */
  openTime: z.string().min(1),
  open: z.number().finite(),
  high: z.number().finite(),
  low: z.number().finite(),
  close: z.number().finite(),
  volume: z.int().nonnegative(),
  tickVolume: z.int().nonnegative(),
  isOpen: z.boolean(),
});

export type BiquoteOhlcBar = z.infer<typeof BiquoteOhlcBarSchema>;

/**
 * BiQuote symbol metadata — `GET /api/symbols` response item, also returned
 * by `/api/symbols/search` and `/api/symbols/{name}`.
 */
export const BiquoteSymbolSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  type: z.string().min(1),
  exchange: z.string().min(1),
  source: z.string().min(1),
});

export type BiquoteSymbol = z.infer<typeof BiquoteSymbolSchema>;

/** Convenience: the supported timeframe codes BiQuote accepts on `/ohlc`. */
export const BiquoteTimeframeSchema = z.enum(['1m', '5m', '15m', '30m', '1h', '4h', '1d']);

export type BiquoteTimeframe = z.infer<typeof BiquoteTimeframeSchema>;

/** Importance level on BiQuote economic calendar events. */
export const BiquoteCalendarImportanceSchema = z.enum(['low', 'medium', 'high']);

/**
 * BiQuote 54-country MT5 Economic Calendar event item —
 * returned by `GET /api/calendar`, `GET /api/calendar/upcoming`, and
 * `GET /api/calendar/{eventId}/history`.
 *
 * Note: `actual: null` means the release has not yet been published (never coerce to 0).
 */
export const BiquoteCalendarEventSchema = z.object({
  id: z.string().min(1),
  eventId: z.string().min(1).optional(),
  time: z.string().min(1),
  period: z.string().nullable().optional(),
  countryCode: z.string().min(1),
  currency: z.string().nullable().optional(),
  name: z.string().min(1),
  importance: BiquoteCalendarImportanceSchema.catch('low'),
  type: z.string().nullable().optional(),
  sector: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
  multiplier: z.string().nullable().optional(),
  digits: z.int().nullable().optional(),
  actual: z.number().finite().nullable().optional().default(null),
  forecast: z.number().finite().nullable().optional().default(null),
  previous: z.number().finite().nullable().optional().default(null),
  revisedPrevious: z.number().finite().nullable().optional().default(null),
  revision: z.int().nullable().optional(),
  timeMode: z.string().nullable().optional(),
  sourceUrl: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
});

export type BiquoteCalendarEvent = z.infer<typeof BiquoteCalendarEventSchema>;

/**
 * BiQuote Market News item — returned by `GET /api/news/market`.
 */
export const BiquoteNewsArticleSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional().default(null),
  url: z.url(),
  publisher: z.string().nullable().optional().default(null),
  publishedDate: z.string().min(1),
  imageUrl: z.string().nullable().optional().default(null),
  category: z.string().nullable().optional().default(null),
  language: z.string().nullable().optional().default(null),
  country: z.string().nullable().optional().default(null),
});

export type BiquoteNewsArticle = z.infer<typeof BiquoteNewsArticleSchema>;
