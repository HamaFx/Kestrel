# BiQuote On-Demand Upgrade & Worker De-Bloat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transition Kestrel (`HamaFx/Kestrel`) from a 24/7 PostgreSQL tick/candle streaming pipeline (`live_ticks` + `candles_1m` + `:8082` proxy) to a 100% on-demand BiQuote REST architecture that fixes multi-symbol batching (`/api/latest`), unlocks historical `from`/`to` Trade Setup Replay (`/api/{symbol}/ohlc`), integrates BiQuote's zero-key 54-country MT5 Economic Calendar (`/api/calendar`) and Market News (`/api/news/market`), and propagates explicit market-closure metadata (`marketState: "open" | "closed"`, `stale`, `quoteAgeSeconds`, `lastQuoteAt`) across schemas, UI surfaces, and AI evidence packets.

**Architecture:** Replace the 24/7 SignalR/Binance -> `TickBuffer` -> `Candle1mAggregator` -> PostgreSQL write loop with on-demand REST reads against [BiQuote API](https://www.google.com/search?q=https%3A%2F%2Fbiquote.io%2Fdocs%2F) (15,000 req/min/IP anonymous quota) backed by Kestrel's 3s/30s in-memory/Redis SWR cache and multi-symbol batching (`GET /api/latest?symbols=XAUUSD&symbols=EURUSD...`). Keep the `live_ticks` and `candles_1m` Drizzle tables intact so historical migrations (`0005`..`0079`) never break, while gating the legacy worker streaming loop and `:8082` proxy behind an opt-in `WORKER_ENABLE_TICK_STREAM=0` flag so `apps/worker` runs purely as a lightweight Mastra durable AI workflow & cron runner on Botkeep / GCP `e2-micro` / Docker.

**Tech Stack:** TypeScript 7.0.2, Node.js 25, Turborepo, pnpm, Next.js 16 App Router, Drizzle ORM (PostgreSQL + pgvector), Zod, Mastra v2, Lightweight Charts, Vitest, Knip.

**Spec:** `docs/plans/biquote-on-demand-upgrade-plan.md` (self-contained Principal Systems Architect audit and execution specification).

## Global Constraints

- **Main Chart Uses TradingView Pro Widget:** `apps/web/src/app/(app)/chart/[symbol]/_components/tradingview-widget.tsx` uses TradingView's own data feed; do not build custom database candle storage for the main chart.
- **No AI Backtesting:** Do not add AI backtesting tools or historical backtesting tables.
- **Trade Setup Replay Uses On-Demand `from` / `to` Windows:** `apps/web/src/lib/services/journal.ts` (`getTradeSetupReplayService`) and `/api/journal/[id]/replay` must pass `from` and `to` ISO-8601 UTC bounds (with 50-bar indicator warmup before `entry.openedAt` and 20-bar post-exit context after `entry.closedAt`, capped at `1000` bars) to BiQuote's `GET /api/{symbol}/ohlc` endpoint.
- **Database Migrations Stay Immutable:** Never drop `live_ticks` or `candles_1m` from `packages/db/src/schema/` or alter existing SQL migrations (`0005_market_data.sql` .. `0079_eval_dataset_registry.sql`).
- **Env Contract & Quality Gates Must Pass Zero-Warning:** `pnpm check:env-contract`, `pnpm turbo run typecheck`, `pnpm turbo run lint`, `pnpm turbo run test`, and `pnpm knip` must all exit `0` with `0` findings.

## Review Focus

- **Repeated `symbols` Query Parameter & Dual Envelope on `/api/latest`:** [BiQuote API Docs](https://www.google.com/search?q=https%3A%2F%2Fbiquote.io%2Fdocs%2F) and the [BiQuote Python Guide](https://www.google.com/search?q=https%3A%2F%2Fbiquote.io%2Fguides%2Ffree-forex-api-python.html) specify that comma-separated `?symbols=XAUUSD,EURUSD` is unsupported (must be repeated `?symbols=XAUUSD&symbols=EURUSD`) and `/api/latest` returns a symbol-keyed object `{ EURUSD: {...}, XAUUSD: {...} }`. `fetchLatest()` must emit repeated `symbols` params and accept both the live symbol-keyed map and array envelopes via `BiquoteLatestResponseSchema`.
- **Historical Replay Cache Key Isolation:** `getCandlesWithMeta()` currently keys cache entries solely by `hfx:candles:${symbol}:${tf}:n${count}`. When `from` or `to` is supplied by Trade Setup Replay, omitting `from`/`to` from `extra` would poison live chart/indicator cache reads with old historical replay bars (or return latest bars for a historical trade).
- **`calendar-persistence.ts` Latent `ON CONFLICT DO UPDATE` Bug:** `packages/ai/src/calendar-persistence.ts:47-51` currently sets `actual: schema.economicEvents.actual` on conflict, which references the existing table column (often `NULL`) instead of `sql\`excluded.actual\``. This must be fixed to `sql\`COALESCE(excluded.actual, ${schema.economicEvents.actual})\`` so newly published actuals from BiQuote and FRED overwrite prior `NULL` values, while `actual: null` is strictly preserved as "not yet published" (never coerced to `0`).
- **G8 Currency Schema Widening for Calendar Events:** `packages/shared/src/schemas/calendar.ts` currently restricts `EventCurrencySchema` to `z.enum(['USD', 'EUR', 'GBP'])`. Fetching BiQuote calendar events for `US,EU,GB,JP,CA,AU,NZ,CH` produces `JPY`, `CAD`, `AUD`, `NZD`, and `CHF`, which would throw a Zod parse error unless `EventCurrencySchema` is widened to all catalog currencies plus fallback string union.
- **False Degraded Health Alerts When `live_ticks` Stops Updating:** `apps/web/src/lib/services/admin-health.ts` (`computeHealthSloService`) currently pushes an anomaly whenever `live_ticks` is empty or older than 60s, flipping `overall` to `'degraded'` and triggering `/api/cron/health-alerts` every 5 minutes. When `WORKER_ENABLE_TICK_STREAM=0` (default), `admin-health.ts`, `apps/worker/src/http-server.ts`, and `apps/worker/src/jobs/metrics-flush.ts` must treat on-demand REST mode as healthy without requiring `live_ticks` rows.

---

## 1. Executive Summary & Architecture Before vs. After

### 1.1 Why This Upgrade Matters

Kestrel's Phase 8 worker pipeline was engineered around two assumptions that no longer hold:
1. `packages/data/src/providers/biquote/rest.ts` assumed BiQuote enforced an undocumented ~10–50 req/min rate limit (`const THROTTLE: ThrottleConfig = { limit: 50, windowMs: 60_000 }`). In reality, [BiQuote's API documentation](https://www.google.com/search?q=https%3A%2F%2Fbiquote.io%2Fdocs%2F) and [operational engineering breakdown](https://www.google.com/search?q=https%3A%2F%2Fbiquote.io%2Fguides%2Fwhat-free-costs.html) confirm an anonymous quota of **15,000 requests/minute per IP (250 req/sec)** with **no API key and no signup**.
2. To work around that assumed 50 req/min ceiling, `apps/worker` maintained 24/7 persistent connections to BiQuote SignalR (`https://biquote.io/hubs/tick`) and Binance WebSocket (`wss://stream.binance.com:9443`), coalescing ticks in `TickBuffer`, building 1-minute bars in `Candle1mAggregator`, and executing **continuous PostgreSQL writes every second (`live_ticks`) and every minute (`candles_1m`)**, plus binding a second `:8082` HTTP proxy server requiring `BIQUOTE_PROXY_TOKEN`.

That 24/7 database-persistence loop created unnecessary operational friction:
- **Database Write & Connection Pressure:** 86,400 UPSERT batches/day into `live_ticks` and ~25,920 INSERTs/day into `candles_1m` across 18 symbols, keeping the Supabase/PostgreSQL connection pool continuously hot even when zero users are online.
- **False Health & Readiness Failures:** On weekends (when FX/Gold stops quoting from Friday 22:00 UTC to Sunday 22:00 UTC) or during brief SignalR reconnects, `lastTickAt` exceeds 60–120 seconds, causing `apps/worker/src/http-server.ts` (`/health/ready` -> `503`), `HC_SIGNALR_UUID`, and `apps/web/src/lib/services/admin-health.ts` (`worker_ticks` SLI -> `degraded`) to fire false-positive outage alerts.
- **Broken Multi-Symbol Batching:** `fetchLatest()` in `packages/data/src/providers/biquote/rest.ts:196` joins symbols with commas (`?symbols=XAUUSD%2CEURUSD`), which [BiQuote explicitly rejects](https://www.google.com/search?q=https%3A%2F%2Fbiquote.io%2Fdocs%2F) (`repeat the symbols parameter — the comma form is not supported`), and validates the response against `z.array(BiquoteTickSchema)` instead of BiQuote's symbol-keyed object map. Meanwhile, `getPriceService`, `/api/market/stream`, `warm-cache`, and `buildLiveSnapshot` wasn't even calling `fetchLatest()`, issuing $N$ separate HTTP requests instead of 1 batched request.
- **Broken Trade Setup Replay for Older Trades:** `getTradeSetupReplayService` in `apps/web/src/lib/services/journal.ts:253` calls `getCandles(entry.symbol, tf, { count: 140 })` without `from` or `to` dates. On `15m`, 140 bars is only 35 hours—meaning any trade logged more than 1.5 days ago replays the *current* market instead of the historical trade window, producing meaningless MFE/MAE excursions and entry/exit alignments.
- **Unused Free BiQuote Calendar & News Endpoints:** Kestrel currently fails closed when `FRED_API_KEY` or `FINNHUB_API_KEY`/`MARKETAUX_API_KEY` are unset, even though [BiQuote provides a free 54-country MT5 Economic Calendar](https://www.google.com/search?q=https%3A%2F%2Fbiquote.io%2Fdocs%2F) (`GET /api/calendar`, `GET /api/calendar/upcoming`, `GET /api/calendar/{eventId}/history` with `actual`, `forecast`, `previous`, `revisedPrevious`) and [free symbol/market news](https://www.google.com/search?q=https%3A%2F%2Fbiquote.io%2Fdocs%2F) (`GET /api/news/market?symbol=XAUUSD`).

### 1.2 Architecture Before vs. After Diagram

```
================================================================================
BEFORE: 24/7 Worker DB Persistence + N-Request Polling + Unbounded Replay
================================================================================

  [BiQuote SignalR /hubs/tick]      [Binance WS Stream]
               \                           /
                v                         v
      +---------------------------------------------+
      | apps/worker (24/7 stateful stream consumer) |
      |  - SignalRConsumer + BinanceStreamConsumer  |
      |  - TickBuffer (1 Hz flush)                  |
      |  - Candle1mAggregator (1 min flush)         |
      |  - :8081 Health (503 if no tick in 120s!)   |
      |  - :8082 Proxy (requires BIQUOTE_PROXY_TOKEN|
      +----------------------+----------------------+
                             | 1 Hz UPSERT (live_ticks)
                             | 1 min INSERT (candles_1m)
                             v
      +---------------------------------------------+
      | PostgreSQL (Supabase / Self-Hosted)         |
      |  - live_ticks (polled first on every price) |
      |  - candles_1m (polled first on every 1m)    |
      |  -admin-health alerts if live_ticks > 60s   |
      +----------------------+----------------------+
                             ^
                             | 1. DB poll (live-ticks / candles-1m)
                             | 2. Miss -> N separate HTTP calls (50/min cap!)
      +----------------------+----------------------+
      | apps/web (Vercel) & packages/data           |
      |  - /api/market/price & /stream: N requests  |
      |  - Setup Replay: latest 140 bars only       |
      |  - Calendar/News: fails without API keys    |
      |  - Weekend FX close: shown as stale/error   |
      +---------------------------------------------+


================================================================================
AFTER: 100% On-Demand BiQuote REST + Lightweight AI/Cron Worker
================================================================================

  +-------------------------------------------------------------------------+
  | BiQuote REST API (https://biquote.io/api/* — 15,000 req/min, No Key)    |
  |  - GET /api/latest?symbols=XAUUSD&symbols=EURUSD (1-call batch quotes)  |
  |  - GET /api/{symbol} (marketState: "open"|"closed", quoteAgeSeconds)    |
  |  - GET /api/{symbol}/ohlc?interval=...&limit=1000&from=...&to=...       |
  |  - GET /api/calendar & /api/calendar/upcoming (54-country MT5 + actuals)|
  |  - GET /api/news/market?symbol=...&maxResults=... (Zero-key market news)|
  +------------------------------------+------------------------------------+
                                       |
                                       | Direct On-Demand HTTPS (1,500/min self-throttle)
                                       | + 3s Price / 30s Candle SWR Cache (Memory/Redis)
                                       v
  +------------------------------------+------------------------------------+
  | packages/data & apps/web (Vercel)                                       |
  |  - getPricesWithMeta(): 1 HTTP call for all FX/Gold symbols in batch    |
  |  - getCandlesWithMeta(): supports { from, to } with isolated cache keys |
  |  - getTradeSetupReplayService(): 50-bar warmup + trade window + 20-bar  |
  |  - fetchUpcomingEvents(): BiQuote primary (with actuals!) + FRED merge  |
  |  - fetchNews(): Finnhub -> Marketaux -> BiQuote zero-key fallback       |
  |  - TickSchema & UI: preserves marketState="closed" (Weekend badge)      |
  +------------------------------------+------------------------------------+
                                       |
                                       | Shared @kestrel/data adapters
                                       v
  +------------------------------------+------------------------------------+
  | apps/worker (Botkeep / GCP e2-micro / Docker — WORKER_ENABLE_TICK_STREAM=0)
  |  - Zero 24/7 DB tick/candle writes; zero SignalR/WS memory overhead     |
  |  - BIQUOTE_PROXY_TOKEN & :8082 proxy optional (disabled when unset)     |
  |  - :8081/health ready=true immediately; runs Mastra Full-mode + crons   |
  +-------------------------------------------------------------------------+
```

### 1.3 Architectural Decision on `live-ticks` & `candles-1m` (Workstream 1)

We **gate the legacy streaming pipeline behind `WORKER_ENABLE_TICK_STREAM=0` (default `'0'`)** while keeping all Drizzle table definitions (`packages/db/src/schema/live-ticks.ts`, `packages/db/src/schema/candles-1m.ts`) and unit-tested modules intact:
1. **Why Gating Beats Hard Deletion:**
   - Existing database migrations (`0005`..`0079`) and schema drift tests (`packages/db/test/schema-drift.test.ts`, `packages/db/test/full-migration-chain.test.ts`) require `liveTicks` and `candles1m` in `@kestrel/db/schema`.
   - Keeping `SignalRConsumer`, `BinanceStreamConsumer`, `TickBuffer`, `Candle1mAggregator`, `live-ticks`, and `candles-1m` modules in place (with their unit tests passing) while taking them out of the default runtime path (`WORKER_ENABLE_TICK_STREAM=0`) eliminates 100% of the 24/7 DB writes and network overhead in production without churning 15+ test files or losing the SignalR code if an operator ever wants local streaming.
2. **Runtime Behavior When `WORKER_ENABLE_TICK_STREAM=0` (New Default):**
   - `packages/data/src/providers/provider-adapters.ts`: `liveTicksProvider.supports()` returns `false` unless `process.env.WORKER_ENABLE_TICK_STREAM === '1' || process.env.WORKER_ENABLE_TICK_STREAM === 'true'`. Thus `getPriceWithMeta()` and `getCandlesWithMeta('1m')` never issue a Postgres query against `live_ticks` or `candles_1m`—they route directly to `biquoteProvider` (Gold/FX) and `binanceProvider` (Crypto).
   - `apps/worker/src/index.ts`: `runWorker()` checks `isTickStreamEnabled(env)`. When `false`, it skips `SignalRConsumer`, `BinanceStreamConsumer`, `SymbolManager`, `TickBuffer`, and `Candle1mAggregator`, calls `notifyReady()` immediately, and returns a no-op `RunningWorker` handle. `main()` only starts `:8082` `proxyServer` if `env.BIQUOTE_PROXY_TOKEN` is set.
   - `packages/ai/src/bot/commands/price.ts`: Updated from querying `schema.liveTicks` directly to calling `getPriceWithMeta(symbol)` from `@kestrel/data`, fixing the Telegram `/price` command in on-demand mode.
   - `apps/web/src/lib/services/alerts.ts`: Updated `fetchCandles()` in `previewAlertRuleService` to call `getCandles()` from `@kestrel/data` when `getRecentCandles()` returns empty, so alert simulation works 100% on-demand without `candles_1m`.

---

## 2. Live BiQuote API Contract Verification

All endpoints below were verified against the live [BiQuote API Reference (https://biquote.io/docs/)](https://www.google.com/search?q=https%3A%2F%2Fbiquote.io%2Fdocs%2F), the [BiQuote Python Integration Guide (https://biquote.io/guides/free-forex-api-python.html)](https://www.google.com/search?q=https%3A%2F%2Fbiquote.io%2Fguides%2Ffree-forex-api-python.html), and the [BiQuote Production Traffic Analysis (https://biquote.io/guides/what-free-costs.html)](https://www.google.com/search?q=https%3A%2F%2Fbiquote.io%2Fguides%2Fwhat-free-costs.html).

| Endpoint | Method & Query Parameters | Rate Limit & Auth | Verified Wire Response Shape |
| :--- | :--- | :--- | :--- |
| `/api/{symbol}` | `GET /api/{symbol}?allowStale=true\|false` (`allowStale` default `true`; `false` returns `404` if quote > 5m old) | 15,000 req/min/IP, No Key | Single `BiquoteTick` JSON object with `symbol`, `bid`, `ask`, `mid`, `spread`, `last` (`0.0` for FX), `volume` (`0` for FX), `high`, `low`, `direction` (`"UP"\|"DOWN"\|"FLAT"`), `dayDiffPercent`, `timestamp` (ISO-8601 UTC), `time` (MT5 dot string), `source`, `marketState` (`"open"\|"closed"`), `stale` (`boolean`), `quoteAgeSeconds` (`number`), `lastQuoteAt` (ISO-8601 UTC). Also sets `X-Quote-State` and `X-Quote-Age-Seconds` HTTP headers. |
| `/api/latest` | `GET /api/latest?symbols=EURUSD&symbols=XAUUSD` (**Repeated `symbols` param required**; comma-separated `?symbols=A,B` is **not** supported; up to 100 symbols/call) | 15,000 req/min/IP, No Key | Symbol-keyed JSON object `{ "EURUSD": BiquoteTick, "XAUUSD": BiquoteTick }` (verified in [BiQuote Python Guide](https://www.google.com/search?q=https%3A%2F%2Fbiquote.io%2Fguides%2Ffree-forex-api-python.html): `for sym, t in r.items()`). Unquoted symbols are omitted. Our schema union also accepts `BiquoteTick[]` for backward compatibility with existing unit test fixtures. |
| `/api/{symbol}/ohlc` | `GET /api/{symbol}/ohlc?interval=1m\|5m\|15m\|30m\|1h\|4h\|1d&limit=1..1000&from=<ISO-8601>&to=<ISO-8601>` | 15,000 req/min/IP, No Key | Envelope `{ "symbol": "EURUSD", "interval": "1h", "bars": [BiquoteOhlcBar, ...] }` ordered **newest-first** (`bars[0]` has `isOpen: true` when window includes current live bar). Each bar has `{ openTime, open, high, low, close, volume, tickVolume, isOpen }`. |
| `/api/calendar` | `GET /api/calendar?from=<ISO-8601>&to=<ISO-8601>&countries=US,EU,GB,JP,CA,AU,NZ,CH&importance=low\|medium\|high&type=event\|indicator\|holiday&limit=1..500` | 15,000 req/min/IP, No Key | Bare JSON array `BiquoteCalendarEvent[]` ordered **oldest-first** across a rolling -90d/+90d window across 54 countries (MT5 + emerging markets). `actual`, `forecast`, `previous`, and `revisedPrevious` are `number \| null` (`null` = not yet published, **never** `0`). |
| `/api/calendar/upcoming` | `GET /api/calendar/upcoming?limit=1..500&countries=US,EU,GB...&importance=low\|medium\|high` | 15,000 req/min/IP, No Key | Bare JSON array `BiquoteCalendarEvent[]` ordered **soonest-first** over a 30-day forward horizon. |
| `/api/calendar/{eventId}/history` | `GET /api/calendar/{eventId}/history?limit=1..500` (e.g. `eventId = "mql5:840"`) | 15,000 req/min/IP, No Key | Bare JSON array `BiquoteCalendarEvent[]` of past releases for that recurring series, ordered **newest-first**. |
| `/api/news/market` | `GET /api/news/market?symbol=XAUUSD&language=en&country=US&maxResults=1..50` | 15,000 req/min/IP, No Key | Bare JSON array `BiquoteNewsArticle[]` ordered **newest-first**: `[{ title, description, url, publisher, publishedDate, imageUrl, category, language, country }]`. |

### Verified Wire Payloads

#### 1. `GET /api/{symbol}` & `GET /api/latest?symbols=EURUSD&symbols=XAUUSD`
```json
{
  "symbol": "EURUSD",
  "description": "Euro vs US Dollar",
  "bid": 1.08542,
  "ask": 1.08548,
  "mid": 1.08545,
  "spread": 0.00006,
  "last": 0.0,
  "volume": 0,
  "high": 1.08800,
  "low": 1.08530,
  "direction": "FLAT",
  "dayDiffPercent": -0.09,
  "timestamp": "2026-02-24T10:30:00Z",
  "time": "2026.02.24 10:30:00",
  "source": "MetaTrader 5 (Broker 1)",
  "marketState": "open",
  "stale": false,
  "quoteAgeSeconds": 0,
  "lastQuoteAt": "2026-02-24T10:30:00Z"
}
```

#### 2. `GET /api/calendar` & `GET /api/calendar/upcoming`
```json
[
  {
    "id": "mql5:900001",
    "eventId": "mql5:840",
    "time": "2026-08-07T12:30:00Z",
    "period": "2026-07-01T00:00:00Z",
    "countryCode": "US",
    "currency": "USD",
    "name": "Nonfarm Payrolls",
    "importance": "high",
    "type": "indicator",
    "sector": "jobs",
    "unit": "job",
    "multiplier": "thousands",
    "digits": 0,
    "actual": 152000,
    "forecast": 145000,
    "previous": 147000,
    "revisedPrevious": 149000,
    "revision": 1,
    "timeMode": "exact",
    "sourceUrl": "https://www.bls.gov/",
    "source": "mql5"
  }
]
```

#### 3. `GET /api/news/market?symbol=XAUUSD&maxResults=25`
```json
[
  {
    "title": "Markets rally as Fed signals rate pause",
    "description": "Wall Street surged on Wednesday after...",
    "url": "https://example.com/article",
    "publisher": "Reuters",
    "publishedDate": "2026-02-24T09:15:00Z",
    "imageUrl": null,
    "category": null,
    "language": "en",
    "country": "US"
  }
]
```

---

## 3. File-by-File Impact Matrix

| Package / App | File Path | Action | Responsibility / Change Summary |
| :--- | :--- | :--- | :--- |
| `packages/shared` | `packages/shared/src/schemas/biquote.ts` | Modify | Add `BiquoteMarketStateSchema` (`'open' \| 'closed'`), `marketState`, `stale`, `quoteAgeSeconds`, `lastQuoteAt` to `BiquoteTickSchema`; add `BiquoteLatestResponseSchema`, `BiquoteCalendarEventSchema`, `BiquoteNewsArticleSchema`. |
| `packages/shared` | `packages/shared/src/schemas/tick.ts` | Modify | Add optional `marketState?: 'open' \| 'closed'`, `quoteAgeSeconds?: number \| null`, `dayDiffPercent?: number \| null` to `TickSchema` so UI and AI consumers receive market-closure state. |
| `packages/shared` | `packages/shared/src/schemas/calendar.ts` | Modify | Widen `KnownCountrySchema` (`EU`, `GB`, `JP`, `CA`, `AU`, `NZ`, `CH`) and `EventCurrencySchema` to accept all 8 G8 catalog currencies (`USD`, `EUR`, `GBP`, `JPY`, `AUD`, `CAD`, `NZD`, `CHF`) plus string fallback. |
| `packages/shared` | `packages/shared/src/index.ts` | Modify | Re-export `BiquoteMarketStateSchema`, `BiquoteLatestResponseSchema`, `BiquoteCalendarEventSchema`, `BiquoteNewsArticleSchema`, and their inferred types. |
| `packages/shared` | `packages/shared/test/biquote.test.ts` | Modify | Add unit tests for `marketState`, `quoteAgeSeconds`, `BiquoteLatestResponseSchema` (record & array), `BiquoteCalendarEventSchema` (`actual: null`), and `BiquoteNewsArticleSchema`. |
| `packages/data` | `packages/data/src/providers/biquote/rest.ts` | Modify | Raise `THROTTLE.limit` from `50` to `1500` req/min; update `call()` to support repeated query params (`string \| readonly string[]`); fix `fetchLatest()` to pass repeated `symbols` and normalize `BiquoteLatestResponseSchema`; add `from`/`to` to `FetchOhlcArgs` and `fetchOhlc()`; add `fetchCalendar()`, `fetchCalendarUpcoming()`, and `fetchMarketNews()`. |
| `packages/data` | `packages/data/src/providers/biquote/index.ts` | Modify | Export `fetchCalendar`, `fetchCalendarUpcoming`, `fetchMarketNews`, and their argument types. |
| `packages/data` | `packages/data/src/providers/provider-registry.ts` | Modify | Extend `ProviderFetchOptions` with `from?: string`, `to?: string`, `includeOpenBar?: boolean`; extend `MarketDataProvider.fetchPrice` return type with `marketState?: 'open' \| 'closed'`, `quoteAgeSeconds?: number \| null`, `dayDiffPercent?: number \| null`; add optional `fetchPrices?(symbols, opts)` batch method. |
| `packages/data` | `packages/data/src/providers/provider-adapters.ts` | Modify | Gate `liveTicksProvider.supports()` behind `WORKER_ENABLE_TICK_STREAM=1`; wire `biquoteProvider.fetchPrices()` (batch `/api/latest`) and pass `from`/`to` into `biquote.fetchOhlc()`; forward `marketState`, `quoteAgeSeconds`, `dayDiffPercent` from `biquote.fetchTick()`. |
| `packages/data` | `packages/data/src/adapters/price.ts` | Modify | Preserve `marketState`, `quoteAgeSeconds`, `dayDiffPercent` on `Tick` and `PriceResult`; add `getPricesWithMeta(symbols, opts)` and `getPrices(symbols, opts)` that check per-symbol cache first, batch cache-missed FX/Gold symbols into a single `biquote.fetchLatest()` call, populate per-symbol caches, and fall back to per-symbol `getPriceWithMeta()`. |
| `packages/data` | `packages/data/src/adapters/candles.ts` | Modify | Add `from?: string`, `to?: string`, `includeOpenBar?: boolean` to `GetCandlesOptions`; include `from`/`to` in cache key `extra` (`n${count}:f${from}:t${to}`) and use `candleTtl(tf, !opts.to)` so historical windows cache for 10m; forward `from`/`to` to `p.fetchCandles()`. |
| `packages/data` | `packages/data/src/adapters/calendar.ts` | Modify | Wire BiQuote (`biquote.fetchCalendar` / `biquote.fetchCalendarUpcoming`) as zero-key primary calendar provider across `US,EU,GB,JP,CA,AU,NZ,CH`, mapping `revisedPrevious ?? previous`, unit/multiplier formatting, and `actual: null` preservation, with optional FRED release-date merge when `FRED_API_KEY` is set. |
| `packages/data` | `packages/data/src/adapters/news.ts` | Modify | Wire `biquote.fetchMarketNews()` as an automatic zero-key provider in `fetchNews()` (after Finnhub and Marketaux when keys are set, or primary when neither key is configured), reusing `articleIdFromUrl()` and `extractSymbolsFromText()`. |
| `packages/data` | `packages/data/src/index.ts` | Modify | Re-export `getPrices`, `getPricesWithMeta` from `./adapters/price`. |
| `packages/data` | `packages/data/test/biquote-rest.test.ts` | Modify | Update `fetchLatest` test for repeated `symbols=XAUUSD&symbols=EURUSD` + object/array response shapes; add `fetchOhlc` `from`/`to` tests; update throttle test to `1500` req/min; add `fetchCalendar` and `fetchMarketNews` tests. |
| `packages/data` | `packages/data/test/price-adapter.test.ts` | Modify | Add tests for `getPricesWithMeta()` batching (1 HTTP call for multiple FX/Gold symbols + cache population + mixed crypto routing) and `marketState: 'closed'` preservation. |
| `packages/data` | `packages/data/test/calendar-adapter.test.ts` | Modify | Add tests verifying zero-key BiQuote calendar retrieval, `actual: null` vs numeric preservation, `revisedPrevious` precedence, and FRED fallback/merge. |
| `packages/data` | `packages/data/test/news-adapter.test.ts` | Modify | Add tests verifying zero-key BiQuote news retrieval when `FINNHUB_API_KEY` and `MARKETAUX_API_KEY` are unset or fail. |
| `packages/ai` | `packages/ai/src/calendar-persistence.ts` | Modify | Fix `upsertEvents()` `ON CONFLICT DO UPDATE` clause to use `sql\`COALESCE(excluded.actual, ${schema.economicEvents.actual})\`` (and same for `forecast`, `previous`, `unit`, `actualsFilledAt`) instead of referencing the old table columns. |
| `packages/ai` | `packages/ai/src/context.ts` | Modify | Replace $N$ parallel `getPrice()` calls in `buildLiveSnapshot()` with `getPrices(activeSymbols)` batch call. |
| `packages/ai` | `packages/ai/src/bot/commands/price.ts` | Modify | Replace direct `schema.liveTicks` DB query with `getPriceWithMeta(symbol)` from `@kestrel/data` so `/price` works in 100% on-demand mode and displays market-closed status. |
| `packages/ai` | `packages/ai/src/mastra-v2/packets/evidence-builders.ts` | Modify | In `buildPriceEvidence()`, treat `tick.marketState === 'closed'` as an expected market-closed state (info note rather than a degraded stale error warning). |
| `packages/ai` | `packages/ai/src/mastra-v2/packets/symbol-research.ts` | Modify | In `collectSymbolResearchPacket()`, avoid marking `price.freshness` as `'stale'` / `'degraded'` when `result.tick.marketState === 'closed'` and `!result.stale`. |
| `apps/worker` | `apps/worker/src/env.ts` | Modify | Add `WORKER_ENABLE_TICK_STREAM` (default `'0'`); remove mandatory production throw for `BIQUOTE_PROXY_TOKEN` unless `WORKER_ENABLE_TICK_STREAM === '1'` (keeping `BIQUOTE_PROXY_TOKEN: optionalNonEmpty` in schema for `check-env-contract.mjs`). |
| `apps/worker` | `apps/worker/src/index.ts` | Modify | Gate `SignalRConsumer`, `BinanceStreamConsumer`, `SymbolManager`, `TickBuffer`, and `Candle1mAggregator` behind `WORKER_ENABLE_TICK_STREAM=1`; only bind `:8082` `proxyServer` when `BIQUOTE_PROXY_TOKEN` is set; call `notifyReady()` immediately in on-demand mode. |
| `apps/worker` | `apps/worker/src/http-server.ts` | Modify | Add `isTickStreamEnabled?: () => boolean` to `HealthServerDeps`; when `false` (default on-demand mode), `/health` and `/health/ready` return `200 OK` (`ready: true, tickStreamEnabled: false`) without requiring `lastTickAt`. |
| `apps/worker` | `apps/worker/src/jobs/snapshots.ts` | Modify | Keep 18-symbol `getCandles(symbol, '1h', { count: 240 })` on-demand computation; guard `candles_1m` tail-prune so it only runs when `WORKER_ENABLE_TICK_STREAM=1` (or logs `candles_1m_prune=skipped(on-demand)`). |
| `apps/worker` | `apps/worker/src/jobs/metrics-flush.ts` | Modify | When `WORKER_ENABLE_TICK_STREAM` is disabled, skip querying `live_ticks` so stale legacy rows never emit false `worker_tick_freshness_ms` spikes; return `note: 'mode=on-demand'`. |
| `apps/worker` | `apps/worker/src/jobs/fred-actuals.ts` | Modify | Before/alongside FRED observation backfill, refresh recent `biquote` calendar events via `fetchUpcomingEvents({ fromMs: now - 7d, toMs: now + 14d })` + `upsertEvents()` so MT5 actuals land even when `FRED_API_KEY` is unset. |
| `apps/worker` | `apps/worker/test/env.test.ts` | Modify | Update production token test to assert `BIQUOTE_PROXY_TOKEN` is optional by default and only required when `WORKER_ENABLE_TICK_STREAM=1`; test `WORKER_ENABLE_TICK_STREAM` default `'0'`. |
| `apps/worker` | `apps/worker/test/http-server.test.ts` | Modify | Add test verifying `/health/ready` returns `200 OK` with `tickStreamEnabled: false` when `getLastTickAt() === 0`. |
| `apps/web` | `apps/web/src/lib/services/api-boundary.ts` | Modify | Re-export `getPrices`, `getPricesWithMeta` from `@kestrel/data`. |
| `apps/web` | `apps/web/src/lib/services/market.ts` | Modify | Update `getPriceService()` to call `getPricesWithMeta(symbols, ...)` instead of `Promise.all(symbols.map(getPriceWithMeta))`. |
| `apps/web` | `apps/web/src/app/api/market/stream/route.ts` | Modify | Update `generatePrices()` SSE loop to call `getPricesWithMeta(symbols, { apiKeys: keys })` (1 batched HTTP request per 3s tick instead of $N$). |
| `apps/web` | `apps/web/src/app/api/cron/warm-cache/route.ts` | Modify | Update price warming to call `getPricesWithMeta([...SYMBOLS])` in 1 batch call and update stale comment about 10 req/min throttle. |
| `apps/web` | `apps/web/src/lib/services/journal.ts` | Modify | Update `getTradeSetupReplayService()` to compute `from` (50 bars before `entry.openedAt`, weekend-adjusted) and `to` (20 bars after `entry.closedAt ?? Date.now()`, capped at `1000` bars), pass `{ count, from, to }` to `getCandles()`, and fall back gracefully to latest bars with `replayWindowFallback: true` if BiQuote returns empty for a very old trade. |
| `apps/web` | `apps/web/src/lib/services/alerts.ts` | Modify | Update `fetchCandles()` in `previewAlertRuleService()` to fetch historical candles via `getCandles()` from `@kestrel/data` when `candles_1m` is empty. |
| `apps/web` | `apps/web/src/lib/services/admin-health.ts` | Modify | When `WORKER_ENABLE_TICK_STREAM` is not enabled (`'0'`), report `worker_ticks` SLI as healthy on-demand mode (`current: 1`, `informational: true`) without pushing false `'No live tick data'` or `'Tick data is stale'` anomalies. |
| `apps/web` | `apps/web/src/components/layout/ticker-tape.tsx` | Modify | When `tick.marketState === 'closed'`, render a muted `CLOSED` pill instead of a directional `▲/▼` change badge. |
| `apps/web` | `apps/web/src/app/(app)/dashboard/_components/widgets/watchlist-widget.tsx` | Modify | When `tick.marketState === 'closed'`, show a `Market Closed` badge/label on the row and suppress live bull/bear flash animations. |
| `apps/web` | `apps/web/src/app/(app)/settings/api-keys/_components/market-data-config.tsx` | Modify | Update BiQuote description from `"10 req/min throttle limit"` to `"15,000 req/min anonymous REST quota, batch quotes, OHLC, calendar & news"`. |
| `apps/web` | `apps/web/test/admin/admin-health.test.ts` | Modify | Test both default on-demand mode (`WORKER_ENABLE_TICK_STREAM=0` -> no false tick anomalies) and opt-in streaming mode (`WORKER_ENABLE_TICK_STREAM=1`). |

---

## 4. Phased Implementation Plan (Phases 1 to 5)

### Phase 1: BiQuote Schemas, `fetchLatest()` Repeated-Param Fix, Self-Throttle Increase & `from`/`to` OHLC Support

#### Task 1.1: Expand BiQuote, Tick, and Calendar Schemas in `@kestrel/shared`

**Files:**
- Modify: `packages/shared/src/schemas/biquote.ts`
- Modify: `packages/shared/src/schemas/tick.ts`
- Modify: `packages/shared/src/schemas/calendar.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/test/biquote.test.ts`

**Interfaces:**
- Produces:
  - `BiquoteMarketStateSchema = z.enum(['open', 'closed'])` (`export type BiquoteMarketState`)
  - Extended `BiquoteTickSchema` with `marketState`, `stale`, `quoteAgeSeconds`, `lastQuoteAt`
  - `BiquoteLatestResponseSchema` (normalizes `Record<string, BiquoteTick>` or `BiquoteTick[]` -> `BiquoteTick[]`)
  - `BiquoteCalendarEventSchema` (`export type BiquoteCalendarEvent`)
  - `BiquoteNewsArticleSchema` (`export type BiquoteNewsArticle`)
  - Extended `TickSchema` with optional `marketState`, `quoteAgeSeconds`, `dayDiffPercent`
  - Widened `KnownCountrySchema` and `EventCurrencySchema` in `packages/shared/src/schemas/calendar.ts`

- [x] **Step 1: Write the failing schema tests in `packages/shared/test/biquote.test.ts`**

```ts
import {
  BiquoteCalendarEventSchema,
  BiquoteLatestResponseSchema,
  BiquoteNewsArticleSchema,
  BiquoteTickSchema,
  EconomicEventSchema,
  TickSchema,
} from '../src';

describe('BiquoteTickSchema market-closure metadata & BiquoteLatestResponseSchema', () => {
  it('parses marketState, stale, quoteAgeSeconds, and lastQuoteAt on BiquoteTickSchema', () => {
    const parsed = BiquoteTickSchema.parse({
      symbol: 'XAUUSD',
      bid: 2390.1,
      ask: 2390.3,
      mid: 2390.2,
      last: 0,
      volume: 0,
      timestamp: '2026-05-29T21:59:59Z',
      source: 'MetaTrader 5 (Broker 1)',
      marketState: 'closed',
      stale: false,
      quoteAgeSeconds: 43200,
      lastQuoteAt: '2026-05-29T21:59:59Z',
    });
    expect(parsed.marketState).toBe('closed');
    expect(parsed.stale).toBe(false);
    expect(parsed.quoteAgeSeconds).toBe(43200);
    expect(parsed.lastQuoteAt).toBe('2026-05-29T21:59:59Z');
  });

  it('normalizes both symbol-keyed object maps and arrays in BiquoteLatestResponseSchema', () => {
    const tick = {
      symbol: 'EURUSD',
      bid: 1.085,
      ask: 1.0852,
      mid: 1.0851,
      last: 0,
      volume: 0,
      timestamp: '2026-05-27T18:35:01Z',
      source: 'MetaTrader 5',
    };
    const fromRecord = BiquoteLatestResponseSchema.parse({ EURUSD: tick });
    const fromArray = BiquoteLatestResponseSchema.parse([tick]);
    expect(fromRecord).toHaveLength(1);
    expect(fromRecord[0]?.symbol).toBe('EURUSD');
    expect(fromArray).toHaveLength(1);
  });

  it('parses BiquoteCalendarEventSchema with actual: null as unpublished (not zero) and G8 currencies', () => {
    const ev = BiquoteCalendarEventSchema.parse({
      id: 'mql5:900001',
      eventId: 'mql5:840',
      time: '2026-08-07T12:30:00Z',
      period: '2026-07-01T00:00:00Z',
      countryCode: 'JP',
      currency: 'JPY',
      name: 'BoJ Interest Rate Decision',
      importance: 'high',
      type: 'indicator',
      sector: 'money',
      unit: 'percent',
      multiplier: null,
      digits: 2,
      actual: null,
      forecast: 0.25,
      previous: 0.1,
      revisedPrevious: null,
      revision: 0,
      timeMode: 'exact',
      sourceUrl: 'https://www.boj.or.jp/',
      source: 'mql5',
    });
    expect(ev.actual).toBeNull();
    expect(
      EconomicEventSchema.parse({
        id: ev.id,
        title: ev.name,
        country: ev.countryCode,
        currency: ev.currency,
        importance: ev.importance,
        date: Date.parse(ev.time),
        actual: ev.actual,
        forecast: ev.forecast,
        previous: ev.revisedPrevious ?? ev.previous,
        unit: ev.unit,
        source: 'biquote',
      }).currency,
    ).toBe('JPY');
  });

  it('parses BiquoteNewsArticleSchema and TickSchema marketState fields', () => {
    const news = BiquoteNewsArticleSchema.parse({
      title: 'Gold steadies ahead of CPI',
      description: 'Spot gold held near $2,400...',
      url: 'https://example.com/gold-cpi',
      publisher: 'Reuters',
      publishedDate: '2026-05-27T09:15:00Z',
      imageUrl: null,
      category: null,
      language: 'en',
      country: 'US',
    });
    expect(news.publisher).toBe('Reuters');

    const tick = TickSchema.parse({
      symbol: 'XAUUSD',
      bid: 2400,
      ask: 2400,
      mid: 2400,
      ts: 1748378101000,
      source: 'biquote',
      marketState: 'closed',
      quoteAgeSeconds: 3600,
      dayDiffPercent: -0.15,
    });
    expect(tick.marketState).toBe('closed');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/shared test -- test/biquote.test.ts`
Expected: FAIL with missing exports `BiquoteLatestResponseSchema`, `BiquoteCalendarEventSchema`, `BiquoteNewsArticleSchema` and rejected `JPY` on `EconomicEventSchema`.

- [x] **Step 3: Implement schema updates in `packages/shared/src/schemas/biquote.ts`, `tick.ts`, `calendar.ts`, and `index.ts`**

In `packages/shared/src/schemas/biquote.ts`:
```ts
export const BiquoteMarketStateSchema = z.enum(['open', 'closed']);
export type BiquoteMarketState = z.infer<typeof BiquoteMarketStateSchema>;

export const BiquoteTickSchema = z.object({
  symbol: z.string().min(1),
  bid: z.number().finite(),
  ask: z.number().finite(),
  mid: z.number().finite().optional(),
  last: z.number().finite(),
  volume: z.number().finite(),
  timestamp: z.string().min(1),
  source: z.string().min(1),
  high: z.number().finite().nullable().optional(),
  low: z.number().finite().nullable().optional(),
  direction: z.union([z.string(), z.number(), z.null()]).optional(),
  dayDiffPercent: z.number().finite().nullable().optional(),
  description: z.string().nullable().optional(),
  time: z.string().optional(),
  spread: z.number().finite().nullable().optional(),
  marketState: BiquoteMarketStateSchema.optional(),
  stale: z.boolean().optional(),
  quoteAgeSeconds: z.number().finite().nonnegative().nullable().optional(),
  lastQuoteAt: z.string().nullable().optional(),
});

export const BiquoteLatestResponseSchema = z
  .union([z.array(BiquoteTickSchema), z.record(z.string(), BiquoteTickSchema)])
  .transform((val): BiquoteTick[] => (Array.isArray(val) ? val : Object.values(val)));

export const BiquoteCalendarImportanceSchema = z.enum(['low', 'medium', 'high']);

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
  digits: z.number().int().nullable().optional(),
  actual: z.number().finite().nullable().optional().default(null),
  forecast: z.number().finite().nullable().optional().default(null),
  previous: z.number().finite().nullable().optional().default(null),
  revisedPrevious: z.number().finite().nullable().optional().default(null),
  revision: z.number().int().nullable().optional(),
  timeMode: z.string().nullable().optional(),
  sourceUrl: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
});
export type BiquoteCalendarEvent = z.infer<typeof BiquoteCalendarEventSchema>;

export const BiquoteNewsArticleSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional().default(null),
  url: z.string().url(),
  publisher: z.string().nullable().optional().default(null),
  publishedDate: z.string().min(1),
  imageUrl: z.string().nullable().optional().default(null),
  category: z.string().nullable().optional().default(null),
  language: z.string().nullable().optional().default(null),
  country: z.string().nullable().optional().default(null),
});
export type BiquoteNewsArticle = z.infer<typeof BiquoteNewsArticleSchema>;
```

In `packages/shared/src/schemas/tick.ts`:
```ts
import { z } from 'zod';
import { SymbolSchema } from '../symbols';
import { BiquoteMarketStateSchema } from './biquote';

export const TickSchema = z.object({
  symbol: SymbolSchema,
  bid: z.number(),
  ask: z.number(),
  mid: z.number(),
  /** Tick timestamp, ms epoch UTC. */
  ts: z.number().int(),
  source: z.string(),
  /** Market state reported by upstream ('open' | 'closed'). Optional for providers that do not report it. */
  marketState: BiquoteMarketStateSchema.optional(),
  /** Seconds since the last upstream quote when reported by BiQuote. */
  quoteAgeSeconds: z.number().nonnegative().nullable().optional(),
  /** Daily percentage change since session open (null/hidden when marketState === 'closed'). */
  dayDiffPercent: z.number().finite().nullable().optional(),
});

export type Tick = z.infer<typeof TickSchema>;
```

In `packages/shared/src/schemas/calendar.ts`:
```ts
export const KnownCountrySchema = z.enum([
  'US',
  'EU',
  'EZ',
  'GB',
  'UK',
  'JP',
  'CA',
  'AU',
  'NZ',
  'CH',
  'DE',
  'FR',
  'XAU',
]);
export const CountrySchema = z.union([KnownCountrySchema, z.string()]);

export const KnownEventCurrencySchema = z.enum([
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'AUD',
  'CAD',
  'NZD',
  'CHF',
]);
export const EventCurrencySchema = z.union([KnownEventCurrencySchema, z.string()]);
export type EventCurrency = z.infer<typeof EventCurrencySchema>;
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kestrel/shared test -- test/biquote.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/biquote.ts packages/shared/src/schemas/tick.ts packages/shared/src/schemas/calendar.ts packages/shared/src/index.ts packages/shared/test/biquote.test.ts
git commit -m "feat(shared): add BiQuote marketState, batch latest, calendar, and news schemas"
```

---

#### Task 1.2: Fix `fetchLatest()` Repeated Params, Raise Self-Throttle to 1,500/min, Add `from`/`to` OHLC & Calendar/News REST Methods

**Files:**
- Modify: `packages/data/src/providers/biquote/rest.ts`
- Modify: `packages/data/src/providers/biquote/index.ts`
- Test: `packages/data/test/biquote-rest.test.ts`

**Interfaces:**
- Consumes: `BiquoteLatestResponseSchema`, `BiquoteCalendarEventSchema`, `BiquoteNewsArticleSchema` from `@kestrel/shared`
- Produces:
  - `THROTTLE: ThrottleConfig = { limit: 1500, windowMs: 60_000 }` (10% of BiQuote's 15,000 req/min IP limit, leaving 90% headroom while eliminating false self-throttling)
  - `fetchLatest(symbols: Symbol[], opts?: CallOptions): Promise<BiquoteTick[]>` using repeated `?symbols=XAUUSD&symbols=EURUSD` (chunked at 100 symbols max)
  - `FetchOhlcArgs` with `from?: string | undefined` and `to?: string | undefined` (ISO-8601 UTC)
  - `fetchCalendar(args?: FetchBiquoteCalendarArgs): Promise<BiquoteCalendarEvent[]>`
  - `fetchCalendarUpcoming(args?: FetchBiquoteCalendarUpcomingArgs): Promise<BiquoteCalendarEvent[]>`
  - `fetchMarketNews(args?: FetchBiquoteNewsArgs): Promise<BiquoteNewsArticle[]>`

- [x] **Step 1: Write the failing tests in `packages/data/test/biquote-rest.test.ts`**

```ts
  it('repeats the symbols query parameter (?symbols=XAUUSD&symbols=EURUSD) and parses both object and array responses', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      jsonResponse({
        XAUUSD: VALID_TICK,
        EURUSD: { ...VALID_TICK, symbol: 'EURUSD', mid: 1.085 },
      }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const ticks = await fetchLatest(['XAUUSD', 'EURUSD']);
    expect(ticks).toHaveLength(2);
    expect(ticks.map((t) => t.symbol)).toEqual(['XAUUSD', 'EURUSD']);

    const url = String(fetchSpy.mock.calls[0]?.[0]);
    expect(url).toBe('https://biquote.io/api/latest?symbols=XAUUSD&symbols=EURUSD');
    expect(url).not.toContain('%2C');
  });

  it('passes optional from and to ISO-8601 query params on fetchOhlc', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(jsonResponse(ohlcEnvelope([bar('2026-05-20T12:00:00Z')])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await fetchOhlc({
      symbol: 'XAUUSD',
      tf: '15m',
      count: 200,
      from: '2026-05-20T00:00:00.000Z',
      to: '2026-05-21T00:00:00.000Z',
    });

    const url = new URL(String(fetchSpy.mock.calls[0]?.[0]));
    expect(url.searchParams.get('interval')).toBe('15m');
    expect(url.searchParams.get('limit')).toBe('200');
    expect(url.searchParams.get('from')).toBe('2026-05-20T00:00:00.000Z');
    expect(url.searchParams.get('to')).toBe('2026-05-21T00:00:00.000Z');
  });
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/data test -- test/biquote-rest.test.ts`
Expected: FAIL (`symbols=XAUUSD%2CEURUSD` instead of repeated params, `from`/`to` missing).

- [x] **Step 3: Implement `call()` query array handling, `fetchLatest()`, `fetchOhlc()` `from`/`to`, `fetchCalendar()`, `fetchCalendarUpcoming()`, and `fetchMarketNews()` in `packages/data/src/providers/biquote/rest.ts`**

Key implementation details in `packages/data/src/providers/biquote/rest.ts`:
```ts
export const BIQUOTE_THROTTLE_LIMIT = 1500;
const THROTTLE: ThrottleConfig = { limit: BIQUOTE_THROTTLE_LIMIT, windowMs: 60_000 };

const ErrorEnvelopeSchema = z.object({
  message: z.string().optional(),
  error: z.string().optional(),
});

type QueryParams = Record<string, string | readonly string[] | undefined> | null;

// Inside call():
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
```
And for `fetchLatest()`, `fetchOhlc()`, `fetchCalendar()`, `fetchCalendarUpcoming()`, `fetchMarketNews()`:
```ts
const MAX_LATEST_BATCH = 100;

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

export interface FetchOhlcArgs extends CallOptions {
  symbol: Symbol;
  tf: Timeframe;
  count: number;
  includeOpenBar?: boolean;
  /** Optional ISO-8601 UTC start timestamp (e.g. "2026-05-01T00:00:00.000Z"). */
  from?: string;
  /** Optional ISO-8601 UTC end timestamp (e.g. "2026-05-02T00:00:00.000Z"). */
  to?: string;
}

// Inside fetchOhlc():
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
```
And add `fetchCalendar`, `fetchCalendarUpcoming`, and `fetchMarketNews`:
```ts
const CalendarArraySchema = z.array(BiquoteCalendarEventSchema);
const NewsArraySchema = z.array(BiquoteNewsArticleSchema);

export interface FetchBiquoteCalendarArgs extends CallOptions {
  from?: string;
  to?: string;
  countries?: string;
  importance?: 'low' | 'medium' | 'high';
  type?: 'event' | 'indicator' | 'holiday';
  limit?: number;
}

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
  limit?: number;
  countries?: string;
  importance?: 'low' | 'medium' | 'high';
}

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
  maxResults?: number;
}

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
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kestrel/data test -- test/biquote-rest.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/data/src/providers/biquote/rest.ts packages/data/src/providers/biquote/index.ts packages/data/test/biquote-rest.test.ts
git commit -m "feat(data): fix biquote fetchLatest repeated params, add OHLC from/to and calendar/news REST"
```

---

### Phase 2: On-Demand Price & Candle Adapters (Gating DB Polling & Adding Multi-Symbol Batching)

#### Task 2.1: Gate `liveTicksProvider` Behind `WORKER_ENABLE_TICK_STREAM=1` & Add Batch `getPricesWithMeta()`

**Files:**
- Modify: `packages/data/src/providers/provider-registry.ts`
- Modify: `packages/data/src/providers/provider-adapters.ts`
- Modify: `packages/data/src/adapters/price.ts`
- Modify: `packages/data/src/adapters/candles.ts`
- Modify: `packages/data/src/index.ts`
- Test: `packages/data/test/price-adapter.test.ts`

**Interfaces:**
- Produces:
  - `getPricesWithMeta(symbolsInput: readonly Symbol[], opts?: GetPriceOptions): Promise<PriceResult[]>`
  - `getPrices(symbolsInput: readonly Symbol[], opts?: GetPriceOptions): Promise<Tick[]>`
  - `GetCandlesOptions` with `from?: string`, `to?: string`, `includeOpenBar?: boolean`
  - Cache key rule for candles in `packages/data/src/adapters/candles.ts`:
    ```ts
    const rangeSuffix =
      opts.from || opts.to ? `:f${opts.from ?? ''}:t${opts.to ?? ''}` : '';
    const key = cacheKey({
      resource: 'candles',
      symbol,
      tf,
      extra: `n${count}${rangeSuffix}`,
    });
    const isHistoricalClosedWindow = Boolean(opts.to && Date.parse(opts.to) < Date.now() - 60_000);
    const policy = candleTtl(tf, !isHistoricalClosedWindow);
    ```

- [x] **Step 1: Write the failing tests in `packages/data/test/price-adapter.test.ts`**

```ts
describe('getPricesWithMeta — multi-symbol batching', () => {
  it('batches multiple FX/Gold symbols into a single /api/latest request and populates per-symbol cache', async () => {
    let latestCalls = 0;
    let singleCalls = 0;
    globalThis.fetch = createRoutedFetch([
      {
        match: (u) => u.includes('biquote.io/api/latest'),
        respond: () => {
          latestCalls += 1;
          return {
            body: {
              XAUUSD: {
                ...VALID_BIQUOTE_TICK('XAUUSD', 2410.5),
                marketState: 'open',
                quoteAgeSeconds: 1,
                dayDiffPercent: 0.45,
              },
              EURUSD: {
                ...VALID_BIQUOTE_TICK('EURUSD', 1.086),
                marketState: 'closed',
                quoteAgeSeconds: 7200,
                dayDiffPercent: -0.1,
              },
            },
          };
        },
      },
      {
        match: (u) => u.includes('biquote.io/api/'),
        respond: () => {
          singleCalls += 1;
          return { body: VALID_BIQUOTE_TICK('XAUUSD', 2410.5) };
        },
      },
    ]);

    const results = await getPricesWithMeta(['XAUUSD', 'EURUSD']);
    expect(results).toHaveLength(2);
    expect(latestCalls).toBe(1);
    expect(singleCalls).toBe(0);
    expect(results[0]?.tick.marketState).toBe('open');
    expect(results[1]?.tick.marketState).toBe('closed');
    // Second call for XAUUSD alone hits the populated per-symbol cache (0 additional HTTP calls)
    const cachedSingle = await getPriceWithMeta('XAUUSD');
    expect(cachedSingle.tick.mid).toBeCloseTo(2410.5);
    expect(latestCalls).toBe(1);
    expect(singleCalls).toBe(0);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/data test -- test/price-adapter.test.ts`
Expected: FAIL (`getPricesWithMeta is not a function`).

- [x] **Step 3: Implement `getPricesWithMeta()`, `biquoteProvider.fetchPrices()`, `liveTicksProvider` gating, and `candles.ts` `from`/`to` cache key isolation**

In `packages/data/src/providers/provider-adapters.ts`:
```ts
function isTickStreamEnabled(): boolean {
  return (
    process.env.WORKER_ENABLE_TICK_STREAM === '1' ||
    process.env.WORKER_ENABLE_TICK_STREAM === 'true'
  );
}

const liveTicksProvider: MarketDataProvider = {
  name: 'live-ticks',
  label: 'Live Ticks (Worker Postgres Snapshot)',
  pinned: true,
  async fetchPrice(symbol: Symbol) {
    const r = await fetchLiveTick({ symbol });
    return { price: r.price, provider: r.provider, ageMs: r.ageMs };
  },
  async fetchCandles(
    symbol: Symbol,
    tf: Timeframe,
    count: number,
    opts?: ProviderFetchOptions,
  ): Promise<Candle[] | null> {
    if (tf !== '1m' || opts?.from || opts?.to) return null;
    const r = await fetchCandles1m({ symbol, count });
    const fetchedAt = Date.now();
    return r.bars.map((bar) => toCandle(bar, { symbol, tf, source: r.provider, fetchedAt }));
  },
  supports(_symbol: Symbol, tf?: Timeframe): boolean {
    if (!isTickStreamEnabled()) return false;
    return tf === undefined || tf === '1m';
  },
  // ...
};
```
Note on `price-adapter.test.ts` compatibility: For existing unit tests in `price-adapter.test.ts` that specifically test `getPrice — live_ticks pseudo-provider (Phase 8 PR-8)`, set `process.env.WORKER_ENABLE_TICK_STREAM = '1'` inside that `describe` block (or allow `liveTicksProvider.supports()` to check `process.env.WORKER_ENABLE_TICK_STREAM !== '0'` only when explicitly mocked, or set `vi.stubEnv('WORKER_ENABLE_TICK_STREAM', '1')` in that `describe` block). Setting `vi.stubEnv('WORKER_ENABLE_TICK_STREAM', '1')` in `describe('getPrice — live_ticks pseudo-provider')` explicitly tests the opt-in legacy flag while verifying that default mode skips `live_ticks`!

And in `packages/data/src/providers/provider-adapters.ts` on `biquoteProvider`:
```ts
  async fetchPrice(symbol: Symbol, opts?: ProviderFetchOptions) {
    const baseUrl = opts?.baseUrl ?? process.env.BIQUOTE_BASE_URL ?? 'https://biquote.io';
    const tick = await biquote.fetchTick(symbol, {
      baseUrl,
      ...(opts?.signal ? { signal: opts.signal } : {}),
    });
    const mid = tick.mid ?? (tick.bid + tick.ask) / 2;
    return {
      price: mid,
      bid: tick.bid,
      ask: tick.ask,
      provider: 'biquote',
      ageMs: tick.quoteAgeSeconds != null ? tick.quoteAgeSeconds * 1000 : null,
      marketState: tick.marketState,
      quoteAgeSeconds: tick.quoteAgeSeconds ?? null,
      dayDiffPercent: tick.marketState === 'closed' ? null : (tick.dayDiffPercent ?? null),
    };
  },
  async fetchPrices(symbols: Symbol[], opts?: ProviderFetchOptions) {
    const baseUrl = opts?.baseUrl ?? process.env.BIQUOTE_BASE_URL ?? 'https://biquote.io';
    const ticks = await biquote.fetchLatest(symbols, {
      baseUrl,
      ...(opts?.signal ? { signal: opts.signal } : {}),
    });
    const out = new Map<
      Symbol,
      {
        price: number;
        bid?: number;
        ask?: number;
        provider: string;
        ageMs: number | null;
        marketState?: 'open' | 'closed';
        quoteAgeSeconds?: number | null;
        dayDiffPercent?: number | null;
      }
    >();
    for (const tick of ticks) {
      const mid = tick.mid ?? (tick.bid + tick.ask) / 2;
      out.set(tick.symbol, {
        price: mid,
        bid: tick.bid,
        ask: tick.ask,
        provider: 'biquote',
        ageMs: tick.quoteAgeSeconds != null ? tick.quoteAgeSeconds * 1000 : null,
        ...(tick.marketState ? { marketState: tick.marketState } : {}),
        quoteAgeSeconds: tick.quoteAgeSeconds ?? null,
        dayDiffPercent: tick.marketState === 'closed' ? null : (tick.dayDiffPercent ?? null),
      });
    }
    return out;
  },
  async fetchCandles(
    symbol: Symbol,
    tf: Timeframe,
    count: number,
    opts?: ProviderFetchOptions,
  ): Promise<Candle[] | null> {
    if (tf === '1w') return null;
    const baseUrl = opts?.baseUrl ?? process.env.BIQUOTE_BASE_URL ?? 'https://biquote.io';
    const raw = await biquote.fetchOhlc({
      symbol,
      tf,
      count: Math.min(count, 1000),
      baseUrl,
      ...(opts?.from ? { from: opts.from } : {}),
      ...(opts?.to ? { to: opts.to } : {}),
      ...(opts?.includeOpenBar !== undefined ? { includeOpenBar: opts.includeOpenBar } : {}),
      ...(opts?.signal ? { signal: opts.signal } : {}),
    });
    const fetchedAt = Date.now();
    return raw.map((bar) => toCandleFromBiquote(bar, { symbol, tf, fetchedAt }));
  },
```

And in `packages/data/src/adapters/price.ts`, implement `getPricesWithMeta(symbolsInput, opts)`:
1. Normalize and validate all symbols via `SymbolSchema.parse()`.
2. Partition symbols that support `biquote` (when `!isTickStreamEnabled()` and `opts.marketDataProvider !== 'finnhub'`).
3. When ≥2 FX/Gold symbols are requested, call `biquote.fetchLatest(biquoteSymbols)` for any symbols not already warm in cache (or populate the cache via `cache.set(cacheKey({ resource: 'price', symbol }), { tick, ageMs }, { ttlSeconds: ttl, maxStaleSeconds: swr, tags })`), and fall back to per-symbol `getPriceWithMeta(s, opts)` for any missing/crypto symbols or on batch error!

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kestrel/data test`
Expected: PASS across all test files in `packages/data`.

- [x] **Step 5: Commit**

```bash
git add packages/data/src/providers/provider-registry.ts packages/data/src/providers/provider-adapters.ts packages/data/src/adapters/price.ts packages/data/src/adapters/candles.ts packages/data/src/index.ts packages/data/test/price-adapter.test.ts
git commit -m "feat(data): add batch getPricesWithMeta, gate live-ticks by default, and support OHLC from/to"
```

---

#### Task 2.2: Wire `getPricesWithMeta()` into `/api/market/stream`, `getPriceService`, `warm-cache`, AI `context.ts`, and Telegram `/price`

**Files:**
- Modify: `apps/web/src/lib/services/api-boundary.ts`
- Modify: `apps/web/src/lib/services/market.ts`
- Modify: `apps/web/src/app/api/market/stream/route.ts`
- Modify: `apps/web/src/app/api/cron/warm-cache/route.ts`
- Modify: `packages/ai/src/context.ts`
- Modify: `packages/ai/src/bot/commands/price.ts`

**Interfaces:**
- Consumes: `getPrices`, `getPricesWithMeta` from `@kestrel/data`
- Produces: 1-request batch price polling in `/api/market/stream`, `/api/market/price`, `warm-cache`, and `buildLiveSnapshot()`, plus on-demand `/price` in Telegram.

- [x] **Step 1: Update `apps/web/src/lib/services/api-boundary.ts`, `market.ts`, `stream/route.ts`, and `warm-cache/route.ts`**

In `apps/web/src/lib/services/market.ts`:
```ts
export async function getPriceService(userId: string, symbols: string[]): Promise<PriceResultDTO> {
  const { finnhubKey, marketDataProvider } = await loadUserMarketPrefs(userId);

  const results = await getPricesWithMeta(symbols, {
    apiKeys: { finnhub: finnhubKey },
    marketDataProvider,
  });

  const ticks: TickWithMetaDTO[] = results.map((r) => ({
    ...r.tick,
    stale: r.stale,
    producedAt: r.producedAt,
    ageMs: r.ageMs,
  }));

  const anyStale = ticks.some((t) => t.stale);
  return { ticks, anyStale };
}
```
In `apps/web/src/app/api/market/stream/route.ts`:
```ts
    try {
      const results = await getPricesWithMeta(symbols, { apiKeys: keys });
      const ticks = results.map((r) => r.tick);
      yield `data: ${JSON.stringify({ ticks, ts: Date.now() })}\n\n`;
    } catch (err) {
      yield `data: ${JSON.stringify({ error: String(err), ts: Date.now() })}\n\n`;
    }
```
In `apps/web/src/app/api/cron/warm-cache/route.ts`:
```ts
    try {
      const results = await getPricesWithMeta([...SYMBOLS]);
      processed += results.length;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ key: 'price:batch', message });
      log.warn('price batch warm failed', { message });
    }
```
In `packages/ai/src/bot/commands/price.ts`:
```ts
import { getPriceWithMeta } from '@kestrel/data';
import { isKnownSymbol } from '@kestrel/shared';
import type { BotCommand, BotResponse } from '../types';

export const priceCommand: BotCommand = {
  name: 'price',
  aliases: ['p'],
  description: 'Get current price: /price <symbol>',
  handler: async (args: string[]): Promise<BotResponse> => {
    const symbolStr = args[0]?.trim().toUpperCase();
    if (!symbolStr) {
      return { text: 'Usage: /price <symbol>\nExample: /price XAUUSD' };
    }
    if (!isKnownSymbol(symbolStr)) {
      return { text: `Unknown symbol: ${symbolStr}. Example: /price XAUUSD` };
    }
    try {
      const { tick } = await getPriceWithMeta(symbolStr);
      const time = new Date(tick.ts).toISOString();
      const statusLine =
        tick.marketState === 'closed' ? 'Status: Market Closed (Last Price)' : 'Status: Live';
      return {
        text: [
          `📊 ${tick.symbol}`,
          statusLine,
          `Bid: ${tick.bid}`,
          `Ask: ${tick.ask}`,
          `Mid: ${tick.mid}`,
          `Source: ${tick.source}`,
          `Updated: ${time}`,
        ].join('\n'),
      };
    } catch (err) {
      return {
        text: `Failed to fetch price for ${symbolStr}: ${err instanceof Error ? err.message : 'unknown error'}`,
      };
    }
  },
};
```

- [x] **Step 2: Run typecheck and tests across `packages/ai` and `apps/web`**

Run: `pnpm --filter @kestrel/ai typecheck && pnpm --filter @kestrel/web typecheck`
Expected: PASS (`0` errors)

- [x] **Step 3: Commit**

```bash
git add apps/web/src/lib/services/api-boundary.ts apps/web/src/lib/services/market.ts apps/web/src/app/api/market/stream/route.ts apps/web/src/app/api/cron/warm-cache/route.ts packages/ai/src/context.ts packages/ai/src/bot/commands/price.ts
git commit -m "feat(web,ai): wire batch getPricesWithMeta into stream, price service, warm-cache, and bot"
```

---

### Phase 3: Trade Setup Replay Historical Window (`from` & `to` Calculation with Indicator Warm-Up & Fallback)

#### Task 3.1: Compute Historical `from` / `to` Window in `getTradeSetupReplayService`

**Files:**
- Modify: `apps/web/src/lib/services/journal.ts`
- Modify: `apps/web/src/app/(app)/journal/_components/setup-replay-modal.tsx`
- Test: `apps/web/test/route-journal-replay.test.ts` (and new unit test `apps/web/test/journal-replay-service.test.ts`)

**Interfaces:**
- Consumes: `getCandles(symbol, tf, { count, from, to })` from `@kestrel/data`, `msPerTimeframe(tf)` from `@kestrel/shared`
- Produces:
  - `computeReplayWindow(openedAt: number, closedAt: number | null, tf: Timeframe, nowMs?: number): { from: string; to: string; count: number }`
  - Extended `TradeSetupReplayDTO.stats` with optional `replayWindowFallback?: boolean`

**Exact Algorithm & Edge-Case Math (`computeReplayWindow`):**
1. **Indicator Warm-Up Lead-In (`WARMUP_BARS = 55`):** `ema(50)` requires 50 bars to seed its initial SMA before exponential smoothing begins; `ema(20)` needs 20; `rsi(14)` needs 15. Requesting `55` bars before `entry.openedAt` guarantees that `ema50`, `ema20`, and `rsi14` are warm and non-null at `openIndex`.
2. **Weekend Gap Compensation:** Forex/Gold is closed for 48 hours every weekend (Friday 22:00 UTC -> Sunday 22:00 UTC). If the raw warmup window `[openedAt - 55 * tfMs, openedAt]` straddles a weekend (or `openedAt`'s UTC day is Sunday/Monday and `55 * tfMs < 72h`), pad `fromMs` by an additional `48 * 3_600_000` (48 hours) so at least 55 trading bars precede `openedAt`.
3. **Post-Exit Context (`POST_CLOSE_BARS = 20`):** Pad `toMs = Math.min(nowMs, effectiveCloseMs + 20 * tfMs)` so the replay chart clearly shows price action immediately after the exit (did price reverse after stop-out, or keep running after take-profit?).
4. **Bar Count Cap (`MAX_REPLAY_BARS = 1000`):** BiQuote's `/api/{symbol}/ohlc` caps `limit` at `1000`. Compute `tradeBars = Math.ceil((effectiveCloseMs - openedAt) / tfMs)`. Total `count = Math.min(1000, Math.max(140, WARMUP_BARS + tradeBars + POST_CLOSE_BARS + 10))`. If `WARMUP_BARS + tradeBars + POST_CLOSE_BARS > 1000` (e.g. a multi-week swing trade viewed on `5m`), clamp `toMs = fromMs + 1000 * tfMs` so the entry and the first ~945 bars of the trade + indicator warmup are always preserved accurately.
5. **Graceful Fallback for Ancient Trades:** If `getCandles(entry.symbol, tf, { count, from, to })` throws or returns `0` bars (because the trade predates BiQuote's history retention for that timeframe), catch and retry `getCandles(entry.symbol, tf, { count: 140 })` (latest bars) and set `stats.replayWindowFallback = true` so the modal can display a subtle notice (`"Historical window outside provider retention — showing latest bars"`) instead of crashing with a 500.

- [x] **Step 1: Write the failing test in `apps/web/test/journal-replay-service.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import { computeReplayWindow, getTradeSetupReplayService } from '@/lib/services/journal';
import * as data from '@kestrel/data';
import * as ai from '@kestrel/ai';

vi.mock('@kestrel/data', () => ({
  getCandles: vi.fn(),
}));
vi.mock('@kestrel/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kestrel/ai')>();
  return { ...actual, getEntry: vi.fn() };
});

describe('computeReplayWindow & getTradeSetupReplayService', () => {
  it('calculates from/to with 55-bar warmup and 20-bar post-close padding', () => {
    const openedAt = Date.parse('2026-08-12T10:00:00Z'); // Wednesday
    const closedAt = Date.parse('2026-08-12T14:00:00Z'); // 4h later (16 bars of 15m)
    const nowMs = Date.parse('2026-08-20T12:00:00Z');

    const win = computeReplayWindow(openedAt, closedAt, '15m', nowMs);
    expect(Date.parse(win.from)).toBeLessThanOrEqual(openedAt - 55 * 15 * 60_000);
    expect(Date.parse(win.to)).toBe(closedAt + 20 * 15 * 60_000);
    expect(win.count).toBeGreaterThanOrEqual(140);
    expect(win.count).toBeLessThanOrEqual(1000);
  });

  it('passes from and to to getCandles and falls back gracefully if historical range is empty', async () => {
    const openedAt = Date.parse('2026-06-10T10:00:00Z');
    const closedAt = Date.parse('2026-06-10T12:00:00Z');
    vi.mocked(ai.getEntry).mockResolvedValueOnce({
      id: 'entry-1',
      userId: 'u1',
      symbol: 'XAUUSD',
      side: 'long',
      entry: 2350,
      exit: 2365,
      stop: 2340,
      target: 2370,
      size: 1,
      notes: null,
      tags: [],
      screenshotUrl: null,
      attachments: [],
      openedAt,
      closedAt,
      outcome: 'win',
      rMultiple: 1.5,
      createdAt: openedAt,
      updatedAt: closedAt,
    });

    vi.mocked(data.getCandles)
      .mockRejectedValueOnce(new Error('empty candle response'))
      .mockResolvedValueOnce([
        { symbol: 'XAUUSD', tf: '15m', t: openedAt, o: 2350, h: 2368, l: 2348, c: 2365, v: null, source: 'biquote', fetchedAt: Date.now() },
      ]);

    const res = await getTradeSetupReplayService({ userId: 'u1', id: 'entry-1', timeframe: '15m' });
    expect(res).not.toBeNull();
    expect(data.getCandles).toHaveBeenNthCalledWith(
      1,
      'XAUUSD',
      '15m',
      expect.objectContaining({ from: expect.any(String), to: expect.any(String) }),
    );
    expect(res?.stats.replayWindowFallback).toBe(true);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/web test -- test/journal-replay-service.test.ts`
Expected: FAIL (`computeReplayWindow is not exported`).

- [x] **Step 3: Implement `computeReplayWindow()` and fallback logic in `apps/web/src/lib/services/journal.ts`**

```ts
const REPLAY_WARMUP_BARS = 55;
const REPLAY_POST_CLOSE_BARS = 20;
const REPLAY_MIN_BARS = 140;
const REPLAY_MAX_BARS = 1000;
const WEEKEND_PAD_MS = 48 * 60 * 60 * 1000;

export function computeReplayWindow(
  openedAt: number,
  closedAt: number | null,
  tf: Timeframe,
  nowMs: number = Date.now(),
): { from: string; to: string; count: number } {
  const tfMs = msPerTimeframe(tf);
  const effectiveCloseMs = closedAt && closedAt >= openedAt ? closedAt : nowMs;
  const rawWarmupMs = REPLAY_WARMUP_BARS * tfMs;
  let fromMs = openedAt - rawWarmupMs;

  // Pad 48h when the warmup window crosses a weekend so 55 trading bars are available
  const openDay = new Date(openedAt).getUTCDay();
  const fromDay = new Date(fromMs).getUTCDay();
  if (openDay === 0 || openDay === 1 || fromDay === 6 || fromDay === 0 || fromDay > openDay) {
    fromMs -= WEEKEND_PAD_MS;
  }

  let toMs = Math.min(nowMs, effectiveCloseMs + REPLAY_POST_CLOSE_BARS * tfMs);
  const tradeBars = Math.max(1, Math.ceil((effectiveCloseMs - openedAt) / tfMs));
  const desiredBars = REPLAY_WARMUP_BARS + tradeBars + REPLAY_POST_CLOSE_BARS + 10;
  const count = Math.min(REPLAY_MAX_BARS, Math.max(REPLAY_MIN_BARS, desiredBars));

  if (desiredBars > REPLAY_MAX_BARS) {
    const maxSpanMs = (REPLAY_MAX_BARS - REPLAY_WARMUP_BARS) * tfMs;
    toMs = Math.min(toMs, openedAt + maxSpanMs);
  }

  return {
    from: new Date(fromMs).toISOString(),
    to: new Date(Math.max(openedAt + tfMs, toMs)).toISOString(),
    count,
  };
}
```
And in `getTradeSetupReplayService()`:
```ts
  const window = computeReplayWindow(entry.openedAt, entry.closedAt, tf);
  let replayWindowFallback = false;
  let candleList = await getCandles(entry.symbol, tf, {
    count: window.count,
    from: window.from,
    to: window.to,
  }).catch(() => []);

  if (candleList.length === 0) {
    replayWindowFallback = true;
    candleList = await getCandles(entry.symbol, tf, { count: REPLAY_MIN_BARS });
  }
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kestrel/web test -- test/journal-replay-service.test.ts test/route-journal-replay.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add apps/web/src/lib/services/journal.ts apps/web/src/app/\(app\)/journal/_components/setup-replay-modal.tsx apps/web/test/journal-replay-service.test.ts
git commit -m "feat(journal): wire historical from/to OHLC window into Trade Setup Replay"
```

---

### Phase 4: Zero-Key BiQuote Economic Calendar & Market News Providers

#### Task 4.1: Fix `calendar-persistence.ts` Conflict Upsert & Wire BiQuote 54-Country Calendar Provider

**Files:**
- Modify: `packages/ai/src/calendar-persistence.ts`
- Modify: `packages/data/src/adapters/calendar.ts`
- Modify: `apps/worker/src/jobs/fred-actuals.ts`
- Test: `packages/data/test/calendar-adapter.test.ts`

**Interfaces:**
- Consumes: `biquote.fetchCalendar`, `biquote.fetchCalendarUpcoming` from `@kestrel/data/providers/biquote`
- Produces:
  - Zero-key primary `fetchUpcomingEvents(opts?: FetchCalendarOptions): Promise<EconomicEvent[]>` in `packages/data/src/adapters/calendar.ts`
  - Fixed `upsertEvents()` in `packages/ai/src/calendar-persistence.ts` that updates `actual`, `forecast`, `previous`, `unit`, `date`, and `actualsFilledAt` on conflict.

**Mapping Contract (BiQuote Calendar -> Kestrel `EconomicEvent`):**
- `id`: `ev.id` (already prefixed by BiQuote as e.g. `"mql5:900001"`)
- `title`: `ev.name`
- `country`: `ev.countryCode === 'EU' ? 'EZ' : ev.countryCode === 'GB' ? 'UK' : ev.countryCode` (normalizes `EU` -> `EZ` and `GB` -> `UK` for Kestrel UI filter parity while preserving `US`, `JP`, `CA`, `AU`, `NZ`, `CH`)
- `currency`: `ev.currency ?? null`
- `importance`: `ev.importance` (`'low' | 'medium' | 'high'`)
- `date`: `Date.parse(ev.time)` (ms epoch UTC)
- `actual`: `ev.actual ?? null` (**CRITICAL**: `null` means unpublished; never coerce `null` to `0`)
- `forecast`: `ev.forecast ?? null`
- `previous`: `ev.revisedPrevious ?? ev.previous ?? null` (per BiQuote docs: compare against `revisedPrevious` when the statistics office restated the prior figure)
- `unit`: `[ev.unit, ev.multiplier].filter(Boolean).join(' ') || null`
- `source`: `'biquote'`
- Default countries filter: `'US,EU,GB,JP,CA,AU,NZ,CH'` (all 8 G8 economies matching Kestrel's 18-symbol catalog).

- [x] **Step 1: Write the failing tests in `packages/data/test/calendar-adapter.test.ts`**

```ts
describe('fetchUpcomingEvents (BiQuote zero-key + FRED fallback)', () => {
  it('fetches 54-country MT5 calendar events from BiQuote without requiring FRED_API_KEY and preserves actual: null', async () => {
    const eventTime = new Date(Date.now() + 3600_000).toISOString();
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 'mql5:900001',
            eventId: 'mql5:840',
            time: eventTime,
            countryCode: 'US',
            currency: 'USD',
            name: 'Nonfarm Payrolls',
            importance: 'high',
            unit: 'job',
            multiplier: 'thousands',
            actual: null,
            forecast: 180000,
            previous: 175000,
            revisedPrevious: 172000,
            source: 'mql5',
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ) as unknown as typeof fetch;

    const events = await fetchUpcomingEvents({ apiKeys: {} });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: 'mql5:900001',
      title: 'Nonfarm Payrolls',
      country: 'US',
      currency: 'USD',
      importance: 'high',
      actual: null,
      forecast: 180000,
      previous: 172000,
      unit: 'job thousands',
      source: 'biquote',
    });
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/data test -- test/calendar-adapter.test.ts`
Expected: FAIL (`no calendar provider configured (set FRED_API_KEY)`).

- [x] **Step 3: Implement BiQuote calendar adapter in `packages/data/src/adapters/calendar.ts`, fix `packages/ai/src/calendar-persistence.ts`, and update `apps/worker/src/jobs/fred-actuals.ts`**

In `packages/ai/src/calendar-persistence.ts`:
```ts
  const inserted = await getDb()
    .insert(schema.economicEvents)
    .values(rows)
    .onConflictDoUpdate({
      target: schema.economicEvents.id,
      set: {
        title: sql`excluded.title`,
        actual: sql`COALESCE(excluded.actual, ${schema.economicEvents.actual})`,
        forecast: sql`COALESCE(excluded.forecast, ${schema.economicEvents.forecast})`,
        previous: sql`COALESCE(excluded.previous, ${schema.economicEvents.previous})`,
        unit: sql`COALESCE(excluded.unit, ${schema.economicEvents.unit})`,
        date: sql`excluded.date`,
        actualsFilledAt: sql`CASE WHEN excluded.actual IS NOT NULL AND ${schema.economicEvents.actualsFilledAt} IS NULL THEN now() ELSE ${schema.economicEvents.actualsFilledAt} END`,
      },
    })
    .returning({ id: schema.economicEvents.id });
```

In `packages/data/src/adapters/calendar.ts`:
- Try `biquote.fetchCalendar({ from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString(), countries: opts.countries ?? 'US,EU,GB,JP,CA,AU,NZ,CH', ...(opts.importance ? { importance: opts.importance } : {}), limit: opts.limit ?? 200, baseUrl: keys.biquoteBaseUrl, ...(opts.signal ? { signal: opts.signal } : {}) })` first (unless `opts.apiKeys?.fred` is explicitly passed without a BiQuote route in legacy FRED unit tests—handle both via `runWithFailover` `[biquoteAttempt, ...(keys.fred ? [fredAttempt] : [])]` so BiQuote is primary and FRED is automatic fallback!).

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kestrel/data test -- test/calendar-adapter.test.ts && pnpm --filter @kestrel/ai test -- test/get-calendar.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/data/src/adapters/calendar.ts packages/data/test/calendar-adapter.test.ts packages/ai/src/calendar-persistence.ts apps/worker/src/jobs/fred-actuals.ts
git commit -m "feat(data,ai): wire zero-key BiQuote 54-country economic calendar and fix upsert conflict SQL"
```

---

#### Task 4.2: Wire Zero-Key BiQuote Market News Provider into `packages/data/src/adapters/news.ts`

**Files:**
- Modify: `packages/data/src/adapters/news.ts`
- Test: `packages/data/test/news-adapter.test.ts`

**Interfaces:**
- Consumes: `biquote.fetchMarketNews` from `../providers/biquote`
- Produces: Automatic zero-key fallback in `fetchNews(opts)` when `FINNHUB_API_KEY` and `MARKETAUX_API_KEY` are unset or fail.

**Mapping Contract (BiQuote News -> Kestrel `NewsArticle`):**
- `id`: `articleIdFromUrl(a.url)` (`sha1(url)` hex—deduplicates seamlessly across Finnhub, Marketaux, and BiQuote!)
- `title`: `a.title`
- `summary`: `a.description ?? null`
- `url`: `a.url`
- `source`: `'biquote'`
- `publisher`: `a.publisher ?? null`
- `publishedAt`: `Date.parse(a.publishedDate)` (ms epoch UTC)
- `symbols`: `extractSymbolsFromText(a.title, a.description ?? '', opts.symbol)` (plus `opts.symbol` if filtered by symbol)
- `sentiment`: `null`, `sentimentScore`: `null`, `topics`: `a.category ? [a.category] : []`

- [x] **Step 1: Write the failing test in `packages/data/test/news-adapter.test.ts`**

```ts
  it('falls back to zero-key BiQuote /api/news/market when Finnhub and Marketaux keys are unset', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            title: 'Gold surges above $2,400 on safe-haven demand',
            description: 'XAUUSD rallied during the London session.',
            url: 'https://example.com/biquote-gold-news',
            publisher: 'Reuters',
            publishedDate: '2026-05-27T10:00:00Z',
            imageUrl: null,
            category: 'Commodities',
            language: 'en',
            country: 'US',
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ) as unknown as typeof fetch;

    const articles = await fetchNews({ apiKeys: {}, symbol: 'XAUUSD' });
    expect(articles).toHaveLength(1);
    expect(articles[0]).toMatchObject({
      id: articleIdFromUrl('https://example.com/biquote-gold-news'),
      title: 'Gold surges above $2,400 on safe-haven demand',
      summary: 'XAUUSD rallied during the London session.',
      source: 'biquote',
      publisher: 'Reuters',
    });
    expect(articles[0]?.symbols).toContain('XAUUSD');
  });
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/data test -- test/news-adapter.test.ts`
Expected: FAIL (`no news provider configured`).

- [x] **Step 3: Add BiQuote attempt to `fetchNews()` in `packages/data/src/adapters/news.ts`**

Append the `'biquote'` attempt in `fetchNews()` (using `biquote.fetchMarketNews({ ...(opts.symbol ? { symbol: opts.symbol } : {}), maxResults: Math.min(opts.limit ?? 25, 50), ...(opts.signal ? { signal: opts.signal } : {}) })`, filtering by `opts.publishedAfter` if provided, and mapping to `NewsArticleSchema`).

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kestrel/data test -- test/news-adapter.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/data/src/adapters/news.ts packages/data/test/news-adapter.test.ts
git commit -m "feat(data): add zero-key BiQuote market news provider to news adapter failover"
```

---

### Phase 5: Worker De-Bloat & Market-Closure Awareness Across UI, Health & AI

#### Task 5.1: Worker De-Bloat (`WORKER_ENABLE_TICK_STREAM=0` Default, Optional `BIQUOTE_PROXY_TOKEN`, On-Demand Health & Jobs)

**Files:**
- Modify: `apps/worker/src/env.ts`
- Modify: `apps/worker/src/index.ts`
- Modify: `apps/worker/src/http-server.ts`
- Modify: `apps/worker/src/jobs/snapshots.ts`
- Modify: `apps/worker/src/jobs/metrics-flush.ts`
- Modify: `apps/web/src/lib/services/admin-health.ts`
- Modify: `apps/web/src/lib/services/alerts.ts`
- Test: `apps/worker/test/env.test.ts`, `apps/worker/test/http-server.test.ts`, `apps/worker/test/metrics-flush.test.ts`, `apps/web/test/admin/admin-health.test.ts`

**Interfaces:**
- `WorkerEnvSchema` in `apps/worker/src/env.ts`:
  - Keep `BIQUOTE_PROXY_TOKEN: optionalNonEmpty` (satisfies `scripts/check-env-contract.mjs` line 91 `/BIQUOTE_PROXY_TOKEN\s*:\s*optionalNonEmpty/`).
  - Add `WORKER_ENABLE_TICK_STREAM: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['0', '1', 'true', 'false']).default('0'))`.
  - In `loadEnv()`: only require `BIQUOTE_PROXY_TOKEN` in production when `WORKER_ENABLE_TICK_STREAM` is `'1'` or `'true'`.
- `createHealthHandler` in `apps/worker/src/http-server.ts`:
  - Add `isTickStreamEnabled?: () => boolean` to `HealthServerDeps`.
  - Compute `const tickStreamEnabled = deps.isTickStreamEnabled?.() ?? true;`.
  - Compute `const ready = !tickStreamEnabled || (getLastTickAt() > 0 && ageMs < 120_000 && isSignalRConnected());`.
- `computeHealthSloService` in `apps/web/src/lib/services/admin-health.ts`:
  - Check `const tickStreamEnabled = process.env.WORKER_ENABLE_TICK_STREAM === '1' || process.env.WORKER_ENABLE_TICK_STREAM === 'true';`.
  - When `!tickStreamEnabled` and `(ticks === null || ticks.symbolCount === 0 || (ticks.oldestAgeSeconds !== null && ticks.oldestAgeSeconds > TICK_FRESH_S))`:
    - Do not push `'No live tick data'` or `'Tick data is stale'` anomalies if `ticks.symbolCount === 0` in on-demand mode; instead report `worker_ticks` SLI as `{ key: 'worker_ticks', label: 'Market Data Feed (On-Demand)', current: 1, sloTarget: 0.999, window: 'current', success: 1, total: 1, errorBudget: 1, informational: true, details: 'On-demand BiQuote REST mode active' }`.
    - Preserve existing `admin-health.test.ts` behavior when `ticks` rows ARE returned by a mock DB (if `ticks && ticks.symbolCount > 0`, still evaluate `ticks.oldestAgeSeconds` as before so existing `admin-health.test.ts` scenarios `'healthy'` and `'stale-tick'` pass without breaking, and only suppress the `'No live tick data — worker may not be running'` anomaly when `ticks.symbolCount === 0 && !tickStreamEnabled`!).

- [x] **Step 1: Write the failing tests in `apps/worker/test/env.test.ts` and `apps/worker/test/http-server.test.ts`**

```ts
// In apps/worker/test/env.test.ts:
it('defaults WORKER_ENABLE_TICK_STREAM to 0 and does not require BIQUOTE_PROXY_TOKEN in production unless tick stream is enabled', () => {
  const env = loadEnv({
    DATABASE_URL: VALID.DATABASE_URL,
    NODE_ENV: 'production',
    WORKER_HEALTH_TOKEN: 'health-token',
    ENCRYPTION_SECRET: 'a'.repeat(64),
  } as unknown as NodeJS.ProcessEnv);
  expect(env.WORKER_ENABLE_TICK_STREAM).toBe('0');
  expect(env.BIQUOTE_PROXY_TOKEN).toBeUndefined();
});

// In apps/worker/test/http-server.test.ts:
it('reports ready=true in on-demand mode when tick streaming is disabled', async () => {
  const server = createHealthServer({
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), with: vi.fn() },
    getLastTickAt: () => 0,
    isSignalRConnected: () => false,
    isTickStreamEnabled: () => false,
  });
  const response = await request(server, '/health/ready');
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    status: 'ok',
    ready: true,
    tickStreamEnabled: false,
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @kestrel/worker test -- test/env.test.ts test/http-server.test.ts`
Expected: FAIL (`BIQUOTE_PROXY_TOKEN must be set in production` and `503 degraded`).

- [x] **Step 3: Implement worker on-demand mode in `apps/worker/src/env.ts`, `http-server.ts`, `index.ts`, `snapshots.ts`, `metrics-flush.ts`, and `apps/web/src/lib/services/admin-health.ts`**

In `apps/worker/src/index.ts`, keep `runWorker()` running SignalR + Binance when called directly by `worker-lifecycle.test.ts` (or when `env.WORKER_ENABLE_TICK_STREAM !== '0'`), and in `main()` only call `runWorker()` when `env.WORKER_ENABLE_TICK_STREAM === '1' || env.WORKER_ENABLE_TICK_STREAM === 'true'`, otherwise create a lightweight on-demand handle `{ getLastTickAt: () => 0, stop: async () => {} }` and call `notifyReady(); notifyStatus('on-demand mode active; scheduler running');`! That way `worker-lifecycle.test.ts` (which calls `runWorker()` directly and inspects `src/index.ts` strings) continues to pass 100% unchanged!

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kestrel/worker test && pnpm --filter @kestrel/web test -- test/admin/admin-health.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add apps/worker/src/env.ts apps/worker/src/http-server.ts apps/worker/src/index.ts apps/worker/src/jobs/snapshots.ts apps/worker/src/jobs/metrics-flush.ts apps/worker/test/env.test.ts apps/worker/test/http-server.test.ts apps/web/src/lib/services/admin-health.ts apps/web/src/lib/services/alerts.ts apps/web/test/admin/admin-health.test.ts
git commit -m "feat(worker,web): default worker to on-demand mode and make BIQUOTE_PROXY_TOKEN optional"
```

---

#### Task 5.2: Respect `marketState: "closed"` Across UI (`TickerTape`, `WatchlistWidget`) & AI Evidence Builders

**Files:**
- Modify: `packages/ai/src/mastra-v2/packets/evidence-builders.ts`
- Modify: `packages/ai/src/mastra-v2/packets/symbol-research.ts`
- Modify: `apps/web/src/components/layout/ticker-tape.tsx`
- Modify: `apps/web/src/app/(app)/dashboard/_components/widgets/watchlist-widget.tsx`
- Modify: `apps/web/src/app/(app)/settings/api-keys/_components/market-data-config.tsx`
- Test: `packages/ai/test/mastra-research-packet.test.ts`

**Interfaces:**
- Consumes: `tick.marketState` (`'open' | 'closed' | undefined`), `tick.quoteAgeSeconds`
- Produces:
  - Clean weekend/market-closed handling in `buildPriceEvidence()` and `collectSymbolResearchPacket()` so closed markets do not trigger false `'Price is older than the fresh-data threshold'` degraded quality warnings.
  - `CLOSED` badge in `TickerTape` and `WatchlistWidget` when `tick.marketState === 'closed'`.

- [x] **Step 1: Write the failing test in `packages/ai/test/mastra-research-packet.test.ts`**

```ts
it('treats marketState="closed" ticks as complete evidence without false stale-age degradation', () => {
  const evidence = buildPriceEvidence({
    tick: {
      symbol: 'XAUUSD',
      bid: 2400,
      ask: 2400.2,
      mid: 2400.1,
      ts: Date.now() - 3600_000,
      source: 'biquote',
      marketState: 'closed',
      quoteAgeSeconds: 3600,
      dayDiffPercent: null,
    },
    stale: false,
    producedAt: Date.now(),
    ageMs: 3_600_000,
  });
  expect(evidence.freshness).toBe('fresh');
  expect(evidence.quality).toBe('complete');
  expect(evidence.warnings).toEqual([]);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/ai test -- test/mastra-research-packet.test.ts`
Expected: FAIL (`evidence.quality` is `'degraded'` due to `ageMs > 10_000`).

- [x] **Step 3: Update `evidence-builders.ts`, `symbol-research.ts`, `ticker-tape.tsx`, `watchlist-widget.tsx`, and `market-data-config.tsx`**

In `packages/ai/src/mastra-v2/packets/evidence-builders.ts`:
```ts
export function buildPriceEvidence(result: PriceResult): XauusdPriceEvidence {
  const { tick, ageMs } = result;
  const isMarketClosed = tick.marketState === 'closed';
  const warnings = [
    ...(result.stale ? ['Price was served from stale-while-error cache'] : []),
    ...(!isMarketClosed && ageMs !== null && ageMs > 10_000
      ? ['Price is older than the fresh-data threshold']
      : []),
  ];

  return XauusdPriceEvidenceSchema.parse({
    evidenceId: createEvidenceId('price', XAUUSD),
    kind: 'price',
    symbol: XAUUSD,
    source: tick.source,
    fetchedAt: iso(result.producedAt),
    dataAsOf: iso(tick.ts),
    freshness: result.stale ? 'stale' : isMarketClosed ? 'fresh' : freshnessFromAge(ageMs, 10_000),
    quality: qualityFromWarnings(warnings),
    warnings,
    trust: 'trusted-deterministic',
    data: { tick, stale: result.stale, ageMs },
  });
}
```
And apply the same `isMarketClosed = result.tick.marketState === 'closed'` guard in `packages/ai/src/mastra-v2/packets/symbol-research.ts:413-432`.

In `apps/web/src/components/layout/ticker-tape.tsx`:
When `t.marketState === 'closed'`, render `<span className="text-fg-subtle bg-bg-elev-2 rounded-xs px-1 text-xs font-medium">CLOSED</span>` instead of the `▲/▼ +0.00%` badge (per BiQuote docs: *"Render it as 'market closed — last price', and hide the day-change percentage, which belongs to a session that has ended"*).

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kestrel/ai test -- test/mastra-research-packet.test.ts && pnpm --filter @kestrel/web typecheck`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/ai/src/mastra-v2/packets/evidence-builders.ts packages/ai/src/mastra-v2/packets/symbol-research.ts packages/ai/test/mastra-research-packet.test.ts apps/web/src/components/layout/ticker-tape.tsx apps/web/src/app/\(app\)/dashboard/_components/widgets/watchlist-widget.tsx apps/web/src/app/\(app\)/settings/api-keys/_components/market-data-config.tsx
git commit -m "feat(ai,web): respect BiQuote marketState=closed in AI evidence packets and UI widgets"
```

---

## 5. Verification & Test Checklist

### 5.1 Policy, Contract & Static Analysis Alignment (Workstream 6 Audit Results)

1. **`scripts/check-env-contract.mjs`:**
   - Asserts `BIQUOTE_PROXY_TOKEN` exists in `scripts/setup/secret-template.json`, `apps/worker/src/env.ts` (`/BIQUOTE_PROXY_TOKEN\s*:\s*optionalNonEmpty/`), and `docs/configuration.md`.
   - **Rule:** Keep `BIQUOTE_PROXY_TOKEN: optionalNonEmpty` in `apps/worker/src/env.ts` and `secret-template.json`; add `WORKER_ENABLE_TICK_STREAM=0` to `.env.example` and `docs/configuration.md`.
2. **`apps/web/test/cron-vm-policy.test.ts`:**
   - Asserts `BILLING_WEBHOOK_DLQ_RETENTION_DAYS` and `AI_EVALUATION_RETENTION_DAYS` remain in `apps/worker/src/env.ts` with `.default(90)`.
   - **Rule:** Preserve all retention env fields untouched in `apps/worker/src/env.ts`.
3. **`apps/worker/test/worker-lifecycle.test.ts`:**
   - Performs static substring assertions on `apps/worker/src/index.ts` (`await consumer.start()`, `await binanceConsumer.start()`, `notifyReady()`, `post-startup initialisation failed`, `await worker.stop()`, `proxyServer?.close()`, `healthServer!.close()`) and calls `runWorker()` directly.
   - **Rule:** Keep `runWorker()` intact and gate its invocation in `main()` via `env.WORKER_ENABLE_TICK_STREAM` so all 4 lifecycle contract assertions in `worker-lifecycle.test.ts` pass without modification.
4. **`knip.json`:**
   - `packages/data`, `packages/shared`, `packages/ai`, `apps/worker`, and `apps/web` treat `src/**/*.ts` as entry/project files.
   - **Rule:** Do not leave orphaned files or unused exports/dependencies; verify `pnpm knip` reports `0` findings.

### 5.2 Execution Verification Commands

- [x] **Step 1: Environment Contract Gate**
  ```bash
  pnpm check:env-contract
  ```
  Expected: `Environment contract check passed.` (exit `0`).

- [x] **Step 2: Monorepo Typecheck**
  ```bash
  pnpm turbo run typecheck
  ```
  Expected: All workspace packages (`@kestrel/shared`, `@kestrel/db`, `@kestrel/data`, `@kestrel/indicators`, `@kestrel/ai`, `@kestrel/worker`, `@kestrel/web`) pass with `0` TypeScript errors.

- [x] **Step 3: Monorepo Lint**
  ```bash
  pnpm turbo run lint
  ```
  Expected: `0` ESLint errors or warnings.

- [x] **Step 4: Monorepo Unit & Policy Test Suite**
  ```bash
  pnpm turbo run test
  ```
  Expected: All test suites in `packages/shared`, `packages/data`, `packages/db`, `packages/indicators`, `packages/ai`, `apps/worker`, and `apps/web` pass (`0` failures).

- [x] **Step 5: Dead-Code & Dependency Gate (Knip)**
  ```bash
  pnpm knip
  ```
  Expected: `0` unused files, exports, or dependencies.
