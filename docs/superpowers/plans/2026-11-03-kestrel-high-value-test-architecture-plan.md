# Kestrel Ruthless High-Value Testing Purge & Architecture Plan (80%+ Test Reduction)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Ruthlessly purge **~81% of Kestrel's test files (deleting 416 out of 512 files / ~2,550 out of ~3,100 individual tests)**—keeping **only 96 high-value test files (~500 tests)** that protect money, security, multi-tenant data isolation, trading math, and AI hallucination guardrails, while cutting total test runtime from **2+ minutes (timing out)** down to **~8–12 seconds**.

**Architecture:** Enforce a strict **Allowlist Architecture** across all 12 workspaces: instead of playing whack-a-mole with hundreds of AI-generated ticket files, each package defines the exact **Allowlist of Canonical Test Files** that earn their keep, and deletes every other `.test.ts`, `.test.tsx`, and `.spec.ts` file in the repository. Pure stateless suites run with `isolate: false`, broken Vitest 5 multi-project configs are fixed, and `coverage.thresholds` are removed or lowered so AI agents never pad coverage again.

**Tech Stack:** Vitest 5.0.5, Playwright, Turborepo, pnpm 12, TypeScript 7 (`tsrs`), Oxlint, PostgreSQL 16 + Drizzle ORM.

**Spec:** Self-contained in Sections 1–2 of this document (`docs/superpowers/plans/2026-11-03-kestrel-high-value-test-architecture-plan.md`).

## Global Constraints

- **Protected Guardrails (`AGENTS.md`):** Never modify `scripts/check-*.mjs`, `scripts/maintainability-baseline.json`, `knip.json`, or `packages/config/eslint/index.js`.
- **Non-Empty Package Test Floor (`scripts/check-test-files.mjs`):** Every workspace in `scripts/check-test-files.mjs` (`apps/web`, `apps/worker`, `packages/ai`, `packages/data`, `packages/db`, `packages/indicators`, `packages/plugin-sdk`, `packages/shared`, `packages/test-utils`, `plugins/backtesting`, `plugins/paper-trading`, `plugins/telegram-bot`) MUST retain at least 1 `.test.ts` or `.test.tsx` file containing at least 1 non-skipped `it(` or `test(` assertion.
- **Knip Entrypoint Preservation (`knip.json`):** Never delete `apps/web/test/vitest.setup.ts`, `apps/web/test/vitest.node-setup.ts`, `apps/web/test/empty.ts`, `apps/worker/test/empty.ts`, `packages/ai/test/__mocks__/server-only.ts`, `packages/plugin-sdk/test/__mocks__/server-only.ts`, or `packages/indicators/test/fixtures.ts`.
- **Dead Export Cleanup After Purge (`pnpm knip`):** Deleting 416 test files will expose helper functions in `src/` that were only exported so an AI test could import them. After each task, run `pnpm knip` and remove the `export` keyword from any internal symbol that has no production caller.
- **Remove Coverage Ratchets (`vitest.config.ts`):** Remove `coverage.thresholds` from every `vitest.config.ts` file across the monorepo (Goodhart's Law: coverage thresholds are the #1 reason AI coding agents generated 2,500+ junk tests in the first place).

## Review Focus

- **Vitest 5 `extends: true` Double Execution Bug (`apps/worker/vitest.config.ts`):** Defining `include: ['test/**/*.test.ts']` at the root `test` block alongside `projects: [{ extends: true }]` causes Vitest 5 to merge root `include` into every child project, running the entire worker test suite twice.
- **Mocked ORM Chain Fallacy (`apps/web/test` & `packages/ai/test`):** Over 90 test files mock `@kestrel/db` with fake `select: () => ({ from: () => ({ where: () => ... }) })` chains. These tests prove zero SQL or RLS correctness and break whenever a query adds a `.leftJoin()` or `.orderBy()`. Delete all mocked-ORM unit tests and rely on the real Postgres RLS suites (`postgres-rls.test.ts`, `postgres-app-role.test.ts`, `settings-actions-app-role.test.ts`).
- **One-Tool-One-Mock-File Sprawl (`packages/ai/test`):** AI agents created 25+ separate files for individual AI tools (`get-calendar.test.ts`, `get-news.test.ts`, `get-price.test.ts`, `get-candles.test.ts`, etc.) that mock `@kestrel/data` and test whether Zod parses `{ symbol: 'EURUSD' }`. `contract-tool-outputs.test.ts` already tests the output contracts of every tool in one file.
- **Cosmetic React Component & Hook Tests (`apps/web/test`):** Over 65 `.test.tsx` and `hooks-*.test.ts` files render UI widgets in `happy-dom` with mocked hooks just to check CSS classes, text labels, or `localStorage`. Delete all of them; keep only security/XSS (`shiki-sanitization.test.ts`, `csrf.test.ts`) and core chat streaming transport tests.
- **Working-Tree Mutation Race (`apps/web/test/build-scripts.test.ts`):** `build-scripts.test.ts` overwrites `apps/web/public/sw.js` and `.env.production.local` in the live repository during test runs. Delete it.

---

## 1. Evidence-Based Testing Principles

| Principle / Framework                      | Core Rule                                                                                                                                                                                                                                   | Authoritative Source                                                                                                                                                                                                                                                                                                                                                                             | How We Apply It Here                                                                                                                    |
| :----------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------- |
| **Khorikov's Four Pillars**                | A test has value only if it provides **(1) Protection against regressions**, **(2) Resistance to refactoring**, **(3) Fast feedback**, and **(4) Maintainability**. Any test that fails when you refactor internals has **zero net value**. | Vladimir Khorikov, [Unit Testing Principles, Practices, and Patterns](https://www.google.com/search?q=https://www.simonandschuster.co.uk/books/Unit-Testing-Principles,Practices,and-Patterns/Vladimir-Khorikov/9781638350293) ([Summary](https://olano.dev/blog/unit-testing-principles/), [Samman Coaching](https://sammancoaching.org/learning_hours/test_design/four_pillars_khorikov.html)) | Delete all `readFileSync` source-grepping tests, Tailwind class assertions, and mocked Drizzle chain tests.                             |
| **Google's Ban on Change-Detector Tests**  | Tests that mirror the exact implementation structure or mock call sequence are **Change-Detector Tests**—they only prove the code wasn't edited.                                                                                            | Google Testing Blog, [_Change-Detector Tests Considered Harmful_](https://testing.googleblog.com/2015/01/testing-on-toilet-change-detector-tests.html) & [_Test Behavior, Not Implementation_](https://testing.googleblog.com/2013/08/testing-on-toilet-test-behavior-not.html)                                                                                                                  | Delete 130 files in `apps/web/test` and 149 files in `packages/ai/test` that test implementation details or mock wiring.                |
| **Kent C. Dodds's Testing Trophy**         | _"Write tests. Not too many. Mostly integration."_ Let TypeScript (`tsrs`) and Oxlint catch type/shape bugs; use tests only for high-consequence business logic and integration boundaries.                                                 | Kent C. Dodds, [_Write tests. Not too many. Mostly integration._](https://kentcdodds.com/blog/write-tests), [_The Testing Trophy_](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications), & [_Testing Implementation Details_](https://kentcdodds.com/blog/testing-implementation-details)                                                                                 | Cut total tests by **~82%** (from ~3,100 tests to ~500 tests) and rely on `pnpm typecheck` + `pnpm check:guards` for static guarantees. |
| **Fowler's Sociable Tests & Anti-Mocking** | Mocking every collaborator (`vi.mock('@kestrel/db')`, `vi.mock('@kestrel/ai')`) tests your test setup, not your application.                                                                                                                | Martin Fowler, [_Unit Test_](https://martinfowler.com/bliki/UnitTest.html) & [_The Practical Test Pyramid_](https://martinfowler.com/articles/practical-test-pyramid.html); Google Testing Blog, [_Don't Overuse Mocks_](https://testing.googleblog.com/2013/05/testing-on-toilet-dont-overuse-mocks.html)                                                                                       | Delete all pass-through route/job/UI tests whose assertions are `expect(mockFn).toHaveBeenCalled()`.                                    |
| **Goodhart's Law on Coverage**             | _"When a measure becomes a target, it ceases to be a good measure."_ Coverage floors force AI agents to write garbage tests for getters, constants, and CSS classes.                                                                        | [_Software Engineering at Google Ch. 12_](https://abseil.io/resources/swe-book/html/ch12.html); Industrial Logic, [_Code Coverage Complications_](https://www.industriallogic.com/blog/code-coverage-complications/)                                                                                                                                                                             | Strip `coverage.thresholds` from every `vitest.config.ts` file in the monorepo.                                                         |

---

## 2. Before vs. After Breakdown Across All Workspaces

| Workspace                       |   Before (Files / ~Tests)    |   After (Files / ~Tests)   |              Files Deleted               | What Survives (The High-Value Core)                                                                                                                                                                                                     |
| :------------------------------ | :--------------------------: | :------------------------: | :--------------------------------------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`apps/web` (Unit/Int)**       |    148 files (~950 tests)    | **18 files** (~110 tests)  |          **-130 files (-88%)**           | Auth/JWT/CSRF/middleware security, SSRF/XSS guards, BYOK key masking, `withAuth`/`withCronAuth` envelopes, chat SSE turn orchestration, real Postgres RLS action test.                                                                  |
| **`apps/web` (Playwright E2E)** |    34 files (~180 tests)     |  **6 files** (~25 tests)   |           **-28 files (-82%)**           | Core journeys only: `auth.spec.ts`, `onboarding.spec.ts`, `chat.spec.ts`, `journal.spec.ts`, `alerts.spec.ts`, `multi-tenant-isolation.spec.ts`.                                                                                        |
| **`packages/ai`**               |   177 files (~1,150 tests)   | **28 files** (~170 tests)  |          **-149 files (-84%)**           | Position/risk math, integer-cent budget & race guards, numeric hallucination verifiers, prompt-injection & secret redaction guardrails, Mastra router & mutation token security, model circuit breaker/fallback, tool output contracts. |
| **`apps/worker`**               |    32 files (~175 tests)     |  **8 files** (~45 tests)   |           **-24 files (-75%)**           | 1m OHLCV tick aggregation math, candle flush rig & outbox durability, tick ring-buffer, SignalR reconnect/consumer, cron advisory lock, tenant partition hash.                                                                          |
| **`packages/data`**             |    28 files (~190 tests)     |  **10 files** (~60 tests)  |           **-18 files (-64%)**           | Adapter failover/staleness, BiQuote/Finnhub/FRED/CFTC parsers, circuit breaker, singleflight dedup, tick normalization.                                                                                                                 |
| **`packages/db`**               |    23 files (~140 tests)     |  **6 files** (~35 tests)   |           **-17 files (-74%)**           | RLS context scoping (`rls.test.ts`), real Postgres RLS & `kestrel_app` role proofs, atomic budget reservations, DB rate-limiting, transient retry.                                                                                      |
| **`packages/shared`**           |    24 files (~160 tests)     |  **8 files** (~50 tests)   |           **-16 files (-67%)**           | AES-256-GCM encryption, vault & BYOK crypto, SSRF `assertSafeOutboundUrl`, image path traversal guard, env security invariants, price/pip math.                                                                                         |
| **`packages/indicators`**       |     12 files (~75 tests)     |  **10 files** (~60 tests)  |           **-2 files (-17%)**            | Pure mathematical indicators (`rsi`, `atr`, `macd`, `bollinger`, `donchian`, `keltner`, `moving-averages`, `pivots`, `stoch-rsi`, `structure`).                                                                                         |
| **`packages/plugin-sdk`**       |     5 files (~25 tests)      |  **2 files** (~10 tests)   |           **-3 files (-60%)**            | Plugin host lifecycle (`host.test.ts`) and encrypted plugin settings (`settings-encryption.test.ts`).                                                                                                                                   |
| **`packages/test-utils`**       |      1 file (~5 tests)       |   **1 file** (~5 tests)    |               **0 files**                | Required by `scripts/check-test-files.mjs` (`factories.test.ts`).                                                                                                                                                                       |
| **`plugins/backtesting`**       |     9 files (~45 tests)      |  **3 files** (~18 tests)   |           **-6 files (-67%)**            | Backtest execution engine (`engine.test.ts`), walk-forward/cost math (`metrics.test.ts`), and parity (`parity.test.ts`).                                                                                                                |
| **`plugins/paper-trading`**     |     12 files (~65 tests)     |  **4 files** (~25 tests)   |           **-8 files (-67%)**            | Margin/liquidation/fill math (`engine.test.ts`, `margin.test.ts`, `orders.test.ts`, `tick-subscriber.test.ts`).                                                                                                                         |
| **`plugins/telegram-bot`**      |     6 files (~30 tests)      |  **2 files** (~12 tests)   |           **-4 files (-67%)**            | Webhook HMAC/secret verification and command dispatch.                                                                                                                                                                                  |
| **TOTAL**                       | **511 files (~3,190 tests)** | **106 files (~625 tests)** | **-405 files (-79% files / -80% tests)** | **Full monorepo `pnpm test` runs in ~8–12s instead of timing out at >120s.**                                                                                                                                                            |

---

## 3. Step-by-Step Agent Execution Plan

### Task 1: Clean Working Tree & Purge `apps/worker` (32 -> 8 Files) + Fix Double Execution Bug

**Files:**

- Modify: `apps/worker/vitest.config.ts`
- Keep (Allowlist of 8 files in `apps/worker/test/`):
  - `candle-1m.test.ts`
  - `candle-flush-rig.test.ts`
  - `candle-outbox.test.ts`
  - `candle-outbox-postgres.test.ts`
  - `runner-lock.test.ts`
  - `signalr-consumer.test.ts`
  - `tenant-router.test.ts`
  - `tick-buffer.test.ts`
  - `empty.ts` (non-test stub alias target)
- Delete: All other 24 `.test.ts` files in `apps/worker/test/`.

**Interfaces:**

- Consumes: `apps/worker/vitest.config.ts`.
- Produces: 8 high-value worker test files running once in ~3–4 seconds.

- [x] **Step 1: Reset working tree so Git starts clean**

```bash
rm -rf .mastra/pruned-tests
git checkout -- .
```

- [x] **Step 2: Delete all `.test.ts` files in `apps/worker/test/` NOT on the 8-file allowlist**

```bash
find apps/worker/test -name '*.test.ts' \
  ! -name 'candle-1m.test.ts' \
  ! -name 'candle-flush-rig.test.ts' \
  ! -name 'candle-outbox.test.ts' \
  ! -name 'candle-outbox-postgres.test.ts' \
  ! -name 'runner-lock.test.ts' \
  ! -name 'signalr-consumer.test.ts' \
  ! -name 'tenant-router.test.ts' \
  ! -name 'tick-buffer.test.ts' \
  -exec git rm -f {} +
```

- [x] **Step 3: Replace `apps/worker/vitest.config.ts` to fix the `projects` double-run bug and remove `coverage.thresholds`**

```ts
import os from 'node:os';

import { defineConfig } from 'vitest/config';

const maxWorkers = process.env.CI ? 2 : Math.max(2, Math.floor(os.availableParallelism() / 2));

export default defineConfig({
  resolve: {
    conditions: ['source'],
  },
  test: {
    fsModuleCachePath: 'node_modules/.vitest-cache',
    pool: 'threads',
    maxWorkers,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    deps: {
      optimizer: {
        ssr: { enabled: true },
      },
    },
    server: {
      deps: {
        inline: [/eventsource-parser/],
      },
    },
    alias: {
      'server-only': new URL('./test/empty.ts', import.meta.url).pathname,
    },
  },
});
```

- [x] **Step 4: Verify `@kestrel/worker` tests and clean up any unused worker exports flagged by `pnpm knip`**

Run: `pnpm --filter @kestrel/worker test && pnpm knip`
Expected: 7 passed, 1 skipped (8 total files) in ~3–4s. If `pnpm knip` flags any unused exports in `apps/worker/src/`, remove their `export` keyword.

- [x] **Step 5: Commit Task 1**

```bash
git add apps/worker
git commit -m "test(worker): purge 24 low-value worker tests and fix duplicate vitest project execution"
```

---

### Task 2: Purge Core Packages & Plugins (`shared`, `db`, `data`, `indicators`, `plugin-sdk`, `plugins/*`) — Deleting 74 Files

**Files:**

- Modify: `packages/db/vitest.config.ts`, `packages/data/vitest.config.ts`, `packages/shared/vitest.config.ts`, `packages/indicators/vitest.config.ts`, `packages/plugin-sdk/vitest.config.ts`, `plugins/backtesting/vitest.config.ts`, `plugins/paper-trading/vitest.config.ts`
- Delete: 74 low-value test files across those 8 packages using the exact allowlists below.

**Interfaces:**

- Consumes: Package test directories across `packages/*` and `plugins/*`.
- Produces: Lean, `isolate: false` test suites across all core packages and plugins.

- [x] **Step 1: Prune `packages/shared/test` to the 8-file security, crypto, and math allowlist (deletes 16 files)**

```bash
find packages/shared/test -name '*.test.ts' \
  ! -name 'byok.test.ts' \
  ! -name 'chat-image-object-path.test.ts' \
  ! -name 'encryption.test.ts' \
  ! -name 'env-contract.test.ts' \
  ! -name 'math.test.ts' \
  ! -name 'safe-url.test.ts' \
  ! -name 'schemas.test.ts' \
  ! -name 'vault.test.ts' \
  -exec git rm -f {} +
```

- [x] **Step 2: Prune `packages/db/test` to the 6-file RLS, concurrency, and retry allowlist (deletes 17 files)**

```bash
find packages/db/test -name '*.test.ts' \
  ! -name 'budget-reservations.test.ts' \
  ! -name 'postgres-app-role.test.ts' \
  ! -name 'postgres-rls.test.ts' \
  ! -name 'rate-limits.test.ts' \
  ! -name 'retry.test.ts' \
  ! -name 'rls.test.ts' \
  -exec git rm -f {} +
```

- [x] **Step 3: Prune `packages/data/test` to the 10-file parser, cache, singleflight, and circuit-breaker allowlist (deletes 18 files)**

```bash
find packages/data/test -name '*.test.ts' \
  ! -name 'adapter.test.ts' \
  ! -name 'biquote-parsers.test.ts' \
  ! -name 'cache.test.ts' \
  ! -name 'cftc.test.ts' \
  ! -name 'circuit-breaker.test.ts' \
  ! -name 'finnhub.test.ts' \
  ! -name 'fred.test.ts' \
  ! -name 'singleflight.test.ts' \
  ! -name 'symbol-resolution.test.ts' \
  ! -name 'ticks.test.ts' \
  -exec git rm -f {} +
```

- [x] **Step 4: Prune `packages/indicators/test`, `packages/plugin-sdk/test`, and `plugins/*/test` (deletes 23 files)**

```bash
# packages/indicators: keep 10 pure math indicator files, delete defaults & session-levels duplicate
git rm -f packages/indicators/test/defaults.test.ts packages/indicators/test/session-levels.test.ts

# packages/plugin-sdk: keep host.test.ts and settings-encryption.test.ts
find packages/plugin-sdk/test -name '*.test.ts' \
  ! -name 'host.test.ts' \
  ! -name 'settings-encryption.test.ts' \
  -exec git rm -f {} +
```

For `plugins/backtesting/test`, `plugins/paper-trading/test`, and `plugins/telegram-bot/test`, inspect `ls plugins/*/test` and keep only:

- `plugins/backtesting/test`: keep the 3 core engine/math files (e.g. `engine.test.ts`, `walk-forward.test.ts` / `metrics.test.ts`, `parity.test.ts`), `git rm` the remaining 6 UI/schema/tool-wrapper files.
- `plugins/paper-trading/test`: keep the 4 core execution/margin/fill files (e.g. `engine.test.ts`, `margin.test.ts`, `orders.test.ts`, `tick-subscriber.test.ts`), `git rm` the remaining 8 schema/UI/route wrapper files.
- `plugins/telegram-bot/test`: keep the 2 core webhook/security & command-handler files, `git rm` the remaining 4 files.

- [x] **Step 5: Enable `isolate: false` and remove `coverage.thresholds` in `packages/{db,data,shared,indicators,plugin-sdk}/vitest.config.ts` and `plugins/*/vitest.config.ts`**

Add `isolate: false` to `packages/db/vitest.config.ts`, `plugins/backtesting/vitest.config.ts`, and `plugins/paper-trading/vitest.config.ts`, and remove the `coverage: { thresholds: ... }` blocks from `packages/db/vitest.config.ts`, `packages/data/vitest.config.ts`, `packages/shared/vitest.config.ts`, `packages/indicators/vitest.config.ts`, and `packages/plugin-sdk/vitest.config.ts`.

- [x] **Step 6: Run tests, typecheck, guards, and `pnpm knip` across all core packages and plugins**

Run: `pnpm --filter @kestrel/shared --filter @kestrel/db --filter @kestrel/data --filter @kestrel/indicators --filter @kestrel/plugin-sdk --filter @kestrel/plugin-backtesting --filter @kestrel/plugin-paper-trading --filter @kestrel/plugin-telegram-bot test && pnpm check:guards && pnpm knip`
Expected: PASS in <10s total. Remove any test-only `export` keywords in `src/` flagged by `pnpm knip`.

- [x] **Step 7: Commit Task 2**

```bash
git add packages plugins
git commit -m "test(packages): purge 74 low-value package/plugin tests and enable isolate:false"
```

---

### Task 3: Ruthlessly Purge `packages/ai/test` from 177 Files Down to the 28-File High-Value Allowlist (Deletes 149 Files!)

**Files:**

- Modify: `packages/ai/vitest.config.ts`
- Keep (Allowlist of 28 files in `packages/ai/test/`):
  1. `alert-decide.test.ts` (pure alert trigger boundary math)
  2. `alert-simulate.test.ts` (historical candle alert simulation math)
  3. `alerts-claim-postgres.test.ts` (real Postgres atomic claim concurrency test)
  4. `alerts-delivery.test.ts` (dedup, quiet hours, channel failover)
  5. `budget-race.test.ts` (concurrent turn budget reservation race protection)
  6. `budget-reservation.test.ts` (integer-cent reservation lifecycle & reconciliation)
  7. `byok-providers.test.ts` (BYOK provider model factory & image middleware wiring)
  8. `canonical-evidence.test.ts` (hallucinated number blocking in canonical chat)
  9. `committee-fusion-verifier.test.ts` (committee synthesis grounding & bounded repair)
  10. `committee-stale-grounding.test.ts` (rejecting stale cache quotes as grounding evidence)
  11. `committee.test.ts` (strict fail-closed committee mode invariants)
  12. `compute-position-health.test.ts` (live pip/R-multiple/stop-distance math)
  13. `compute-risk.test.ts` (lot size & risk-reward calculation math)
  14. `contract-tool-outputs.test.ts` (schema contract verification across all AI tools in one file)
  15. `cost.test.ts` (token pricing & integer-cent cost math)
  16. `external-content.test.ts` (prompt injection quarantine on external news/web content)
  17. `image-resolution-persistence.test.ts` (proves base64 image bytes are never persisted to DB/memory)
  18. `indirect-content-guardrail.test.ts` (indirect prompt-injection blocking)
  19. `integration/ai-data.integration.test.ts` (sociable integration between `@kestrel/ai` and `@kestrel/data`)
  20. `journal-stats.test.ts` (R-multiple, drawdown, profit factor, expectancy, and null-honesty math)
  21. `level-sanity.test.ts` (price-level sanity bounds against live market quotes)
  22. `mastra-guardrails.test.ts` (input processor blocking/rewriting guardrails)
  23. `mastra-mutation-policy.test.ts` (HMAC confirmation token & admin system-action policy)
  24. `mastra-mutation.test.ts` (suspend/resume/cancel mutation workflow durability)
  25. `mastra-router.test.ts` (deterministic symbol, comparison, and mutation routing)
  26. `model-circuit-breaker.test.ts` (provider outage circuit-breaker state machine)
  27. `model-fallback.test.ts` (mid-turn and pre-turn provider failover)
  28. `opinion-verifier.test.ts` (specialist desk numeric & temporal staleness verification)
- Delete: All other 149 `.test.ts` files in `packages/ai/test/`.

**Interfaces:**

- Consumes: `packages/ai/test/**/*.test.ts` and `packages/ai/vitest.config.ts`.
- Produces: A 28-file `@kestrel/ai` suite that runs in **~4–6 seconds** instead of timing out at >60s.

- [x] **Step 1: Delete all 149 `.test.ts` files in `packages/ai/test` not on the 28-file allowlist**

```bash
find packages/ai/test -name '*.test.ts' \
  ! -name 'alert-decide.test.ts' \
  ! -name 'alert-simulate.test.ts' \
  ! -name 'alerts-claim-postgres.test.ts' \
  ! -name 'alerts-delivery.test.ts' \
  ! -name 'budget-race.test.ts' \
  ! -name 'budget-reservation.test.ts' \
  ! -name 'byok-providers.test.ts' \
  ! -name 'canonical-evidence.test.ts' \
  ! -name 'committee-fusion-verifier.test.ts' \
  ! -name 'committee-stale-grounding.test.ts' \
  ! -name 'committee.test.ts' \
  ! -name 'compute-position-health.test.ts' \
  ! -name 'compute-risk.test.ts' \
  ! -name 'contract-tool-outputs.test.ts' \
  ! -name 'cost.test.ts' \
  ! -name 'external-content.test.ts' \
  ! -name 'image-resolution-persistence.test.ts' \
  ! -name 'indirect-content-guardrail.test.ts' \
  ! -name 'ai-data.integration.test.ts' \
  ! -name 'journal-stats.test.ts' \
  ! -name 'level-sanity.test.ts' \
  ! -name 'mastra-guardrails.test.ts' \
  ! -name 'mastra-mutation-policy.test.ts' \
  ! -name 'mastra-mutation.test.ts' \
  ! -name 'mastra-router.test.ts' \
  ! -name 'model-circuit-breaker.test.ts' \
  ! -name 'model-fallback.test.ts' \
  ! -name 'opinion-verifier.test.ts' \
  -exec git rm -f {} +
```

- [x] **Step 2: Simplify `packages/ai/vitest.config.ts` and remove `coverage.thresholds`**

With only 28 files left, simplify `packages/ai/vitest.config.ts` so the 14 pure stateless files run with `isolate: false` in `ai-fast` and the 14 module-mocking/singleton files run in `ai-isolated`, and remove `coverage.thresholds`:

```ts
import os from 'node:os';

import { defineConfig } from 'vitest/config';

const maxWorkers = process.env.CI ? 2 : Math.max(2, Math.floor(os.availableParallelism() / 2));

const fastPureInclude = [
  'test/alert-decide.test.ts',
  'test/alert-simulate.test.ts',
  'test/byok-providers.test.ts',
  'test/canonical-evidence.test.ts',
  'test/committee.test.ts',
  'test/committee-stale-grounding.test.ts',
  'test/contract-tool-outputs.test.ts',
  'test/external-content.test.ts',
  'test/indirect-content-guardrail.test.ts',
  'test/level-sanity.test.ts',
  'test/mastra-guardrails.test.ts',
  'test/mastra-mutation-policy.test.ts',
  'test/mastra-router.test.ts',
  'test/opinion-verifier.test.ts',
];

export default defineConfig({
  resolve: {
    conditions: ['source'],
    alias: {
      'server-only': new URL('./test/__mocks__/server-only.ts', import.meta.url).pathname,
      '@ai': new URL('./src', import.meta.url).pathname,
    },
  },
  test: {
    fsModuleCachePath: 'node_modules/.vitest-cache',
    pool: 'threads',
    maxWorkers,
    environment: 'node',
    deps: {
      optimizer: {
        ssr: { enabled: true },
      },
    },
    server: {
      deps: {
        inline: ['server-only'],
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'ai-fast',
          isolate: false,
          include: fastPureInclude,
        },
      },
      {
        extends: true,
        test: {
          name: 'ai-isolated',
          isolate: true,
          include: ['test/**/*.test.ts'],
          exclude: fastPureInclude,
        },
      },
    ],
  },
});
```

- [x] **Step 3: Run `@kestrel/ai` tests, typecheck, and `pnpm knip` to clean up any unused test-only exports**

Run: `pnpm --filter @kestrel/ai test && pnpm --filter @kestrel/ai typecheck && pnpm knip`
Expected: 27 passed, 1 skipped (28 files) in **~4–6s**. Remove any unused `export` keywords in `packages/ai/src/` reported by `pnpm knip` (or remove unused test helpers in `packages/ai/test/helpers/` if `knip` flags them).

- [x] **Step 4: Commit Task 3**

```bash
git add packages/ai
git commit -m "test(ai): ruthlessly prune 149 low-value/duplicate test files down to 28 core suites"
```

---

### Task 4: Ruthlessly Purge `apps/web/test` from 148 Files Down to the 18-File High-Value Allowlist (Deletes 130 Files!)

**Files:**

- Modify: `apps/web/vitest.config.ts`
- Keep (Allowlist of 18 test files in `apps/web/test/`):
  1. `api-chat-route.integration.test.ts` (end-to-end `/api/chat` route integration: auth, rate-limit, budget, SSE stream)
  2. `api-key-masking.test.ts` (guarantees raw BYOK API keys never leak to the browser)
  3. `api.test.ts` (`withAuth`, CSRF enforcement, rate-limiting, tenant context)
  4. `auth-callbacks.test.ts` (JWT & session callback security invariants)
  5. `auth-credentials.test.ts` (password verification, lockout, timing-safe auth)
  6. `auth-flow.test.ts` (registration & login flow integration)
  7. `auth-impersonation.test.ts` (HMAC challenge verification & production block)
  8. `chat-transport.test.ts` (client SSE frame state machine & progress reducer)
  9. `cron-auth-contract.test.ts` (`withCronAuth` bearer secret & admin session gate)
  10. `csrf.test.ts` (double-submit CSRF token extraction & header attachment)
  11. `mastra-stream-response.test.ts` (SSE stream abort, cancel, and terminal persistence status)
  12. `middleware.test.ts` (route protection, public allowlist, and redirect behavior)
  13. `plugin-tool-confirm.test.ts` (tenant-scoped confirmation and schema re-validation for plugin write tools)
  14. `run-mastra-sse-turn.test.ts` (Mastra SSE turn execution, fallback, and budget reconciliation)
  15. `session-validation-policy.test.ts` (session revocation & DB outage fail-closed policy)
  16. `settings-actions-app-role.test.ts` (real PostgreSQL `kestrel_app` NOBYPASSRLS tenant isolation proof)
  17. `settings-chat-model-service.test.ts` (model ownership, catalog membership, and embedding-tier rejection)
  18. `shiki-sanitization.test.ts` (DOMPurify XSS sanitization on rendered code blocks)
  - Plus keep non-test setup files required by `knip.json`: `vitest.setup.ts`, `vitest.node-setup.ts`, `empty.ts`.
- Delete: All other 130 `.test.ts` and `.test.tsx` files in `apps/web/test/` (and delete `apps/web/test/helpers/` and `apps/web/test/auth-helpers.ts` once unused).

**Interfaces:**

- Consumes: `apps/web/test/**/*` and `apps/web/vitest.config.ts`.
- Produces: An 18-file `@kestrel/web` security & integration test suite that runs in **~3–5 seconds** instead of timing out at >60s.

- [x] **Step 1: Delete all 130 `.test.ts` and `.test.tsx` files in `apps/web/test` not on the 18-file allowlist**

```bash
find apps/web/test \( -name '*.test.ts' -o -name '*.test.tsx' \) \
  ! -name 'api-chat-route.integration.test.ts' \
  ! -name 'api-key-masking.test.ts' \
  ! -name 'api.test.ts' \
  ! -name 'auth-callbacks.test.ts' \
  ! -name 'auth-credentials.test.ts' \
  ! -name 'auth-flow.test.ts' \
  ! -name 'auth-impersonation.test.ts' \
  ! -name 'chat-transport.test.ts' \
  ! -name 'cron-auth-contract.test.ts' \
  ! -name 'csrf.test.ts' \
  ! -name 'mastra-stream-response.test.ts' \
  ! -name 'middleware.test.ts' \
  ! -name 'plugin-tool-confirm.test.ts' \
  ! -name 'run-mastra-sse-turn.test.ts' \
  ! -name 'session-validation-policy.test.ts' \
  ! -name 'settings-actions-app-role.test.ts' \
  ! -name 'settings-chat-model-service.test.ts' \
  ! -name 'shiki-sanitization.test.ts' \
  -exec git rm -f {} +

# Also remove now-unused test helper files in apps/web/test
git rm -rf apps/web/test/helpers apps/web/test/auth-helpers.ts
```

- [x] **Step 2: Update `apps/web/vitest.config.ts` to scope `domInclude` to the 2 remaining DOM security tests (`csrf.test.ts` and `shiki-sanitization.test.ts`) and remove `coverage.thresholds`**

```ts
import os from 'node:os';
import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const maxWorkers = process.env.CI ? 2 : Math.max(2, Math.floor(os.availableParallelism() / 2));

const domInclude = ['test/**/*.test.tsx', 'test/csrf.test.ts', 'test/shiki-sanitization.test.ts'];

export default defineConfig({
  plugins: [react()],
  resolve: {
    conditions: ['source'],
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@scripts': path.resolve(import.meta.dirname, '../../scripts'),
      '@tools': path.resolve(import.meta.dirname, '../../tools'),
      '@loadtest': path.resolve(import.meta.dirname, '../../loadtest'),
      'server-only': path.resolve(import.meta.dirname, './test/empty.ts'),
    },
  },
  test: {
    fsModuleCachePath: 'node_modules/.vitest-cache',
    pool: 'threads',
    maxWorkers,
    server: {
      deps: {
        inline: ['next-auth', '@auth/drizzle-adapter', /eventsource-parser/],
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'web-node',
          environment: 'node',
          setupFiles: ['./test/vitest.node-setup.ts'],
          include: ['test/**/*.test.{ts,tsx}'],
          exclude: domInclude,
        },
      },
      {
        extends: true,
        test: {
          name: 'web-dom',
          environment: 'happy-dom',
          setupFiles: ['./test/vitest.setup.ts'],
          include: domInclude,
        },
      },
    ],
  },
});
```

- [x] **Step 3: Run `@kestrel/web` tests, typecheck, and `pnpm knip` to clean up any test-only exports in `apps/web/src/`**

Run: `pnpm --filter @kestrel/web test && pnpm --filter @kestrel/web typecheck && pnpm knip`
Expected: 17 passed, 1 skipped (18 files) in **~3–5s**. For any symbol in `apps/web/src/` flagged by `pnpm knip` as an unused export (because only a deleted test imported it), remove its `export` keyword or delete dead helper files.

- [x] **Step 4: Commit Task 4**

```bash
git add apps/web
git commit -m "test(web): ruthlessly purge 130 low-value web test files down to 18 core security/integration suites"
```

---

### Task 5: Purge Playwright E2E Suite from 34 Files Down to 6 Critical User Journeys (Deletes 28 E2E Files!)

**Files:**

- Inspect & Prune: `apps/web/tests/e2e/*.spec.ts`

**Interfaces:**

- Consumes: `apps/web/tests/e2e/` and `apps/web/playwright.config.ts`.
- Produces: 6 high-value E2E specs covering login/registration, onboarding, AI chat, trade journal, price alerts, and multi-tenant isolation.

- [x] **Step 1: List `apps/web/tests/e2e/` and delete all cosmetic, audit, layout, and duplicate specs, keeping only the 6 core journey specs**

Inspect `ls apps/web/tests/e2e` and retain only the 6 core user-journey specs (adjusting exact filenames if named e.g. `auth.spec.ts`, `onboarding.spec.ts`, `chat.spec.ts`, `journal.spec.ts`, `alerts.spec.ts`, `multi-tenant-isolation.spec.ts` / `smoke.spec.ts`), removing the other ~28 specs with `git rm`.

- [x] **Step 2: Run `pnpm typecheck`, `pnpm lint`, and `pnpm knip` to verify no broken references**

Run: `pnpm typecheck && pnpm lint && pnpm knip`
Expected: PASS with 0 errors and 0 unused exports.

- [x] **Step 3: Commit Task 5**

```bash
git add apps/web/tests
git commit -m "test(e2e): prune 28 cosmetic/redundant E2E specs down to 6 critical user journeys"
```

---

### Task 6: Lock In Anti-Bloat Rules in `AGENTS.md` & Run Full Monorepo Verification

**Files:**

- Modify: `AGENTS.md`

**Interfaces:**

- Consumes: `AGENTS.md`.
- Produces: Permanent constitution in `AGENTS.md` preventing any future AI coding agent from re-introducing coverage-padding or change-detector tests.

- [x] **Step 1: Append the `## Testing Architecture & Anti-Bloat Rules` section to `AGENTS.md`**

```markdown
## Testing Architecture & Anti-Bloat Rules

- **Hard Cap on Test Sprawl (~100 Test Files Total Across Monorepo):**
  - Do NOT create a new `.test.ts` file for every bug fix, audit ticket, or phase (`phase2-*`, `p0-4-*`, `r8-*`). Add behavioral assertions to the existing canonical domain test file, or do not write a unit test if `pnpm typecheck` and `pnpm check:guards` already enforce the invariant.
- **Forbidden Low-Value Test Categories:**
  - **No `readFileSync` Source Grepping:** Never read `.ts`, `.tsx`, `.css`, `.sh`, or `docker-compose.yml` files inside Vitest. Static code-shape checks belong only in `scripts/check-*.mjs`.
  - **No Tailwind / CSS Token Assertions:** Never assert `className` tokens (`rounded-xl`, `h-11`, `border-border`) or presentational DOM structure in `.test.tsx` files.
  - **No Mocked-ORM Chain Tests:** Never mock `@kestrel/db` query builders (`select().from().where()`) to assert that a service called Drizzle. Use real Postgres RLS integration tests for database invariants.
  - **No Pass-Through Controller / Job Mocks:** Never write a test that mocks `@/lib/services/*` or `@kestrel/ai` and only asserts `expect(mockFn).toHaveBeenCalled()`.
  - **No Third-Party / Schema / Stub Tests:** Never test `clsx`, `tailwind-merge`, `server-only` stubs, static constant arrays, or Drizzle table column existence.
  - **No Coverage Threshold Gaming:** Coverage thresholds are intentionally omitted from `vitest.config.ts`. Never write tests to increase line coverage percentages.
```

- [x] **Step 2: Run the complete verification suite across the entire monorepo**

Run: `pnpm check:guards && pnpm lint && pnpm format:check && pnpm typecheck && pnpm knip && pnpm test`
Expected:

- `pnpm check:guards`: All 7 static guards PASS in `<200ms`.
- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm knip`: PASS with 0 errors and 0 warnings.
- `pnpm test`: All 12 workspace packages PASS in **~8–12 seconds total** with **~100 total test files** (down from 511 files / >120s).

- [x] **Step 3: Commit Task 6**

```bash
git add AGENTS.md
git commit -m "docs(agents): enforce strict anti-bloat testing rules and ban coverage-padding tests"
```

---

## Execution Record (2026-11-03)

Completed in six task commits plus two follow-up fixes.

- **Final size:** 108 test files (102 unit/integration + 6 Playwright journeys), down from ~526.
- **`pnpm test` without a database:** 14/14 tasks, 1,121 passed / 37 skipped, ~17s.
- **`pnpm test` with Postgres + the `kestrel_app` role:** 14/14 tasks, 1,157 passed / 0 skipped, ~20s.
- **Gates:** `pnpm check:guards`, `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, and `pnpm knip` all pass.

Deviations from the original plan:

- Package/plugin allowlists were mapped to the real filenames in this tree. One extra db test (`migration-preflight.test.ts`) was kept because `migration-plan.ts` is production code reached through built `dist` imports that knip cannot trace.
- `apps/web` keeps 19 security files, adding `chat-image-paths.test.ts` because the path-traversal guard lives there rather than in `packages/shared`.
- `ai-fast` keeps 11 stateless files; `mastra-guardrails`, `mastra-mutation-policy`, and `level-sanity` moved to `ai-isolated` because they mutate `process.env` or call `vi.mock`.
- The E2E tree contained 29 specs rather than 34; 23 were deleted.
- Coverage thresholds were removed from every config. Coverage reporting remains available through `test:coverage`.
