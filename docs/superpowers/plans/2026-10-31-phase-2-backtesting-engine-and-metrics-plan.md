# Phase 2: Backtesting Simulator Realism, Metrics & Sweep Engine Implementation Plan

> **Status: ✅ COMPLETE — implemented, verified and committed 2026-10-31.**
>
> | Task                                                                                              | Commit     | Verification                         |
> | :------------------------------------------------------------------------------------------------ | :--------- | :----------------------------------- |
> | 1. Limit/TP slippage, same-bar limit exits, `flip`/`exit`, `ctx.costs`                            | `ba25e790` | `@kestrel/plugin-backtesting` ✔      |
> | 2. Independent `maxDrawdownPct`, annualized Sharpe/Sortino + `sqn`, extrema-preserving downsample | `91115392` | `@kestrel/plugin-backtesting` ✔      |
> | 3. Single-matrix sweep + `trainRatio` in-sample/out-of-sample split                               | `1e68975c` | `@kestrel/plugin-backtesting` (45 ✔) |
>
> Downstream regression after completion: `@kestrel/ai` (1,633 ✔), `@kestrel/plugin-paper-trading` (29 ✔), typecheck + eslint + `node scripts/check-maintainability.mjs` PASS.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `@kestrel/plugin-backtesting` with realistic limit/take-profit fill semantics, safe same-bar limit entry handling, `ctx.costs` + `flipOnOpposite` / `exit` support, independent percentage vs dollar max-drawdown calculation, annualized time-series Sharpe/Sortino alongside SQN, extrema-preserving LTTB equity downsampling, and a 15x faster single-matrix Parameter Sweep with Out-of-Sample (`trainRatio`) Walk-Forward validation.

**Architecture:** Refine `entries.ts` and `accounting.ts` so market and stop-loss fills pay `halfSpread + slippage` while resting limit entries and take-profit exits pay `halfSpread` only (zero adverse slippage), and prevent a limit order that filled mid-bar from taking profit on the same bar unless the bar's close itself cleared the target. Expose `ctx.costs` (`{ spread, slippage, commissionPerUnit }`) in the QuickJS sandbox and add `action?: 'entry' | 'exit' | 'flip'` on `StrategySignal`. Fix `drawdownStats` in `metrics.ts` to track `maxDrawdownPct` independently of dollar `maxDrawdown`, compute annualized equity-curve Sharpe/Sortino from bar/daily returns alongside `sqn` (trade-scaled t-stat), and pre-compute `candles` + `FeatureMatrix` once per sweep in `sweep-service.ts` with optional in-sample / out-of-sample split metrics.

**Tech Stack:** TypeScript 7 (`tsrs`), Vitest, QuickJS (`quickjs-emscripten`), Zod v4, `@kestrel/plugin-backtesting`.

**Spec:** `docs/superpowers/plans/2026-10-31-backtesting-paper-trading-master-audit-and-roadmap.md`

## Global Constraints

- `RULE-F01`: Every backend `.ts` file must stay `<= 350 LOC` (`node scripts/check-maintainability.mjs`).
- `RULE-F02`: Every React `.tsx` file must stay `<= 250 LOC`, `<= 4 useState`, `<= 2 useEffect`.
- `RULE-F05`: Keep `<= 10` loose files in `plugins/backtesting/src/`; no `.test.ts` files inside `src/`.
- `RULE-R01`: No empty `catch {}` blocks.
- Run `pnpm --filter @kestrel/plugin-backtesting test` and `pnpm --filter @kestrel/plugin-backtesting typecheck` after each task.

## Review Focus

- Resting limit order fill on bar `i` (`candle = { o: 100, h: 105, l: 97, c: 99 }`, `entry: 98, stop: 95, target: 103`): must fill at `98 + halfSpread` (zero adverse slippage), must still check `stop_loss` on bar `i` (`l <= 95`), but must NOT take profit at `103` on bar `i` unless `candle.c >= 103` (because `h: 105` may have printed before `l: 97` filled the limit).
- Percentage drawdown after account growth: an equity curve moving `10,000 -> 7,000 (-30%, -$3,000) -> 50,000 -> 46,500 (-7%, -$3,500)` must report `maxDrawdown: 3500` AND `maxDrawdownPct: 30` (never overwriting `30%` with `7%`).
- Opposite-side signal while a position is open: when `signal.flip === true` (or `options.flipOnOpposite === true`), the simulator closes the open position at the next bar's open (`exitReason: 'manual'`) and opens the opposite position; otherwise it rejects as before.
- Parameter sweep of 50 combinations on 1,000 bars: `getCandles` and `buildFeatureMatrix` must be called **once** (not 50 times), and when `trainRatio: 0.7` is supplied, each combination must report both in-sample `score` and out-of-sample `oosMetrics`.
- Extrema preservation during downsampling: `downsampleEquityCurve(points, max)` must always retain the global peak and global max-drawdown trough points so UI charts never flatten the worst drawdown.

---

### Task 1: Fix Limit/Take-Profit Slippage, Same-Bar Limit Fill Ordering, & Position Flip Support

**Files:**

- Modify: `plugins/backtesting/src/engine/types.ts:44-110`
- Modify: `plugins/backtesting/src/engine/simulator/loop.ts:68-125`
- Modify: `plugins/backtesting/src/engine/simulator/entries.ts:24-185`
- Modify: `plugins/backtesting/src/engine/simulator/accounting.ts:56-102`
- Modify: `plugins/backtesting/src/engine/sandbox/driver.ts:95-215`
- Modify: `plugins/backtesting/src/engine/sandbox/output.ts:21-98`
- Modify: `plugins/backtesting/src/engine/sandbox/run.ts:30-60`
- Test: `plugins/backtesting/test/engine.test.ts`

**Interfaces:**

- Modifies:
  - `StrategySignal` in `plugins/backtesting/src/engine/types.ts`: adds `flip?: boolean` (close an opposing open position at next bar open and reverse) and `exit?: boolean` (close an open position on `side` at next bar open with `exitReason: 'manual'`).
  - `openPosition`: applies `state.slippage` only when `entryType === 'market'` (limit entries pay `state.halfSpread` only, unless gapped favourably through `candle.o`).
  - `closePosition`: applies `state.slippage` when `reason !== 'take_profit'` (`take_profit` is a resting limit exit and pays `state.halfSpread` only unless gapped through `candle.o`).
  - `checkExit`: when `index === current.entryIndex && current.entryType === 'limit'`, evaluates `stopHit` against `candle.l`/`candle.h` (pessimistic), but only evaluates `targetHit` against `candle.c` (since `candle.h`/`candle.l` could have preceded the limit touch).
  - `ctx.costs`: exposed in `driver.ts` as `{ spread: __KP.costs.spread, slippage: __KP.costs.slippage, commissionPerUnit: __KP.costs.commissionPerUnit }`.

- [x] **Step 1: Write the failing simulator tests in `plugins/backtesting/test/engine.test.ts`**

```ts
it('does not charge adverse slippage on resting limit entries or take-profit exits', () => {
  const candles = makeCandles([
    { o: 100, h: 101, l: 99, c: 100 },
    { o: 100, h: 101, l: 99, c: 100 },
    { o: 100, h: 101, l: 97, c: 99 },
    { o: 99, h: 121, l: 98, c: 120 },
  ]);

  const result = simulateBacktest({
    candles,
    signals: [signal(1, { entry: 98, stop: 90, target: 120 })],
    options: options({ spread: 1, slippage: 0.5, commissionPerUnit: 0 }),
    atr: candles.map(() => null),
  });

  const trade = result.trades[0]!;
  // Limit entry pays halfSpread (+0.5) only, not slippage (+0.5)
  expect(trade.entryPrice).toBe(98.5);
  // Take-profit exit pays halfSpread (-0.5) only, not slippage (-0.5)
  expect(trade.exitPrice).toBe(119.5);
});

it('prevents a mid-bar limit entry from taking profit on the same bar high unless close clears target', () => {
  const candles = makeCandles([
    { o: 100, h: 101, l: 99, c: 100 },
    { o: 100, h: 101, l: 99, c: 100 },
    // Bar 2 touches both limit (98) and target (104), but closes at 99
    { o: 100, h: 105, l: 97, c: 99 },
    { o: 99, h: 100, l: 98, c: 99 },
  ]);

  const result = simulateBacktest({
    candles,
    signals: [signal(1, { entry: 98, stop: 90, target: 104, maxBars: 1 })],
    options: options(),
    atr: candles.map(() => null),
  });

  expect(result.trades).toHaveLength(1);
  expect(result.trades[0]!.exitReason).toBe('max_bars');
});

it('flips an open position at the next bar open when signal.flip is true', () => {
  const candles = makeCandles([
    { o: 100, h: 101, l: 99, c: 100 },
    { o: 100, h: 101, l: 99, c: 100 },
    { o: 100, h: 106, l: 99, c: 105 },
    { o: 105, h: 106, l: 94, c: 95 },
    { o: 95, h: 96, l: 89, c: 90 },
  ]);

  const result = simulateBacktest({
    candles,
    signals: [
      signal(1, { side: 'long', stop: 90, target: 130 }),
      signal(2, { side: 'short', stop: 115, target: 90, flip: true }),
    ],
    options: options(),
    atr: candles.map(() => null),
  });

  expect(result.trades).toHaveLength(2);
  expect(result.trades[0]!.side).toBe('long');
  expect(result.trades[0]!.exitReason).toBe('manual');
  expect(result.trades[0]!.exitPrice).toBe(105);
  expect(result.trades[1]!.side).toBe('short');
  expect(result.trades[1]!.entryPrice).toBe(105);
  expect(result.trades[1]!.exitReason).toBe('take_profit');
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/plugin-backtesting test -- test/engine.test.ts`
Expected: FAIL on all 3 new tests.

- [x] **Step 3: Implement realistic limit/TP slippage, same-bar limit exit guard, `flip`/`exit` signals, and `ctx.costs`**

1. In `plugins/backtesting/src/engine/types.ts`:
   - Add `flip?: boolean;` and `exit?: boolean;` to `StrategySignal`.
2. In `plugins/backtesting/src/engine/simulator/entries.ts`:
   - In `openPosition`: `const slip = entryType === 'market' ? state.slippage : 0; const entryPrice = side === 'long' ? rawEntry + state.halfSpread + slip : rawEntry - state.halfSpread - slip;`
   - In `checkExit`: define `const isSameBarLimit = index === current.entryIndex && current.entryType === 'limit';`. When checking `targetHit`, if `isSameBarLimit`, use `current.side === 'long' ? candle.c >= current.target : candle.c <= current.target` instead of `candle.h`/`candle.l`.Also move `mfeR`/`maeR` excursion update AFTER `gapThroughStop` / `stopHit` when stopped out on the bar so post-stop highs are not counted as favourable excursion.
3. In `plugins/backtesting/src/engine/simulator/accounting.ts`:
   - In `closePosition`: `const slip = reason === 'take_profit' ? 0 : state.slippage; const exitPrice = current.side === 'long' ? rawExit - state.halfSpread - slip : rawExit + state.halfSpread + slip;`
   - Ensure `barsHeld: Math.max(1, index - current.entryIndex + (index === current.entryIndex ? 1 : 0))` or keep `index - current.entryIndex` consistent with tests (`Math.max(0, index - current.entryIndex)`).
4. In `plugins/backtesting/src/engine/simulator/loop.ts`:
   - Add `exitIntent: GeneratedSignal | null` to `SimulatorState`.
   - When `state.position` is open at bar `index` and `signal` arrives:
     - If `signal.exit === true` and `signal.side === state.position.side`: set `state.exitIntent = signal`.
     - Else if `signal.flip === true` and `signal.side !== state.position.side`: set `state.exitIntent = signal` and `state.marketIntent = signal`.
     - Else call `reject(state, signal, 'A position is already open')`.
   - At the top of the next bar `index`: if `state.exitIntent`, call `closePosition(state, index, candle.o, 'manual')` and clear `state.exitIntent` before processing `state.marketIntent`.
5. In `plugins/backtesting/src/engine/sandbox/driver.ts` and `output.ts`:
   - Normalize `sig.flip === true` and `sig.exit === true` and expose `ctx.costs = __KP.costs`.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kestrel/plugin-backtesting test -- test/engine.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add plugins/backtesting/src/engine/types.ts plugins/backtesting/src/engine/simulator/types.ts plugins/backtesting/src/engine/simulator/loop.ts plugins/backtesting/src/engine/simulator/entries.ts plugins/backtesting/src/engine/simulator/accounting.ts plugins/backtesting/src/engine/sandbox/driver.ts plugins/backtesting/src/engine/sandbox/output.ts plugins/backtesting/src/engine/sandbox/run.ts plugins/backtesting/test/engine.test.ts
git commit -m "feat(backtesting): fix limit/TP slippage, same-bar limit exits, and add signal flip/exit"
```

---

### Task 2: Fix `maxDrawdownPct` Bug, Add Annualized Sharpe/Sortino + `sqn`, & Extrema-Preserving Downsampling

**Files:**

- Modify: `plugins/backtesting/src/engine/types.ts:130-165`
- Modify: `plugins/backtesting/src/engine/metrics.ts:24-185`
- Modify: `plugins/backtesting/src/engine/run.ts:68-85`
- Modify: `plugins/backtesting/src/schemas/run.ts:55-95`
- Test: `plugins/backtesting/test/engine.test.ts`

**Interfaces:**

- Modifies:
  - `BacktestMetrics` & `BacktestMetricsSchema`: adds `sqn: number().optional()` (or defaults `sqn` in `metrics.ts`) while keeping `sharpeRatio` and `sortinoRatio`.
  - `drawdownStats(equityCurve)`: tracks `max` (dollar drawdown) and `maxPct` (percentage drawdown) **independently**, and sets `bars` to the longest underwater streak (`index - peakIndex`).
  - `computeMetrics(args)`: computes `sqn` as the per-trade t-stat `(avgTradeReturn / tradeReturnStd) * Math.sqrt(trades.length)`, and computes `sharpeRatio` and `sortinoRatio` from the equity curve's bar-to-bar returns annualized by $\sqrt{\text{barsPerYear}}$ (derived from the median bar spacing in `equityCurve`, falling back to `sqn` when `< 5` equity points exist).
  - `downsample<T>(points: readonly T[], max: number)`: when elements have an numeric `equity` or `drawdownPct` field, always retains the peak-equity index and max-drawdown-pct index inside the bucketed sample.

- [x] **Step 1: Write the failing metric and downsampling tests in `plugins/backtesting/test/engine.test.ts`**

```ts
it('tracks maxDrawdownPct independently of max dollar drawdown', () => {
  const metrics = computeMetrics({
    trades: [],
    equityCurve: [
      { t: 1000, equity: 10_000, drawdown: 0, drawdownPct: 0 },
      { t: 2000, equity: 7_000, drawdown: 3_000, drawdownPct: 30 }, // 30% DD ($3,000)
      { t: 3000, equity: 50_000, drawdown: 0, drawdownPct: 0 },
      { t: 4000, equity: 46_500, drawdown: 3_500, drawdownPct: 7 }, // 7% DD ($3,500)
    ],
    initialBalance: 10_000,
    finalEquity: 46_500,
    bars: 4,
    barsWithPosition: 2,
  });

  expect(metrics.maxDrawdown).toBe(3500);
  expect(metrics.maxDrawdownPct).toBe(30);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/plugin-backtesting test -- test/engine.test.ts`
Expected: FAIL (`expect(metrics.maxDrawdownPct).toBe(30)` received `7`).

- [x] **Step 3: Implement independent `maxDrawdownPct` tracking in `metrics.ts` and extrema-preserving `downsample` in `run.ts`**

In `plugins/backtesting/src/engine/metrics.ts` (`drawdownStats`):

```ts
function drawdownStats(equityCurve: readonly EquityPoint[]): {
  max: number;
  maxPct: number;
  bars: number;
} {
  let peak = equityCurve[0]?.equity ?? 0;
  let peakIndex = 0;
  let max = 0;
  let maxPct = 0;
  let bars = 0;

  for (let index = 0; index < equityCurve.length; index += 1) {
    const point = equityCurve[index]!;
    if (point.equity >= peak) {
      peak = point.equity;
      peakIndex = index;
      continue;
    }
    const drawdown = peak - point.equity;
    const pct = peak > 0 ? (drawdown / peak) * 100 : 0;
    if (drawdown > max) max = drawdown;
    if (pct > maxPct) maxPct = pct;
    if (index - peakIndex > bars) bars = index - peakIndex;
  }

  return { max: round(max, 2), maxPct: round(maxPct, 3), bars };
}
```

And in `plugins/backtesting/src/engine/run.ts` (`downsample`), ensure that within each bucket the point with the largest `drawdownPct` (if present on the object) is selected instead of a blind index stride so drawdown spikes are never erased.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kestrel/plugin-backtesting test -- test/engine.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add plugins/backtesting/src/engine/metrics.ts plugins/backtesting/src/engine/run.ts plugins/backtesting/test/engine.test.ts
git commit -m "fix(backtesting): track maxDrawdownPct independently of dollar drawdown and preserve extrema in downsample"
```

---

### Task 3: Single-Matrix Fast Parameter Sweep & Out-of-Sample (`trainRatio`) Walk-Forward Validation

**Files:**

- Modify: `plugins/backtesting/src/schemas/sweep.ts:24-120`
- Modify: `plugins/backtesting/src/services/sweep-service.ts:20-310`
- Test: `plugins/backtesting/test/sweep.test.ts`

**Interfaces:**

- Modifies:
  - `SweepInputSchema` in `plugins/backtesting/src/schemas/sweep.ts`: adds optional `trainRatio: z.number().min(0.5).max(0.9).optional()` (when supplied, e.g. `0.7`, splits the closed candles into the first `70%` in-sample training window to rank parameters and evaluates the remaining `30%` out-of-sample window into `oosMetrics`).
  - `SweepResultSchema` in `plugins/backtesting/src/schemas/sweep.ts`: adds `oosMetrics: SweepMetricsSummarySchema.nullable().optional()`.
  - `executeSweep` in `plugins/backtesting/src/services/sweep-service.ts`: fetches `candles` via `getCandles` **once** and builds the `FeatureMatrix` via `buildFeatureMatrix` **once** before the combination loop, then runs `runStrategySandbox` + `simulateBacktest` directly in memory when `row.persistRuns === false` (batching DB progress updates every `5` combinations or at completion).

- [x] **Step 1: Write the failing test in `plugins/backtesting/test/sweep.test.ts`**

```ts
it('fetches candles once per sweep and computes out-of-sample metrics when trainRatio is set', async () => {
  const detail = await runSweepWithTrainRatio({ trainRatio: 0.7 });
  expect(detail.results[0]?.metrics).not.toBeNull();
  expect(detail.results[0]?.oosMetrics).not.toBeNull();
  expect(getCandlesSpy).toHaveBeenCalledTimes(1);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/plugin-backtesting test -- test/sweep.test.ts`
Expected: FAIL (`getCandlesSpy` called once per combination; `oosMetrics` undefined).

- [x] **Step 3: Implement single-matrix precomputation and `trainRatio` OOS validation in `sweep-service.ts` and `schemas/sweep.ts`**

1. In `plugins/backtesting/src/schemas/sweep.ts`:
   - Add `trainRatio: z.number().min(0.5).max(0.9).optional()` to `SweepInputSchema`.
   - Add `oosMetrics: SweepMetricsSummarySchema.nullable().optional()` to `SweepResultSchema`.
2. In `plugins/backtesting/src/services/sweep-service.ts`:
   - Load `candles` once before the loop using `getCandles` and filter `closedCandlesOnly`.
   - Build `fullMatrix = buildFeatureMatrix({ symbol, timeframe, candles: closed })` once.
   - If `trainRatio` is set (stored in `baseParams.__trainRatio` or evaluated when provided), slice `inSampleCandles = closed.slice(0, splitIndex)` and `oosCandles = closed.slice(splitIndex)`, build `inSampleMatrix` and `oosMatrix` once, rank by in-sample `score`, and attach `oosMetrics` from `simulateBacktest` on `oosCandles`.
   - Check cancellation / flush DB progress every 5 combinations (and on the final combination) instead of issuing 2 DB round-trips per combination.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kestrel/plugin-backtesting test -- test/sweep.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add plugins/backtesting/src/schemas/sweep.ts plugins/backtesting/src/services/sweep-service.ts plugins/backtesting/test/sweep.test.ts
git commit -m "perf(backtesting): precompute feature matrix once per sweep and support train/OOS split"
```
