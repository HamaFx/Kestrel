# 03. Market Data Failover, Background Worker & Tick-Streaming Pipelines

> **Visual SVG Board:** [`docs/assets/market-data-worker-and-plugins-flow.svg`](../assets/market-data-worker-and-plugins-flow.svg)

---

## 1. Multi-Provider Market Data & Health-Scored Failover (`@kestrel/data`)

Kestrel works out of the box with **zero API keys** using **BiQuote** (Gold + 11 Forex pairs + economic calendar + news) and **Binance** (6 Crypto pairs), while supporting optional BYOK keys for **Finnhub**, **FRED**, **CFTC Socrata**, and **Marketaux**.

```
+--------------- [ DATA FAILOVER ] ----------------+
|                                                  |
| ●  1. l1/l2 cache     memory lru + redis swr     |
| │                                                |
| ●  2. dedupe inflight share concurrent promises  |
| │                                                |
| ●  3. rank providers  sort by health score 0..1  |
| │                                                |
| ●  4. fetch + retry   timeout + 429 backoff      |
| │                                                |
| ●  5. meta envelope   attach ageSeconds + stale  |
+--------------------------------------------------+
```

```
+------------- [ PROVIDER ROUTING ] ---------------+
|                                                  |
| Asset / Data     | Primary      | Failover       |
| -----------------+--------------+--------------- |
| XAUUSD + 11 FX   | BiQuote      | Finnhub        |
| 6 Crypto Pairs   | Binance      | BiQuote        |
| 1m Live Stream   | live_ticks   | REST Providers |
| Macro & Yields   | FRED         | BiQuote Cal    |
| CoT Positioning  | CFTC Socrata | Cached Snapshot|
| Breaking News    | Marketaux    | BiQuote News   |
| -----------------+--------------+--------------- |
| Catalog Scope    | 18 symbols   | 6 adapters     |
+--------------------------------------------------+
```

### How Staleness & Failover Metadata Protects the AI

1. **Two-Tier SWR Cache (`packages/data/src/cache/`):** Every `getPriceWithMeta` and `getCandlesWithMeta` call checks the in-process L1 LRU cache and optional L2 Redis cache, coalescing concurrent in-flight requests for the same `(symbol, timeframe)` key.
2. **Health-Scored Failover (`packages/data/src/failover.ts` & `src/health/`):** Each provider has a rolling health score (`0.0` to `1.0`) persisted to `provider_health`. If a provider returns HTTP 429 or times out, `recordFailure` / `recordRateLimit` demotes it and `executeWithFailover` transparently falls back to the next healthy provider.
3. **Freshness Envelope (`DataWithMeta<T>`):** Every response carries `{ data, provider, cached, fetchedAt, priceAgeSeconds, isStale }`. Downstream AI tools and the committee verifier inspect `priceAgeSeconds` (> 60s = stale) so stale market data is never silently presented as live.

---

## 2. Background Worker Scheduler & Job Pipeline (`@kestrel/worker`)

The worker daemon (`apps/worker/src/index.ts`) runs 7 core scheduled jobs, 3 plugin scheduled jobs, and 3 `pg-boss` queue consumers, coordinated across multi-instance deployments via database locks (`cron_runs`) and consistent hash tenant partitioning (`TenantRouter`).

```
+---------------- [ WORKER JOBS ] -----------------+
|                                                  |
| Job Name            | Schedule     | Lock Policy |
| --------------------+--------------+------------ |
| alerts              | * * * * *    | none (1m)   |
| briefings           | */5 * * * *  | none (5m)   |
| news                | */30 * * * * | daily/slot  |
| embedding-backfill  | 0 */6 * * *  | none (6h)   |
| cot                 | 0 21 * * 5   | daily       |
| fred-actuals        | 30 13 * * *  | daily       |
| retention           | 15 3 * * *   | daily       |
| --------------------+--------------+------------ |
| Core Scheduled Jobs | 7 jobs       | node-cron   |
+--------------------------------------------------+
```

```
+--------------- [ PLUGIN & QUEUE ] ---------------+
|                                                  |
| Runner / Queue           | Cadence / Trigger     |
| -------------------------+---------------------- |
| paper.market-watch       | * * * * * (1m cron)   |
| paper.strategy-runner    | * * * * * (1m cron)   |
| telegram.daily-briefing  | */15 * * * * (15m)    |
| pg-boss: backtest-sweep  | on-demand grid sweep  |
| pg-boss: candle-flush    | 1m bar persistence    |
| -------------------------+---------------------- |
| Total Worker Pipelines   | 5 plugin/queue loops  |
+--------------------------------------------------+
```

### Job Execution Lifecycle

1. **In-Flight & Distributed Lock (`apps/worker/src/scheduler/job-runtime.ts` & `cron-lock.ts`):**
   - Checks `_runningJobs` to prevent overlapping local runs.
   - Acquires an atomic row lock in `cron_runs` (`acquireCronLock`) for daily/singleton jobs.
2. **Tenant Partitioning (`packages/shared/src/runtime/tenant-partition.ts`):**
   - For per-user jobs (`alerts`, `briefings`, plugin jobs), `TenantRouter` hashes `tenantId` across `WORKER_SHARD_COUNT` so horizontal worker replicas split user workloads cleanly without duplicate execution.
3. **Timeout & Heartbeat (`apps/worker/src/runtime/healthchecks.ts`):**
   - Races every job against an `AbortController` timeout (`JOB_TIMEOUT_MS`, default `120s`), records execution duration and row counts in `cron_runs`, and pings external Healthchecks.io UUIDs when configured.

---

## 3. Optional 24/7 WebSocket Tick Stream & Durable 1m Candle Outbox

When `WORKER_ENABLE_TICK_STREAM=1` is enabled, `apps/worker` activates a real-time streaming pipeline (`apps/worker/src/bootstrap/feed-worker.ts`):

```
+-------------- [ LIVE TICK STREAM ] --------------+
|                                                  |
| ●  1. ws consumers    signalr (fx) + binance (cr)|
| │                                                |
| ●  2. tick buffer     250ms coalesce → live_ticks|
| │                                                |
| ●  3. tick bus        sub-second paper fills     |
| │                                                |
| ●  4. 1m aggregator   build ohlcv bars in memory |
| │                                                |
| ●  5. candle outbox   pg-boss + disk fallback    |
+--------------------------------------------------+
```

1. **Dynamic Symbol Subscription (`SymbolManager` in `apps/worker/src/streams/symbol-manager.ts`):** Polls active symbols every 60 seconds and updates the **BiQuote SignalR** consumer (Gold/FX) and **Binance WebSocket** consumer (Crypto).
2. **Coalesced `live_ticks` Snapshot (`TickBuffer` in `apps/worker/src/signalr/tick-buffer.ts`):** Coalesces high-frequency ticks over a 250ms window and upserts the latest bid/ask/mid quote into the `live_ticks` table.
3. **In-Process `TickBus` (`apps/worker/src/streams/tick-bus.ts`):** Fans out every incoming tick to registered plugin `onTick` handlers (`@kestrel/plugin-paper-trading`) for sub-second stop/target/limit order fills.
4. **1m Bar Aggregation & Durable Outbox (`Candle1mAggregator` + `CandleOutbox`):** Aggregates ticks into 1-minute OHLCV bars. When a minute closes, the bar is written to `candles_1m` (via `pg-boss` `candle-flush`), backed by a local disk JSONL outbox (`candle-outbox.ts`) and REST gap backfill (`candle-backfill.ts`) so zero bars are lost if PostgreSQL briefly restarts.
