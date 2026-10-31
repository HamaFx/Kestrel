# Phase 3: Paper Trading Atomic Execution, Market-State Guards & Backtest Parity Implementation Plan

> **Status: ⏳ NOT STARTED.** Phase 1 (`c910eff8`…`f3969965`) and Phase 2 (`ba25e790`…`1e68975c`) are complete; this plan is next in the queue and all checkboxes below are open.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate race conditions and double-fills in `@kestrel/plugin-paper-trading`, block market fills and stop triggers on closed or stale market quotes, fix `rMultiple` corruption after stop-loss modifications, remove adverse slippage from Take-Profit limit exits, and achieve 100% Backtest-to-Paper execution parity in `strategy-runner.ts` (`entry` limit orders, `validBars`, `maxBars`, `breakEvenAtR`, and `trailing` modes).

**Architecture:** Replace read-modify-write balance updates with atomic SQL `balance = balance + delta` (`incrementAccountBalance`) and guard position closes (`WHERE status = 'open'`) and pending order fills (`WHERE status = 'pending'`) at the database query boundary. Propagate `marketState`, `stale`, and `quoteAgeSeconds` into `MarketTick` so `placeOrderForUser` and `processQuotesForUser` reject/skip execution when a market is closed or a quote is stale. Fix `evaluatePosition` in `domain/evaluation.ts` to compute `rMultiple` from `initialRiskAmount` rather than the mutable `stopLoss`. Upgrade `strategy-runner.ts` to translate every `StrategySignal` field (`entry`, `validBars`, `maxBars`, `breakEvenAtR`, `trailing`, `flip`/`exit`) into matching paper orders and position maintenance actions.

**Tech Stack:** TypeScript 7 (`tsrs`), Vitest, Drizzle ORM, PostgreSQL RLS, `@kestrel/plugin-paper-trading`, `@kestrel/plugin-backtesting`.

**Spec:** `docs/superpowers/plans/2026-10-31-backtesting-paper-trading-master-audit-and-roadmap.md`

## Global Constraints

- `RULE-F01`: Every backend `.ts` file must stay `<= 350 LOC` (`node scripts/check-maintainability.mjs`).
- `RULE-F02`: Every React `.tsx` file must stay `<= 250 LOC`, `<= 4 useState`, `<= 2 useEffect`.
- `RULE-F05`: Keep `<= 10` loose files in `plugins/paper-trading/src/`; no `.test.ts` files inside `src/`.
- `RULE-R01`: No empty `catch {}` blocks.
- Run `pnpm --filter @kestrel/plugin-paper-trading test` and `pnpm --filter @kestrel/plugin-paper-trading typecheck` after each task.

## Review Focus

- Concurrent position close / order fill race: when `paperTickSubscriber` and `paperMarketWatchJob` (or manual close) evaluate the same open position or pending order simultaneously, only one caller may transition the row and credit `paper_accounts.balance`.
- Stale / closed market quote: when `tick.marketState === 'closed'` or `tick.stale === true` (or `quoteAgeSeconds > 300`), market order placement must throw a clear user-facing error (`Market is currently closed or quote is stale`), while resting limit/stop order placement is allowed to rest without filling until the market opens.
- Stop-loss moved to breakeven (`stopLoss === entryPrice`): `evaluatePosition` must still compute `rMultiple` from `position.initialRiskAmount` (`unrealizedGrossPnl / initialRiskAmount`), never dividing by `0` or returning `0`.
- Take-profit exit fill price: when `evaluatePosition` triggers `reason: 'take_profit'`, `processQuotesForUser` must fill at `evaluation.close.price` without subtracting adverse `slippage` (`exitWithSlippage` applies only to `stop_loss`, `trailing_stop`, and `manual` market closes).
- Deployed backtest strategy parity: a strategy returning `{ side: 'long', entry: 2640, stop: 2630, target: 2660, breakEvenAtR: 1, trailing: { type: 'atr', value: 1.5 }, validBars: 5, maxBars: 20 }` in `strategy-runner.ts` must place a `limit` order at `2640` with `expiresAt = barTime + 5 * barMs`, `breakEvenAtR: 1`, and `trailingStop: 1.5 * latestAtr`, and automatically close the open position when `barsHeld >= 20`.

---

### Task 1: Fix `rMultiple` Corruption After Stop Move & Take-Profit Slippage in Paper Domain

**Files:**

- Modify: `plugins/paper-trading/src/domain/types.ts:34-44`
- Modify: `plugins/paper-trading/src/domain/evaluation.ts:48-95`
- Modify: `plugins/paper-trading/src/services/fill-engine.ts:155-175`
- Test: `plugins/paper-trading/test/domain.test.ts`

**Interfaces:**

- Modifies:
  - `MarketTick` in `plugins/paper-trading/src/domain/types.ts`: adds `marketState?: 'open' | 'closed'; stale?: boolean; quoteAgeSeconds?: number | null;`
  - `evaluatePosition(position: PaperPositionState, quotes: Quotes): PositionEvaluation`: computes `gross = (markPrice - entry) * direction * position.quantity * contractSizeFor(position.symbol)` and computes `rMultiple` using `position.initialRiskAmount > 0 ? round(gross / position.initialRiskAmount, 4) : (initialStopDistance > 0 ? round(((markPrice - entry) * direction) / initialStopDistance, 4) : 0)`.
  - `processQuotesForUser`: applies `exitWithSlippage` only when `evaluation.close.reason !== 'take_profit'`.

- [ ] **Step 1: Write the failing tests in `plugins/paper-trading/test/domain.test.ts`**

```ts
it('preserves rMultiple using initialRiskAmount after stopLoss is moved to breakeven', () => {
  // Position opened at 2000 with initial stop 1990 (initialRiskAmount = $1000 on 1 lot XAUUSD),
  // then modified so stopLoss = 2000 (breakeven).
  const evaluation = evaluatePosition(
    position({ entryPrice: 2000, stopLoss: 2000, initialRiskAmount: 1000 }),
    { bid: 2015, ask: 2015.2, mid: 2015.1 },
  );
  expect(evaluation.rMultiple).toBeCloseTo(1.51, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/plugin-paper-trading test -- test/domain.test.ts`
Expected: FAIL (`expect(evaluation.rMultiple).toBeCloseTo(1.51, 2)` received `0`).

- [ ] **Step 3: Implement `initialRiskAmount`-based `rMultiple` in `domain/evaluation.ts` and skip slippage on `take_profit` in `services/fill-engine.ts`**

In `plugins/paper-trading/src/domain/evaluation.ts`:

```ts
const contractSize = contractSizeFor(position.symbol);
const gross = (markPrice - entry) * direction * position.quantity * contractSize;
const unrealizedPnl = round(gross - position.entryFee, 2);
const initialStopDistance = position.stopLoss !== null ? Math.abs(entry - position.stopLoss) : 0;
const rMultiple =
  position.initialRiskAmount > 0
    ? round(gross / position.initialRiskAmount, 4)
    : initialStopDistance > 0
      ? round(((markPrice - entry) * direction) / initialStopDistance, 4)
      : 0;
```

In `plugins/paper-trading/src/services/fill-engine.ts` (`processQuotesForUser`):

```ts
const exitPrice =
  evaluation.close.reason === 'take_profit'
    ? evaluation.close.price
    : exitWithSlippage(position, evaluation.close.price, args.settings);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kestrel/plugin-paper-trading test -- test/domain.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add plugins/paper-trading/src/domain/types.ts plugins/paper-trading/src/domain/evaluation.ts plugins/paper-trading/src/services/fill-engine.ts plugins/paper-trading/test/domain.test.ts
git commit -m "fix(paper-trading): preserve rMultiple after breakeven stop move and remove TP slippage"
```

---

### Task 2: Atomic SQL Balance Increments, Claim Guards, & Closed/Stale Market Protection

**Files:**

- Modify: `plugins/paper-trading/src/db/queries/accounts.ts:75-92`
- Modify: `plugins/paper-trading/src/db/queries/orders.ts:130-152`
- Modify: `plugins/paper-trading/src/db/queries/positions.ts:150-175`
- Modify: `plugins/paper-trading/src/services/pricing.ts:34-55`
- Modify: `plugins/paper-trading/src/services/position-lifecycle.ts:45-138`
- Modify: `plugins/paper-trading/src/services/fill-engine.ts:32-195`
- Modify: `plugins/paper-trading/src/services/trading.ts:55-155`
- Test: `plugins/paper-trading/test/plugin.test.ts`

**Interfaces:**

- Produces:
  - `incrementAccountBalance(userId: string, accountId: string, delta: number): Promise<PaperAccountRow | undefined>` in `db/queries/accounts.ts` using `sql\`${paperAccounts.balance} + ${delta}\``.
  - `claimPendingOrder(userId: string, orderId: string, patch: OrderPatch): Promise<PaperOrderRow | undefined>` in `db/queries/orders.ts` with `and(eq(paperOrders.userId, userId), eq(paperOrders.id, orderId), eq(paperOrders.status, 'pending'))`.
  - `updateOpenPosition(userId: string, positionId: string, patch: PositionPatch): Promise<PaperPositionRow | undefined>` in `db/queries/positions.ts` with `and(eq(paperPositions.userId, userId), eq(paperPositions.id, positionId), eq(paperPositions.status, 'open'))`.
  - `isTickTradable(tick: MarketTick): { ok: true } | { ok: false; reason: string }` in `services/pricing.ts`: returns `{ ok: false }` when `tick.marketState === 'closed' || tick.stale === true || (typeof tick.quoteAgeSeconds === 'number' && tick.quoteAgeSeconds > 300)`.

- [ ] **Step 1: Write the failing test in `plugins/paper-trading/test/domain.test.ts` (or `plugin.test.ts`)**

```ts
it('rejects market execution on closed or stale ticks while allowing resting orders', () => {
  expect(
    isTickTradable({
      symbol: 'XAUUSD',
      bid: 2650,
      ask: 2650.2,
      mid: 2650.1,
      ts: Date.now(),
      marketState: 'closed',
    }),
  ).toEqual({
    ok: false,
    reason:
      'Market for XAUUSD is currently closed; market orders cannot fill until the session opens.',
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/plugin-paper-trading test`
Expected: FAIL (`isTickTradable is not a function`).

- [ ] **Step 3: Implement atomic DB queries and `isTickTradable` guards**

1. In `plugins/paper-trading/src/db/queries/accounts.ts`, add `incrementAccountBalance` using `sql\`${paperAccounts.balance} + ${delta}\``.
2. In `plugins/paper-trading/src/db/queries/positions.ts`, add `updateOpenPosition` filtering by `eq(paperPositions.status, 'open')`.
3. In `plugins/paper-trading/src/db/queries/orders.ts`, add `claimPendingOrder` filtering by `eq(paperOrders.status, 'pending')`.
4. In `plugins/paper-trading/src/services/position-lifecycle.ts` (`applyClose`), call `updateOpenPosition` FIRST; if it returns `undefined` (already closed by a concurrent tick), return early without inserting a duplicate fill or crediting balance. Use `incrementAccountBalance(args.userId, args.account.id, pnl)` instead of `setAccountBalance`.
5. In `plugins/paper-trading/src/services/fill-engine.ts` (`fillOrder` and `processQuotesForUser`), skip quotes where `!isTickTradable(tick).ok`, and claim the pending order with `claimPendingOrder` before calling `createPosition`.
6. In `plugins/paper-trading/src/services/trading.ts` (`placeOrderForUser`), if `args.input.type === 'market'` and `!isTickTradable(tick).ok`, throw `new Error(tradable.reason)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kestrel/plugin-paper-trading test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add plugins/paper-trading/src/db/queries/accounts.ts plugins/paper-trading/src/db/queries/orders.ts plugins/paper-trading/src/db/queries/positions.ts plugins/paper-trading/src/services/pricing.ts plugins/paper-trading/src/services/position-lifecycle.ts plugins/paper-trading/src/services/fill-engine.ts plugins/paper-trading/src/services/trading.ts plugins/paper-trading/test/domain.test.ts
git commit -m "fix(paper-trading): enforce atomic balance/status updates and block closed-market fills"
```

---

### Task 3: Full Backtest-to-Paper Signal Parity in `strategy-runner.ts`

**Files:**

- Modify: `plugins/paper-trading/src/strategy-runner.ts:35-215`
- Modify: `plugins/paper-trading/src/db/queries/orders.ts:95-130`
- Test: `plugins/paper-trading/test/strategy-runner.test.ts`

**Interfaces:**

- Modifies:
  - `LatestStrategySignal` in `plugins/paper-trading/src/strategy-runner.ts`: adds `latestAtr: number | null; latestClose: number;`
  - `evaluateLatestStrategySignal`: returns `latestAtr: matrix.series.atr14.at(-1) ?? null` and `latestClose: closed[lastIndex]!.c`.
  - `runOneStrategy`:
    1. **Time-stop (`maxBars`) enforcement**: If `openPosition` exists and `Math.floor((evaluation.barTime - openPosition.entryTime.getTime()) / barMs) >= maxBarsFromNotesOrDefault`, closes the position (`reason: 'max_bars'`).
    2. **Dynamic trailing-stop (`atr` / `percent` / `fixed`) & `breakEvenAtR` forwarding**: Converts `signal.trailing` (`atr` -> `signal.trailing.value * latestAtr`, `percent` -> `(latestClose * signal.trailing.value) / 100`, `fixed` -> `signal.trailing.value`) into `trailingStop: number` and passes `breakEvenAtR: signal.breakEvenAtR` to `placeOrderForUser`.
    3. **Limit entry (`signal.entry`) & `validBars` expiry**: When `typeof signal.entry === 'number'`, places `type: 'limit'`, `price: signal.entry`, and sets order expiry after `signal.validBars ?? 5` bars (cancelling any stale pending strategy order first).
    4. **Opposite-signal parity**: Only closes an opposing open position on signal if `signal.flip === true` (matching the backtester's rule that an open position blocks new signals unless `flip: true`, and when `flip: true` it closes the old position AND opens the new position).

- [ ] **Step 1: Write the failing parity tests in `plugins/paper-trading/test/strategy-runner.test.ts`**

```ts
it('translates limit entry, ATR trailing stop, and breakEvenAtR from getSignal into the paper order', async () => {
  const result = await evaluateLatestStrategySignal({
    symbol: 'XAUUSD',
    timeframe: '1h',
    source: `
      function getSignal(ctx) {
        if (ctx.i !== ctx.bars - 1) return null;
        return {
          side: 'long',
          entry: ctx.close - 5,
          stop: ctx.close - 15,
          target: ctx.close + 25,
          breakEvenAtR: 1.5,
          trailing: { type: 'atr', value: 2 },
          validBars: 4,
          maxBars: 12,
        };
      }
    `,
    params: {},
  });

  expect(result.signal?.entry).toBeTypeOf('number');
  expect(result.latestAtr).toBeGreaterThan(0);
  expect(result.signal?.trailing).toEqual({ type: 'atr', value: 2 });
  expect(result.signal?.breakEvenAtR).toBe(1.5);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/plugin-paper-trading test -- test/strategy-runner.test.ts`
Expected: FAIL (`result.latestAtr` is `undefined`).

- [ ] **Step 3: Implement full signal translation in `plugins/paper-trading/src/strategy-runner.ts`**

1. In `evaluateLatestStrategySignal`: compute `const latestAtr = matrix.series.atr14[lastIndex] ?? null;` and `const latestClose = closed[lastIndex]!.c;` and return both on `LatestStrategySignal`.
2. Add helper `resolveTrailingDistance(signal: StrategySignal, latestAtr: number | null, latestClose: number): number | undefined`:
   - If `!signal.trailing` return `undefined`.
   - If `signal.trailing.type === 'atr'`, return `latestAtr && latestAtr > 0 ? signal.trailing.value * latestAtr : undefined`.
   - If `signal.trailing.type === 'percent'`, return `(latestClose * signal.trailing.value) / 100`.
   - Return `signal.trailing.value`.
3. In `runOneStrategy`:
   - Check if `openPosition` has exceeded `maxBars` (stored in position notes tag `[maxBars:N]` or default `100` bars) and close if elapsed.
   - If `evaluation.signal` is present:
     - If `openPosition` exists and `openPosition.side !== evaluation.signal.side`: only close + reverse when `evaluation.signal.flip === true` (or `evaluation.signal.exit === true`); otherwise keep the open position (matching backtesting).
     - When placing a new order via `placeOrderForUser`, pass:
       - `type: typeof evaluation.signal.entry === 'number' ? 'limit' : 'market'`
       - `...(typeof evaluation.signal.entry === 'number' ? { price: evaluation.signal.entry } : {})`
       - `...(trailingDistance ? { trailingStop: trailingDistance } : {})`
       - `...(evaluation.signal.breakEvenAtR !== undefined ? { breakEvenAtR: evaluation.signal.breakEvenAtR } : {})`

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kestrel/plugin-paper-trading test -- test/strategy-runner.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add plugins/paper-trading/src/strategy-runner.ts plugins/paper-trading/test/strategy-runner.test.ts
git commit -m "feat(paper-trading): achieve full backtest-to-paper signal parity in strategy runner"
```
