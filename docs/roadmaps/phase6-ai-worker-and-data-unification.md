# Phase 6: AI Engine, Worker, Market Data & Database Unification

> **Goal:** Eliminate split backend flows, unbilled LLM routing calls, committee failover gaps, worker-vs-web cron discrepancies, Paper Trading user-slicing starvation, and market-data/indicator edge cases identified in the 2026-11-04 Full Monorepo Audit.

---

> **Status:** Complete (2026-11-04). All five tasks delivered; `check:guards` 7/7, `knip` 0 findings, `check:fast` 29/29 after each task.
> **Verification Gate:** After each task, run `pnpm check:guards`, `pnpm knip`, and `pnpm check:fast`.

## Overview of Tasks

- [x] **Task 6.1 [AI Engine]:** Fix `routeUnified` semantic routing waste & accounting, wire `runWithModelFallback` into committee specialist desks, fix sub-half-cent budget reconciliation rounding, and fix multi-symbol `agent_opinions` collisions.
- [x] **Task 6.2 [Paper Trading Worker]:** Filter users by active watched symbols (`open` positions / `pending` orders) _before_ applying the 100/250 user cap in `tick.ts` and `market-watch.ts`.
- [x] **Task 6.3 [Worker & Cron Parity]:** Unify `retention` and `/api/cron/cleanup-telemetry` (including `verificationToken` cleanup, stale budget recovery, and Mastra pruning), add `news` refresh to `apps/worker`, and pass `filterUserIds` to `/api/cron/briefings`.
- [x] **Task 6.4 [Market Data & Indicators]:** Synthesize `1w` candles from BiQuote `1d` bars, unify session hours (`Asia`/`London`/`NY`) in `@kestrel/indicators`, allow plugin indicators in `computeIndicator`, and use `@kestrel/shared` symbol extraction in `marketaux/map.ts`.
- [x] **Task 6.5 [Shared, Env & DB Hygiene]:** Align `PHASE3_STRUCTURED_FUSION` default in `RuntimeEnv`, add `REDIS_URL` to `CacheEnv`, move plugin intent regexes into plugin manifests, and fast-path `requireTenantIdForUser`.

---

## Task 6.1: AI Routing Accounting, Committee Failover, Budget Rounding & Multi-Symbol Opinions

### Problems

1. **Redundant & Unbilled `routeTurn` Call (`packages/ai/src/mastra-v2/planning/execution-decision.ts:88-94`):** `decideMastraExecution()` calls `routeTurn()` (which makes an LLM call when semantic routing is enabled) _before_ checking if the prompt is a deterministic symbol research or mutation route, and omits the `accounting` callback so the call is never recorded in `generationLedger`.
2. **Missing Provider Failover on Committee Desks (`packages/ai/src/committee/specialist-runner/runner.ts:144-146`):** Specialist desks only retry on the _same_ model (`withRetry`), so a single `429` or `503` on one provider fails the strict 4-of-4 committee turn even when `aiFallbackChain` has healthy backup providers.
3. **Sub-Half-Cent Turns Reconcile to `0` Cents (`packages/ai/src/budget/budget-reservations.ts:174`):** `Math.round(actualUsd * 100)` rounds any flash-model turn costing `< $0.005` to `0`, releasing the 1-cent reservation back to `0` so `daily_ai_spend` stays at `0` forever.
4. **Multi-Symbol Opinion Collision (`packages/ai/src/committee/opinion-history.ts:126-128`):** `ON CONFLICT (message_id, agent_name) DO NOTHING` drops the 2nd symbol's `technical` opinion in multi-symbol comparison runs.

### Files to Modify

- `packages/ai/src/mastra-v2/planning/execution-decision.ts`
- `packages/ai/src/committee/specialist-runner/runner.ts`
- `packages/ai/src/budget/budget-reservations.ts`
- `packages/ai/src/committee/opinion-history.ts`
- `packages/ai/src/models/helpers.ts`

### Implementation Steps

1. In `packages/ai/src/mastra-v2/planning/execution-decision.ts`:
   - Determine the target route (`symbol-research`, `multi-symbol-research`, `mutation`, or `canonical-chat`) using deterministic symbol/mutation extraction _first_. Only invoke `routeTurn()` when the route is `canonical-chat` (or use keyword routing for symbol research), and wire `accounting` when a ledger is passed.
2. In `packages/ai/src/budget/budget-reservations.ts:174`:
   - Change `const actualCents = Math.max(0, Math.round(actualUsd * 100));` to `const actualCents = actualUsd > 0 ? Math.max(1, Math.round(actualUsd * 100)) : 0;` so non-zero paid turns always account for at least 1 cent.
3. In `packages/ai/src/committee/opinion-history.ts`:
   - Preserve `op.symbol` inside `rawData` (`withRunSymbol(op.rawData, op.symbol ?? input.symbol)`) and suffix `agentName` with `:${op.symbol}` when a comparison run contains multiple symbols for the same desk so `(message_id, agent_name)` never drops comparison desk opinions.
4. In `packages/ai/src/models/helpers.ts:62-97`:
   - Update `envFallbackKeys(env)` to check `(env as Record<string, string | undefined>)[envName] ?? process.env[envName]` across all 11 providers instead of only Google.

### Verification

- Run `pnpm --filter @kestrel/ai test` and `pnpm check:fast`.

---

## Task 6.2: Filter Paper Trading Worker Loops by Active Watched Symbols Before Slicing

### Problem

In `plugins/paper-trading/src/tick.ts:89` and `plugins/paper-trading/src/jobs/market-watch.ts:36`, the worker fetches all users who have installed `paper-trading` and slices `users.slice(0, MAX_USERS_PER_TICK)` (`250` / `100`) _before_ checking if those users have any watched symbols (`open` positions or `pending` orders). Once 100+ users install the plugin (even with 0 open positions), users past index 100 never get their stops, targets, or resting orders filled.

### Files to Modify

- `plugins/paper-trading/src/tick.ts`
- `plugins/paper-trading/src/jobs/market-watch.ts`

### Implementation Steps

1. In `plugins/paper-trading/src/tick.ts`:
   - Filter `users` through `await isWatched(user.userId, user.tenantId, tick.symbol)` (or stop once `activeCount >= MAX_USERS_PER_TICK` of users who actually watch `tick.symbol`), rather than slicing `users.slice(0, MAX_USERS_PER_TICK)` upfront.
2. In `plugins/paper-trading/src/jobs/market-watch.ts`:
   - Track `let processedActiveUsers = 0;` and only increment `processedActiveUsers` when `symbols.length > 0`, breaking when `processedActiveUsers >= MAX_USERS_PER_RUN`.

### Verification

- Run `pnpm --filter @kestrel/plugin-paper-trading test` and `pnpm check:fast`.

---

## Task 6.3: Align Worker & Web Cron Schedules and Retention Logic

### Problems

1. `runRetentionCleanup()` (`packages/db/src/retention/cleanup.ts`) never purges expired `verificationToken` rows (`lazyPurgeExpiredTokens` only runs on `/api/cron/cleanup-tokens`).
2. Web `/api/cron/cleanup-telemetry` (`apps/web/src/app/api/cron/cleanup-telemetry/route.ts`) only runs `runRetentionCleanupAcrossTenants()`, omitting `recoverStaleBudgetReservations()` and `pruneMastraStorage()` (which only run in `apps/worker/src/jobs/retention.ts`).
3. `apps/worker` schedules `embedding-backfill` every 6 hours over `news_articles`, but never schedules news ingestion (`fetchNews` / `refreshNews`), so `news_articles` is never updated in background Docker mode unless a user visits `/news` or pokes `/api/cron/news`.
4. `runBriefingsCronService` (`apps/web/src/lib/services/cron-jobs.ts:39`) omits `filterUserIds` for `WORKER_PARTITION`.

### Files to Modify

- `packages/db/src/retention/cleanup.ts`
- `apps/web/src/app/api/cron/cleanup-telemetry/route.ts`
- `apps/web/src/lib/services/cron-jobs.ts`
- `apps/worker/src/jobs/retention.ts`

### Implementation Steps

1. In `packages/db/src/retention/cleanup.ts`, add `verificationToken` (`WHERE expires < NOW()`) to `runRetentionCleanup()` so both worker `retention` and web `/api/cron/cleanup-telemetry` purge expired verification tokens automatically.
2. In `apps/web/src/app/api/cron/cleanup-telemetry/route.ts` (via `src/lib/services/cron-jobs.ts`), call `recoverStaleBudgetReservations` and `pruneMastraStorage` alongside `runRetentionCleanupAcrossTenants` so web cron and worker `retention` have 100% parity.
3. In `apps/web/src/lib/services/cron-jobs.ts:39`, pass `filterUserIds` using `createTenantRouterFromEnv()` to `runBriefingsFanout`, matching `apps/worker/src/jobs/briefings.ts`.

### Verification

- Run `pnpm --filter @kestrel/db test`, `pnpm --filter @kestrel/worker test`, `pnpm --filter @kestrel/web test`, and `pnpm check:fast`.

---

## Task 6.4: Synthesize `1w` BiQuote Candles, Unify Session Hours & Open `computeIndicator`

### Problems

1. BiQuote does not serve `1w` candles (`packages/data/src/providers/biquote/map.ts:53`). Without `FINNHUB_API_KEY`, requesting `1w` candles for `XAUUSD` or FX pairs throws `NO_PROVIDER_AVAILABLE`.
2. `computeIndicator` (`packages/indicators/src/registry.ts:238`) runs `IndicatorKindSchema.parse(kind)` against the closed 7-item enum in `@kestrel/shared`, rejecting any indicator registered dynamically on `indicatorRegistry`.
3. `packages/data/src/providers/marketaux/map.ts:31-41` only tags 3 hardcoded symbols (`XAUUSD`, `EURUSD`, `GBPUSD`) instead of using `@kestrel/shared`'s 18-symbol catalog extractor.
4. Session ranges (`Asia`, `London`, `NY`) are split between `packages/indicators/src/structure/asian-range.ts` and `packages/ai/src/tools/get-session-levels.ts`.

### Files to Modify

- `packages/data/src/providers/biquote/map.ts`
- `packages/data/src/providers/biquote/rest/ohlc.ts`
- `packages/data/src/providers/provider-adapters.ts`
- `packages/data/src/providers/marketaux/map.ts`
- `packages/indicators/src/registry.ts`
- `packages/indicators/src/structure/index.ts`
- `packages/ai/src/tools/get-session-levels.ts`

### Implementation Steps

1. In `packages/data/src/providers/biquote/`: add `synth1WFrom1D(candles: Candle[]): Candle[]` (grouping `1d` bars by ISO week Monday `00:00 UTC`, matching `synth4HFrom1H` in `finnhub/rest.ts:229`) and add `'1w'` to BiQuote's supported timeframes in `provider-adapters.ts:144`.
2. In `packages/indicators/src/registry.ts:238`: look up the plugin via `this.get(kind)` first; if registered on `indicatorRegistry`, validate `params` with `plugin.paramsSchema` and compute without failing on `IndicatorKindSchema.parse(kind)`.
3. In `packages/data/src/providers/marketaux/map.ts`: import `extractSymbolsFromText` from `@kestrel/shared` so all 18 catalog symbols are tagged on incoming news articles.
4. Move the pure session-level calculation helper from `packages/ai/src/tools/get-session-levels.ts` into `packages/indicators/src/structure/` and re-use it in `get-session-levels.ts`.

### Verification

- Run `pnpm --filter @kestrel/data test`, `pnpm --filter @kestrel/indicators test`, `pnpm --filter @kestrel/ai test`, and `pnpm check:fast`.

---

## Task 6.5: Align Env Schemas, Declarative Plugin Intent & Fast-Path Tenant Lookup

### Problems

1. `PHASE3_STRUCTURED_FUSION` defaults to `'0'` (`false`) in `packages/shared/src/env/schema/runtime.ts:144` but defaults to `true` in `packages/shared/src/runtime/feature-flags.ts:28`.
2. `CacheEnv` (`packages/shared/src/env/schema/infra.ts:27-30`) declares unused `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` while omitting `REDIS_URL` (which `packages/data/src/cache/redis.ts` actually reads).
3. `packages/db/src/tenant/index.ts:52` (`requireTenantIdForUser`) queries `organization_member ⋈ organization` on every cold `withUserTenant(userId)` call without an in-memory cache, even though personal tenant IDs are immutable (`tenantId === userId`).

### Files to Modify

- `packages/shared/src/env/schema/runtime.ts`
- `packages/shared/src/env/schema/infra.ts`
- `.env.example` (if needed to keep `pnpm check:env-contract` green)
- `packages/db/src/tenant/index.ts`

### Implementation Steps

1. Change `PHASE3_STRUCTURED_FUSION` default in `packages/shared/src/env/schema/runtime.ts:144` from `'0'` to `'1'` to match `feature-flags.ts`.
2. Add `REDIS_URL: z.string().url().optional()` to `CacheEnv` in `packages/shared/src/env/schema/infra.ts`.
3. In `packages/db/src/tenant/index.ts`, add a bounded in-memory LRU/TTL cache (`Map<string, { tenantId: string; expiresAt: number }>`, max 5,000 entries, 5-minute TTL, cleared in `_resetDbForTesting`) inside `getTenantIdForUser` so `withUserTenant(userId)` avoids an extra `SELECT` round-trip before opening its transaction.

### Verification

- Run `pnpm check:guards`, `pnpm knip`, and `pnpm check:fast`.
