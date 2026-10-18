# Kestrel End-to-End Technical Audit — Phase 4: Market Data, Indicators, Worker Sync & AI Data Tools

**Repository:** `HamaFx/Kestrel` (commit `2335256c7b9bc0cce655bf29a11da0e1445a65d8`)  
**Phase Scope:** `packages/data`, `packages/indicators`, `packages/shared` (symbols, timeframes, market-phase, portfolio schemas), `apps/worker`, and all market-data / indicator tools and research packets in `packages/ai`  
**Audit Gate Status:** **READ-ONLY COMPLETE** — No repository source files were modified during this pass. All proposed patches below await explicit approval before implementation.

## 1. End-to-End Architecture Trace: Chat Prompt to Market Context

When a user asks a market question in Kestrel chat (e.g., _"What is Gold doing on the 4h?"_, _"Analyze BTCUSD RSI and structure"_, or _"Run a committee check on EUR/USD"_), the request flows through six sequential stages across `@kestrel/web`, `@kestrel/ai`, `@kestrel/shared`, `@kestrel/data`, `@kestrel/indicators`, and `@kestrel/worker`:

### Stage 1: Chat Entry, Symbol Extraction & Capability Routing

1. **HTTP / Queue Entry**:
   - Interactive chat requests enter [`apps/web/src/app/api/chat/route.ts:273-845`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/apps/web/src/app/api/chat/route.ts#L273-L845).
   - Asynchronous multi-agent committee jobs enter [`apps/worker/src/jobs/multi-agent-analysis.ts:132-447`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/apps/worker/src/jobs/multi-agent-analysis.ts#L132-L447) via the `analysis_jobs` PostgreSQL queue.
2. **Symbol Detection & Execution Planning**:
   - [`planChatExecution()`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/mastra-v2/planning/execution-plan.ts#L140-L320) invokes [`classifyMastraTurn()`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/mastra-v2/planning/routing-policy.ts#L118-L185) and [`extractMastraSymbols()`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/mastra-v2/planning/routing-policy.ts#L91-L105) (or [`extractSymbolFromPrompt()`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/mastra-v2/packets/symbol-research.ts#L419-L434) in committee/worker paths).
   - Based on `analysisMode` (`single`, `quick`, `full`) and detected symbols, the router selects:
     - `xauusd-research` / `xauusd-conversation` ([`packages/ai/src/mastra-v2/agents/xauusd/run.ts:125-976`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/mastra-v2/agents/xauusd/run.ts#L125-L976)) for single-symbol `XAUUSD`.
     - `canonical-chat` ([`packages/ai/src/mastra-v2/agents/canonical/run.ts:102-360`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/mastra-v2/agents/canonical/run.ts#L102-L360)) for non-XAUUSD single-mode prompts (e.g., `EURUSD`, `BTCUSDT`) or multi-symbol prompts.
     - `committee-quick` / `committee-full` ([`packages/ai/src/committee/workflow.ts`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/committee/workflow.ts)) for multi-specialist analysis.

### Stage 2: System Context & Market-Phase Snapshot Injection

- On the `canonical-chat` path, [`buildContextMessage()`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/context.ts#L186-L246) builds a `<kestrel_context>` XML block containing a `LIVE_SNAPSHOT`:
  - Calls [`getMarketPhase()`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/shared/src/market-phase.ts#L60-L81) and [`describeMarketPhase()`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/context.ts#L71-L84) to label the current trading session (`asian`, `london`, `overlap`, `ny`, `off`) and whether COMEX Gold futures are open via [`isComexOpen()`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/shared/src/market-phase.ts#L86-L103).
  - Calls [`fetchPricesSafe()`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/context.ts#L130-L157) with a `1500ms` timeout to pre-populate prices for `['XAUUSD', 'EURUSD', 'GBPUSD']` (plus `userSettings.defaultSymbol`).

### Stage 3: Deterministic Research Packets vs. Interactive Tool Calls

- **Packet-First Paths (`xauusd-*` & `committee-*`)**:
  - [`collectXauusdResearchPacket()`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/mastra-v2/packets/research-packet.ts#L38-L133) or [`collectSymbolResearchPacket()`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/mastra-v2/packets/symbol-research.ts#L283-L384) pre-fetches live price, 4 timeframes of candles (`1d`, `4h`, `1h`, `15m` — `200` bars each), 6 indicators per timeframe (`EMA20`, `EMA50`, `SMA200`, `RSI14`, `MACD(12,26,9)`, `ATR14`), plus macro/news/calendar context.
  - Packets are cached for `15_000ms` in an in-process `Map` and mirrored to Redis ([`packages/ai/src/mastra-v2/packets/packet-cache.ts:26-143`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/mastra-v2/packets/packet-cache.ts#L26-L143)).
- **Tool-Calling Path (`canonical-chat`, `xauusd-conversation`, and Specialist Desks)**:
  - The LLM invokes read-only tools in [`packages/ai/src/tools/`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/tools/index.ts#L130-L154) (`get_price`, `get_candles`, `get_indicators`, `get_market_structure`, `get_session_levels`, `analyze_technical`, `analyze_fundamental`, `forecast_volatility`, `compute_risk`, `verify_call`, `replay_setup`, `annotate_chart`, `get_news`, `get_calendar`, `get_intermarket`, `get_correlation`, `get_cot`, `get_seasonality`, `get_social_sentiment`) or their XAUUSD-scoped Mastra wrappers in [`packages/ai/src/mastra-v2/agents/xauusd/tools/`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/mastra-v2/agents/xauusd/tools/index.ts#L1-L137).
  - Tool inputs are validated against [`SymbolSchema`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/shared/src/symbols.ts#L65-L75) and [`TimeframeSchema`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/shared/src/timeframes.ts#L19-L22).

### Stage 4: Data Adapters, Caching & Upstream Provider Failover (`packages/data`)

- **Live Quotes (`getPriceWithMeta` / `getPricesWithMeta`)** ([`packages/data/src/adapters/price.ts:132-259`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/adapters/price.ts#L132-L259)):
  - Checks [`getDefaultCache()`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/cache/index.ts#L88-L98) (`RedisCache` when `REDIS_URL` is set, otherwise `MemoryCache`) with `ttlSeconds = 3`, `maxStaleSeconds = 10`.
  - Runs [`runWithFailover()`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/failover.ts#L78-L133) across `PRICE_CHAIN` ([`packages/data/src/registry.ts:62-68`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/registry.ts#L62-L68)): `live-ticks` (max age `5_000ms`) $\rightarrow$ `biquote` (FX/Metals) $\rightarrow$ `binance` (Crypto) $\rightarrow$ `finnhub` (optional fallback).
- **OHLCV Candles (`getCandlesWithMeta`)** ([`packages/data/src/adapters/candles.ts:75-183`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/adapters/candles.ts#L75-L183)):
  - Checks cache with timeframe-dependent TTL ([`packages/data/src/adapters/candles.ts:44-55`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/adapters/candles.ts#L44-L55): `15s` for `1m` up to `1800s` for `1w`, or `86_400s` when `to < Date.now() - 60_000`).
  - Runs `runWithFailover()` across `CANDLE_CHAIN` ([`packages/data/src/registry.ts:70-76`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/registry.ts#L70-L76)): `candles-1m` (`1m` only, max age `90_000ms`) $\rightarrow$ `biquote` (FX/Metals, `1m`..`1d`) $\rightarrow$ `binance` (Crypto, `1m`..`1w`) $\rightarrow$ `finnhub` (optional key fallback).

### Stage 5: Technical Indicator & Structure Computation (`packages/indicators`)

- [`computeIndicator()`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/indicators/src/index.ts#L60-L157) dispatches over `Candle[]` to compute `sma`, `ema`, `rsi`, `macd`, `bollinger`, `atr`, `vwap`, `pivots`, `stochastic`, `adx`, `ichimoku`, `obv`, or `fib`.
- Smart Money Concepts (SMC) helpers in [`packages/indicators/src/smc/`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/indicators/src/smc/index.ts#L1-L35) (`findSwings`, `detectStructure`, `findFVGs`, `findOrderBlocks`, `findLiquiditySweeps`) and session helpers in [`packages/indicators/src/sessions.ts`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/indicators/src/sessions.ts#L1-L162) compute structural levels.

### Stage 6: LLM Payload Serialization & Evidence Verification

- Tool outputs and serialized packets ([`serializeSymbolResearchPacket()`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/mastra-v2/packets/symbol-research.ts#L390-L413), [`serializeXauusdModelEvidenceContext()`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/mastra-v2/agents/xauusd/model-context.ts#L97-L99)) are injected into the LLM prompt or returned as tool-result messages.
- Post-generation verifiers ([`checkCanonicalEvidence()`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/mastra-v2/agents/canonical/evidence.ts) and [`verifyXauusdResearchReport()`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/mastra-v2/agents/xauusd/report/report-verifier.ts)) check that prices and levels cited in the response match the collected evidence.

## 2. Executive Summary & Master Findings Matrix

This audit identified **16 technical findings** across the 4 checklist areas: **4 `P0-Critical`**, **9 `P1-High`**, **2 `P2-Medium`**, and **1 `P3-Low`**.

| ID       | Severity        | Checklist Area                                      | Component / `filepath:line`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Summary of Finding                                                                                                                                                                                                                                                                                                                                                                                      |
| :------- | :-------------- | :-------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **F-01** | **P0-Critical** | 1. Symbol & TF Normalization                        | [`packages/shared/src/symbol-catalog.ts:467-469`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/shared/src/symbol-catalog.ts#L467-L469)<br>[`packages/shared/src/symbols.ts:65-75`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/shared/src/symbols.ts#L65-L75)<br>[`packages/shared/src/timeframes.ts:19-22`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/shared/src/timeframes.ts#L19-L22)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `normalizeSymbol()` only calls `.trim().toUpperCase()` and `TimeframeSchema` is case-sensitive lowercase. Common user/LLM inputs (`"Gold"`, `"XAU/USD"`, `"EUR/USD"`, `"BTC"`, `"BTCUSD"`, `"ETH"`, `"1D"`, `"4H"`, `"1H"`) fail Zod validation across all 19 AI tools.                                                                                                                                 |
| **F-02** | **P1-High**     | 1. Natural-Language Ticker Resolution               | [`packages/ai/src/mastra-v2/packets/symbol-research.ts:419-434`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/mastra-v2/packets/symbol-research.ts#L419-L434)<br>[`packages/ai/src/mastra-v2/planning/routing-policy.ts:91-105`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/mastra-v2/planning/routing-policy.ts#L91-L105)<br>[`apps/worker/src/jobs/multi-agent-analysis.ts:215`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/apps/worker/src/jobs/multi-agent-analysis.ts#L215)                                                                                                                                                                                                                                                                                                                                                                                                    | Prompt symbol extractors only recognize `\bgold\b` and exact canonical codes (`BTCUSDT`, `EURUSD`). Prompts asking about `"Bitcoin"`, `"BTC"`, `"BTCUSD"`, `"ETH"`, or `"EUR/USD"` fail symbol extraction and **silently fall back to `XAUUSD`** in committee worker jobs.                                                                                                                              |
| **F-03** | **P0-Critical** | 1. Cross-Asset Decimals, Pips & Lot Sizing          | [`packages/shared/src/schemas/portfolio.ts:162-178`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/shared/src/schemas/portfolio.ts#L162-L178)<br>[`packages/ai/src/portfolio/risk-service.ts:45-87`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/portfolio/risk-service.ts#L45-L87)<br>[`packages/ai/src/tools/verify-call.ts:231-282`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/tools/verify-call.ts#L231-L282)<br>[`packages/ai/src/tools/compute-risk.ts:60-62`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/tools/compute-risk.ts#L60-L62)<br>[`packages/ai/src/tools/convene-committee.ts:183-224`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/tools/convene-committee.ts#L183-L224)                                                                         | `getContractSize()` defaults to `100,000` for all symbols except `XAUUSD`, inflating Crypto P&L/exposure by **100,000x** (`1 lot BTCUSDT = $6.5B`); `verify_call` keys `BTCUSD` instead of `BTCUSDT` and formats JPY/Crypto to 5 decimals; `compute_risk` throws on all 7 non-USD quote pairs (`USDJPY`, `EURJPY`, etc.); `convene_committee` rounds FX `ATR14` (`0.0018`) to `0.00` via `.toFixed(2)`. |
| **F-04** | **P2-Medium**   | 1. Legacy 3-Symbol Hardcoding in News & Macro       | [`packages/data/src/adapters/news.ts:201-231`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/adapters/news.ts#L201-L231)<br>[`packages/data/src/providers/marketaux/map.ts:34-47`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/providers/marketaux/map.ts#L34-L47)<br>[`packages/ai/src/tools/analyze-fundamental.ts:57-61`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/tools/analyze-fundamental.ts#L57-L61)<br>[`packages/ai/src/tools/get-calendar.ts:33`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/tools/get-calendar.ts#L33)                                                                                                                                                                                                                                                                          | `getNews()` filter hardcodes `                                                                                                                                                                                                                                                                                                                                                                          |     | a.symbols.includes('XAU')`, leaking Gold headlines into `EURUSD`/`BTCUSDT`news queries;`SYMBOL_KEYWORDS`, Marketaux `PAIR_RE`, `CURRENCIES_BY_SYMBOL`, and `get_calendar`'s `CurrencySchema` omit 13–15 of the 18 catalog symbols. |
| **F-05** | **P1-High**     | 2. Upstream Providers & Failover                    | [`packages/data/src/failover.ts:98-120`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/failover.ts#L98-L120)<br>[`packages/data/src/providers/biquote/rest.ts:137-143`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/providers/biquote/rest.ts#L137-L143)<br>[`packages/data/src/providers/binance/rest.ts:62-68`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/providers/binance/rest.ts#L62-L68)                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | All 5 REST clients convert caller-initiated `opts.signal` aborts into `ProviderError('PROVIDER_TIMEOUT')`, and `runWithFailover()` does not check `opts.signal?.aborted` — recording false health failures against healthy primary providers and cascading requests down the fallback chain after cancellation.                                                                                         |
| **F-06** | **P1-High**     | 2. Rate Limits & 429 Backoff                        | [`packages/data/src/providers/binance/rest.ts:137-199`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/providers/binance/rest.ts#L137-L199)<br>[`packages/data/src/providers/cftc/rest.ts:104-111`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/providers/cftc/rest.ts#L104-L111)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Binance `fetchTickerPrice()` completely bypasses `tryReserve()` self-throttling, never calls `noteBackoff()` on HTTP 429/418 (IP ban), and throws `PROVIDER_HTTP_ERROR` instead of `PROVIDER_QUOTA_EXCEEDED`. CFTC `fetchLatestRows()` also omits `noteBackoff()` on HTTP 429.                                                                                                                          |
| **F-07** | **P1-High**     | 2. Fallback Provider Integrity                      | [`packages/data/src/adapters/provider-adapters.ts:195-215`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/adapters/provider-adapters.ts#L195-L215)<br>[`packages/data/src/providers/finnhub/rest.ts:176-186`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/providers/finnhub/rest.ts#L176-L186)<br>[`packages/data/src/adapters/candles.ts:132-137`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/adapters/candles.ts#L132-L137)                                                                                                                                                                                                                                                                                                                                                                                                                                   | `finnhubProvider.supports()` returns `true` even when `FINNHUB_API_KEY` is unset (causing `1w` FX/Gold candle requests to fail with a false `PROVIDER_HTTP_ERROR` and poison Finnhub health), and Finnhub `fetchNative()` calls `/forex/candle` for `BINANCE:*` crypto symbols instead of `/crypto/candle`.                                                                                             |
| **F-08** | **P2-Medium**   | 2. Unbatched Quote Fan-Out                          | [`packages/ai/src/tools/get-price.ts:50-61`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/tools/get-price.ts#L50-L61)<br>[`packages/ai/src/portfolio/risk-service.ts:110-119`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/portfolio/risk-service.ts#L110-L119)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `get_price` and `portfolio/risk-service.ts` loop over `getPrice(s)` in `Promise.all` instead of calling batched `getPricesWithMeta(symbols)`, firing $N$ separate BiQuote REST calls and burning $N$ throttle tokens per turn.                                                                                                                                                                          |
| **F-09** | **P0-Critical** | 3. Cache Freshness & Redis SWR Bug                  | [`packages/data/src/cache/redis.ts:140-245`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/cache/redis.ts#L140-L245)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `RedisCache.fetchWithMeta()` immediately returns stale data during the `maxStaleSeconds` window (`entry.h > now`) **before calling `producer()`**, turning the stale-while-error fallback window into an unconditional stale cache hit! Also, `getWithMeta()` reports `stale: false` for expired entries, and `client.set()` sets keys without Redis `PX` expiration (unbounded memory growth).         |
| **F-10** | **P0-Critical** | 3. Quote Timestamp Integrity & Silent Staleness     | [`packages/data/src/adapters/price.ts:80-92`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/adapters/price.ts#L80-L92)<br>[`packages/data/src/adapters/price.ts:163-165`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/adapters/price.ts#L163-L165)<br>[`packages/ai/src/tools/get-price.ts:48-63`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/tools/get-price.ts#L48-L63)<br>[`packages/ai/src/tools/get-candles.ts:47-51`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/tools/get-candles.ts#L47-L51)                                                                                                                                                                                                                                                                                                         | `snapshotToTick()` overwrites the upstream quote timestamp with `fetchedAt = Date.now()`, stamping a 48-hour-old Friday close with Sunday's live timestamp. Meanwhile, `get_price` and `get_candles` call `getPrice()`/`getCandles()` instead of `*WithMeta()`, dropping `stale` and `ageMs` so stale fallback prices are served to the LLM as live.                                                    |
| **F-11** | **P1-High**     | 3. Market-Hours & Session Awareness                 | [`packages/shared/src/market-phase.ts:60-103`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/shared/src/market-phase.ts#L60-L103)<br>[`packages/ai/src/context.ts:71-84`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/context.ts#L71-L84)<br>[`packages/data/src/providers/candles-1m/index.ts:110-117`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/providers/candles-1m/index.ts#L110-L117)<br>[`apps/worker/src/index.ts:315-322`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/apps/worker/src/index.ts#L315-L322)                                                                                                                                                                                                                                                                                                                   | `isComexOpen()` hardcodes `17:00–18:00 UTC` (1:00–2:00 PM NY!) instead of `17:00–18:00 America/New_York` (`21:00–22:00 UTC` EDT / `22:00–23:00 UTC` EST) for COMEX daily maintenance; `LIVE_SNAPSHOT` tells the LLM `"Market is CLOSED (weekend)"` even for 24/7 Crypto queries; `fetchCandles1m` rejects Friday close bars all weekend.                                                                |
| **F-12** | **P1-High**     | 3. Worker Cron Locks, Timeouts & Signal Propagation | [`apps/worker/src/runner/cli.ts:52-121`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/apps/worker/src/runner/cli.ts#L52-L121)<br>[`apps/worker/src/scheduler.ts:260-269`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/apps/worker/src/scheduler.ts#L260-L269)<br>[`apps/worker/src/jobs/snapshots.ts:55`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/apps/worker/src/jobs/snapshots.ts#L55)<br>[`apps/worker/src/jobs/cot.ts:49-52`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/apps/worker/src/jobs/cot.ts#L49-L52)<br>[`apps/worker/src/jobs/fred-actuals.ts:107-112`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/apps/worker/src/jobs/fred-actuals.ts#L107-L112)                                                                                                                                                                        | Default `WORKER_MODE=systemd` runs jobs via `runner/cli.ts`, which completely skips `acquireCronLock()` (`cron_runs`) and `JOB_TIMEOUT_MS`; `scheduler.ts` runs unlocked if `acquireCronLock` errors twice; `snapshots`, `cot`, and `fred-actuals` ignore `ctx.signal` when calling upstream REST APIs.                                                                                                 |
| **F-13** | **P1-High**     | 4. Indicator Mathematical Accuracy                  | [`packages/indicators/src/atr.ts:25-53`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/indicators/src/atr.ts#L25-L53)<br>[`packages/indicators/src/pivots.ts:56-61`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/indicators/src/pivots.ts#L56-L61)<br>[`packages/indicators/src/bollinger.ts:40`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/indicators/src/bollinger.ts#L40)<br>[`packages/indicators/src/smc/structure.ts:63-104`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/indicators/src/smc/structure.ts#L63-L104)                                                                                                                                                                                                                                                                                                                    | `atr()` has an off-by-one guard (`candles.length <= period` vs `padFront(out, period - 1)`); `pivotsAligned()` computes Floor Trader Pivots from the previous `15m`/`1h` bar instead of the previous daily session; `bollinger()` divides by `N - 1` instead of `N` (+2.6% band inflation vs TradingView); `detectStructure()` emits `'bos'` when `trend === null`.                                     |
| **F-14** | **P1-High**     | 4. Unclosed Candle Contamination                    | [`packages/data/src/providers/binance/rest.ts:88-109`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/providers/binance/rest.ts#L88-L109)<br>[`packages/data/src/providers/finnhub/rest.ts:192-252`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/providers/finnhub/rest.ts#L192-L252)<br>[`packages/ai/src/tools/replay-setup.ts:117-146`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/tools/replay-setup.ts#L117-L146)                                                                                                                                                                                                                                                                                                                                                                                                                                             | Unlike BiQuote (`!b.isOpen`), Binance `/api/v3/klines` and Finnhub `/forex/candle` append the currently forming (unclosed) candle at `candles[candles.length - 1]`, triggering premature close-based BOS/CHoCH breaks, unstable RSI/EMA crossovers, and unclosed-bar trade exits in `replay_setup`.                                                                                                     |
| **F-15** | **P0-Critical** | 4. LLM Context Token Bloat                          | [`packages/ai/src/tools/get-candles.ts:34-51`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/tools/get-candles.ts#L34-L51)<br>[`packages/ai/src/mastra-v2/packets/evidence-builders.ts:61-92`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/mastra-v2/packets/evidence-builders.ts#L61-L92)<br>[`packages/ai/src/mastra-v2/agents/xauusd/tools/research-packet-tool.ts:24-34`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/mastra-v2/agents/xauusd/tools/research-packet-tool.ts#L24-L34)<br>[`packages/ai/src/tools/get-indicators.ts:54-70`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/tools/get-indicators.ts#L54-L70)<br>[`packages/ai/src/tools/annotate-chart.ts:88-199`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/tools/annotate-chart.ts#L88-L199) | `get_candles` dumps up to **500 raw `Candle` objects** (~16,000 tokens) into LLM context; `xauusdCandlesTool` dumps **200 raw candles**; `getXauusdResearchPacket` dumps **320 raw candles + 192 indicator values**; `get_indicators`, `get_market_structure`, `annotate_chart`, and `replay_setup` serialize raw multi-dozen/hundred-element arrays instead of compact analytical summaries.           |
| **F-16** | **P3-Low**      | 4. Indicator Input Edge Cases & Summary Precision   | [`packages/indicators/src/macd.ts:38-45`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/indicators/src/macd.ts#L38-L45)<br>[`packages/indicators/src/obv.ts:26-41`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/indicators/src/obv.ts#L26-L41)<br>[`packages/ai/src/mastra-v2/packets/symbol-research.ts:183-203`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/mastra-v2/packets/symbol-research.ts#L183-L203)                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `macd()` does not validate `fast < slow`; `obv()` can propagate `NaN` across all subsequent bars if a single candle has non-finite volume; `computeMarketStructureSummary()` uses raw 50-bar `max(h)`/`min(l)` instead of confirmed swing points and hardcodes `.toFixed(5)` for `rangeSize`.                                                                                                           |

## 3. Checklist Area 1: Symbol Normalization & Natural-Language Ticker Resolution (`packages/shared`, `packages/data`, `packages/ai`)

### Finding F-01 (`P0-Critical`): Strict `SymbolSchema`, `normalizeSymbol()`, and `TimeframeSchema` Reject Common Natural-Language, Slashed, and Exchange Aliases

- **Locations**:
  - [`packages/shared/src/symbol-catalog.ts:467-469`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/shared/src/symbol-catalog.ts#L467-L469)
  - [`packages/shared/src/symbols.ts:65-75`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/shared/src/symbols.ts#L65-L75)
  - [`packages/shared/src/timeframes.ts:19-22`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/shared/src/timeframes.ts#L19-L22)
- **Root Cause**:
  1. In [`packages/shared/src/symbol-catalog.ts:467-469`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/shared/src/symbol-catalog.ts#L467-L469), `normalizeSymbol(symbol: string)` only runs `return symbol.trim().toUpperCase();`.
  2. [`SymbolSchema`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/shared/src/symbols.ts#L65-L75) pipes `z.string().transform((val) => normalizeSymbol(val))` into `isSupportedSymbol(val)`, which checks membership in the 18 exact strings (`XAUUSD`, `EURUSD`, ..., `BTCUSDT`, `ETHUSDT`, `SOLUSDT`, `BNBUSDT`, `XRPUSDT`, `ADAUSDT`).
  3. It does not strip separators (`/`, `-`, `_`, `:`, spaces) or resolve ubiquitous market aliases (`"GOLD"` / `"XAU"` $\rightarrow$ `XAUUSD`, `"BTC"` / `"BTCUSD"` / `"BITCOIN"` / `"XBTUSD"` $\rightarrow$ `BTCUSDT`, `"ETH"` / `"ETHUSD"` / `"ETHEREUM"` $\rightarrow$ `ETHUSDT`, `"SOL"` / `"SOLUSD"` $\rightarrow$ `SOLUSDT`, `"BNB"` / `"BNBUSD"` $\rightarrow$ `BNBUSDT`, `"XRP"` / `"XRPUSD"` $\rightarrow$ `XRPUSDT`, `"ADA"` / `"ADAUSD"` $\rightarrow$ `ADAUSDT`, `"CABLE"` $\rightarrow$ `GBPUSD`, `"FIBRE"` / `"FIBER"` $\rightarrow$ `EURUSD`).
  4. In [`packages/shared/src/timeframes.ts:19-22`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/shared/src/timeframes.ts#L19-L22), `TimeframeSchema = z.enum(ALL_TIMEFRAMES)` only accepts lowercase `['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w']`. Uppercase or TradingView/MT4 timeframe strings (`"1D"`, `"4H"`, `"1H"`, `"15M"`, `"D1"`, `"H4"`, `"H1"`, `"M15"`, `"M5"`, `"W1"`, `"daily"`, `"weekly"`) throw a Zod validation error.
- **Concrete Failure Scenario**:
  - A user asks in `canonical-chat`: _"Compare BTC/USD and EUR/USD on the 1D and 4H charts."_
  - The LLM calls `get_candles({ symbol: "BTCUSD", tf: "1D" })` and `get_candles({ symbol: "EUR/USD", tf: "4H" })`. Both tool invocations fail at the Zod input boundary with `Unknown symbol: BTCUSD`, `Unknown symbol: EUR/USD`, and `Invalid enum value. Expected '1m' | ... | '1d' | '1w', received '1D'`.
- **Proposed Patch**:
  ```ts
  // packages/shared/src/symbol-catalog.ts (lines 467-475)
  const SYMBOL_ALIAS_MAP: Readonly<Record<string, Symbol>> = {
    GOLD: 'XAUUSD',
    XAU: 'XAUUSD',
    SPOTGOLD: 'XAUUSD',
    CABLE: 'GBPUSD',
    FIBRE: 'EURUSD',
    FIBER: 'EURUSD',
    BTC: 'BTCUSDT',
    BTCUSD: 'BTCUSDT',
    XBTUSD: 'BTCUSDT',
    XBTUSDT: 'BTCUSDT',
    BITCOIN: 'BTCUSDT',
    ETH: 'ETHUSDT',
    ETHUSD: 'ETHUSDT',
    ETHEREUM: 'ETHUSDT',
    SOL: 'SOLUSDT',
    SOLUSD: 'SOLUSDT',
    SOLANA: 'SOLUSDT',
    BNB: 'BNBUSDT',
    BNBUSD: 'BNBUSDT',
    XRP: 'XRPUSDT',
    XRPUSD: 'XRPUSDT',
    RIPPLE: 'XRPUSDT',
    ADA: 'ADAUSDT',
    ADAUSD: 'ADAUSDT',
    CARDANO: 'ADAUSDT',
  };

  export function normalizeSymbol(symbol: string): string {
    const cleaned = symbol
      .trim()
      .toUpperCase()
      .replace(/^(?:OANDA|BINANCE|FOREX|CRYPTO|FX|SPOT):/, '')
      .replace(/[\s/_-]+/g, '');
    return SYMBOL_ALIAS_MAP[cleaned] ?? cleaned;
  }
  ```
  ```ts
  // packages/shared/src/timeframes.ts (lines 19-35)
  const TIMEFRAME_ALIAS_MAP: Readonly<Record<string, Timeframe>> = {
    M1: '1m',
    '1MIN': '1m',
    M5: '5m',
    '5MIN': '5m',
    M15: '15m',
    '15MIN': '15m',
    M30: '30m',
    '30MIN': '30m',
    H1: '1h',
    '1HR': '1h',
    HOURLY: '1h',
    H4: '4h',
    '4HR': '4h',
    D: '1d',
    D1: '1d',
    DAILY: '1d',
    '1DAY': '1d',
    W: '1w',
    W1: '1w',
    WEEKLY: '1w',
    '1WK': '1w',
  };

  export function normalizeTimeframe(tf: string): string {
    const lower = tf.trim().toLowerCase();
    if ((ALL_TIMEFRAMES as readonly string[]).includes(lower)) return lower;
    const upper = tf.trim().toUpperCase();
    return TIMEFRAME_ALIAS_MAP[upper] ?? lower;
  }

  export const TimeframeSchema = z
    .string()
    .transform((val) => normalizeTimeframe(val))
    .refine((val): val is Timeframe => (ALL_TIMEFRAMES as readonly string[]).includes(val), {
      message: `Unsupported timeframe. Expected one of: ${ALL_TIMEFRAMES.join(', ')}`,
    });
  ```

### Finding F-02 (`P1-High`): Prompt Symbol Extractors Miss Natural-Language & Exchange Tickers and Silently Fall Back to `XAUUSD` in Worker Committee Jobs

- **Locations**:
  - [`packages/ai/src/mastra-v2/packets/symbol-research.ts:419-434`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/mastra-v2/packets/symbol-research.ts#L419-L434)
  - [`packages/ai/src/mastra-v2/planning/routing-policy.ts:91-105`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/mastra-v2/planning/routing-policy.ts#L91-L105)
  - [`apps/worker/src/jobs/multi-agent-analysis.ts:215`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/apps/worker/src/jobs/multi-agent-analysis.ts#L215)
- **Root Cause**:
  1. Both `extractSymbolFromPrompt(prompt, fallback)` ([`symbol-research.ts:419-434`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/mastra-v2/packets/symbol-research.ts#L419-L434)) and `extractMastraSymbols(prompt)` ([`routing-policy.ts:91-105`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/mastra-v2/planning/routing-policy.ts#L91-L105)) only check `upper.includes(symbol)` for `ALL_SYMBOLS` and `\bgold\b` for `XAUUSD`.
  2. Neither function matches slashed FX pairs (`EUR/USD`, `GBP/USD`, `USD/JPY`, `XAU/USD`), standard crypto tickers without the `USDT` suffix (`BTC`, `BTCUSD`, `Bitcoin`, `ETH`, `ETHUSD`, `Ethereum`, `SOL`, `SOLUSD`, `Solana`, `BNB`, `XRP`, `ADA`), or trader slang (`Cable`, `Fibre`).
  3. Worse, in [`apps/worker/src/jobs/multi-agent-analysis.ts:215`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/apps/worker/src/jobs/multi-agent-analysis.ts#L215), `extractSymbolFromPrompt(userText, userSettings.defaultSymbol ?? 'XAUUSD')` silently falls back to `XAUUSD` when a user submits a Quick or Full committee job asking about `"Bitcoin"`, `"BTCUSD"`, or `"EUR/USD"`, running all 4 specialist agents on **Gold (`XAUUSD`)** instead of the requested instrument.
- **Proposed Patch**:
  ```ts
  // packages/shared/src/symbol-catalog.ts — export shared prompt symbol matcher
  const PROMPT_SYMBOL_PATTERNS: ReadonlyArray<{ symbol: Symbol; re: RegExp }> = [
    { symbol: 'XAUUSD', re: /\b(?:xau\s*[/\-_]?\s*usd|gold|spot\s+gold)\b/i },
    { symbol: 'EURUSD', re: /\b(?:eur\s*[/\-_]?\s*usd|fibre|fiber)\b/i },
    { symbol: 'GBPUSD', re: /\b(?:gbp\s*[/\-_]?\s*usd|cable)\b/i },
    { symbol: 'USDJPY', re: /\b(?:usd\s*[/\-_]?\s*jpy|gopher|yen)\b/i },
    { symbol: 'AUDUSD', re: /\b(?:aud\s*[/\-_]?\s*usd|aussie)\b/i },
    { symbol: 'USDCAD', re: /\b(?:usd\s*[/\-_]?\s*cad|loonie)\b/i },
    { symbol: 'NZDUSD', re: /\b(?:nzd\s*[/\-_]?\s*usd|kiwi)\b/i },
    { symbol: 'USDCHF', re: /\b(?:usd\s*[/\-_]?\s*chf|swissy)\b/i },
    { symbol: 'EURGBP', re: /\b(?:eur\s*[/\-_]?\s*gbp)\b/i },
    { symbol: 'EURJPY', re: /\b(?:eur\s*[/\-_]?\s*jpy)\b/i },
    { symbol: 'GBPJPY', re: /\b(?:gbp\s*[/\-_]?\s*jpy|guppy|dragon)\b/i },
    { symbol: 'AUDJPY', re: /\b(?:aud\s*[/\-_]?\s*jpy)\b/i },
    { symbol: 'BTCUSDT', re: /\b(?:btc\s*[/\-_]?\s*usdt?|xbt\s*[/\-_]?\s*usdt?|bitcoin|btc)\b/i },
    { symbol: 'ETHUSDT', re: /\b(?:eth\s*[/\-_]?\s*usdt?|ethereum|ether|eth)\b/i },
    { symbol: 'SOLUSDT', re: /\b(?:sol\s*[/\-_]?\s*usdt?|solana|sol)\b/i },
    { symbol: 'BNBUSDT', re: /\b(?:bnb\s*[/\-_]?\s*usdt?|binance\s+coin|bnb)\b/i },
    { symbol: 'XRPUSDT', re: /\b(?:xrp\s*[/\-_]?\s*usdt?|ripple|xrp)\b/i },
    { symbol: 'ADAUSDT', re: /\b(?:ada\s*[/\-_]?\s*usdt?|cardano|ada)\b/i },
  ];

  export function extractSymbolsFromText(text: string): Symbol[] {
    const matches: Array<{ symbol: Symbol; index: number }> = [];
    for (const { symbol, re } of PROMPT_SYMBOL_PATTERNS) {
      const m = re.exec(text);
      if (m && m.index !== undefined) matches.push({ symbol, index: m.index });
    }
    matches.sort((a, b) => a.index - b.index);
    return matches.map((m) => m.symbol);
  }
  ```

### Finding F-03 (`P0-Critical`): Severe Cross-Asset Contract Size, P&L, Pip, Decimal, and Volatility Mismatches Across Forex, Metals, and Crypto

- **Locations**:
  - [`packages/shared/src/schemas/portfolio.ts:162-178`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/shared/src/schemas/portfolio.ts#L162-L178)
  - [`packages/ai/src/portfolio/risk-service.ts:45-87, 146`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/portfolio/risk-service.ts#L45-L87)
  - [`packages/ai/src/tools/verify-call.ts:231-282`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/tools/verify-call.ts#L231-L282)
  - [`packages/ai/src/tools/compute-risk.ts:60-62`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/tools/compute-risk.ts#L60-L62)
  - [`packages/ai/src/tools/convene-committee.ts:183-191, 224`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/tools/convene-committee.ts#L183-L224)
- **Root Cause**:
  1. **100,000x Crypto Exposure & Unconverted Non-USD Quote P&L in Portfolio Risk Service**:
     - [`packages/shared/src/schemas/portfolio.ts:162-170`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/shared/src/schemas/portfolio.ts#L162-L170) defines `CONTRACT_SIZES = { XAUUSD: 100, EURUSD: 100_000, GBPUSD: 100_000 }` and `getContractSize(symbol)` defaults to `100_000` for every other symbol instead of delegating to `lotUnits(symbol)` ([`packages/shared/src/symbol-catalog.ts:456-458`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/shared/src/symbol-catalog.ts#L456-L458), where all 6 Crypto symbols have `lotUnits = 1`).
     - Because [`packages/ai/src/portfolio/risk-service.ts:45, 76, 86, 146`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/portfolio/risk-service.ts#L45-L87) calls `getContractSize(pos.symbol)`, a `1.0` lot `BTCUSDT` position at `$65,000` is valued at `$6,500,000,000` ($6.5B) exposure and a `$100` move is reported as `$10,000,000` unrealized P&L!
     - Additionally, `computePnL()` ([`risk-service.ts:41-52`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/portfolio/risk-service.ts#L41-L52)) computes `priceDiff * pos.lotSize * contractSize` without converting quote-currency P&L to USD when the quote currency is not USD/USDT (e.g., for `USDJPY` at `150.00`, a `1.00 JPY` move on 1 lot is `¥100,000 ≈ $666.67`, but `computePnL` reports `$100,000.00 USD`).
  2. **Wrong Decimals, Wrong Crypto Keys, and Wrong `pipFloor` in `verify_call`**:
     - [`packages/ai/src/tools/verify-call.ts:231-233`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/tools/verify-call.ts#L231-L233): `function decimals(symbol: Symbol): number { return symbol === 'XAUUSD' ? 2 : 5; }` formats 3-decimal JPY pairs and 2/4-decimal Crypto pairs with 5 decimal places.
     - [`packages/ai/src/tools/verify-call.ts:241-253`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/tools/verify-call.ts#L241-L253): `INSTRUMENT_VOLATILITY` uses dead keys `BTCUSD: 0.04` and `ETHUSD: 0.045` instead of canonical `BTCUSDT` and `ETHUSDT`, so all crypto symbols fall back to `DEFAULT_VOLATILITY_FACTOR = 0.02`.
     - [`packages/ai/src/tools/verify-call.ts:281`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/tools/verify-call.ts#L281): `const pipFloor = symbol === 'XAUUSD' ? 5.0 : 0.001;` sets a `0.001` stop floor for `USDJPY` and `BTCUSDT`.
  3. **`compute_risk` Hard-Fails on 7 of 18 Supported Symbols**:
     - [`packages/ai/src/tools/compute-risk.ts:60-62`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/tools/compute-risk.ts#L60-L62) throws `new Error('Risk sizing currently requires a USD- or USDT-quoted symbol')` for `USDJPY`, `USDCAD`, `USDCHF`, `EURGBP`, `EURJPY`, `GBPJPY`, and `AUDJPY`.
  4. **`convene_committee` Hardcodes `.toFixed(2)` on 5-Decimal FX Prices & ATR**:
     - [`packages/ai/src/tools/convene-committee.ts:183-191, 224`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/tools/convene-committee.ts#L183-L224) formats `ema20`, `ema50`, `atr14`, and `liveMid` with `.toFixed(2)`. For `EURUSD` (`1.08543`, `ATR14 = 0.0018`), the specialist prompts receive `EMA20=1.09, EMA50=1.08, ATR14=0.00`!
- **Proposed Patch**:
  ```ts
  // packages/shared/src/schemas/portfolio.ts (lines 162-178)
  import { isSupportedSymbol, lotUnits, pipSize } from '../symbol-catalog';

  export function getContractSize(symbol: string): number {
    const s = symbol.trim().toUpperCase();
    return isSupportedSymbol(s) ? lotUnits(s) : 100_000;
  }

  export function getPipValue(symbol: string, lotSize: number): number {
    const s = symbol.trim().toUpperCase();
    const pip = isSupportedSymbol(s) ? pipSize(s) : s.endsWith('JPY') ? 0.01 : 0.0001;
    return pip * getContractSize(s) * lotSize;
  }
  ```

### Finding F-04 (`P2-Medium`): Legacy 3-Symbol Hardcoding in News Adapter, Marketaux Mapper, `analyze_fundamental`, `forecast_volatility`, and `get_calendar`

- **Locations**:
  - [`packages/data/src/adapters/news.ts:201-205, 214-231`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/adapters/news.ts#L201-L231)
  - [`packages/data/src/providers/marketaux/map.ts:34-47`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/providers/marketaux/map.ts#L34-L47) & [`packages/data/src/providers/marketaux/rest.ts:42-43`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/providers/marketaux/rest.ts#L42-L43)
  - [`packages/ai/src/tools/analyze-fundamental.ts:57-61`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/tools/analyze-fundamental.ts#L57-L61)
  - [`packages/ai/src/tools/forecast-volatility.ts:65-69`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/tools/forecast-volatility.ts#L65-L69)
  - [`packages/ai/src/tools/get-calendar.ts:33`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/tools/get-calendar.ts#L33)
- **Root Cause**:
  1. In [`packages/data/src/adapters/news.ts:201-205`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/adapters/news.ts#L201-L205), `value.filter((a) => a.symbols.includes(opts.symbol as Symbol) || a.symbols.includes('XAU'))` leaks Gold (`'XAU'`) articles into every non-Gold symbol query (`EURUSD`, `BTCUSDT`, etc.), while `SYMBOL_KEYWORDS` (`news.ts:214-231`) omits 8 of the 18 catalog symbols.
  2. In `analyze-fundamental.ts:57-61` and `forecast-volatility.ts:65-69`, `CURRENCIES_BY_SYMBOL` only maps `XAUUSD`, `EURUSD`, `GBPUSD` and falls back to `['USD']` instead of reading `getSymbolDefinition(symbol).currencies`.
  3. In `get-calendar.ts:33`, `CurrencySchema = z.enum(['USD', 'EUR', 'GBP'])` blocks querying `JPY`, `AUD`, `CAD`, `NZD`, or `CHF` calendar events.
- **Proposed Patch**:
  - Replace `CURRENCIES_BY_SYMBOL[symbol] || ['USD']` with `[...getSymbolDefinition(symbol).currencies]`, expand `CurrencySchema` to `z.enum(['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'NZD', 'CHF'])`, and change `news.ts:203` to `a.symbols.includes(opts.symbol as Symbol) || (opts.symbol === 'XAUUSD' && a.symbols.includes('XAU'))`.

## 4. Checklist Area 2: Upstream Data Providers, Rate Limits & Graceful Degradation (`packages/data`)

### Finding F-05 (`P1-High`): Caller `AbortSignal` Misclassified as `PROVIDER_TIMEOUT`, Poisoning Provider Health and Cascading Failover After Cancellation

- **Locations**:
  - [`packages/data/src/failover.ts:98-120`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/failover.ts#L98-L120)
  - [`packages/data/src/providers/biquote/rest.ts:137-143`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/providers/biquote/rest.ts#L137-L143)
  - [`packages/data/src/providers/binance/rest.ts:62-68, 165-171`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/providers/binance/rest.ts#L62-L68)
  - [`packages/data/src/providers/finnhub/rest.ts:97-103`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/providers/finnhub/rest.ts#L97-L103)
  - [`packages/data/src/providers/fred/rest.ts:99-105, 203-209`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/providers/fred/rest.ts#L99-L105)
  - [`packages/data/src/providers/marketaux/rest.ts:132-138`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/providers/marketaux/rest.ts#L132-L138)
- **Root Cause**:
  1. Every REST client in `packages/data` links the caller's `opts.signal` to an internal `AbortController`. When `fetch()` rejects with `AbortError`, the `catch` block unconditionally converts it into `new ProviderError('PROVIDER_TIMEOUT', PROVIDER, 'request timed out', { cause: err })` without checking whether `opts.signal?.aborted` was the trigger.
  2. In [`packages/data/src/failover.ts:98-120`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/failover.ts#L98-L120), `runWithFailover()` catches `ProviderError`, calls `recordFailure(attempt.provider, pErr, now, registry)` (incrementing `consecutiveFailures` toward the `degraded` / `down` threshold of 3/6 failures), and **continues the loop to invoke the next fallback provider** even though the caller already aborted.
- **Concrete Failure Scenario**:
  - `buildContextMessage()` calls `fetchPricesSafe()` with a `1500ms` `AbortSignal.timeout(1500)` ([`packages/ai/src/context.ts:44, 134`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/context.ts#L134)), or a user aborts a chat turn.
  - `opts.signal` aborts while `biquote` is in flight. `biquote/rest.ts` throws `ProviderError('PROVIDER_TIMEOUT', 'biquote')`. `runWithFailover` marks `biquote` as failed (`consecutiveFailures++`) and immediately attempts `finnhub`.
- **Proposed Patch**:
  ```ts
  // packages/data/src/failover.ts (lines 90-121)
  for (const attempt of ordered) {
    if (opts.signal?.aborted) {
      throw opts.signal.reason ?? new DOMException('Aborted', 'AbortError');
    }
    const start = (opts.now ?? Date.now)();
    try {
      const value = await attempt.run();
      const latencyMs = Math.max(0, (opts.now ?? Date.now)() - start);
      recordSuccess(attempt.provider, latencyMs, (opts.now ?? Date.now)(), registry);
      return { value, provider: attempt.provider, tried };
    } catch (err) {
      if (opts.signal?.aborted) {
        throw opts.signal.reason ?? err;
      }
      tried.push(attempt.provider);
      const pErr = toProviderError(attempt.provider, err);
      errors.push(pErr);
      recordFailure(attempt.provider, pErr, (opts.now ?? Date.now)(), registry);
    }
  }
  ```

### Finding F-06 (`P1-High`): Binance `fetchTickerPrice` Bypasses Self-Throttle and Ignores HTTP 429/418 Backoff; CFTC Omits 429 `noteBackoff`

- **Locations**:
  - [`packages/data/src/providers/binance/rest.ts:137-199`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/providers/binance/rest.ts#L137-L199)
  - [`packages/data/src/providers/cftc/rest.ts:104-111`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/providers/cftc/rest.ts#L104-L111)
- **Root Cause**:
  1. Unlike `klinesCall()` ([`binance/rest.ts:39-84`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/providers/binance/rest.ts#L39-L84)), `fetchTickerPrice()` ([`binance/rest.ts:137-199`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/providers/binance/rest.ts#L137-L199)) never calls `tryReserve(PROVIDER, THROTTLE)` and has no `res.status === 429 || res.status === 418` branch. It throws a generic `PROVIDER_HTTP_ERROR` without calling `noteBackoff(PROVIDER, THROTTLE)`.
  2. In [`packages/data/src/providers/cftc/rest.ts:104-111`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/providers/cftc/rest.ts#L104-L111), `fetchLatestRows()` checks `if (res.status === 429)` and throws `PROVIDER_QUOTA_EXCEEDED`, but omits `await noteBackoff(PROVIDER, THROTTLE)`.
- **Proposed Patch**:
  ```ts
  // packages/data/src/providers/binance/rest.ts (lines 146-182)
  const allowed = await tryReserve(PROVIDER, THROTTLE);
  if (!allowed) {
    throw new ProviderError(
      'PROVIDER_QUOTA_EXCEEDED',
      PROVIDER,
      'binance self-throttle exhausted (600/min)',
    );
  }
  // ... inside response handling:
  if (res.status === 429 || res.status === 418) {
    await noteBackoff(PROVIDER, THROTTLE);
    throw new ProviderError('PROVIDER_QUOTA_EXCEEDED', PROVIDER, `binance HTTP ${res.status}`, {
      status: res.status,
    });
  }
  ```

### Finding F-07 (`P1-High`): Finnhub Fallback Claims `supports() = true` Without API Key and Calls `/forex/candle` for Crypto Symbols

- **Locations**:
  - [`packages/data/src/adapters/provider-adapters.ts:195-215`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/adapters/provider-adapters.ts#L195-L215)
  - [`packages/data/src/providers/finnhub/rest.ts:176-186`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/providers/finnhub/rest.ts#L176-L186)
  - [`packages/data/src/adapters/candles.ts:132-137`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/adapters/candles.ts#L132-L137)
- **Root Cause**:
  1. `finnhubProvider.supports(_symbol, _tf)` ([`provider-adapters.ts:213-215`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/adapters/provider-adapters.ts#L213-L215)) unconditionally returns `true` even when `FINNHUB_API_KEY` is unset. When `1w` candles are requested for `XAUUSD` or `EURUSD` in zero-key mode, `biquoteProvider.supports(symbol, '1w')` returns `false`, `finnhubProvider.fetchCandles` returns `null`, and `candles.ts:132-137` throws `ProviderError('PROVIDER_HTTP_ERROR', 'finnhub')`, poisoning Finnhub's health score.
  2. When `FINNHUB_API_KEY` _is_ set, `fetchNative()` ([`finnhub/rest.ts:176-186`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/providers/finnhub/rest.ts#L176-L186)) calls `/forex/candle` even for `BINANCE:*` crypto symbols, which require `/crypto/candle` on Finnhub.
- **Proposed Patch**:
  ```ts
  // packages/data/src/adapters/provider-adapters.ts (lines 213-215)
  supports(_symbol, _tf) {
    return Boolean(process.env.FINNHUB_API_KEY);
  },
  // packages/data/src/providers/finnhub/rest.ts (lines 176-181)
  const fhSymbol = toFinnhubSymbol(symbol);
  const endpoint = fhSymbol.startsWith('BINANCE:') ? '/crypto/candle' : '/forex/candle';
  ```

### Finding F-08 (`P2-Medium`): Unbatched `getPrice()` Loops in `get_price` Tool and `portfolio/risk-service.ts`

- **Locations**:
  - [`packages/ai/src/tools/get-price.ts:50-61`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/tools/get-price.ts#L50-L61)
  - [`packages/ai/src/portfolio/risk-service.ts:110-119`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/portfolio/risk-service.ts#L110-L119)
- **Root Cause & Fix**:
  Both callers invoke `Promise.all(symbols.map((s) => getPrice(s)))` instead of calling batched `getPricesWithMeta(symbols, { signal })` ([`packages/data/src/adapters/price.ts:212-259`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/adapters/price.ts#L212-L259)), issuing $N$ separate BiQuote requests instead of 1 batched `/forex?symbols=...` request.

## 5. Checklist Area 3: Cache Freshness, Market Hours & Timestamp Integrity (`packages/data`, `packages/shared`, `apps/worker`)

### Finding F-09 (`P0-Critical`): `RedisCache.fetchWithMeta` Serves Stale Data Immediately on Soft-TTL Expiry Without Calling `producer()`, and Leaks Unexpired Redis Keys

- **Locations**:
  - [`packages/data/src/cache/redis.ts:140-245`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/cache/redis.ts#L140-L245)
- **Root Cause**:
  In [`RedisCache.fetchWithMeta()`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/cache/redis.ts#L140-L157):
  ```ts
  const raw = await client.get(lKey);
  if (raw) {
    const entry = JSON.parse(raw) as RedisValue<T>;
    if (entry.p + ttlMs > now) {
      return { value: entry.v, meta: { producedAt: entry.p, stale: false } };
    }
    if (swrMs > 0 && entry.h > now) {
      // Stale-while-error window — return stale value but mark it.
      return { value: entry.v, meta: { producedAt: entry.p, stale: true } };
    }
    await client.del(lKey);
  }
  ```
  Because `if (swrMs > 0 && entry.h > now)` executes **before** calling `producer()`, `RedisCache` **never refreshes any cached key until `hardExpiresAt` (`ttlSeconds + maxStaleSeconds`) has elapsed!**
  - Live quotes (`ttlSeconds = 3`, `maxStaleSeconds = 10`) are served stale for **13 seconds** instead of refreshing after 3s.
  - Open candles (`maxStaleSeconds = 300`) are served stale for an extra **5 minutes** without calling the upstream provider.
  - Furthermore, `RedisCache.getWithMeta()` (`redis.ts:200-221`) returns `stale: false` across the entire `entry.h > now` window, and `client.set()` (`redis.ts:173, 241`) sets keys without Redis `PX` expiration.
- **Proposed Patch**:
  ```ts
  // packages/data/src/cache/redis.ts (lines 139-197)
  let staleEntry: RedisValue<T> | null = null;
  try {
    const raw = await client.get(lKey);
    if (raw) {
      const entry = JSON.parse(raw) as RedisValue<T>;
      const softExp = entry.e ?? entry.p + ttlMs;
      if (softExp > now) {
        return { value: entry.v, meta: { producedAt: entry.p, stale: false } };
      }
      if (swrMs > 0 && entry.h > now) {
        staleEntry = entry; // Save for fallback ONLY if producer() throws!
      } else {
        await client.del(lKey);
      }
    }
  } catch (err) {
    this.handleError('get', err);
  }
  // ... call producer(), and in catch (err):
  if (staleEntry && staleEntry.h > this.now()) {
    return { value: staleEntry.v, meta: { producedAt: staleEntry.p, stale: true } };
  }
  throw err;
  ```

### Finding F-10 (`P0-Critical`): `snapshotToTick()` Overwrites Upstream Quote Timestamp with `Date.now()`, and `get_price` / `get_candles` Strip Staleness Metadata

- **Locations**:
  - [`packages/data/src/adapters/price.ts:80-92, 163-165`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/adapters/price.ts#L80-L92)
  - [`packages/data/src/adapters/provider-adapters.ts:116-148`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/adapters/provider-adapters.ts#L116-L148)
  - [`packages/ai/src/tools/get-price.ts:48-63`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/tools/get-price.ts#L48-L63)
  - [`packages/ai/src/tools/get-candles.ts:47-51`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/tools/get-candles.ts#L47-L51)
- **Root Cause**:
  1. `snapshotToTick(snap, fetchedAt)` ([`price.ts:80-92`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/adapters/price.ts#L80-L92)) sets `ts: fetchedAt` (`Date.now()`) instead of preserving the upstream quote's observation timestamp (`r.ts` from `live-ticks` or `Date.parse(tick.timestamp)` from BiQuote). On Saturday/Sunday, Friday's closing FX/Gold quote is stamped with Sunday's live timestamp.
  2. `get_price` ([`get-price.ts:48-63`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/tools/get-price.ts#L48-L63)) and `get_candles` ([`get-candles.ts:47-51`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/tools/get-candles.ts#L47-L51)) call `getPrice()` / `getCandles()` instead of `*WithMeta()`, discarding `stale` and `ageMs`.
- **Proposed Patch**:
  Preserve `observedAt?: number` on `ProviderQuoteSnapshot`, set `ts: snap.observedAt ?? fetchedAt` in `snapshotToTick()`, and use `getPricesWithMeta()` / `getCandlesWithMeta()` in the AI tools so `stale`, `ageMs`, and `quoteAsOf` are passed to the LLM.

### Finding F-11 (`P1-High`): Market-Hours & Session Awareness Bugs: Wrong COMEX Daily Maintenance Window (`17:00 UTC` vs `17:00 ET`), Crypto Weekend False Closure in `LIVE_SNAPSHOT`, and Weekend `candles_1m` / Worker Healthcheck False Failures

- **Locations**:
  - [`packages/shared/src/market-phase.ts:60-103`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/shared/src/market-phase.ts#L60-L103)
  - [`packages/ai/src/context.ts:71-84, 194-205`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/context.ts#L71-L84)
  - [`packages/data/src/providers/candles-1m/index.ts:110-117`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/providers/candles-1m/index.ts#L110-L117)
  - [`apps/worker/src/index.ts:315-322`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/apps/worker/src/index.ts#L315-L322)
- **Root Cause**:
  1. `isComexOpen(now)` ([`market-phase.ts:86-103`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/shared/src/market-phase.ts#L86-L103)) hardcodes `17:00–18:00 UTC` (which is **1:00–2:00 PM New York time** during peak NY trading!) instead of `17:00–18:00 America/New_York` (`21:00–22:00 UTC` EDT / `22:00–23:00 UTC` EST).
  2. `describeMarketPhase()` ([`context.ts:71-84`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/context.ts#L71-L84)) tells the LLM `"Market is CLOSED (weekend)"` without clarifying that Crypto (`*USDT`) trades 24/7 and that FX/Gold quotes on weekends represent Friday's closing bar.
  3. `fetchCandles1m` (`candles-1m/index.ts:110-117`) rejects Friday's closing `1m` bars all weekend (`ageMs > 90_000`), and `apps/worker/src/index.ts:315-322` pings `HC_SIGNALR_UUID` `fail` all weekend if only FX/Gold symbols are enabled.
- **Proposed Patch**:
  Compute `isComexOpen()` in `America/New_York` time via `Intl.DateTimeFormat`, update `describeMarketPhase()` to distinguish FX/Metals vs. 24/7 Crypto, and exempt FX weekend closures from the 90s `candles_1m` staleness rejection.

### Finding F-12 (`P1-High`): Worker CLI Runner (`WORKER_MODE=systemd`) Bypasses `acquireCronLock` & `JOB_TIMEOUT_MS`, `scheduler.ts` Fails Open on Lock Errors, and Sync Jobs Ignore `ctx.signal`

- **Locations**:
  - [`apps/worker/src/runner/cli.ts:52-121`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/apps/worker/src/runner/cli.ts#L52-L121)
  - [`apps/worker/src/scheduler.ts:260-269`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/apps/worker/src/scheduler.ts#L260-L269)
  - [`apps/worker/src/jobs/snapshots.ts:55`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/apps/worker/src/jobs/snapshots.ts#L55), [`apps/worker/src/jobs/cot.ts:49-52`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/apps/worker/src/jobs/cot.ts#L49-L52), [`apps/worker/src/jobs/fred-actuals.ts:107-112`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/apps/worker/src/jobs/fred-actuals.ts#L107-L112)
- **Root Cause**:
  1. `apps/worker/src/runner/cli.ts` (used in default `WORKER_MODE=systemd`) never calls `acquireCronLock()` / `completeCronLock()` and never sets a `JOB_TIMEOUT_MS` timeout on `controller`.
  2. `scheduler.ts:260-269` proceeds unlocked if `acquireCronLock()` fails twice.
  3. `snapshots.ts`, `cot.ts`, and `fred-actuals.ts` omit `{ signal: ctx.signal }` on upstream fetches.
- **Proposed Patch**:
  Add `acquireCronLock` / `completeCronLock` and `JOB_TIMEOUT_MS` to `runner/cli.ts`, return early in `scheduler.ts:260-269` when lock acquisition fails, and pass `signal: ctx.signal` in `snapshots.ts`, `cot.ts`, and `fred-actuals.ts`.

## 6. Checklist Area 4: Technical Indicator Accuracy & LLM Payload Formatting (`packages/indicators` & `packages/ai`)

### Finding F-13 (`P1-High`): Indicator & Structure Mathematical Bugs (`atr` Off-by-One Guard, Intraday `pivotsAligned` Micro-Range Bug, `bollinger` Sample vs. Population Stdev, and `detectStructure` Initial BOS)

- **Locations**:
  - [`packages/indicators/src/atr.ts:25, 44-53`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/indicators/src/atr.ts#L25-L53)
  - [`packages/indicators/src/pivots.ts:56-61`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/indicators/src/pivots.ts#L56-L61) & [`packages/ai/src/tools/analyze-technical.ts:113, 176-178`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/tools/analyze-technical.ts#L113-L178)
  - [`packages/indicators/src/bollinger.ts:40`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/indicators/src/bollinger.ts#L40) & [`packages/indicators/src/util.ts:55-62`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/indicators/src/util.ts#L55-L62)
  - [`packages/indicators/src/smc/structure.ts:63, 76-104`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/indicators/src/smc/structure.ts#L63-L104)
- **Root Cause**:
  1. **`atr()` Off-by-One Warm-Up Guard (`atr.ts:25`)**: Checks `if (candles.length <= period) return Array(candles.length).fill(null);`, even though `padFront(out, period - 1)` places the first ATR value at index `period - 1`. Changing line 25 to `if (candles.length < period)` restores prefix invariance.
  2. **`pivotsAligned()` Intraday Micro-Range Bug (`pivots.ts:56-61`)**: Computes Floor Trader Pivots (`PP, R1, S1`) from the immediately preceding bar (`candles[i - 1]`) regardless of timeframe. On `15m` or `1h` charts in `analyze_technical` and `get_indicators`, `PP/R1/S1` reflect the previous 15m/1h bar's micro-range instead of the prior daily session's High/Low/Close.
  3. **`bollinger()` Uses Sample Stdev (`N - 1`) Instead of Population Stdev (`N`) (`bollinger.ts:40`)**: Inflates `BB(20, 2)` band width by $\sqrt{20/19} \approx +2.6\%$ vs. TradingView/MT5.
  4. **`detectStructure()` Initial Trend State (`smc/structure.ts:63, 82`)**: Emits `'bos'` when `trend === null` (before any higher-high or lower-low trend exists) and uses `else if` on outside bars.
- **Proposed Patch**:
  Change `atr.ts:25` to `if (candles.length < period)`, aggregate intraday candles by UTC day inside `pivotsAligned()`, use `populationStdev` ($\div N$) in `bollinger.ts`, and only emit `'bos'` / `'choch'` in `detectStructure()` after an initial trend direction is established.

### Finding F-14 (`P1-High`): Unclosed (In-Progress) Candle Included in Binance & Finnhub Candle Series, Corrupting Close-Confirmed Indicators, BOS/CHoCH, and `replay_setup`

- **Locations**:
  - [`packages/data/src/providers/binance/rest.ts:88-109`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/providers/binance/rest.ts#L88-L109)
  - [`packages/data/src/providers/finnhub/rest.ts:192-204, 218-252`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/providers/finnhub/rest.ts#L192-L252)
- **Root Cause & Fix**:
  Unlike BiQuote (`!b.isOpen` at [`biquote/rest.ts:287`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/data/src/providers/biquote/rest.ts#L287)), Binance `/api/v3/klines` and Finnhub `/forex/candle` include the currently forming bar (`k.closeTime > fetchedAt` / `t + TIMEFRAME_MS[tf] > fetchedAt`) at `candles[candles.length - 1]`. Request `count + 1` bars and filter `k.closeTime <= fetchedAt` (Binance) and `t + TIMEFRAME_MS[tf] <= fetchedAt` (Finnhub) so all candle providers return closed bars consistently.

### Finding F-15 (`P0-Critical`): Severe LLM Context Bloat from Raw Multi-Hundred-Candle and Indicator Array JSON Dumps

- **Locations**:
  - [`packages/ai/src/tools/get-candles.ts:34, 47-51`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/tools/get-candles.ts#L34-L51)
  - [`packages/ai/src/mastra-v2/packets/evidence-builders.ts:61-92`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/mastra-v2/packets/evidence-builders.ts#L61-L92)
  - [`packages/ai/src/mastra-v2/agents/xauusd/tools/research-packet-tool.ts:24-34`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/mastra-v2/agents/xauusd/tools/research-packet-tool.ts#L24-L34)
  - [`packages/ai/src/tools/get-indicators.ts:54, 63-70`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/tools/get-indicators.ts#L54-L70)
  - [`packages/ai/src/tools/get-market-structure.ts:61, 92-98`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/tools/get-market-structure.ts#L61-L98)
  - [`packages/ai/src/tools/annotate-chart.ts:88-199`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/tools/annotate-chart.ts#L88-L199)
  - [`packages/ai/src/tools/replay-setup.ts:65-99`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/tools/replay-setup.ts#L65-L99)
- **Root Cause**:
  - `get_candles` serializes up to `500` full `Candle` objects (~16,000 tokens per call) with redundant per-bar `symbol`, `tf`, `source`, and `fetchedAt` keys.
  - `xauusdCandlesTool` (`evidence-builders.ts:82`) serializes up to `200` full `Candle` objects (~7,000 tokens).
  - `getXauusdResearchPacket` (`research-packet-tool.ts:29-33`) returns the raw `XauusdResearchPacket` (`320` full candles + `192` indicator values $\approx 14,000$ tokens) instead of `buildXauusdModelEvidenceContext(packet)`.
  - `get_indicators` (`TAIL_POINTS = 30`), `get_market_structure` (`TAIL = 30`), `annotate_chart` (all markers across 500 bars), and `replay_setup` (unbounded `trades[]`) dump large raw arrays into LLM context.
- **Proposed Patch**:
  ```ts
  // packages/ai/src/tools/get-candles.ts — return compact period summary + last 15 compact bars
  const TAIL_BARS = 15;
  const { value: candles, meta } = await getCandlesWithMeta(args.symbol, args.tf, {
    count: args.count,
    signal: ctx.signal,
  });
  const first = candles[0];
  const last = candles[candles.length - 1];
  let highBar = first;
  let lowBar = first;
  let totalRange = 0;
  let totalVolume = 0;
  for (const c of candles) {
    if (highBar && c.h > highBar.h) highBar = c;
    if (lowBar && c.l < lowBar.l) lowBar = c;
    totalRange += c.h - c.l;
    totalVolume += c.v ?? 0;
  }
  return {
    symbol: args.symbol,
    tf: args.tf,
    count: candles.length,
    stale: meta.stale,
    ageMs: meta.ageMs,
    source: last?.source ?? null,
    summary:
      first && last && highBar && lowBar
        ? {
            fromIso: new Date(first.t).toISOString(),
            toIso: new Date(last.t).toISOString(),
            open: first.o,
            high: highBar.h,
            highAtIso: new Date(highBar.t).toISOString(),
            low: lowBar.l,
            lowAtIso: new Date(lowBar.t).toISOString(),
            close: last.c,
            change: Number((last.c - first.o).toFixed(5)),
            changePct:
              first.o !== 0 ? Number((((last.c - first.o) / first.o) * 100).toFixed(3)) : 0,
            avgBarRange: Number((totalRange / candles.length).toFixed(5)),
            totalVolume: Number(totalVolume.toFixed(2)),
          }
        : null,
    recentCandles: candles.slice(-TAIL_BARS).map((c) => ({
      t: c.t,
      o: c.o,
      h: c.h,
      l: c.l,
      c: c.c,
      ...(c.v !== undefined ? { v: c.v } : {}),
    })),
  };
  ```

### Finding F-16 (`P3-Low`): Indicator Input Edge Cases (`macd` Fast/Slow Validation, `obv` Non-Finite Volume Poisoning, and `computeMarketStructureSummary` Precision)

- **Locations**:
  - [`packages/indicators/src/macd.ts:38-45`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/indicators/src/macd.ts#L38-L45)
  - [`packages/indicators/src/obv.ts:26-41`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/indicators/src/obv.ts#L26-L41)
  - [`packages/ai/src/mastra-v2/packets/symbol-research.ts:183-203`](https://github.com/HamaFx/Kestrel/blob/2335256c7b9bc0cce655bf29a11da0e1445a65d8/packages/ai/src/mastra-v2/packets/symbol-research.ts#L183-L203)
- **Root Cause & Proposed Patch**:
  - In `macd.ts:43`, guard against `fast >= slow`.
  - In `obv.ts:33`, sanitize `const vol = Number.isFinite(curr.v) ? (curr.v as number) : 0;` so a single corrupt volume does not poison the entire cumulative OBV series.
  - In `symbol-research.ts:183-203`, use `priceDecimals(symbol)` instead of `.toFixed(5)` when rounding `rangeSize`.

## 7. Prioritized Remediation Roadmap (Awaiting Approval)

1. **Wave 1 — `P0-Critical` Fixes**:
   - **F-09**: Fix `RedisCache.fetchWithMeta()` (`packages/data/src/cache/redis.ts:140-197`) so expired soft-TTL entries invoke `producer()` first and only serve `staleEntry` on error; fix `getWithMeta()` soft-TTL check and add Redis `PX` expiration.
   - **F-10**: Preserve upstream quote timestamps in `snapshotToTick()` (`packages/data/src/adapters/price.ts:80-92`) and use `getPricesWithMeta()` / `getCandlesWithMeta()` in `get_price` and `get_candles`.
   - **F-01**: Add natural-language, exchange, and slashed alias normalization to `normalizeSymbol()` / `SymbolSchema` and case/MT4 alias normalization to `TimeframeSchema`.
   - **F-03**: Fix `getContractSize()` to use `lotUnits(symbol)`, convert non-USD quote P&L in `risk-service.ts` and `compute-risk.ts`, fix `verify-call.ts` decimals/volatility/pipFloor, and replace `.toFixed(2)` with `.toFixed(priceDecimals(symbol))` in `convene-committee.ts`.
   - **F-15**: Replace raw multi-hundred-candle / indicator dumps in `get_candles`, `xauusdCandlesTool`, `getXauusdResearchPacket`, `get_indicators`, `get_market_structure`, `annotate_chart`, and `replay_setup` with compact summaries + bounded tails.
2. **Wave 2 — `P1-High` Fixes**:
   - **F-02**: Unify prompt symbol extraction (`extractSymbolsFromText`) across `routing-policy.ts`, `symbol-research.ts`, and `multi-agent-analysis.ts`.
   - **F-05, F-06, F-07**: Propagate caller `AbortSignal` cleanly in `runWithFailover()`, add `tryReserve` + 429/418 `noteBackoff` to Binance `fetchTickerPrice` and CFTC `fetchLatestRows`, and fix Finnhub `supports()` and `/crypto/candle` routing.
   - **F-11**: Fix `isComexOpen()` to use `America/New_York` (`17:00–18:00 ET`), make `LIVE_SNAPSHOT` crypto-aware on weekends, and make `fetchCandles1m` / worker healthchecks market-hours aware.
   - **F-12**: Add `acquireCronLock` + `JOB_TIMEOUT_MS` to `apps/worker/src/runner/cli.ts`, fail closed on lock errors in `scheduler.ts`, and pass `ctx.signal` in `snapshots.ts`, `cot.ts`, and `fred-actuals.ts`.
   - **F-13, F-14**: Fix `atr()` length guard, intraday `pivotsAligned()` daily aggregation, `bollinger()` population stdev, `detectStructure()` initial trend state, and filter unclosed trailing klines in Binance and Finnhub.
3. **Wave 3 — `P2-Medium` & `P3-Low` Fixes**:
   - **F-04, F-08, F-16**: Fix `news.ts` `'XAU'` filter leak and expand 18-symbol maps in `news.ts`, Marketaux, `analyze_fundamental`, `forecast_volatility`, and `get_calendar`; use batched `getPricesWithMeta` in `get_price` and `risk-service.ts`; harden `macd`/`obv` edge cases.
