# Phase 1: Market Data, BiQuote Integration & Causal Feature Matrix Implementation Plan

> **Status: ✅ COMPLETE — implemented, verified and committed 2026-10-31.**
>
> | Task                                                              | Commit     | Verification                                                   |
> | :---------------------------------------------------------------- | :--------- | :------------------------------------------------------------- |
> | 1. BiQuote bid/ask spread & `stale` passthrough                   | `c910eff8` | `@kestrel/data` (181 ✔), `@kestrel/shared` (443 ✔)             |
> | 2. `tickVolume` → `Candle.v` + BiQuote crypto failover            | `d10a367f` | `@kestrel/data` ✔, `@kestrel/shared` ✔                         |
> | 3. OHLC pagination up to 5,000 bars (BiQuote + Binance)           | `66fd1086` | `@kestrel/data` ✔                                              |
> | 4. Causal order blocks, single-consumption sweeps, daily UTC VWAP | `f3969965` | `@kestrel/indicators` (102 ✔), `@kestrel/plugin-backtesting` ✔ |
>
> Downstream regression after completion: `@kestrel/ai` (1,633 ✔), `apps/worker` (168 ✔), `@kestrel/plugin-paper-trading` (29 ✔), `node scripts/check-maintainability.mjs` PASS.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve real BiQuote bid/ask spreads, market-state/staleness flags, and tick volume across `@kestrel/data`, enable multi-window OHLC pagination up to 5,000 bars and BiQuote crypto fallback, and eliminate non-causal Order Block truncation and unanchored VWAP bugs in `@kestrel/indicators` and `@kestrel/plugin-backtesting`.

**Architecture:** Extend `ProviderPriceSnapshot` and `TickSchema` to carry `bid`, `ask`, and `stale` verbatim from BiQuote REST responses instead of collapsing to `mid`. Update `toCandleFromBiquote` to fall back to `tickVolume` when real `volume` is `0` (all FX/Gold on MT5) and paginate `fetchOhlc` / `binance.fetchCandles` backward via `to`/`endTime` cursors when `count > 1000`. Remove the non-causal `prune(out, 10)` end-of-series truncation from `detectOrderBlocks`, consume swept swings once in `detectLiquiditySweeps`, pass causal ATR(14) into SMC detectors, and reset `VWAP` at each UTC day boundary in `ta-features.ts`.

**Tech Stack:** TypeScript 7 (`tsrs`), Vitest, Zod v4, `trading-signals`, `@kestrel/shared`, `@kestrel/data`, `@kestrel/indicators`, `@kestrel/plugin-backtesting`.

**Spec:** `docs/superpowers/plans/2026-10-31-backtesting-paper-trading-master-audit-and-roadmap.md`

## Global Constraints

- `RULE-F01`: Every backend `.ts` file must stay `<= 350 LOC` (`node scripts/check-maintainability.mjs`).
- `RULE-F04`: Static catalog files (`packages/shared/src/symbol-catalog/*`) must stay `<= 500 LOC`.
- `RULE-F05`: Keep `<= 10` loose files in package `src/` roots; never place `.test.ts` files inside `src/`.
- `RULE-R01`: Never write an empty `catch {}` block without a comment or handler.
- Run `pnpm --filter <pkg> test` and `pnpm --filter <pkg> typecheck` after each task.

## Review Focus

- BiQuote REST quote when `bid > 0 && ask > bid`: `getPrice` / `getPrices` must return the real `bid` and `ask` (not `bid = ask = mid`), and preserve `marketState` and `stale`.
- BiQuote FX/Gold OHLC bar with `volume: 0, tickVolume: 340`: `toCandleFromBiquote` must map `v: 340` so downstream `vwap`, `mfi14`, `obv`, and `volumeSma20` produce finite numbers instead of `null`/`0`.
- Multi-page OHLC fetch with `count: 2500`: `fetchOhlc` must page backward using the oldest bar's timestamp minus 1ms, deduplicate overlapping timestamps, and stop gracefully when upstream has no older bars.
- Causal Order Block invariance: running `buildFeatureMatrix` on 500 bars with `> 15` bearish and bullish order blocks vs truncating to the first 250 bars must produce identical `smc.obBullTop` / `smc.obBearTop` values on bars `0..249`.
- Daily session VWAP reset: `series.vwap` in `ta-features.ts` must reset its cumulative price-volume accumulator at `00:00 UTC` each day so bar 0's start date never shifts later days' VWAP.

---

### Task 1: Preserve BiQuote Bid/Ask Spread & Staleness in `@kestrel/shared` and `@kestrel/data`

**Files:**

- Modify: `packages/shared/src/schemas/tick.ts:20-35`
- Modify: `packages/data/src/providers/provider-registry.ts:44-58`
- Modify: `packages/data/src/providers/provider-adapters.ts:95-145`
- Modify: `packages/data/src/adapters/price.ts:80-92`
- Test: `packages/data/test/price-adapter.test.ts`

**Interfaces:**

- Produces:
  - `TickSchema` in `@kestrel/shared`: adds `stale: z.boolean().optional()`
  - `ProviderPriceSnapshot` in `@kestrel/data`: adds `bid?: number; ask?: number; stale?: boolean;`
  - `snapshotToTick(symbol: Symbol, value: ProviderPriceSnapshot, fetchedAt: number): Tick` uses `value.bid ?? value.price` and `value.ask ?? value.price`

- [x] **Step 1: Write the failing test in `packages/data/test/price-adapter.test.ts`**

```ts
it('preserves real bid, ask, marketState and stale flags from biquote ticks', async () => {
  const res = await getPriceWithMeta('XAUUSD', {
    apiKeys: { biquoteBaseUrl: 'https://biquote.test' },
  });
  expect(res.tick.bid).toBeLessThan(res.tick.ask);
  expect(res.tick.mid).toBeCloseTo((res.tick.bid + res.tick.ask) / 2, 5);
  expect(res.tick.marketState).toBe('open');
  expect(res.tick.stale).toBe(false);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/data test -- test/price-adapter.test.ts`
Expected: FAIL with `expect(received).toBeLessThan(expected)` because `bid === ask === mid`.

- [x] **Step 3: Implement `bid`, `ask`, and `stale` passthrough in `tick.ts`, `provider-registry.ts`, `provider-adapters.ts`, and `price.ts`**

In `packages/shared/src/schemas/tick.ts`, add `stale: z.boolean().optional()` to `TickSchema`.
In `packages/data/src/providers/provider-registry.ts`, add `bid?: number; ask?: number; stale?: boolean;` to `ProviderPriceSnapshot`.
In `packages/data/src/providers/provider-adapters.ts` (`biquoteProvider.fetchPrice` and `fetchPrices`), include `bid: tick.bid`, `ask: tick.ask`, and `...(tick.stale !== undefined ? { stale: tick.stale } : {})`.
In `packages/data/src/adapters/price.ts` (`snapshotToTick` and `getPriceWithMeta`), set `bid: value.bid ?? value.price`, `ask: value.ask ?? value.price`, and forward `stale`.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kestrel/data test -- test/price-adapter.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/tick.ts packages/data/src/providers/provider-registry.ts packages/data/src/providers/provider-adapters.ts packages/data/src/adapters/price.ts packages/data/test/price-adapter.test.ts
git commit -m "feat(data): preserve biquote bid/ask spread and stale metadata on ticks"
```

---

### Task 2: Map BiQuote `tickVolume` to `Candle.v` & Enable Crypto Fallback Mapping

**Files:**

- Modify: `packages/data/src/providers/to-candle.ts:52-76`
- Modify: `packages/shared/src/symbol-catalog/definitions-crypto.ts:24-150`
- Modify: `packages/shared/src/symbol-catalog/catalog.ts:152-170`
- Modify: `packages/data/src/providers/provider-adapters.ts:165-169,280-285`
- Test: `packages/data/test/to-candle.test.ts`
- Test: `packages/shared/test/symbol-catalog.test.ts`

**Interfaces:**

- Consumes: `BiquoteOhlcBar` from `@kestrel/shared` (`volume: number`, `tickVolume?: number`)
- Produces:
  - `toCandleFromBiquote(bar: BiquoteOhlcBar, opts)` sets `v: bar.volume > 0 ? bar.volume : (bar.tickVolume && bar.tickVolume > 0 ? bar.tickVolume : null)`
  - Crypto `SymbolDefinition` entries in `definitions-crypto.ts` set `biquote: 'BTCUSD' | 'ETHUSD' | 'SOLUSD' | 'BNBUSD' | 'XRPUSD' | 'ADAUSD'` and `providers: ['binance', 'biquote', 'finnhub']`
  - `buildProviderList()` registers `[liveTicksProvider, binanceProvider, biquoteProvider, finnhubProvider]` so Binance remains primary for crypto and BiQuote isprimary for FX/Gold while serving as automatic failover for crypto.

- [x] **Step 1: Write the failing tests in `packages/data/test/to-candle.test.ts`**

```ts
it('uses tickVolume when FX/Gold real volume is zero on BiQuote bars', () => {
  const candle = toCandleFromBiquote(
    {
      openTime: '2026-02-24T12:00:00Z',
      open: 2650.1,
      high: 2655.0,
      low: 2648.5,
      close: 2653.2,
      volume: 0,
      tickVolume: 412,
    },
    { symbol: 'XAUUSD', tf: '1h', fetchedAt: 1771934400000 },
  );
  expect(candle.v).toBe(412);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/data test -- test/to-candle.test.ts`
Expected: FAIL with `expected null to be 412`.

- [x] **Step 3: Implement `tickVolume` fallback in `to-candle.ts` and BiQuote crypto fallback in `definitions-crypto.ts`, `catalog.ts`, and `provider-adapters.ts`**

In `packages/data/src/providers/to-candle.ts`, add `tickVolume?: number` to `BiquoteOhlcBar` and compute:
`const volume = bar.volume > 0 ? bar.volume : (bar.tickVolume ?? 0) > 0 ? bar.tickVolume! : null;`
In `packages/shared/src/symbol-catalog/definitions-crypto.ts`, populate `biquote: 'BTCUSD'` (and `'ETHUSD'`, `'SOLUSD'`, `'BNBUSD'`, `'XRPUSD'`, `'ADAUSD'`) and include `'biquote'` in `providers`. Update `assertSymbolCatalog()` in `packages/shared/src/symbol-catalog/catalog.ts` to allow crypto symbols to define both `binance` and `biquote`. In `packages/data/src/providers/provider-adapters.ts`, update `biquoteProvider.supports` to check `Boolean(def?.biquote) && (!tf || tf !== '1w')`, and order `buildProviderList()` as `[liveTicksProvider, binanceProvider, biquoteProvider, finnhubProvider]`.

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kestrel/shared test && pnpm --filter @kestrel/data test -- test/to-candle.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/data/src/providers/to-candle.ts packages/shared/src/symbol-catalog/definitions-crypto.ts packages/shared/src/symbol-catalog/catalog.ts packages/data/src/providers/provider-adapters.ts packages/data/test/to-candle.test.ts packages/shared/test/symbol-catalog.test.ts
git commit -m "feat(data): use biquote tickVolume fallback for FX/gold and enable crypto failover"
```

---

### Task 3: Multi-Window OHLC Pagination (`count > 1000` up to `5000`) in BiQuote & Binance Providers

**Files:**

- Modify: `packages/data/src/providers/biquote/rest/ohlc.ts:55-120`
- Modify: `packages/data/src/providers/provider-adapters.ts:146-164,256-267`
- Modify: `packages/data/src/providers/binance/rest.ts:116-142`
- Test: `packages/data/test/biquote-rest.test.ts`

**Interfaces:**

- Produces:
  - `fetchOhlc(args: FetchOhlcArgs): Promise<BiquoteOhlcBar[]>` supports `args.count` up to `5000` by fetching up to 5 sequential pages (`limit=1000`) backward using `to = new Date(Date.parse(oldestBar.openTime) - 1).toISOString()`, deduplicating by `openTime`, and stopping early when a page returns `< 2` new bars or reaches `args.from`.
  - `binance.fetchCandles(symbol, tf, count, opts)` supports `count` up to `5000` via `endTime = String(oldestBar.t - 1)` pagination.

- [x] **Step 1: Write the failing test in `packages/data/test/biquote-rest.test.ts`**

```ts
it('paginates backward when count > 1000 and deduplicates bars in ascending order', async () => {
  // Stub 2 pages of 1000 bars each and request count: 1500
  const bars = await fetchOhlc({
    symbol: 'XAUUSD',
    tf: '1h',
    count: 1500,
    baseUrl: 'https://biquote.test',
    skipThrottle: true,
  });
  expect(bars).toHaveLength(1500);
  expect(Date.parse(bars[0]!.openTime)).toBeLessThan(Date.parse(bars[1499]!.openTime));
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/data test -- test/biquote-rest.test.ts`
Expected: FAIL with `expected length 1500 but got 999` (or `1000`).

- [x] **Step 3: Implement backward cursor pagination in `biquote/rest/ohlc.ts`, `binance/rest.ts`, and remove the `Math.min(count, 1000)` cap in `provider-adapters.ts`**

In `packages/data/src/providers/biquote/rest/ohlc.ts`, cap `targetCount = Math.max(1, Math.min(args.count, 5000))` and loop up to `MAX_PAGES = 6`:

- On page 0, pass `to: args.to` and `limit: String(Math.min(1000, targetCount + (args.includeOpenBar ? 0 : 1)))`.
- On subsequent pages while `collected.size < targetCount`, pass `to: new Date(oldestMs - 1).toISOString()` and `limit: String(Math.min(1000, targetCount - collected.size + 1))`.
- Break if upstream returns `0` bars, or `oldestMs` does not decrease, or `args.from && oldestMs <= Date.parse(args.from)`.
- Return the last `targetCount` closed (or open-included) bars in strict ascending `openTime` order.
  Apply the same `endTime` loop in `packages/data/src/providers/binance/rest.ts` and pass `count` uncapped (up to `5000`) from `biquoteProvider.fetchCandles` in `provider-adapters.ts`.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kestrel/data test -- test/biquote-rest.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/data/src/providers/biquote/rest/ohlc.ts packages/data/src/providers/binance/rest.ts packages/data/src/providers/provider-adapters.ts packages/data/test/biquote-rest.test.ts
git commit -m "feat(data): paginate biquote and binance OHLC requests up to 5000 bars"
```

---

### Task 4: Fix Non-Causal Order Block Truncation, Repeat Sweeps, & Daily Session VWAP

**Files:**

- Modify: `packages/indicators/src/smc/order-blocks.ts:30-95`
- Modify: `packages/indicators/src/smc/liquidity.ts:24-92`
- Modify: `plugins/backtesting/src/engine/smc-features.ts:80-125`
- Modify: `plugins/backtesting/src/engine/ta-features.ts:43-135`
- Test: `plugins/backtesting/test/engine.test.ts`

**Interfaces:**

- Modifies:
  - `DetectOrderBlocksOptions`: adds `maxPerSide?: number | null` (defaults to `10` for chart UI, `null` when called from `smc-features.ts` so backtests never drop historical order blocks based on future bars) and `atrSeries?: readonly (number | null)[]`.
  - `DetectLiquiditySweepsOptions`: adds `atrSeries?: readonly (number | null)[]` and tracks `sweptHighIndices: Set<number>` / `sweptLowIndices: Set<number>` so each swing pivot can be swept at most once.
  - `applyTaFeatures(matrix, candles)`: resets `vwap = new VWAP()` whenever the UTC day key `Math.floor(candle.t / 86_400_000)` changes.

- [x] **Step 1: Write the failing causality & session-VWAP tests in `plugins/backtesting/test/engine.test.ts`**

```ts
it('keeps order blocks causal when more than 10 order blocks form across the series', () => {
  // Construct 400 alternating impulse candles producing > 25 bullish and bearish OBs
  const bars: { o: number; h: number; l: number; c: number }[] = [];
  let price = 2000;
  for (let i = 0; i < 400; i += 1) {
    const mod = i % 6;
    if (mod === 0) {
      bars.push({ o: price + 2, h: price + 3, l: price - 2, c: price - 1 });
    } else if (mod === 1 || mod === 2) {
      price += 3;
      bars.push({ o: price - 3, h: price + 1, l: price - 3, c: price });
    } else if (mod === 3) {
      bars.push({ o: price - 2, h: price + 2, l: price - 3, c: price + 1 });
    } else {
      price -= 2.5;
      bars.push({ o: price + 2.5, h: price + 3, l: price - 1, c: price });
    }
  }
  const full = makeCandles(bars);
  const prefix = full.slice(0, 180);

  const fullMatrix = buildFeatureMatrix({ symbol: 'XAUUSD', timeframe: '1h', candles: full });
  const prefixMatrix = buildFeatureMatrix({ symbol: 'XAUUSD', timeframe: '1h', candles: prefix });

  expect(prefixMatrix.smc.obBullTop).toEqual(fullMatrix.smc.obBullTop.slice(0, 180));
  expect(prefixMatrix.smc.obBearTop).toEqual(fullMatrix.smc.obBearTop.slice(0, 180));
  expect(fullMatrix.smc.obBullStrength.some((s) => s > 0)).toBe(true);
});

it('resets VWAP at the UTC day boundary so later days do not depend on earlier start bars', () => {
  const full = waveCandles(120, 60 * 60 * 1000); // 5 days of 1h bars
  const sliced = full.slice(24); // drop day 1
  const mFull = buildFeatureMatrix({ symbol: 'XAUUSD', timeframe: '1h', candles: full });
  const mSliced = buildFeatureMatrix({ symbol: 'XAUUSD', timeframe: '1h', candles: sliced });
  expect(mSliced.series.vwap.slice(24)).toEqual(mFull.series.vwap.slice(48));
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/plugin-backtesting test -- test/engine.test.ts`
Expected: FAIL on both tests (`obBullTop` differs on prefix vs full; `vwap` differs when day 1 is dropped).

- [x] **Step 3: Implement causal Order Blocks, single-consumption Sweeps, per-bar ATR scoring, and daily UTC VWAP reset**

1. In `packages/indicators/src/smc/order-blocks.ts`:
   - Add `maxPerSide?: number | null` and `atrSeries?: readonly (number | null)[]` to `DetectOrderBlocksOptions`.
   - Use `const barAtr = opts.atrSeries?.[i + impulse] ?? atr14;` when calling `computeStrength`.
   - If `opts.maxPerSide === null`, return `out` without calling `prune(out, 10)`; otherwise call `prune(out, opts.maxPerSide ?? 10)`.
2. In `packages/indicators/src/smc/liquidity.ts`:
   - Add `atrSeries?: readonly (number | null)[]` to `DetectLiquiditySweepsOptions`.
   - Track `const sweptHighs = new Set<number>()` and `const sweptLows = new Set<number>()` so once a swing high/low is swept (or broken by a close beyond `sw.price`), it is added to the set and skipped on later bars.
   - Use `const barAtr = opts.atrSeries?.[i] ?? atr14;` for `magnitude`.
3. In `plugins/backtesting/src/engine/smc-features.ts`:
   - Pass `orderBlocks: { maxPerSide: null, atrSeries: matrix.series.atr14 }` and `liquidity: { atrSeries: matrix.series.atr14 }` to `computeStructure`.
4. In `plugins/backtesting/src/engine/ta-features.ts`:
   - Track `let currentDay = -1; let vwap = new VWAP();`. Inside the bar loop, compute `const day = Math.floor(candle.t / 86_400_000); if (day !== currentDay) { currentDay = day; vwap = new VWAP(); }` before calling `vwap.update(ohlcv, false)`.

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kestrel/indicators test && pnpm --filter @kestrel/plugin-backtesting test`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/indicators/src/smc/order-blocks.ts packages/indicators/src/smc/liquidity.ts plugins/backtesting/src/engine/smc-features.ts plugins/backtesting/src/engine/ta-features.ts plugins/backtesting/test/engine.test.ts
git commit -m "fix(backtesting,indicators): make order blocks, sweeps, and daily VWAP strictly causal"
```
