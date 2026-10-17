# Phase 4 Implementation Plan: Market Data, Indicators, Worker Sync & AI Data Tools

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement comprehensive remediations for all 16 technical findings (F-01 through F-16) identified in the Phase 4 Technical Audit across `@kestrel/shared`, `@kestrel/data`, `@kestrel/indicators`, `@kestrel/ai`, and `apps/worker`.

**Architecture:** Fixes are rolled out in three strictly ordered waves:
1. **Wave 1 (P0-Critical)**: Redis cache SWR fix & TTL expiration, quote timestamp integrity, natural language symbol/timeframe normalizers, multi-asset portfolio & risk calculations, and LLM candle/indicator token bloat reduction.
2. **Wave 2 (P1-High)**: Prompt symbol extraction across router/worker, abort signal propagation in failover, Binance/CFTC throttle & 429 backoff, Finnhub routing & supports check, CME Globex NY market hours, worker cron locks, and indicator math (ATR, Pivots, Bollinger) + unclosed candle filtering.
3. **Wave 3 (P2-Medium & P3-Low)**: News filtering & 18-symbol coverage expansion in fundamental/calendar tools, batched quote fan-out, and precision formatting.

**Tech Stack:** TypeScript, Node.js 22, pnpm, Vitest, Zod, Redis, Drizzle ORM, Mastra / AI SDK v5.

**Spec:** [`docs/audits/phase-04-market-data-and-indicators.md`](file:///home/ubuntu/Kestrel/docs/audits/phase-04-market-data-and-indicators.md)

## Global Constraints
- Preserve full backward compatibility for existing UI component schemas (`apps/web/src/components/chat/parts/`).
- No regressions on existing test suites (`pnpm --filter @kestrel/shared test`, `pnpm --filter @kestrel/indicators test`, `pnpm --filter @kestrel/data test`, `pnpm --filter @kestrel/ai test`).
- All 18 supported instruments in `BUILTIN_SYMBOLS` (Gold, 11 FX pairs, 6 Crypto pairs) must be first-class citizens.
- Exact symbol matching and UTF-16LE parameter rules where applicable.

## Review Focus
1. `RedisCache.fetchWithMeta`: Calling with soft-expired entry must attempt producer first, and only return stale entry if producer throws.
2. `SymbolSchema` & `TimeframeSchema`: Must accept `"Gold"`, `"BTC"`, `"BTC/USD"`, `"1D"`, `"4H"`, `"H4"` without Zod errors.
3. Crypto & JPY Risk Math: 1 lot `BTCUSDT` position exposure must be $65k (not $6.5B), and `USDJPY` P&L must be converted to USD.
4. Failover & Abort: Aborting a price fetch must NOT record failure against primary provider (`biquote`) or cascade down fallback chain.
5. CME Globex Hours: `isComexOpen()` must pause at 17:00-18:00 America/New_York (21:00-22:00 UTC during EDT).

---

### Task 1: Fix Redis SWR Soft-TTL & Expiration (Finding F-09, P0)

**Files:**
- Modify: `packages/data/src/cache/redis.ts:135-245`
- Test: `packages/data/test/cache-redis.test.ts`

**Interfaces:**
- Consumes: `RedisCache.fetchWithMeta()`, `getWithMeta()`, `set()`
- Produces: Correct stale-while-error fallback (producer invoked first on soft expiry; stale entry served only on error), accurate `stale` metadata, Redis `PX` auto-expiration.

- [ ] **Step 1: Write the failing tests in `packages/data/test/cache-redis.test.ts`**
  - Test 1: Calling `fetchWithMeta` on an entry past `softExpiresAt` but before `hardExpiresAt` calls `producer()` when producer succeeds.
  - Test 2: Calling `fetchWithMeta` on an entry past `softExpiresAt` returns stale entry with `meta.stale = true` when `producer()` throws.
  - Test 3: `getWithMeta` returns `stale: true` when `entry.p + ttlMs < now <= entry.h`.
  - Test 4: `client.set` passes `{ PX: ttlMs + swrMs }`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm --filter @kestrel/data test test/cache-redis.test.ts`
  Expected: FAIL on soft-TTL refresh behavior.

- [ ] **Step 3: Implement SWR fix in `packages/data/src/cache/redis.ts`**
  - In `fetchWithMeta()`, when `entry.p + ttlMs <= now` and `entry.h > now`, store `staleEntry = entry` instead of returning immediately. Call `producer()`. If `producer()` succeeds, save & return new value. In `catch (err)`, if `staleEntry` exists and `staleEntry.h > Date.now()`, return `{ value: staleEntry.v, meta: { producedAt: staleEntry.p, stale: true } }`.
  - In `getWithMeta()`, check if `entry.p + ttlMs < now` and set `meta.stale = true`.
  - In `set()` and `fetchWithMeta()`, pass `{ PX: ttlMs + swrMs }` to `client.set`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm --filter @kestrel/data test test/cache-redis.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add packages/data/src/cache/redis.ts packages/data/test/cache-redis.test.ts
  git commit -m "fix(data): fix RedisCache SWR soft-TTL refresh and add PX key expiration (F-09)"
  ```

---

### Task 2: Preserve Quote Timestamps & Propagate Metadata (Finding F-10, P0)

**Files:**
- Modify: `packages/data/src/providers/provider-registry.ts:45-56`
- Modify: `packages/data/src/providers/provider-adapters.ts:60-135`
- Modify: `packages/data/src/adapters/price.ts:80-92, 160-260`
- Modify: `packages/ai/src/tools/get-price.ts:45-65`
- Modify: `packages/ai/src/tools/get-candles.ts:45-55`
- Test: `packages/data/test/price-timestamp.test.ts`
- Test: `packages/ai/test/get-price-metadata.test.ts`

**Interfaces:**
- Consumes: `ProviderPriceSnapshot.observedAt`, `Tick.ts`, `getPriceWithMeta()`, `getPricesWithMeta()`, `getCandlesWithMeta()`
- Produces: Ticks with accurate observation timestamps `ts = observedAt ?? fetchedAt`, tools returning freshness metadata.

- [ ] **Step 1: Write failing test in `packages/data/test/price-timestamp.test.ts`**
  - Verify `snapshotToTick` preserves `observedAt` rather than replacing with `Date.now()`.
  - Verify `biquote` adapter extracts `observedAt` from `tick.lastQuoteAt` or `tick.timestamp` or `quoteAgeSeconds`.
  - Verify `live-ticks` adapter passes `r.ts` as `observedAt`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm --filter @kestrel/data test test/price-timestamp.test.ts`
  Expected: FAIL

- [ ] **Step 3: Implement timestamp preservation and tool metadata**
  - Add optional `observedAt?: number` to `ProviderPriceSnapshot`.
  - In `provider-adapters.ts`, populate `observedAt` in `biquote` and `live-ticks`.
  - In `packages/data/src/adapters/price.ts`, use `snap.observedAt ?? fetchedAt` for `ts`.
  - In `packages/ai/src/tools/get-price.ts`, use `getPricesWithMeta(symbols, { signal })` and pass freshness data.
  - In `packages/ai/src/tools/get-candles.ts`, use `getCandlesWithMeta(symbol, tf, { count, signal })`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm --filter @kestrel/data test test/price-timestamp.test.ts && pnpm --filter @kestrel/ai test test/get-price-metadata.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add packages/data/ packages/ai/
  git commit -m "fix(data,ai): preserve quote observation timestamps and propagate freshness metadata (F-10)"
  ```

---

### Task 3: Comprehensive Symbol & Timeframe Normalization (Finding F-01, P0)

**Files:**
- Modify: `packages/shared/src/symbol-catalog.ts:466-475`
- Modify: `packages/shared/src/symbols.ts:65-75`
- Modify: `packages/shared/src/timeframes.ts:19-35`
- Test: `packages/shared/test/normalization.test.ts`

**Interfaces:**
- Consumes: `normalizeSymbol()`, `SymbolSchema`, `normalizeTimeframe()`, `TimeframeSchema`
- Produces: Normalization of slashed (`"EUR/USD"`, `"BTC/USD"`), prefixed (`"BINANCE:BTCUSDT"`, `"OANDA:XAU_USD"`), natural language (`"Gold"`, `"Bitcoin"`, `"Cable"`, `"Fibre"`), and timeframe variants (`"1D"`, `"4H"`, `"1H"`, `"15MIN"`, `"daily"`, `"weekly"`).

- [ ] **Step 1: Write failing tests in `packages/shared/test/normalization.test.ts`**
  - Test `normalizeSymbol` and `SymbolSchema.parse` on `"Gold"`, `"XAU/USD"`, `"EUR/USD"`, `"BTC"`, `"BTCUSD"`, `"Bitcoin"`, `"ETH"`, `"SOL"`, `"Cable"`.
  - Test `TimeframeSchema.parse` on `"1D"`, `"4H"`, `"1H"`, `"15M"`, `"D1"`, `"H4"`, `"daily"`, `"weekly"`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm --filter @kestrel/shared test test/normalization.test.ts`
  Expected: FAIL on aliases.

- [ ] **Step 3: Implement alias maps and normalizers**
  - Add `SYMBOL_ALIAS_MAP` in `symbol-catalog.ts` mapping `GOLD`, `XAU`, `BTC`, `BTCUSD`, `BITCOIN`, `ETH`, `ETHUSD`, `ETHEREUM`, `SOL`, `SOLUSD`, `SOLANA`, `BNB`, `XRP`, `ADA`, `CABLE`, `FIBRE`, `FIBER` to canonical symbols.
  - Update `normalizeSymbol` to strip exchange prefixes and separators (`/`, `-`, `_`, `:`, spaces) and resolve alias.
  - Add `normalizeTimeframe` and update `TimeframeSchema` with `.transform(normalizeTimeframe)` supporting MT4/TV/case-insensitive strings.

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm --filter @kestrel/shared test test/normalization.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared/
  git commit -m "fix(shared): normalize natural-language, slashed, and exchange symbols and timeframes (F-01)"
  ```

---

### Task 4: Fix Cross-Asset Contract Size, Portfolio P&L, Pip Floors, and Formatting (Finding F-03, P0)

**Files:**
- Modify: `packages/shared/src/schemas/portfolio.ts:162-178`
- Modify: `packages/shared/src/symbols.ts:90-120`
- Modify: `packages/ai/src/portfolio/risk-service.ts:40-95, 110-120`
- Modify: `packages/ai/src/tools/verify-call.ts:230-285`
- Modify: `packages/ai/src/tools/compute-risk.ts:55-80, 130-135`
- Modify: `packages/ai/src/tools/convene-committee.ts:180-225`
- Test: `packages/shared/test/portfolio-sizing.test.ts`
- Test: `packages/ai/test/risk-sizing.test.ts`

**Interfaces:**
- Consumes: `getContractSize()`, `lotUnits()`, `priceDecimals()`, `pipSize()`, `computePnL()`
- Produces: Correct lot sizes across Gold (100), FX (100,000), Crypto (1); USD-converted P&L for USD-base pairs; canonical volatility and pip floors in `verify_call`; symbol-aware decimal formatting in `convene_committee`.

- [ ] **Step 1: Write failing tests in `packages/shared/test/portfolio-sizing.test.ts` and `packages/ai/test/risk-sizing.test.ts`**
  - Verify `getContractSize('BTCUSDT') === 1` and `getContractSize('XAUUSD') === 100` and `getContractSize('EURUSD') === 100_000`.
  - Verify `computePnL` on `BTCUSDT` (1.0 lot, $100 price move = $100 P&L, not $10,000,000).
  - Verify `computePnL` on `USDJPY` (1.0 lot, 100 pips at 150.00 ≈ $666.67 USD).
  - Verify `computeRiskTool` runs successfully on `USDJPY`, `USDCAD`, `USDCHF`.
  - Verify `verify_call` uses `priceDecimals` and canonical crypto keys `BTCUSDT`, `ETHUSDT`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm --filter @kestrel/shared test test/portfolio-sizing.test.ts && pnpm --filter @kestrel/ai test test/risk-sizing.test.ts`
  Expected: FAIL on contract size and non-USD quote sizing.

- [ ] **Step 3: Implement contract sizing and multi-asset P&L**
  - In `packages/shared/src/schemas/portfolio.ts`, implement `getContractSize()` delegating to `definition.capabilities.contractSize`. Export `lotUnits` alias.
  - In `packages/ai/src/portfolio/risk-service.ts`, adjust `computePnL` to divide by `currentPrice` for USD-base pairs (`baseCurrency === 'USD'`).
  - In `packages/ai/src/tools/compute-risk.ts`, allow USD-base pairs (`definition.baseCurrency === 'USD'`) and compute `valuePerDistanceUnit = (definition.capabilities.contractSize * definition.pipSize) / entry`.
  - In `packages/ai/src/tools/verify-call.ts`, replace `decimals()` with `priceDecimals(symbol)`, update `INSTRUMENT_VOLATILITY` keys to canonical `BTCUSDT`, `ETHUSDT`, `SOLUSDT`, etc., and set `pipFloor = pipSize(symbol) * 10`.
  - In `packages/ai/src/tools/convene-committee.ts`, format `ema20`, `ema50`, `liveMid` with `priceDecimals(symbol)` and `atr14` with `Math.max(2, priceDecimals(symbol))`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm --filter @kestrel/shared test test/portfolio-sizing.test.ts && pnpm --filter @kestrel/ai test test/risk-sizing.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared/ packages/ai/
  git commit -m "fix(shared,ai): fix contract size, crypto exposure, non-USD quote sizing, and decimal formatting (F-03)"
  ```

---

### Task 5: Prevent LLM Context Token Bloat (Finding F-15, P0)

**Files:**
- Modify: `packages/shared/src/schemas/tool-outputs/get-candles.ts:25-32`
- Modify: `packages/ai/src/tools/get-candles.ts:30-55`
- Modify: `packages/ai/src/mastra-v2/packets/evidence-builders.ts:60-95`
- Modify: `packages/ai/src/mastra-v2/agents/xauusd/tools/research-packet-tool.ts:20-35`
- Modify: `packages/ai/src/tools/get-indicators.ts:50-70`
- Modify: `packages/ai/src/tools/get-market-structure.ts:60-100`
- Modify: `packages/ai/src/tools/annotate-chart.ts:88-200`
- Modify: `packages/ai/src/tools/replay-setup.ts:65-100`
- Test: `packages/ai/test/tool-token-caps.test.ts`

**Interfaces:**
- Consumes: `getCandlesTool`, `xauusdCandlesTool`, `getXauusdResearchPacket`, `getIndicatorsTool`
- Produces: Compact summary objects and bounded tail windows while keeping `candles` array shape compatible with web UI components.

- [ ] **Step 1: Write failing test in `packages/ai/test/tool-token-caps.test.ts`**
  - Verify `get_candles` with `count: 500` returns period summary and bounded recent candles (max 30 bars in `candles` array) while preserving `GetCandlesOutput` interface.
  - Verify `getXauusdResearchPacket` returns serialized model evidence context rather than raw 500-bar dump.
  - Verify `get_indicators` caps returned tail points.

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm --filter @kestrel/ai test test/tool-token-caps.test.ts`
  Expected: FAIL

- [ ] **Step 3: Implement token bloat caps**
  - In `packages/shared/src/schemas/tool-outputs/get-candles.ts`, add optional `summary` to `GetCandlesOutputSchema`.
  - In `packages/ai/src/tools/get-candles.ts`, compute high/low/range/change summary and return `candles.slice(-30)` so UI sparkline/tail work without dumping 500 bars into context.
  - In `evidence-builders.ts` and `research-packet-tool.ts`, serialize evidence with `buildXauusdModelEvidenceContext` / compact formatting.
  - In `get_indicators.ts` and `get_market-structure.ts`, bound tails to the most recent 15 bars.

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm --filter @kestrel/ai test test/tool-token-caps.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared/ packages/ai/
  git commit -m "perf(ai): prevent token bloat with compact summaries and bounded tails in AI tools (F-15)"
  ```

---

### Task 6: Unified Prompt Symbol Extraction (Finding F-02, P1)

**Files:**
- Modify: `packages/shared/src/symbol-catalog.ts:500-563`
- Modify: `packages/ai/src/mastra-v2/planning/routing-policy.ts:90-110`
- Modify: `packages/ai/src/mastra-v2/packets/symbol-research.ts:415-435`
- Modify: `apps/worker/src/jobs/multi-agent-analysis.ts:210-225`
- Test: `packages/shared/test/prompt-symbol-extractor.test.ts`

**Interfaces:**
- Consumes: `extractSymbolsFromText(text: string): Symbol[]`
- Produces: Accurate detection of natural-language tickers (`"Bitcoin"`, `"BTC"`, `"BTCUSD"`, `"EUR/USD"`, `"Cable"`) across chat routing and worker committee jobs.

- [ ] **Step 1: Write failing test in `packages/shared/test/prompt-symbol-extractor.test.ts`**
  - Test prompts: `"Analyze Bitcoin structure"`, `"What is BTC/USD doing?"`, `"Check EUR/USD on 4h"`, `"Run committee on Cable"`.
  - Verify detected symbol is `BTCUSDT`, `EURUSD`, `GBPUSD` respectively (not falling back to `XAUUSD`).

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm --filter @kestrel/shared test test/prompt-symbol-extractor.test.ts`
  Expected: FAIL

- [ ] **Step 3: Implement `extractSymbolsFromText` and integrate**
  - In `packages/shared/src/symbol-catalog.ts`, implement `PROMPT_SYMBOL_PATTERNS` and `extractSymbolsFromText(text)`.
  - In `packages/ai/src/mastra-v2/planning/routing-policy.ts`, use `extractSymbolsFromText`.
  - In `packages/ai/src/mastra-v2/packets/symbol-research.ts`, use `extractSymbolsFromText` in `extractSymbolFromPrompt`.
  - In `apps/worker/src/jobs/multi-agent-analysis.ts`, use `extractSymbolFromPrompt` with the new patterns so worker doesn't silently fall back to `XAUUSD`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm --filter @kestrel/shared test test/prompt-symbol-extractor.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared/ packages/ai/ apps/worker/
  git commit -m "fix(shared,ai,worker): unify prompt symbol extraction and eliminate silent XAUUSD fallback (F-02)"
  ```

---

### Task 7: AbortSignal Handling, Binance/CFTC Backoff, and Finnhub Routing (Findings F-05, F-06, F-07, P1)

**Files:**
- Modify: `packages/data/src/failover.ts:90-125`
- Modify: `packages/data/src/providers/biquote/rest.ts:135-145`
- Modify: `packages/data/src/providers/binance/rest.ts:60-70, 140-199`
- Modify: `packages/data/src/providers/cftc/rest.ts:104-115`
- Modify: `packages/data/src/providers/finnhub/rest.ts:175-185`
- Modify: `packages/data/src/providers/provider-adapters.ts:210-220`
- Test: `packages/data/test/failover-abort.test.ts`
- Test: `packages/data/test/binance-backoff.test.ts`

**Interfaces:**
- Consumes: `opts.signal`, `tryReserve`, `noteBackoff`, `runWithFailover()`
- Produces: Clean cancellation without health ding, Binance ticker throttling & 429 backoff, Finnhub API key check & crypto routing.

- [ ] **Step 1: Write failing tests**
  - Verify aborted signal in `runWithFailover` rethrows immediately without calling next provider or recording failure.
  - Verify `fetchTickerPrice` in Binance respects `tryReserve` and calls `noteBackoff` on 429/418.
  - Verify `finnhubProvider.supports()` returns false when `FINNHUB_API_KEY` is not set.
  - Verify Finnhub crypto symbols route to `/crypto/candle`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm --filter @kestrel/data test test/failover-abort.test.ts test/binance-backoff.test.ts`
  Expected: FAIL

- [ ] **Step 3: Implement abort handling and provider hardening**
  - In `packages/data/src/failover.ts`, check `opts?.signal?.aborted` before each attempt and in `catch`; rethrow without recording failure.
  - In `binance/rest.ts`, add `tryReserve` and 429/418 check with `noteBackoff` to `fetchTickerPrice`.
  - In `cftc/rest.ts`, add `noteBackoff` on 429.
  - In `provider-adapters.ts`, update `finnhubProvider.supports` to return `Boolean(process.env.FINNHUB_API_KEY)`.
  - In `finnhub/rest.ts`, route `BINANCE:*` symbols to `/crypto/candle`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm --filter @kestrel/data test test/failover-abort.test.ts test/binance-backoff.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add packages/data/
  git commit -m "fix(data): propagate AbortSignal cleanly, throttle Binance ticker, and fix Finnhub routing (F-05, F-06, F-07)"
  ```

---

### Task 8: Market-Hours & Session Awareness (Finding F-11, P1)

**Files:**
- Modify: `packages/shared/src/market-phase.ts:60-105`
- Modify: `packages/shared/test/market-phase.test.ts:68-90`
- Modify: `packages/ai/src/context.ts:70-85, 190-205`
- Modify: `packages/data/src/providers/candles-1m/index.ts:110-120`
- Modify: `apps/worker/src/index.ts:315-325`
- Test: `packages/shared/test/market-phase.test.ts`

**Interfaces:**
- Consumes: `isComexOpen()`, `describeMarketPhase()`, `fetchCandles1m`
- Produces: True CME Globex schedule in Eastern Time; crypto-aware weekend session labels; weekend-tolerant 1m candle age checks.

- [ ] **Step 1: Write failing test in `packages/shared/test/market-phase.test.ts`**
  - Verify COMEX maintenance pause operates 17:00-18:00 US Eastern Time (e.g. 21:00-22:00 UTC during EDT).
  - Verify COMEX is open during 17:00-18:00 UTC on weekdays (1:00-2:00 PM NY).

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm --filter @kestrel/shared test test/market-phase.test.ts`
  Expected: FAIL

- [ ] **Step 3: Implement Eastern Time conversion and crypto awareness**
  - In `packages/shared/src/market-phase.ts`, evaluate `isComexOpen` using `Intl.DateTimeFormat` with `timeZone: 'America/New_York'`.
  - In `packages/ai/src/context.ts`, clarify in `describeMarketPhase` that Crypto trades 24/7 and FX quotes reflect Friday's close on weekends.
  - In `candles-1m/index.ts`, allow Friday close bars on weekends without failing the 90s age check.
  - In `apps/worker/src/index.ts`, skip weekend failure alert when market is closed for FX/Gold.

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm --filter @kestrel/shared test test/market-phase.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared/ packages/ai/ packages/data/ apps/worker/
  git commit -m "fix(shared,ai,data,worker): fix COMEX maintenance hours to Eastern Time and handle weekend crypto (F-11)"
  ```

---

### Task 9: Worker CLI Runner Locks, Timeouts & Job Signal Propagation (Finding F-12, P1)

**Files:**
- Modify: `apps/worker/src/runner/cli.ts:50-125`
- Modify: `apps/worker/src/scheduler.ts:255-275`
- Modify: `apps/worker/src/jobs/snapshots.ts:50-65`
- Modify: `apps/worker/src/jobs/cot.ts:45-55`
- Modify: `apps/worker/src/jobs/fred-actuals.ts:100-115`
- Test: `apps/worker/test/runner-lock.test.ts`

**Interfaces:**
- Consumes: `acquireCronLock()`, `completeCronLock()`, `signal: ctx.signal`
- Produces: Distributed cron lock safety and timeout guard in CLI runner; abort signal propagation in worker background jobs.

- [ ] **Step 1: Write failing test in `apps/worker/test/runner-lock.test.ts`**
  - Verify CLI runner acquires cron lock before executing job and completes lock on exit.
  - Verify job timeout is enforced.

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm --filter @kestrel/worker test test/runner-lock.test.ts`
  Expected: FAIL

- [ ] **Step 3: Implement cron lock and timeout in `runner/cli.ts`**
  - Wrap job execution in `runner/cli.ts` with `acquireCronLock` / `completeCronLock`.
  - Add `JOB_TIMEOUT_MS` timeout to the AbortController.
  - In `scheduler.ts:260-269`, fail closed (do not execute unlocked) if lock acquisition fails.
  - In `snapshots.ts`, `cot.ts`, and `fred-actuals.ts`, pass `signal: ctx.signal` to upstream provider calls.

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm --filter @kestrel/worker test test/runner-lock.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add apps/worker/
  git commit -m "fix(worker): add distributed cron locks and timeout guards to worker CLI runner (F-12)"
  ```

---

### Task 10: Indicator Accuracy (ATR, Pivots, Bollinger) & Unclosed Candle Filtering (Findings F-13, F-14, P1)

**Files:**
- Modify: `packages/indicators/src/atr.ts:20-30`
- Modify: `packages/indicators/src/pivots.ts:50-63`
- Modify: `packages/indicators/src/bollinger.ts:35-48`
- Modify: `packages/indicators/src/util.ts:55-63`
- Modify: `packages/data/src/providers/binance/rest.ts:90-110`
- Modify: `packages/data/src/providers/finnhub/rest.ts:190-205`
- Test: `packages/indicators/test/atr.test.ts`
- Test: `packages/indicators/test/pivots.test.ts`
- Test: `packages/indicators/test/bollinger.test.ts`
- Test: `packages/data/test/closed-candles.test.ts`

**Interfaces:**
- Consumes: `atr()`, `pivotsAligned()`, `bollinger()`, `fetchCandles()`
- Produces: Length-invariant ATR, daily-aggregated intraday pivots, population-stdev Bollinger Bands, and strictly closed candle series from Binance & Finnhub.

- [ ] **Step 1: Write failing tests**
  - Verify `atr(candles, 14)` on exactly 14 candles produces a non-null ATR at index 13.
  - Verify `bollinger` uses population stdev ($N$) matching MT5/TradingView.
  - Verify intraday `pivotsAligned` uses prior day's H/L/C for intraday bars.
  - Verify Binance and Finnhub `fetchCandles` omit currently forming in-progress candles when `includeOpenBar` is false.

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm --filter @kestrel/indicators test && pnpm --filter @kestrel/data test test/closed-candles.test.ts`
  Expected: FAIL

- [ ] **Step 3: Implement indicator fixes and closed candle filtering**
  - In `packages/indicators/src/atr.ts`, change `if (candles.length <= period)` to `if (candles.length < period)`.
  - In `packages/indicators/src/bollinger.ts` & `util.ts`, export `stdevPopulation` and use it in `bollinger()`.
  - In `packages/indicators/src/pivots.ts`, aggregate intraday candles by UTC day so intraday bars receive pivots from the previous daily session.
  - In `packages/data/src/providers/binance/rest.ts` and `finnhub/rest.ts`, filter out open bars (`k.closeTime > Date.now()` / `t + msPerTimeframe > Date.now()`) unless `includeOpenBar` is true.

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm --filter @kestrel/indicators test && pnpm --filter @kestrel/data test test/closed-candles.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add packages/indicators/ packages/data/
  git commit -m "fix(indicators,data): fix ATR off-by-one, intraday pivots, population stdev, and filter open candles (F-13, F-14)"
  ```

---

### Task 11: News Filtering, Batched Quotes & Precision Hardening (Findings F-04, F-08, F-16, P2/P3)

**Files:**
- Modify: `packages/data/src/adapters/news.ts:200-235`
- Modify: `packages/data/src/providers/marketaux/map.ts:30-50`
- Modify: `packages/ai/src/tools/analyze-fundamental.ts:55-65`
- Modify: `packages/ai/src/tools/forecast-volatility.ts:65-70`
- Modify: `packages/ai/src/tools/get-calendar.ts:30-45`
- Modify: `packages/ai/src/portfolio/risk-service.ts:105-125`
- Modify: `packages/ai/src/mastra-v2/packets/symbol-research.ts:180-205`
- Test: `packages/data/test/news-filter.test.ts`
- Test: `packages/ai/test/fundamental-currencies.test.ts`

**Interfaces:**
- Consumes: `getNews()`, `analyzeFundamentalTool`, `getCalendarTool`, `getPricesWithMeta`
- Produces: Correct news filtering without Gold article leaking, 18-symbol support across all fundamental tools, batched quote fetching in portfolio service.

- [ ] **Step 1: Write failing tests**
  - Verify querying news for `BTCUSDT` does not include Gold-specific articles.
  - Verify `analyze_fundamental` and `forecast_volatility` resolve currencies from `getSymbolDefinition(symbol).currencies`.
  - Verify `get_calendar` accepts all supported currencies (`USD`, `EUR`, `GBP`, `JPY`, `AUD`, `CAD`, `NZD`, `CHF`).
  - Verify `getOpenPositionsWithPnL` uses batched `getPricesWithMeta`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm --filter @kestrel/data test test/news-filter.test.ts && pnpm --filter @kestrel/ai test test/fundamental-currencies.test.ts`
  Expected: FAIL

- [ ] **Step 3: Implement fixes**
  - In `packages/data/src/adapters/news.ts`, fix line 203: `a.symbols.includes(opts.symbol as Symbol) || (opts.symbol === 'XAUUSD' && a.symbols.includes('XAU'))`. Expand `SYMBOL_KEYWORDS`.
  - In `packages/ai/src/tools/analyze-fundamental.ts` and `forecast-volatility.ts`, read currencies dynamically via `getSymbolDefinition(symbol).currencies`.
  - In `packages/ai/src/tools/get-calendar.ts`, expand `CurrencySchema` to accept all catalog currency tags.
  - In `packages/ai/src/portfolio/risk-service.ts`, replace `Promise.all(symbols.map(getPrice))` with `getPricesWithMeta(symbols)`.
  - In `packages/ai/src/mastra-v2/packets/symbol-research.ts`, round `rangeSize` using `priceDecimals(symbol)`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm --filter @kestrel/data test test/news-filter.test.ts && pnpm --filter @kestrel/ai test test/fundamental-currencies.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add packages/data/ packages/ai/
  git commit -m "fix(data,ai): fix news filtering leaks, expand catalog currencies, and batch portfolio quotes (F-04, F-08, F-16)"
  ```

---

### Task 12: End-to-End Verification & Full Test Suite Pass

**Files:**
- Test: All packages (`@kestrel/shared`, `@kestrel/indicators`, `@kestrel/data`, `@kestrel/ai`, `apps/worker`)

- [ ] **Step 1: Run typechecks across workspace**
  Run: `pnpm typecheck`
  Expected: Zero TypeScript errors.

- [ ] **Step 2: Run test suites across all packages**
  Run: `pnpm test`
  Expected: All tests pass.

- [ ] **Step 3: Run format check and linters**
  Run: `pnpm format:check && pnpm lint`
  Expected: Clean pass.

- [ ] **Step 4: Final commit and branch review**
  ```bash
  git status
  ```
