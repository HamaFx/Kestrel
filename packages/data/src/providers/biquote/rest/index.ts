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

// BiQuote REST client — barrel for the split modules.
//
// Thin wrapper around `fetch` that:
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
//
// Split: request building/parsing in `./call`, batch + single ticks in
// `./ticks`, candles in `./ohlc`, calendar in `./calendar`, news in `./news`.
// Every name previously exported from `rest.ts` is re-exported here.

export { BIQUOTE_THROTTLE_LIMIT, type CallOptions } from './call';
export { fetchLatest, fetchTick } from './ticks';
export { fetchOhlc, type FetchOhlcArgs } from './ohlc';
export {
  fetchCalendar,
  fetchCalendarUpcoming,
  type FetchBiquoteCalendarArgs,
  type FetchBiquoteCalendarUpcomingArgs,
} from './calendar';
export { fetchMarketNews, type FetchBiquoteNewsArgs } from './news';
