# Kestrel Automated Test Suite Audit & Execution Blueprint (`TEST_AUDIT_PLAN.md`)

**Role Context for Executing Agent:** You are executing a high-signal test suite remediation across the Kestrel monorepo (`pnpm` + Turborepo + TypeScript + Vitest + Playwright). Every instruction in this document has been verified against the actual production source files and test files in the repository. Follow the batches in order (`Batch 1` -> `Batch 2` -> `Batch 3` -> `Batch 4` -> `Batch 5` -> `Section 4` -> `Section 5`) and run the verification gates after each batch.

---

## Execution Progress (updated 2026-10-17)

**Overall:** Batch 1 ✅ complete. Batch 2 ✅ complete (2026-10-17; 14/17 files pruned exactly as specified, 3 items — #3, #6, #7 — verified as stale/no-op against the current working tree). Batch 3 ✅ complete (2026-10-17; items #10, #11, #12, #15 were executed early because the Batch 1 preamble required their edge-case merges before deleting `cost-estimate.test.ts`, `override-model.test.ts`, `social-sentiment-service.test.ts`, `test-provider-key.test.ts`, `vision-embedding-model.test.ts`, and `chaos-retry.test.ts`; the remaining 21 items were consolidated to table-driven form on 2026-10-17 — see the **Batch 3 verification evidence** block below). All errors surfaced by the Batch 1–2 verification passes were remediated on 2026-10-17 — `pnpm test:empty-guard` ✅, `pnpm typecheck` ✅ 15/15 tasks, `pnpm lint` ✅ 14/14 tasks (see the **Error Remediation** block below). Batch 4 ✅ complete (2026-10-17; 7/7 files rewritten and green — items #2, #6, and #7 were adapted against the **actual** production surface where the plan's API references were stale for this revision, e.g. the class-based `SymbolManager`, the `AuthError`-based `authorizeCredentials`/`handleJwtCallback` contracts, and `isMutationIntent` — see the **Batch 4 verification evidence** block below). Section 4 ✅ complete (8 orphaned `packages/test-utils` files purged, barrel + export map reduced to `makeCandles`). Section 5 ✅ complete — the full `pnpm test` turbo gate passed (9/9 tasks · **3,530 passed / 24 env-gated skips / 0 failed**) and all 5 sabotage checks were executed with fail-on-mutation / green-on-revert evidence. **The audit plan is fully executed — and a post-plan completion pass (2026-10-17) additionally ran the previously-skipped Postgres suites, the E2E suite, and the coverage gate, uncovering and fixing four real bugs; see the **Post-Plan Completion Pass** section at the end of this document.**

**Batch 1 verification evidence (recorded while completing the batch):**
- ✅ `pnpm test:empty-guard` passes. Post-deletion workspace test-file counts: `apps/web` 123, `apps/worker` 27, `packages/ai` 167, `packages/data` 27, `packages/db` 11, `packages/indicators` 16, `packages/shared` 23, `packages/test-utils` 1.
- ✅ All 41 deletions confirmed via `git status` (41× ` D`), and `rg` confirms zero remaining references to any deleted file (outside this plan document).
- ✅ Prerequisite merges verified green in isolation: `packages/ai/test/cost.test.ts` (48 tests), `packages/ai/test/model.test.ts` (50), `packages/ai/src/retry.test.ts` (21), `packages/ai/src/sentiment/social-sentiment-service.test.ts` (15).
- ✅ Workspace suites re-run sequentially after the deletions (turbo's default cross-workspace parallelism flakes 5-second-timeout tests on low-core machines): `packages/test-utils` ✅ 16, `packages/indicators` ✅ 102, `packages/db` ✅ 56 (+1 RLS env-gated skip), `packages/shared` ✅ 395, `packages/data` ✅ 155 (+1 skip), `apps/worker` ✅ 145, `apps/web` ✅ 1073. `packages/ai` finished 1450 passed / 5 failed — all 5 are **pre-existing, deterministic drifts unrelated to Batch 1** (details below).
- ℹ️ Three files failed only under parallel turbo load (`packages/data/test/biquote-rest.test.ts`, `packages/ai/test/mastra-modes.test.ts`, `apps/web/src/__tests__/ux/landing-motion-empirical.test.tsx` — all "timed out in 5000ms" flakes) and each passes 100% when run in isolation → not Batch 1 regressions.
- ⚠️ **Pre-existing `@kestrel/ai` drift to reconcile in a later batch (NOT Batch 1 regressions):** `test/get-price.test.ts` (`rejects unknown symbols` — `BTCUSD` now normalizes to `BTCUSDT`), `test/get-calendar.test.ts` (`currencies accepts USD/EUR/GBP` — `JPY` is now a valid currency), and `test/analyze-fundamental.test.ts` (3 tests now receive currencies in `['USD','EUR']` order). These test files were last updated 2026-08-22/29 while their production tools changed on 2026-10-15 (`58b6092d`) and 2026-10-17 (`f7222c7b` — F-04/F-08/F-16 "cross-asset fundamentals, calendar currencies, batched pricing, summary precision"). All 5 fail deterministically in isolation, involve no Batch 1 file, and the new `BTCUSD → BTCUSDT` normalization is in fact the intended behavior documented by Batch 3 item #5 of this plan. These stale assertions should be updated (or their tool reassigned out of Batch 5's `[KEEP AS-IS]`) when the later batches land.
- ✅ **RESOLVED (2026-10-17, error remediation):** the 5 stale `@kestrel/ai` assertions above were rewritten to assert the intended catalog-driven behavior (BTCUSD→BTCUSDT normalization; G8 calendar currencies incl. `JPY`; F-04 currency lists `['USD','EUR']`/`['USD','GBP']`/`['USD','XAU']`). All three files now pass; see the **Error Remediation** block below.
- ✅ `pnpm typecheck` and `pnpm lint` now pass end-to-end (15/15 and 14/14 turbo tasks, first time since the `typescript@7.0.2` upgrade — see the Error Remediation block). `pnpm knip --no-progress` currently exits 0 — it does not flag the orphaned `packages/test-utils` helpers (they are covered by the package entry config), but Section 4 still purges them by design. The Section 5 sabotage checks are now unblocked: Batch 4 has landed the rewritten `auth-callbacks.test.ts` / `auth-credentials.test.ts`, so all 5 checks have live targets.

**Batch 2 verification evidence (recorded while completing the batch):**
- ✅ `pnpm test:empty-guard` passes across all 8 workspaces (test-file counts unchanged from post-Batch-1: no files were deleted in Batch 2).
- ✅ Full-workspace suites re-run sequentially (per the Batch 1 flake note): `packages/db` ✅ 47 passed (+1 RLS env-gated skip); `apps/web` ✅ 123 files / 1,073 tests passed; `packages/ai` ✅ 164/167 files passed — the 3 failing files are the pre-existing working-tree failures listed below, unrelated to Batch 2.
- ✅ Directly-affected files all green: `packages/db` 21 tests, `packages/ai` 32 tests, `apps/web` 50 tests across the 14 pruned files; `playwright test --list tests/e2e/chat-ui.spec.ts` parses cleanly with the stale tool-card describe removed.
- ✅ `prettier --check` clean on all 14 edited files; targeted `tsc --noEmit` shows **zero** errors in edited files (`packages/db` exit 0; `packages/ai`/`apps/web` expose only pre-existing errors in untouched files).
- ℹ️ Pre-existing failures at the working-tree baseline (untouched by Batch 2): `packages/ai/test/get-price.test.ts` (`BTCUSD` no longer rejected by the schema), `packages/ai/test/analyze-fundamental.test.ts` (currency ordering changed), `packages/ai/test/get-calendar.test.ts` (GBP accepted by the currencies schema) — deterministic in isolation; caused by the in-progress cross-asset fundamentals / calendar-currency work (`f7222c7b` + working-tree edits). Pre-existing typecheck errors also remained in `packages/ai/test/risk-sizing.test.ts`, `packages/ai/src/mastra-v2/workflows/mutation.ts`, and `apps/web/src/components/chat/parts/registry.tsx`. → ✅ **All fixed in the error remediation below.**
- ℹ️ `pnpm lint` was blocked repo-wide by a pre-existing toolchain incompatibility (`@typescript-eslint/typescript-estree@8.60.0` vs `typescript@7.0.2` → `TypeError: Cannot read properties of undefined (reading 'Cjs')` at config load, crashing on untouched files too). → ✅ **Fixed in the error remediation below** (`packages/config` now pins `typescript@~6.0.3` for the lint toolchain).

**Batch 3 verification evidence (recorded while completing the batch, 2026-10-17):**
- ✅ `pnpm test:empty-guard` passes across all 8 workspaces. Note: `scripts/check-test-files.mjs` only recognises `it(`/`it.each(` at line start, so the five files whose tables used the `it.each<{...}>([...])` generic syntax were refactored to an equivalent scanner-visible form — `const CASES: Array<...> = [...]` + `it.each(CASES)(...)`: `apps/web/test/{cn,health-badge,session}.test.ts`, `packages/ai/src/portfolio/risk-service.test.ts`, `packages/ai/test/rate-limits.test.ts`.
- ✅ **All 21 remaining Batch 3 files verified green in isolation** (expanded case counts): `packages/test-utils` 10 · `packages/indicators/defaults` 8 · `packages/shared`: error-patterns 12 / errors 21 / normalization 52 / symbol-catalog 20 · `packages/data`: biquote-map 21 / health 11 · `packages/ai`: risk-service 8 / fallback 22 / message-text 38 / parse-indicator-spec 20 / rate-limits 10 / redact 23 / validate-provider-config 11 · `apps/web`: cn 20 / format-number 30 / format 24 / health-badge 11 / session 19. `playwright test --list tests/e2e/theme-tokens.spec.ts` parses cleanly (1 consolidated test × chromium/firefox/webkit + the auth setup).
- ✅ **Full sequential per-workspace sweep of every touched workspace:** `packages/test-utils` ✅ 10 · `packages/indicators` ✅ 102 · `packages/shared` ✅ 450 (up from 395 — the `it.each` tables expand the runnable case count) · `packages/data` ✅ 174 passed (+1 Postgres-gated skip) · `packages/ai` ✅ **167 files / 1,467 passed / 22 env-gated skips / 0 failed** · `apps/web` ✅ 123 files / 1,085 tests (the 3 empty-guard-restructured web files were re-verified green after the sweep: 50 tests).
- ⚠️ **Environment caveat for the AI sweep:** this sandbox exports the agent-runtime `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_MODEL` variables, which leak into the four "no keys configured" model-resolution suites (`test/model.test.ts`, `test/chat-model.test.ts`, `test/routing-semantic-config.test.ts`, `test/baseline-route-matrix.test.ts`) and produce 14 environment-dependent failures. With `ANTHROPIC_*` unset (as in CI), those four files pass 81/81 — unrelated to Batch 3 (none of the four files were touched).
- ✅ **Static gates re-verified after the empty-guard refactor:** `pnpm typecheck` ✅ 15/15 turbo tasks (plus direct `tsc --noEmit` exit 0 for `@kestrel/ai` and `@kestrel/web`); `pnpm lint` ✅ 14/14 turbo tasks with **0 errors** (only pre-existing warnings); `prettier --check` ✅ on every file touched by Batch 3.

**Batch 4 verification evidence (recorded while completing the batch, 2026-10-17):**
- ✅ **All 7 rewritten files verified green in isolation — 75 tests total:** `packages/db/test/with-user-scope.test.ts` 4 · `apps/worker/test/symbol-manager.test.ts` 6 · `packages/ai/test/integration/ai-data.integration.test.ts` 4 · `packages/ai/test/usage.test.ts` 4 · `apps/web/test/admin-ai-eval.test.tsx` 30 · `apps/web/test/auth-callbacks.test.ts` 8 · `apps/web/test/auth-credentials.test.ts` 19.
- ✅ **Full sequential per-workspace sweep of every touched workspace:** `packages/db` ✅ 48 passed (+1 RLS-gated skip) · `apps/worker` ✅ 27 files / 147 passed · `apps/web` ✅ 123 files / **1,134 passed** (up from 1,085 — the three rewritten web files now expand to 57 runnable cases) · `packages/ai` ✅ **167 files / 1,465 passed / 22 env-gated skips / 0 failed** (run with the sandbox `ANTHROPIC_*` vars unset, per the Batch 3 caveat).
- ✅ **Static gates re-run after Batch 4:** `pnpm test:empty-guard` ✅ all 8 workspaces · `pnpm typecheck` ✅ 15/15 turbo tasks · `pnpm lint` ✅ 14/14 turbo tasks with 0 errors · `pnpm knip --no-progress` ✅ exit 0 (unchanged 9 advisory config hints) · `prettier --check` ✅ on all 7 files.
- ✅ **Sabotage Check 5 pre-verified against the Batch 4 rewrite (2026-10-17):** flipping the inline fail-closed return in `apps/web/src/lib/auth/callbacks.ts` to `user: { id: 'leaked-user' }` made the rewritten `apps/web/test/auth-callbacks.test.ts` fail immediately (1 failed / 7 passed); `git checkout --` restored the file and the suite returned to 8/8 green.
- ℹ️ **Stale plan references adapted against the actual production surface (per the Batch 2/3 convention):**
  - **#2 `symbol-manager.test.ts`:** the plan's `refreshActiveSymbols` / `getActiveSymbols` / `onSymbolsChanged` functional API does **not** exist in this revision; the module is the class-based `SymbolManager` querying `listDistinctSymbols()` from `@kestrel/db`. The rewrite mocks that DB boundary and drives the real class (default fallback, unknown-symbol filtering, per-consumer `biquoteChanged`/`binanceChanged` diff math, unchanged-set no-op, DB-failure retention, double-start no-op). Note the real contract differs from the plan's prose: valid DB symbols **replace** the defaults; the default watchlist is used only when the DB returns zero symbols.
  - **#6 `auth-callbacks.test.ts`:** the plan's `@/lib/session` / `getLoginMeta` / `createUserSession → null` references do not exist; the real module persists via `@kestrel/db.createUserSession` and **throws `AuthError('SESSION_SYSTEM_ERROR')`**, and session invalidation is delegated to the real `validateSession` fail-closed policy. The rewritten tests mock only `@kestrel/db` (session insert + schema stubs) and `@kestrel/ai` (`getDb`), then exercise the real callback + validator code paths, asserting the invariant `{ expires: '0', user: undefined }` (the invalidated session legitimately retains `sessionId`, which is merged before validation).
  - **#7 `auth-credentials.test.ts`:** the plan's `checkAccountLockout` / `recordFailedLogin` / `setLoginFailureReason` / `consumeBackupCode` helpers do not exist; the real `authorizeCredentials` throws `AuthError('ACCOUNT_LOCKED' | '2FA_REQUIRED' | 'INVALID_2FA_CODE')`, increments `failedLoginAttempts` / `failed2faAttempts` via Drizzle updates, and consumes bcrypt-hashed backup codes. Tests use real `bcryptjs` hashing (cost 4) with only the DB/encryption/TOTP boundaries mocked; `passwordSchema` is exercised against the production 10–128-char rule (the plan's ">72 chars" predates `PASSWORD_MAX = 128`).
  - **#5 `admin-ai-eval.test.tsx`:** the plan's `isMutatingIntent` export is named `isMutationIntent`; the eval-set gate assertion uses the real `extractMastraSymbol` + `isMastraXauusdCandidate` (verified: every `AI_EVAL_PROMPTS` entry passes the real gate).

**Error Remediation & Gate Status (2026-10-17, executed after Batch 2):** every error surfaced by the Batch 1–2 verification passes was fixed so the Section 5 gates can actually run.

- ✅ **Static gates now pass end-to-end (first time since the `typescript@7.0.2` upgrade):**
  - `pnpm test:empty-guard` ✅ — all 8 workspaces.
  - `pnpm typecheck` ✅ — **15/15 turbo tasks successful** (was: 2 errors in `packages/ai` + 9 in `apps/web`).
  - `pnpm lint` ✅ — **14/14 turbo tasks successful** (was: crashed repo-wide at ESLint config load).
  - `prettier --check` ✅ on every file touched by the remediation.
- ✅ **ESLint toolchain restored (root cause fix):** `typescript@7.0.2` (the native compiler) no longer ships the JavaScript compiler API, which `typescript-eslint@8.x` requires at parser load. `packages/config` (the shared ESLint preset package, which owns the `typescript-eslint` dependency) now pins `typescript@~6.0.3` — the last JS-API release and inside typescript-eslint's `>=4.8.4 <6.1.0` peer range — so **linting runs on TS 6 while every app/package still compiles with TS 7.0.2**. `pnpm install` re-resolved all `typescript-eslint` peer instances to `typescript@6.0.3` and updated `pnpm-lock.yaml`; no other workspace changed its compiler.
- ✅ **38 pre-existing lint errors fixed** (hidden while ESLint could not run): unused imports in `packages/ai/src/mastra-v2/{packets/symbol-research,planning/routing-policy,planning/mode-runner,workflows/full-analysis}.ts`; `apps/worker/src/runner/cli.ts` (unused `ping`); `apps/worker/test/runner-lock.test.ts` (inline `import()` types → top-level `import type * as`); `apps/web` (`IconCpu` in `admin-platform-config.tsx`, `EventCurrency` in `calendar-toolbar.tsx`, `BYOK_PROVIDERS`/`BYOK_PROVIDERS_LIST` in the platform-config route, dead `profile` binding in `pixel-desk.tsx`, 4 empty `catch {}` blocks in `mastra-stream-response.ts`); `packages/data` (`z.ZodType<T, any, any>` → `z.ZodType<T, z.ZodTypeDef, unknown>` in `providers/biquote/rest.ts`, unused `ProviderError` import in `test/failover-abort.test.ts`, `as any` → typed `MarketDataProvider` in `test/price-timestamp.test.ts`); plus `any` elimination in `packages/db/test/with-user-scope.test.ts`, `packages/ai/test/byok-embeddings.test.ts`, and `packages/ai/test/convene-committee.test.ts` (typed `CommitteeResult` + shared `ToolCallOptions`).
- ✅ **Typecheck errors fixed:**
  - `packages/ai/src/mastra-v2/workflows/mutation.ts` — Mastra's `Workflow` inferred `TInput` from the raw schema's *input* side while `createStep` types `inputData` from the *parsed output*; `AlertRuleSchema`'s `tf` transform made the two diverge and broke the first `.then(draftStep)`. Fixed with a documented `WorkflowInputSchema` boundary type (runtime validation still runs the full `MutationInputSchema`).
  - `packages/ai/test/risk-sizing.test.ts` — fixtures updated to the current `PortfolioPosition` schema (dropped removed `realizedPnlUsd`/`source` fields; added `createdAt`/`updatedAt`/`linkedSignalId`).
  - `apps/web/src/components/chat/parts/registry.tsx` — `partSchemas` map re-typed `z.ZodType<ToolOutput<K>, z.ZodTypeDef, unknown>` (Zod input/output variance for transform schemas such as `TimeframeSchema`).
- ✅ **5 stale `@kestrel/ai` assertions reconciled to their intended production behavior:** `test/get-price.test.ts` now asserts `BTCUSD → BTCUSDT` normalization + unknown-symbol rejection; `test/get-calendar.test.ts` asserts G8 currency acceptance (`JPY`) + unknown rejection (`XYZ`); `test/analyze-fundamental.test.ts` expects the catalog-driven F-04 currency lists (`['USD','EUR']`, `['USD','GBP']`, `['USD','XAU']`).
- ✅ **Full monorepo test sweep (sequential, per the low-core flake guidance) — all 8 workspaces green:**
  - `apps/web` 123 files / 1,073 tests · `packages/ai` **167 files / 1,452 passed (0 failed)** · `apps/worker` 27 / 145 · `packages/db` 47 (+1 RLS-gated skip) · `packages/data` 154 (+1 skip) · `packages/shared` 395 · `packages/indicators` 102 · `packages/test-utils` 16 → **3,384 passed / 0 failed / 24 env-gated skips**.
- ✅ `pnpm knip --no-progress` now exits 0: the unused `glob` dependency was removed from `apps/web/package.json`. 9 advisory "redundant entry pattern" configuration hints remain (non-failing; the `packages/shared` entry points are already covered by the package `exports` map — they do not affect the exit code).
- ✅ **RESOLVED (2026-10-17, completion pass):** the literal `pnpm test` turbo gate was re-run on the now 4-core box with `--concurrency=1` (and `ANTHROPIC_*` unset) and passed: **9/9 turbo tasks · 3,530 passed / 24 env-gated skips / 0 failed**. The earlier pause note (low-core oversubscription, no recorded failures) is superseded. All 5 sabotage checks were executed on the same day — each mutation failed the suite immediately and each revert restored green (see the Section 5 execution records).

---

## Section 1: Baseline & Testing Infrastructure Context

### 1.1 Exact Commands for the Executing Agent

| Operation | Exact Command | Notes |
| :--- | :--- | :--- |
| **Run a single Vitest test file (fastest)** | `pnpm --filter <workspace> exec vitest run <relative-path-inside-package>` | Example: `pnpm --filter @kestrel/ai exec vitest run test/cost.test.ts` or `pnpm --filter @kestrel/web exec vitest run test/auth-callbacks.test.ts` |
| **Run all tests in a single workspace** | `pnpm --filter <workspace> test` | Workspaces: `@kestrel/shared`, `@kestrel/indicators`, `@kestrel/db`, `@kestrel/data`, `@kestrel/ai`, `@kestrel/worker`, `@kestrel/web`, `@kestrel/test-utils` |
| **Run the full monorepo unit/integration suite** | `pnpm test` | Runs `turbo run test` across all 8 workspaces |
| **Run the full suite with V8 coverage thresholds** | `pnpm test:coverage` | Enforces per-workspace coverage thresholds in `vitest.config.ts` |
| **Run the CI empty-test-file guard** | `pnpm test:empty-guard` | Executes `node scripts/check-test-files.mjs` (fails if any `.test.ts(x)` file has 0 `it`/`test` blocks or if any workspace with a `"test"` script has 0 test files) |
| **Run the Postgres RLS & queue integration suites** | `pnpm test:postgres-rls` and `pnpm test:ai-queue-postgres` | Requires Docker (`pgvector/pgvector:pg16`); gated by `RUN_DB_POSTGRES_RLS_TESTS=1` and `RUN_AI_QUEUE_POSTGRES_TESTS=1` |
| **Run Playwright E2E tests** | `pnpm --filter @kestrel/web test:e2e` | Runs `playwright test` against `apps/web/tests/e2e/*.spec.ts` |
| **Run TypeScript typechecker across monorepo** | `pnpm typecheck` | Runs `turbo run typecheck` (`tsc --noEmit`) |
| **Run ESLint across monorepo** | `pnpm lint` | Runs `turbo run lint` |
| **Run Knip dead-code / unused-export check** | `pnpm knip --no-progress` | Enforced in `.github/workflows/ci-fast.yml`; catches orphaned helpers and unused exports |

### 1.2 Critical CI Guardrails & Invariants You Must Respect

1. **Empty-Test-File & Empty-Workspace Guard (`scripts/check-test-files.mjs`):**
   - Executed via `pnpm test:empty-guard` in `.github/workflows/ci-fast.yml`.
   - Any `.test.ts` or `.test.tsx` file with zero active `it(...)` or `test(...)` calls fails CI immediately. When deleting tests from a file, either keep at least one active test in that file (`[PRUNE SPECIFIC TESTS]`) or delete the entire file (`[DELETE ENTIRE FILE]`).
   - Any workspace directory under `apps/*` or `packages/*` whose `package.json` defines a `"test"` script MUST contain at least one `.test.ts(x)` file. Therefore, in `packages/test-utils`, you must **keep** `packages/test-utils/src/factories/candles.test.ts` (consolidated into a table-driven test) while deleting the other 5 unused mock/factory test files.
2. **Coverage Thresholds (`vitest.config.ts`):**
   - Each workspace defines V8 coverage thresholds in its `vitest.config.ts` (`packages/indicators` 90% lines/statements, `packages/shared` 80% lines/statements, `packages/data` 68% lines/statements, `packages/ai` 55% lines/70% branches, `packages/db` 28% lines/75% branches, `apps/worker` 50% lines/70% branches, `apps/web` 42% lines/68% branches).
   - Pure `fs.readFileSync` tests contribute **0%** to V8 code coverage because they never import or execute the production TypeScript module. Deleting them does not lower coverage, and replacing mock-heavy or `readFileSync` tests with real behavioral invocations in Batch 4 **increases** real coverage.

### 1.3 Inventory of High-Value Existing Test Utilities & Fixtures to Reuse

Reuse these battle-tested helpers when consolidating tests or replacing mocks with real behavioral/integration tests:

| Utility / Fixture | Exact File Path | Key Exports & Purpose |
| :--- | :--- | :--- |
| **Scripted Deterministic LLM Client** | `packages/ai/test/helpers/scripted-llm.ts` | `createScriptedLlmClient(scenarios)`, `scriptedModel()` — deterministic in-memory `LlmClient` and AI SDK `LanguageModel` fake that executes real tool callbacks (`opts.tools[toolName].execute`), emits token usage, and triggers `opts.onFinish` without network calls. |
| **Disposable Postgres + Mastra Queue Harness** | `packages/ai/test/helpers/full-analysis-queue-db.ts` | `withQueueStorage(fn)` — provisions an isolated Postgres database (`pgvector/pgvector:pg16`), runs all Drizzle SQL migrations from `packages/db/drizzle`, seeds `user-1` + `organization`, registers the `DB` DI token, and initializes a file-backed `LibSQLStore` Mastra instance. |
| **Two-Tenant RLS Seed Fixture** | `packages/db/test/fixtures/two-tenant.ts` | `TWO_TENANT_IDS`, `seedTwoTenantBillingAndTraceData(execute)` — seeds two isolated tenants (`user-a`, `user-b`), plans, subscriptions, NOWPayments rows, and diagnostic traces for cross-tenant isolation testing. |
| **Deterministic Candle Series Factory** | `packages/indicators/test/fixtures.ts` (and `packages/test-utils/src/factories/candles.ts`) | `makeCandles(closes, opts)` — builds valid `Candle[]` arrays with deterministic timestamps and customizable `highs`/`lows` for hand-verifiable indicator and market-structure math. |
| **NextAuth Session Helper** | `apps/web/test/auth-helpers.ts` | `mockNextAuthSession(userId)` — returns a typed NextAuth session mock for server action and API route handler tests. |
| **Global Web Vitest Setup** | `apps/web/test/vitest.setup.ts` | Configures `@testing-library/jest-dom/vitest`, mocks `next-view-transitions`, polyfills `crypto.subtle` and `PointerEvent`, and sets a default `DATABASE_URL` fallback. |
| **Playwright Composable Auth & SSE Fixtures** | `apps/web/tests/e2e/fixtures.ts` & `apps/web/tests/e2e/test-utils.ts` | `test` (`authedPage`, `mockChatApi`, `testUser`, `workerUser`), `authenticateAs`, `ensureTestUser`, `createSessionForUser`, `selectAnalysisMode`, `FULL_MODE_SSE`, `SINGLE_MODE_SSE`. |

### 1.4 Baseline Metrics (Measured Across the Monorepo)

| Workspace | Vitest Files (`.test.ts/tsx`) | Playwright Specs (`.spec.ts`) | Static `it`/`test` Blocks | Expanded Vitest Cases (Offline Run) | Baseline Status | Baseline Runtime (Cold / Warm) |
| :--- | ---: | ---: | ---: | ---: | :--- | ---: |
| `packages/test-utils` (`@kestrel/test-utils`) | 6 | 0 | 32 | 32 | 6 passed | 1.98s / 0.8s |
| `packages/indicators` (`@kestrel/indicators`) | 16 | 0 | 207 | 222 | 16 passed | 4.94s / 1.5s |
| `packages/db` (`@kestrel/db`) | 15 | 0 | 112 | 99 (+13 RLS-gated) | 13 passed, 2 env-gated (`RUN_DB_POSTGRES_RLS_TESTS=1`) | 4.86s / 1.4s |
| `packages/shared` (`@kestrel/shared`) | 23 | 0 | 557 | 599 | 23 passed | 10.67s / 3.2s |
| `packages/data` (`@kestrel/data`) | 28 | 0 | 287 | 287 | 28 passed | 7.62s / 2.9s |
| `apps/worker` (`@kestrel/worker`) | 32 | 0 | 234 | 234 | 32 passed | 20.69s / 6.1s |
| `packages/ai` (`@kestrel/ai`) | 177 | 0 | 1,073 | 1,063 (+10 PG-gated) | 175 passed, 2 env-gated (`RUN_AI_QUEUE_POSTGRES_TESTS=1`) | 109.76s / 48.0s |
| `apps/web` (`@kestrel/web`) | 139 | 29 | 963 (Vitest) + 239 (E2E) | 963 (Vitest) | 139 Vitest passed; 29 E2E specs | 78.31s / 31.0s |
| **Total** | **436** | **29** | **3,704** (`3,465` Vitest + `239` E2E) | **3,499** (+23 PG-gated) | **432 passed, 4 PG-gated, 29 E2E** | **238.83s cold / ~95s warm** |

## Section 2: Global Anti-Patterns Found in This Repo

Before executing the file-by-file plan in Section 3, internalize the four systemic "test slop" failure modes present in this repository so you do not reintroduce them during consolidations or rewrites:

### Anti-Pattern 1: `fs.readFileSync` Source-Code Substring Grepping ("Contract/Policy Slop")
- **What it does:** Opens production `.ts`, `.tsx`, `.css`, or `.mjs` files via `fs.readFileSync(..., 'utf8')` and runs `expect(source).toContain(...)` or regex matches against internal variable names, comments, or Tailwind class strings without ever importing or executing the production code.
- **Concrete Repo Examples:**
  1. `apps/worker/test/scheduler-idempotency.test.ts` (lines 22–65): Reads `apps/worker/src/scheduler.ts` as text and asserts `expect(schedulerSource).toContain('const _runningJobs = new Set<string>()')` and `expect(schedulerSource).toContain('if (_runningJobs.has(name))')`. Renaming `_runningJobs` to `activeJobs` breaks the test immediately while real concurrency behavior is already tested in `apps/worker/test/cron-lock.test.ts` and `apps/worker/test/runner-lock.test.ts`.
  2. `packages/db/test/phase6-7-8.test.ts` (lines 70–137): Reads `packages/db/src/schema/index.ts`, `packages/shared/src/schemas/entities.ts`, and `packages/data/src/providers/fred.ts` as raw strings and asserts substring matches like `expect(src).toContain('DESIGN DECISION')`, `expect(src).toContain('120_000')`, and `expect(src).toContain('withRetry')`.
  3. `apps/web/test/auth-callbacks.test.ts` (lines 18–56) & `apps/web/src/__tests__/ux/landing-motion-empirical.test.tsx` (lines 95–111, 236–267): Asserts `expect(source).toContain('SESSION_SYSTEM_ERROR')` or `expect(source).toContain('coreGeo.dispose()')` on source text instead of invoking `handleJwtCallback` and `handleSessionCallback`.

### Anti-Pattern 2: Zero-Import Self-Testing Closures (Testing Local Functions Defined Inside the Test File)
- **What it does:** Defines a local helper function, validation schema, or React component *inside the `.test.ts` file itself* (often with a comment claiming the production function is private or hard to call) and writes dozens of assertions against the local copy. If the production file is deleted or completely broken, these tests still pass 100%.
- **Concrete Repo Examples:**
  1. `packages/db/test/billing-transactions.test.ts` (lines 1–102): Has **zero** imports from `@kestrel/db` or any production file (`import { describe, expect, it } from 'vitest'` is the only import). It creates local object literals (`const plan = { priceUsdCents: 2900 }`) and tests JavaScript arithmetic (`expect(payment.payAmount >= payment.priceAmount).toBe(true)`).
  2. `packages/ai/test/usage.test.ts` (lines 28–57) & `packages/ai/test/chaos-retry.test.ts` (lines 173–305): `usage.test.ts` has zero production imports and defines a local `function reduce(rows: Row[], now: Date)` that doesn't even match `computeUsage()` in `packages/ai/src/usage.ts` (which reads `daily_ai_spend.totalUsdCents`). `chaos-retry.test.ts` defines a local 50-line `function createCircuitBreaker` inside the test file and tests it instead of importing `packages/ai/src/model-circuit-breaker.ts`.
  3. `apps/worker/test/scheduler-behavior.test.ts` (lines 26–128) & `apps/web/test/auth-flow.test.ts` (lines 31–361): `scheduler-behavior.test.ts` defines a local `runWithGuard` closure with zero production imports; `auth-flow.test.ts` defines local `validatePassword`, `parseBcryptCost`, `hashToken`, `validate2FA`, `isSessionValid`, and `isSessionExpired` functions inside the test file instead of importing `apps/web/src/lib/validation.ts` or `apps/web/src/lib/auth-tokens.ts`.

### Anti-Pattern 3: Tautological Mock Chains, Commented-Out Assertions & `typeof` Export Theater
- **What it does:** Mocks internal modules or database chains and asserts only that the mock returned its hardcoded value, or asserts `expect(typeof fn).toBe('function')` / `expect(true).toBe(true)`, or comments out the actual assertions.
- **Concrete Repo Examples:**
  1. `packages/ai/test/full-analysis-resilience.test.ts` (lines 1–16): Contains only two tests: `expect(typeof claimNextFullAnalysisQueue).toBe('function')` and `expect(typeof recoverStaleFullAnalysisQueue).toBe('function')`.
  2. `packages/db/test/isolated-db.test.ts` (lines 1–132): Imports `createTestDb` from `@kestrel/test-utils` (whose `.select()` is hardcoded to resolve to `[]`) and asserts `expect(rows).toEqual([])` under the misleading test name `'queries return empty arrays when no data matches'`.
  3. `apps/worker/test/symbol-manager.test.ts` (lines 58–124) & `packages/db/test/phase6-7-8.test.ts` (lines 24–67): All real assertions are commented out (`// expect(active).toEqual(...)`) or replaced with `expect(true).toBe(true)`.

### Anti-Pattern 4: Fragmented Duplicate Files, Real-Timer Sleeps & Stale Theme Assertions
- **What it does:** Splits unit tests for the same function across 2–4 separate `.test.ts` files, waits on real wall-clock timers when fake timers are already used elsewhere, or asserts pre-Hoplite Dark CSS hex values.
- **Concrete Repo Examples:**
  1. `packages/ai/test/tool-timeout.test.ts` (lines 27–37): Runs `withTelemetry` against a never-resolving promise **without** `vi.useFakeTimers()`, sleeping for **25,000ms of real wall-clock time** to test the exact same `ToolTimeoutError` deadline that `packages/ai/test/with-telemetry.test.ts` (lines 215–236) tests in 2ms using `vi.useFakeTimers()`.
  2. `apps/web/tests/e2e/theme-tokens.spec.ts` & `apps/web/tests/e2e/chat-ui.spec.ts` (line 235): Assert legacy theme tokens (`#0a0a0a`, `#141414`, `#f56e0f`, `2px`) that were replaced in `apps/web/src/app/globals.css` (`#121212`, `#1a1a1a`, `#ff3616`, `4px`).

## Section 3: File-by-File Audit & Action Specifications

Every single one of the **465 test files** in the repository (`436` Vitest `.test.ts`/`.test.tsx` files + `29` Playwright `.spec.ts` files) is categorized below into 5 ordered **Execution Batches**:

| Execution Batch | Verdict | File Count | Purpose | Status |
| :--- | :--- | ---: | :--- | :--- |
| **Batch 1** | `[DELETE ENTIRE FILE]` | **41** | Pure `fs.readFileSync` source-grepping slop, zero-import local closures, `typeof` export theater, unused mock self-tests, and 100% duplicate files | ✅ **COMPLETE** — 41/41 deleted (2026-10-17) |
| **Batch 2** | `[PRUNE SPECIFIC TESTS]` | **17** | High-signal test files mixed with brittle `readFileSync` blocks, local self-testing closures, or duplicate `describe` blocks | ✅ **COMPLETE** — 14/17 pruned, 3 verified no-op (2026-10-17) |
| **Batch 3** | `[CONSOLIDATE TO TABLE-DRIVEN]` | **25** | Copy-paste bloat (5–35 repetitive `it` blocks) consolidated into parameterized `it.each` tables | ✅ **COMPLETE — 25/25 done (2026-10-17)** (4 early as Batch 1 prerequisites; 21 on 2026-10-17) |
| **Batch 4** | `[REPLACE MOCKS WITH INTEGRATION]` | **7** | Files that mocked internal modules or used local closures/source greps instead of executing real production entry points | ✅ **COMPLETE — 7/7 rewritten (2026-10-17)** |
| **Batch 5** | `[KEEP AS-IS]` | **375** | High-signal behavioral unit, property-based (`fast-check`), Postgres RLS/queue integration, and Playwright E2E tests | — no action required |
| **Total** | — | **465** | **100% of repository test files accounted for** | 41 deleted, 4 consolidated |

### Batch 1: Pure Deletions & Dead Fixtures (41 Files — `[DELETE ENTIRE FILE]`) — ✅ COMPLETE

**Status: ✅ COMPLETE (2026-10-17). All 41 files deleted; `pnpm test:empty-guard` passes; all prerequisite merges landed in the four Batch 3 target files.**

Delete each of the following 41 test files completely (`rm <file>`). Before deleting `cost-estimate.test.ts`, `override-model.test.ts`, `social-sentiment-service.test.ts`, `test-provider-key.test.ts`, and `vision-embedding-model.test.ts`, merge their unique edge cases into `cost.test.ts`, `src/sentiment/social-sentiment-service.test.ts`, and `model.test.ts` as specified in Batch 3.

> ✅ **Completed prerequisites (executed 2026-10-17):** the unique edge cases from all five deleted fragment files, plus `chaos-retry.test.ts`'s mid-backoff abort test, were merged into `@kestrel/ai` test targets — `test/cost.test.ts`, `test/model.test.ts`, `src/sentiment/social-sentiment-service.test.ts`, and `src/retry.test.ts` — together with their Batch 3 table-driven consolidations (Batch 3 items #10–#12 and #15 are therefore also complete). Each merged file passes green in isolation.

#### ✅ 1. `packages/test-utils/src/factories/users.test.ts`
- **File Path:** `packages/test-utils/src/factories/users.test.ts`
- **Production Target:** `packages/test-utils/src/factories/users.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** Tests an orphaned mock factory (`makeUser`, `makeSession`, `resetUserCounter`) that has zero imports anywhere in `packages/*` or `apps/*`. All 6 tests merely assert that the factory returns the hardcoded object literal fields it was given (`expect(user.role).toBe('user')`).
- **Exact Instructions for Executing Agent:**
  - Delete `packages/test-utils/src/factories/users.test.ts` in its entirety (and purge `packages/test-utils/src/factories/users.ts` in Section 4).

#### ✅ 2. `packages/test-utils/src/factories/threads.test.ts`
- **File Path:** `packages/test-utils/src/factories/threads.test.ts`
- **Production Target:** `packages/test-utils/src/factories/threads.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** Tests an orphaned mock factory (`makeThread`, `makeMessage`, `resetThreadCounter`) that has zero imports anywhere in the repository outside `packages/test-utils`. Asserts trivial object literal construction.
- **Exact Instructions for Executing Agent:**
  - Delete `packages/test-utils/src/factories/threads.test.ts` in its entirety (and purge `packages/test-utils/src/factories/threads.ts` in Section 4).

#### ✅ 3. `packages/test-utils/src/helpers/vitest.test.ts`
- **File Path:** `packages/test-utils/src/helpers/vitest.test.ts`
- **Production Target:** `packages/test-utils/src/helpers/vitest.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** Self-tests `setupTestEnvironment`, `teardownTestEnvironment`, `freezeTime`, and `advanceTime` — trivial 1-line wrappers around `process.env` assignment and `vi.setSystemTime` / `vi.advanceTimersByTime` that have zero imports anywhere in the repository outside `packages/test-utils`.
- **Exact Instructions for Executing Agent:**
  - Delete `packages/test-utils/src/helpers/vitest.test.ts` in its entirety (and purge `packages/test-utils/src/helpers/vitest.ts` in Section 4).

#### ✅ 4. `packages/test-utils/src/mocks/fetch.test.ts`
- **File Path:** `packages/test-utils/src/mocks/fetch.test.ts`
- **Production Target:** `packages/test-utils/src/mocks/fetch.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** Self-tests `createMockFetch()`, an unused fetch wrapper with zero imports across all workspaces (`packages/data`, `packages/ai`, `apps/worker`, and `apps/web` all use `vi.fn()` or `vi.stubGlobal('fetch', ...)` directly).
- **Exact Instructions for Executing Agent:**
  - Delete `packages/test-utils/src/mocks/fetch.test.ts` in its entirety (and purge `packages/test-utils/src/mocks/fetch.ts` in Section 4).

#### ✅ 5. `packages/test-utils/src/mocks/llm.test.ts`
- **File Path:** `packages/test-utils/src/mocks/llm.test.ts`
- **Production Target:** `packages/test-utils/src/mocks/llm.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** Self-tests `createMockLlm()`, an unused mock LLM helper superseded by `packages/ai/test/helpers/scripted-llm.ts` (`createScriptedLlmClient`) with zero imports outside `packages/test-utils`.
- **Exact Instructions for Executing Agent:**
  - Delete `packages/test-utils/src/mocks/llm.test.ts` in its entirety (and purge `packages/test-utils/src/mocks/llm.ts` in Section 4).

#### ✅ 6. `packages/db/test/billing-transactions.test.ts`
- **File Path:** `packages/db/test/billing-transactions.test.ts`
- **Production Target:** `packages/db/src/billing-store.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** Zero production imports (`import { describe, expect, it } from 'vitest'` is the only import in the file). All 4 `describe` blocks (`createSubscriptionTransaction`, `recordPaymentEvent`, `expireOverdueSubscriptions`, `billing amount validation`) construct local JavaScript object literals and assert trivial arithmetic (`expect(payment.payAmount >= payment.priceAmount).toBe(true)`) without touching `packages/db/src/billing-store.ts`.
- **Exact Instructions for Executing Agent:**
  - Delete `packages/db/test/billing-transactions.test.ts` in its entirety.

#### ✅ 7. `packages/db/test/isolated-db.test.ts`
- **File Path:** `packages/db/test/isolated-db.test.ts`
- **Production Target:** `packages/db/src/index.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** 100% mock theater. Imports `createTestDb` from `@kestrel/test-utils` (an in-memory mock object whose `.select()` method is hardcoded to resolve to `[]`) and asserts `expect(rows).toEqual([])` and `expect(testDb.inserted).toHaveLength(1)`. Never imports or executes any function from `@kestrel/db`.
- **Exact Instructions for Executing Agent:**
  - Delete `packages/db/test/isolated-db.test.ts` in its entirety.

#### ✅ 8. `packages/db/test/phase6-7-8.test.ts`
- **File Path:** `packages/db/test/phase6-7-8.test.ts`
- **Production Target:** `packages/db/src/schema/index.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** Lines 24–67 (`Phase 6 — portfolio schema`) have all real column assertions commented out and replaced with `expect(true).toBe(true)`. Lines 70–137 (`Phase 6 — retention policy documentation`, `Phase 7 — FRED retry wiring`, `Phase 8 — symbol catalog expansion`) use `fs.readFileSync` to grep source comments (`'DESIGN DECISION'`), literal numbers (`'120_000'`), and `'withRetry'`. Real symbol catalog and retention behavior are already tested in `packages/shared/test/symbol-catalog.test.ts` and `packages/db/test/retention.test.ts`.
- **Exact Instructions for Executing Agent:**
  - Delete `packages/db/test/phase6-7-8.test.ts` in its entirety.

#### ✅ 9. `packages/db/test/rate-limit.test.ts`
- **File Path:** `packages/db/test/rate-limit.test.ts`
- **Production Target:** `packages/db/src/rate-limit.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** Defines a local `function extractCount(rows: unknown): number` inside the test file (lines 22–27) with zero imports from `@kestrel/db`, and lines 29–52 test that local copy. Worse, this exact same local `extractCount` test is copy-pasted verbatim in `packages/db/test/index.test.ts` (lines 101–131), while real behavioral `withRateLimit` tests already exist in `packages/db/test/index.test.ts` (lines 58–99).
- **Exact Instructions for Executing Agent:**
  - Delete `packages/db/test/rate-limit.test.ts` in its entirety.

#### ✅ 10. `packages/data/test/storage-boundary.test.ts`
- **File Path:** `packages/data/test/storage-boundary.test.ts`
- **Production Target:** `packages/data/src/storage.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** Contains a single 25-line test (`passes rows with Date asOf directly to storage.upsertCandles`) that mocks a `DataStorage` object with `vi.fn()` and is 100% covered by `packages/data/test/storage.test.ts` (`getStorage / setStorage / resetStorage`, `saveCandles / loadCandles`).
- **Exact Instructions for Executing Agent:**
  - Delete `packages/data/test/storage-boundary.test.ts` in its entirety.

#### ✅ 11. `apps/worker/test/scheduler-behavior.test.ts`
- **File Path:** `apps/worker/test/scheduler-behavior.test.ts`
- **Production Target:** `apps/worker/src/scheduler.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** Has **zero** imports from `apps/worker/src/*` (`import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'` is the only import). Defines its own local `const _runningJobs = new Set<string>()` and local `async function runWithGuard(...)` at lines 26–44 and runs 5 tests against its own local closure. Real overlap and lease guard behavior is tested in `apps/worker/test/cron-lock.test.ts` and `apps/worker/test/runner-lock.test.ts`.
- **Exact Instructions for Executing Agent:**
  - Delete `apps/worker/test/scheduler-behavior.test.ts` in its entirety.

#### ✅ 12. `apps/worker/test/scheduler-idempotency.test.ts`
- **File Path:** `apps/worker/test/scheduler-idempotency.test.ts`
- **Production Target:** `apps/worker/src/scheduler.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** 100% `fs.readFileSync('src/scheduler.ts', 'utf8')` substring grepping (lines 22–65). Asserts that `scheduler.ts` contains literal strings `const _runningJobs = new Set<string>()`, `if (_runningJobs.has(name))`, `_runningJobs.add(name)`, and `_runningJobs.delete(name)`. Zero behavioral execution.
- **Exact Instructions for Executing Agent:**
  - Delete `apps/worker/test/scheduler-idempotency.test.ts` in its entirety.

#### ✅ 13. `apps/worker/test/scheduler-runtime-contract.test.ts`
- **File Path:** `apps/worker/test/scheduler-runtime-contract.test.ts`
- **Production Target:** `apps/worker/src/scheduler.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** 100% `fs.readFileSync('src/scheduler.ts', 'utf8')` regex/substring grepping (lines 18–76). Checks that literal strings like `pruneMastraStorage()`, `recoverStaleFullAnalysisQueue(new Date(), 20, _shutdownController?.signal)`, and `replayPersistenceFailures(25, _shutdownController?.signal)` appear in source text. Real job registrations are tested in `apps/worker/test/jobs-registry.test.ts`.
- **Exact Instructions for Executing Agent:**
  - Delete `apps/worker/test/scheduler-runtime-contract.test.ts` in its entirety.

#### ✅ 14. `apps/worker/test/scheduler.test.ts`
- **File Path:** `apps/worker/test/scheduler.test.ts`
- **Production Target:** `apps/worker/src/scheduler.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** Pure framework/export theater (lines 51–102): 4 of the 6 tests only assert `expect(typeof startScheduler).toBe('function')`, `expect(typeof stopScheduler).toBe('function')`, `expect(typeof runBriefingNow).toBe('function')`, and `expect(typeof runOutcomeResolverNow).toBe('function')`; the remaining 2 tests call `stopScheduler()` when nothing is running and check `isJobRunning('nonexistent') === false`.
- **Exact Instructions for Executing Agent:**
  - Delete `apps/worker/test/scheduler.test.ts` in its entirety.

#### ✅ 15. `apps/worker/test/worker-lifecycle.test.ts`
- **File Path:** `apps/worker/test/worker-lifecycle.test.ts`
- **Production Target:** `apps/worker/src/index.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** 100% `fs.readFileSync` substring checks across `src/index.ts`, `src/health.ts`, and `src/signalr.ts` (lines 20–125), asserting literal strings like `'SIGTERM'`, `'SIGINT'`, `'stopScheduler()'`, `'stopHealthServer()'`, `'503'`, and `'127.0.0.1'`. Real behavioral tests for the health HTTP server and SignalR client already exist in `apps/worker/test/http-server.test.ts`, `apps/worker/test/http-server-separation.test.ts`, `apps/worker/test/signalr-consumer.test.ts`, and `apps/worker/test/signalr-reconnect.test.ts`.
- **Exact Instructions for Executing Agent:**
  - Delete `apps/worker/test/worker-lifecycle.test.ts` in its entirety.

#### ✅ 16. `packages/ai/test/chaos-retry.test.ts`
- **File Path:** `packages/ai/test/chaos-retry.test.ts`
- **Production Target:** `packages/ai/src/retry.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** Three sections of slop and duplication: (1) `describe('chaos: retry on transient failures')` (lines 35–94) duplicates `packages/ai/src/retry.test.ts`; (2) `describe('chaos: AbortSignal cancellation')` (lines 99–168) duplicates abort handling; (3) `describe('chaos: circuit-breaker pattern response')` (lines 173–305) defines a local 50-line `function createCircuitBreaker` inside the test file and tests that local closure instead of importing `packages/ai/src/model-circuit-breaker.ts` (which is tested in `packages/ai/test/model-circuit-breaker.test.ts`).
- **Exact Instructions for Executing Agent:**
  - Delete `packages/ai/test/chaos-retry.test.ts` in its entirety (merge the mid-backoff abort timer test into `packages/ai/src/retry.test.ts` as specified in Batch 3).

#### ✅ 17. `packages/ai/test/cost-estimate.test.ts`
- **File Path:** `packages/ai/test/cost-estimate.test.ts`
- **Production Target:** `packages/ai/src/cost.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** 100% duplicate of `packages/ai/test/cost.test.ts`. Tests `estimateCostUsd`, `estimateKnownCostUsd`, and `DEFAULT_TURN_ESTIMATE_USD` on the exact same `packages/ai/src/cost.ts` module already tested in `packages/ai/test/cost.test.ts`.
- **Exact Instructions for Executing Agent:**
  - Delete `packages/ai/test/cost-estimate.test.ts` after merging its `estimateKnownCostUsd` negative/NaN/unknown-model checks into `packages/ai/test/cost.test.ts` (specified in Batch 3).

#### ✅ 18. `packages/ai/test/full-analysis-resilience.test.ts`
- **File Path:** `packages/ai/test/full-analysis-resilience.test.ts`
- **Production Target:** `packages/ai/src/mastra-v2/workflows/full-analysis-queue.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** 16-line file containing only 2 `typeof` export theater assertions: `expect(typeof claimNextFullAnalysisQueue).toBe('function')` and `expect(typeof recoverStaleFullAnalysisQueue).toBe('function')`. Real queue resilience is tested in `packages/ai/test/mastra-v2-full-analysis.test.ts` and `packages/ai/test/full-analysis-properties.test.ts`.
- **Exact Instructions for Executing Agent:**
  - Delete `packages/ai/test/full-analysis-resilience.test.ts` in its entirety.

#### ✅ 19. `packages/ai/test/mastra-capabilities-projection.test.ts`
- **File Path:** `packages/ai/test/mastra-capabilities-projection.test.ts`
- **Production Target:** `packages/ai/src/mastra/capabilities.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** 25-line file with 2 tests (`exposes canonical chat as an agent-backed capability` and `projects domain tool lists from the capability manifest`) that are 100% duplicated in `packages/ai/test/mastra-capabilities.test.ts` and `packages/ai/test/baseline-mutation-exposure.test.ts`.
- **Exact Instructions for Executing Agent:**
  - Delete `packages/ai/test/mastra-capabilities-projection.test.ts` in its entirety.

#### ✅ 20. `packages/ai/test/mastra-model-resolution.test.ts`
- **File Path:** `packages/ai/test/mastra-model-resolution.test.ts`
- **Production Target:** `packages/ai/src/mastra/model-resolution.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** 26-line file with a single test (`preserves purpose, domain, and provider snapshot`) that is duplicated verbatim in `packages/ai/test/mastra-p2-contracts.test.ts` (lines 13–29).
- **Exact Instructions for Executing Agent:**
  - Delete `packages/ai/test/mastra-model-resolution.test.ts` in its entirety.

#### ✅ 21. `packages/ai/test/override-model.test.ts`
- **File Path:** `packages/ai/test/override-model.test.ts`
- **Production Target:** `packages/ai/src/model.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** Fragmented test file for `resolveOverrideModel` from `src/model.ts` with a copy-pasted `@kestrel/shared/encryption` mock stub and a no-op `settingsWithKeys` helper (`void keys; return { aiApiKeys: null }`). Belongs consolidated inside `packages/ai/test/model.test.ts`.
- **Exact Instructions for Executing Agent:**
  - Delete `packages/ai/test/override-model.test.ts` after merging its `resolveOverrideModel` test cases as a `describe('resolveOverrideModel')` `it.each` block into `packages/ai/test/model.test.ts` (specified in Batch 3).

#### ✅ 22. `packages/ai/test/social-sentiment-service.test.ts`
- **File Path:** `packages/ai/test/social-sentiment-service.test.ts`
- **Production Target:** `packages/ai/src/sentiment/social-sentiment-service.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** Duplicate test file for `SocialSentimentService` (which already has a co-located test file at `packages/ai/src/sentiment/social-sentiment-service.test.ts`). Tests the same unconfigured-key fallback plus 2 `AbortSignal` tests.
- **Exact Instructions for Executing Agent:**
  - Delete `packages/ai/test/social-sentiment-service.test.ts` after merging its 2 `AbortSignal` tests (`passes the abort signal to the external request` and `does not swallow cancellation as an unavailable-data result`) into `packages/ai/src/sentiment/social-sentiment-service.test.ts` (specified in Batch 3).

#### ✅ 23. `packages/ai/test/test-provider-key.test.ts`
- **File Path:** `packages/ai/test/test-provider-key.test.ts`
- **Production Target:** `packages/ai/src/model.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** Duplicates `describe('testProviderKey — key validation')` in `packages/ai/test/model.test.ts` (lines 291–339). Both files mock `ai`'s `generateText` and `@kestrel/shared/encryption` to test 401 failure and 200 success on `testProviderKey`.
- **Exact Instructions for Executing Agent:**
  - Delete `packages/ai/test/test-provider-key.test.ts` after merging its `maxOutputTokens: 1` and network error assertion into `packages/ai/test/model.test.ts` (specified in Batch 3).

#### ✅ 24. `packages/ai/test/tool-timeout.test.ts`
- **File Path:** `packages/ai/test/tool-timeout.test.ts`
- **Production Target:** `packages/ai/src/tools/with-telemetry.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** Contains 2 tests for `withTelemetry` that are 100% duplicated in `packages/ai/test/with-telemetry.test.ts` (lines 186–254). Worse, the second test (`rejects a tool that exceeds its deadline`, lines 27–37) omits `vi.useFakeTimers()` and sleeps for **25,000ms of real wall-clock time**, whereas `with-telemetry.test.ts` (lines 215–236) tests the exact same 25s deadline in 2ms using `vi.useFakeTimers()`.
- **Exact Instructions for Executing Agent:**
  - Delete `packages/ai/test/tool-timeout.test.ts` in its entirety (saves 25 seconds on every test run with zero loss of coverage).

#### ✅ 25. `packages/ai/test/vision-embedding-model.test.ts`
- **File Path:** `packages/ai/test/vision-embedding-model.test.ts`
- **Production Target:** `packages/ai/src/model.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** Duplicates `describe('resolveVisionModel — vision-capable model')` and `describe('resolveEmbeddingModel — embedding model')` in `packages/ai/test/model.test.ts` (lines 218–289) using the exact same `__setByok` encryption mock harness.
- **Exact Instructions for Executing Agent:**
  - Delete `packages/ai/test/vision-embedding-model.test.ts` after merging its 2 invalid-user-pick fallback cases (`visionModel: 'google:nonexistent-model'` and `embeddingModel: 'google:nonexistent-model'`) into `packages/ai/test/model.test.ts` (specified in Batch 3).

#### ✅ 26. `apps/web/src/__tests__/ux/css-utilities-tokens.test.ts`
- **File Path:** `apps/web/src/__tests__/ux/css-utilities-tokens.test.ts`
- **Production Target:** `apps/web/src/app/globals.css`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** Reads `apps/web/src/app/globals.css` and `apps/web/src/app/layout.tsx` via `fs.readFileSync` and runs regex matches against CSS class names (`.num`, `.custom-scrollbar`, `.skeleton-shimmer`) and font variable strings, plus 4 trivial constant equality checks on `tokens.ts`.
- **Exact Instructions for Executing Agent:**
  - Delete `apps/web/src/__tests__/ux/css-utilities-tokens.test.ts` in its entirety.

#### ✅ 27. `apps/web/src/__tests__/ux/responsive-scenarios-and-motion.test.tsx`
- **File Path:** `apps/web/src/__tests__/ux/responsive-scenarios-and-motion.test.tsx`
- **Production Target:** `apps/web/src/components/motion/motion-config.tsx`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** Lines 25–72 define a local dummy `<MobileChipRail />` component inside the test file and assert on the classes hardcoded inside the test file. Lines 75–121 use `fs.readFileSync` on `globals.css` and `motion-config.tsx` to grep for `'prefers-reduced-motion: reduce'` and `'reducedMotion="user"'`. Zero production code is executed.
- **Exact Instructions for Executing Agent:**
  - Delete `apps/web/src/__tests__/ux/responsive-scenarios-and-motion.test.tsx` in its entirety.

#### ✅ 28. `apps/web/test/admin-route-policy.test.ts`
- **File Path:** `apps/web/test/admin-route-policy.test.ts`
- **Production Target:** `apps/web/src/app/api/admin/overview/route.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** Walks `src/app/api/admin/**/route.ts` with `fs.readFileSync` checking for `'withAdminAuth'`. 100% duplicated by `apps/web/test/p1-security-contract.test.ts` (lines 28–43) AND behavioral admin route tests (`admin-routes.test.ts`, `route-admin-users.test.ts`, `route-admin-system-action.test.ts`).
- **Exact Instructions for Executing Agent:**
  - Delete `apps/web/test/admin-route-policy.test.ts` in its entirety.

#### ✅ 29. `apps/web/test/auth-2fa-policy.test.ts`
- **File Path:** `apps/web/test/auth-2fa-policy.test.ts`
- **Production Target:** `apps/web/src/lib/auth/credentials-authorize.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** 100% `fs.readFileSync` substring grepping on `src/lib/auth/credentials-authorize.ts` and `src/app/login/actions.ts` (lines 11–52), asserting literal strings like `'totp_required'`, `'totp_invalid'`, `'consumeBackupCode'`, and `'verifyTotpToken'`. Real behavioral tests for `authorizeCredentials` are added to `apps/web/test/auth-credentials.test.ts` in Batch 4.
- **Exact Instructions for Executing Agent:**
  - Delete `apps/web/test/auth-2fa-policy.test.ts` in its entirety.

#### ✅ 30. `apps/web/test/auth-host-security.test.ts`
- **File Path:** `apps/web/test/auth-host-security.test.ts`
- **Production Target:** `apps/web/src/auth.config.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** Contains 3 tests: 2 tests for `assertProductionSecurity()` that are 100% duplicated in `apps/web/test/auth-config.test.ts` (lines 18–79), and 1 `fs.readFileSync('src/auth.config.ts')` test that greps for a code comment explaining `trustHost: true`.
- **Exact Instructions for Executing Agent:**
  - Delete `apps/web/test/auth-host-security.test.ts` in its entirety.

#### ✅ 31. `apps/web/test/badge.test.tsx`
- **File Path:** `apps/web/test/badge.test.tsx`
- **Production Target:** `apps/web/src/components/ui/badge.tsx`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** 100% duplicated inside `apps/web/src/components/ui/__tests__/stat-card-badge-tokens.test.tsx` (lines 85–133), which tests every `<Badge>` variant (`default`, `bullish`, `bearish`, `warning`, `accent`, `info`), `dot` indicator, and `className` forwarding.
- **Exact Instructions for Executing Agent:**
  - Delete `apps/web/test/badge.test.tsx` in its entirety.

#### ✅ 32. `apps/web/test/hooks-use-popup-menu.test.ts`
- **File Path:** `apps/web/test/hooks-use-popup-menu.test.ts`
- **Production Target:** `apps/web/src/hooks/use-popup-menu.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** Redundant with `apps/web/test/use-popup-menu.test.tsx`, which renders a harness component using `usePopupMenu` and tests toggle, outside-click dismissal, Escape key dismissal, focus restoration, and custom `isOutsideClick` predicates.
- **Exact Instructions for Executing Agent:**
  - Delete `apps/web/test/hooks-use-popup-menu.test.ts` in its entirety.

#### ✅ 33. `apps/web/test/hooks-use-tf.test.ts`
- **File Path:** `apps/web/test/hooks-use-tf.test.ts`
- **Production Target:** `apps/web/src/hooks/use-tf.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** 100% mock theater on a 3-line wrapper around `nuqs` `useQueryState`. Mocks `useQueryState` to return `['1h', mockSetTf]` and asserts that `useTimeframe()` returns `['1h', mockSetTf]`. Would pass even if `use-tf.ts` passed completely broken parser options to `useQueryState`.
- **Exact Instructions for Executing Agent:**
  - Delete `apps/web/test/hooks-use-tf.test.ts` in its entirety.

#### ✅ 34. `apps/web/test/integration/middleware-to-ai.integration.test.ts`
- **File Path:** `apps/web/test/integration/middleware-to-ai.integration.test.ts`
- **Production Target:** `apps/web/src/app/api/journal/route.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** Misnamed file (does not touch `middleware.ts` or `@kestrel/ai` execution). Mocks `@kestrel/ai` (`listEntries`, `createEntry`, `updateEntry`, `deleteEntry`) and `@/auth` with `vi.fn()` and tests `GET`/`POST /api/journal` — 100% duplicated by `apps/web/test/route-journal.test.ts`.
- **Exact Instructions for Executing Agent:**
  - Delete `apps/web/test/integration/middleware-to-ai.integration.test.ts` in its entirety.

#### ✅ 35. `apps/web/test/p1-security-contract.test.ts`
- **File Path:** `apps/web/test/p1-security-contract.test.ts`
- **Production Target:** `apps/web/src/app/api/admin/overview/route.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** 100% `fs.readFileSync` source-code grepping across `apps/web/src/app/api/admin/**/route.ts`, `packages/shared/src/schemas/entities.ts`, `apps/web/src/lib/validation.ts`, `apps/web/src/app/settings/actions.ts`, and `packages/ai/src/tools/web-search.ts`. Every single one of those behaviors is already tested via real execution in `apps/web/test/admin-routes.test.ts`, `apps/web/test/settings-actions.test.ts`, and `packages/ai/test/web-search-ssrf.test.ts`.
- **Exact Instructions for Executing Agent:**
  - Delete `apps/web/test/p1-security-contract.test.ts` in its entirety.

#### ✅ 36. `apps/web/test/p2-security-contract.test.ts`
- **File Path:** `apps/web/test/p2-security-contract.test.ts`
- **Production Target:** `apps/web/src/lib/rate-limit.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** 100% `fs.readFileSync` substring grepping across `packages/db/src/index.ts`, `apps/web/src/lib/rate-limit.ts`, `apps/web/src/app/api/health/route.ts`, `apps/worker/src/jobs/outcome-resolver.ts`, and `apps/worker/src/jobs/daily-briefing.ts`.
- **Exact Instructions for Executing Agent:**
  - Delete `apps/web/test/p2-security-contract.test.ts` in its entirety.

#### ✅ 37. `apps/web/test/phase4-phase5-policy.test.ts`
- **File Path:** `apps/web/test/phase4-phase5-policy.test.ts`
- **Production Target:** `apps/web/src/auth.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** Greps `README.md`, `apps/web/src/auth.ts`, and `packages/ai/src/tools/get-price.ts` via `fs.readFileSync` for substring literals, plus a duplicate `ALL_SYMBOLS` length check already tested in `packages/shared/test/symbol-catalog.test.ts`.
- **Exact Instructions for Executing Agent:**
  - Delete `apps/web/test/phase4-phase5-policy.test.ts` in its entirety.

#### ✅ 38. `apps/web/test/request-body-contract.test.ts`
- **File Path:** `apps/web/test/request-body-contract.test.ts`
- **Production Target:** `apps/web/src/lib/request-body.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** Uses `fs.readFileSync` to check that 6 API route files contain the substring `'parseJsonBody'`. Real behavioral tests for `parseJsonBody` and the route handlers exist in `apps/web/test/request-body.test.ts` and `apps/web/test/route-*.test.ts`.
- **Exact Instructions for Executing Agent:**
  - Delete `apps/web/test/request-body-contract.test.ts` in its entirety.

#### ✅ 39. `apps/web/test/runtime-migrate-policy.test.ts`
- **File Path:** `apps/web/test/runtime-migrate-policy.test.ts`
- **Production Target:** `scripts/migrate-runtime.mjs`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** Uses `fs.readFileSync` to check string literals inside `scripts/migrate-runtime.mjs` (`'0000_ambiguous_Machine_man'`, `'pg_advisory_lock'`), and defines an unused local helper `function extractEnabledTables(sql: string)` (lines 9–17) that is never even called inside the test file.
- **Exact Instructions for Executing Agent:**
  - Delete `apps/web/test/runtime-migrate-policy.test.ts` in its entirety.

#### ✅ 40. `apps/web/test/runtime-security-headers.test.ts`
- **File Path:** `apps/web/test/runtime-security-headers.test.ts`
- **Production Target:** `apps/web/src/lib/security-headers.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** 100% duplicated by `apps/web/test/security-headers-contract.test.ts` (which tests `buildContentSecurityPolicy`, `buildSecurityHeaders`, HSTS, nonce formatting, and `next.config.ts` parity).
- **Exact Instructions for Executing Agent:**
  - Delete `apps/web/test/runtime-security-headers.test.ts` in its entirety.

#### ✅ 41. `apps/web/test/tidy-consistency.test.ts`
- **File Path:** `apps/web/test/tidy-consistency.test.ts`
- **Production Target:** `apps/web/src/lib/health-badge.ts`
- **Verdict:** `[DELETE ENTIRE FILE]`
- **Technical Diagnosis:** 100% `fs.readFileSync` substring grepping checking that `button.tsx` contains `'inline-flex h-9'` and 3 admin components contain `'formatHealthAge'`. Breaks on any CSS class reordering.
- **Exact Instructions for Executing Agent:**
  - Delete `apps/web/test/tidy-consistency.test.ts` in its entirety.

### Batch 2: Targeted Test Pruning (17 Files — `[PRUNE SPECIFIC TESTS]`) — ✅ COMPLETE

**Status: ✅ COMPLETE (2026-10-17).** 14/17 files pruned exactly as specified. Items **#3, #6, and #7** were verified as **stale/no-op** against the current working tree — the anti-patterns they describe no longer exist in this revision (and never existed in git history; the files have since evolved into higher-signal versions). Execution log:

| # | File | Outcome |
| ---: | :--- | :--- |
| 1 | `packages/db/test/client.test.ts` | ✅ Deleted the `typeof` export-theater test `exports getAdminDb for cross-tenant admin health routes`. |
| 2 | `packages/db/test/index.test.ts` | ✅ Deleted `describe('public API exports')` + the local-closure `describe('extractCount regression guard')`; kept `describe('withRateLimit with mocked client')`. |
| 3 | `packages/shared/test/schemas.test.ts` | ⏭️ No-op — see inline note below. |
| 4 | `packages/ai/src/bot/dispatcher.test.ts` | ✅ `parseCommand` consolidated to one `it.each`; 6 no-arg dispatch tests consolidated to one `it.each`; weak `expect(response.text).toBeDefined()` replaced with `toContain('Kestrel Bot Commands')`. |
| 5 | `packages/ai/src/bot/linking.test.ts` | ✅ Fake "expired code" test replaced with a real `vi.useFakeTimers()` + `vi.advanceTimersByTime(11 * 60 * 1000)` expiry assertion on the actual `createLinkCode` result. |
| 6 | `packages/ai/test/baseline-mutation-exposure.test.ts` | ⏭️ No-op — see inline note below. |
| 7 | `packages/ai/test/convene-committee.test.ts` | ⏭️ No-op — see inline note below. |
| 8 | `packages/ai/test/provider-id-from-model.test.ts` | ✅ Deleted the local `canonicalize` replica + `describe('Phase D — canonical BYOK id mapping')`; kept the real `providerIdFromModel` tests. |
| 9 | `packages/ai/test/tools.test.ts` | ✅ Deleted the `get_price`, `compute_risk`, and `get_calendar` `inputSchema` tests; kept registry invariants + the `convene_committee` schema test. |
| 10 | `apps/web/src/__tests__/ux/landing-motion-empirical.test.tsx` | ✅ Deleted the 3 `fs.readFileSync` source-grep tests + `node:fs`/`node:path` imports; kept all 8 rendered-component tests. |
| 11 | `apps/web/src/__tests__/ux/route-safety-and-telemetry.test.tsx` | ✅ Deleted the local `resolveChartRoute`/`sanitizeSymbol`/`isTelemetrySuppressed` closures + the `fs.readFileSync` contract block + imports; kept the 5 real `<TopBar />` behavioral tests. |
| 12 | `apps/web/test/auth-flow.test.ts` | ✅ Deleted all 9 self-testing closure `describe` blocks (register/hash/password/cost/token/2FA/session/remember-me) + now-unused `node:crypto`/`bcryptjs`/`zod` imports; `sanitizeNext` consolidated to `it.each`; kept `isFailedSignIn`, `sanitizeNext`, and `withServerActionLogging`. |
| 13 | `apps/web/test/news-ui.test.tsx` | ✅ Deleted `describe('News page source contracts (Phase 10)')` + `node:fs`/`node:path` imports; kept the 4 `<NewsToolbar />` behavioral tests. |
| 14 | `apps/web/test/phase7-9-ui.test.tsx` | ✅ Deleted `describe('Phase 7–9 source contracts')` (9-file grep) + `readWebFile`/`node:fs` imports; kept `TextPart` + `PasswordField` behavioral tests. |
| 15 | `apps/web/test/polish-flash-gauge.test.tsx` | ✅ Deleted `describe('Empty-state polish')` + `readWebFile`/`node:fs` imports; kept sentiment-gauge and live-price-flash tests. |
| 16 | `apps/web/test/session-validation-policy.test.ts` | ✅ Deleted the `fs.readFileSync('src/lib/auth/callbacks.ts')` grep test + imports; kept the 4 behavioral `validateSession` tests. |
| 17 | `apps/web/tests/e2e/chat-ui.spec.ts` | ✅ Deleted `test.describe('Chat UI — tool card parts')` with the stale `rgb(10, 10, 10)` background assertion; kept all other chat UI specs. |

In each of the following 17 test files, delete the specified brittle `fs.readFileSync`, self-testing closure, or duplicate `describe`/`it` blocks while keeping the high-signal behavioral tests untouched.

#### 1. `packages/db/test/client.test.ts`
- **File Path:** `packages/db/test/client.test.ts`
- **Production Target:** `packages/db/src/client.ts`
- **Verdict:** `[PRUNE SPECIFIC TESTS]`
- **Technical Diagnosis:** Lines 39–270 test real `withDbRetry`, multi-user RLS enforcement in `getDb`, `checkDbHealth`, `closeDb`/`closeReplicaDb`, and `withTenantDbFresh`. However, `it('exports getAdminDb for cross-tenant admin health routes')` (lines 272–275) only asserts `expect(typeof mod.getAdminDb).toBe('function')` (`typeof` export theater).
- **Exact Instructions for Executing Agent:**
  - **Delete:**
    - `it('exports getAdminDb for cross-tenant admin health routes', ...)` (lines 272–275).
  - **Keep untouched:**
    - All behavioral tests in `describe('withDbRetry')`, `describe('tenant isolation configuration')`, `describe('checkDbHealth')`, `describe('closeDb / closeReplicaDb')`, and `describe('withTenantDbFresh and tenant short-circuit')` (lines 39–271).

#### 2. `packages/db/test/index.test.ts`
- **File Path:** `packages/db/test/index.test.ts`
- **Production Target:** `packages/db/src/rate-limit.ts`
- **Verdict:** `[PRUNE SPECIFIC TESTS]`
- **Technical Diagnosis:** Contains 2 anti-pattern blocks alongside 1 valid behavioral block: (1) `describe('public API exports')` (lines 31–56) only asserts `toBeTypeOf('function')` on module exports; (2) `describe('extractCount regression guard')` (lines 101–131) defines a local `function extractCount(rows: unknown): number` inside the test file and tests the local copy, whereas `describe('withRateLimit with mocked client')` (lines 58–99) already tests all 5 of those exact row shapes through the real `withRateLimit` function!
- **Exact Instructions for Executing Agent:**
  - **Delete:**
    - `describe('public API exports', ...)` (lines 31–56).
    - `describe('extractCount regression guard', ...)` (lines 101–131).
  - **Keep untouched:**
    - `describe('withRateLimit with mocked client', ...)` (lines 58–99).

#### 3. `packages/shared/test/schemas.test.ts`
- **File Path:** `packages/shared/test/schemas.test.ts`
- **Production Target:** `packages/shared/src/schemas/index.ts`
- **Verdict:** `[PRUNE SPECIFIC TESTS]`
- **Technical Diagnosis:** Lines 26–39 (`describe('CandleSchema')`) and lines 41–73 (`describe('AlertRuleSchema')`) are duplicated in `packages/shared/test/symbol-catalog.test.ts` and `packages/shared/test/tool-io.test.ts`, whereas lines 75–96 (`describe('ChatStreamEventSchema')`) test discriminated-union stream events (`data-partial-analysis`, `data-agent-progress`, `data-multi-agent-meta`).
- **Exact Instructions for Executing Agent:**
  - **Delete:**
    - `describe('CandleSchema', ...)` (lines 26–39).
    - `describe('AlertRuleSchema', ...)` (lines 41–73).
  - **Keep untouched:**
    - `describe('ChatStreamEventSchema', ...)` (lines 75–96).
- **Execution note (2026-10-17):** ⏭️ **No-op — stale plan reference.** The current revision of this file is a 936-line, 23-schema suite: it has no `AlertRuleSchema` or `ChatStreamEventSchema` blocks at all (the latter lives in `packages/shared/test/chat-stream.test.ts`), and its `CandleSchema` block is **unique** (`rg` finds no other `.test.ts` referencing `CandleSchema`). The described duplicates do not exist in this revision or in git history, so nothing was pruned.

#### 4. `packages/ai/src/bot/dispatcher.test.ts`
- **File Path:** `packages/ai/src/bot/dispatcher.test.ts`
- **Production Target:** `packages/ai/src/bot/dispatcher.ts`
- **Verdict:** `[PRUNE SPECIFIC TESTS]`
- **Technical Diagnosis:** In `describe('BotDispatcher')` (lines 72–193), `it('returns help for non-command text')` (lines 98–108) only asserts `expect(response.text).toBeDefined()` (tautological assertion), and the 6 `dispatches /<cmd> with no args -> usage message` tests (lines 131–192) are repetitive copy-paste blocks.
- **Exact Instructions for Executing Agent:**
  - **Update / Consolidate:**
    - Replace the weak assertion `expect(response.text).toBeDefined()` in `it('returns help for non-command text')` (line 107) with `expect(response.text).toContain('Kestrel Bot Commands')`.
    - Consolidate the 6 `dispatches /<cmd> with no args` blocks (lines 131–192) into a single `it.each([['price', 'Usage: /price'], ['alert', 'Usage: /alert'], ['link', 'Link Your Kestrel Account'], ['ask', 'Usage: /ask'], ['analyze', 'Usage: /analyze'], ['chart', 'Usage: /chart']])` test and consolidate `describe('parseCommand')` (lines 20–70) into a single `it.each` table.
  - **Keep untouched:**
    - `registers and dispatches commands`, `returns help for unknown commands`, `listCommands returns all registered commands`, and `getBotDispatcher returns a singleton`.

#### 5. `packages/ai/src/bot/linking.test.ts`
- **File Path:** `packages/ai/src/bot/linking.test.ts`
- **Production Target:** `packages/ai/src/bot/linking.ts`
- **Verdict:** `[PRUNE SPECIFIC TESTS]`
- **Technical Diagnosis:** In `describe('Link Code Resolution')` (lines 51–64), `it('returns null for an expired code')` (lines 56–63) does NOT test an expired code — its own comment admits `// We can't easily mock time in this test, but we can test that a non-existent code returns null`, duplicating `it('returns null for an invalid code')` at lines 52–55.
- **Exact Instructions for Executing Agent:**
  - **Replace fake test with real fake-timer expiry test:**
    - Replace `it('returns null for an expired code')` at lines 56–63 with a real fake-timer test: call `vi.useFakeTimers()`, call `const { code } = createLinkCode('user-expired')`, call `vi.advanceTimersByTime(11 * 60 * 1000)`, assert `await resolveLinkCode(code, '123', 'telegram')` returns `null`, and restore `vi.useRealTimers()`.
  - **Keep untouched:**
    - `describe('Link Code Generation', ...)` (lines 24–49) and `it('returns null for an invalid code')` (lines 52–55).

#### 6. `packages/ai/test/baseline-mutation-exposure.test.ts`
- **File Path:** `packages/ai/test/baseline-mutation-exposure.test.ts`
- **Production Target:** `packages/ai/src/mastra/capabilities.ts`
- **Verdict:** `[PRUNE SPECIFIC TESTS]`
- **Technical Diagnosis:** Contains 2 tests: `it('does not include mutation tools in the canonical chat capability')` (lines 7–13) is 100% duplicated in `packages/ai/test/mastra-capabilities.test.ts` (lines 18–26), whereas `it('keeps mutation tools in the explicit registry for dedicated mutation workflows')` (lines 15–22) uniquely verifies `toolRegistry.resolve(['set_alert', 'log_journal', 'share_snapshot', 'run_system_action'])`.
- **Exact Instructions for Executing Agent:**
  - **Delete:**
    - `it('does not include mutation tools in the canonical chat capability', ...)` (lines 7–13).
  - **Keep untouched:**
    - `it('keeps mutation tools in the explicit registry for dedicated mutation workflows', ...)` (lines 15–22).
- **Execution note (2026-10-17):** ⏭️ **No-op — stale plan reference.** The current revision of this file (123 lines) contains 6 behavioral Phase-0 tests (write-capability declaration, read-only capability exclusion, sensitive-read exclusion, committee read-only enforcement, mode composition, and legacy-adapter rejection). It has no `typeof`/duplicate blocks; the two tests named in the plan do not exist in this revision or in git history, so nothing was pruned.

#### 7. `packages/ai/test/convene-committee.test.ts`
- **File Path:** `packages/ai/test/convene-committee.test.ts`
- **Production Target:** `packages/ai/src/tools/convene-committee.ts`
- **Verdict:** `[PRUNE SPECIFIC TESTS]`
- **Technical Diagnosis:** Lines 251–295 contain 4 repetitive `it` blocks (`rejects negative entry price`, `rejects zero stop price`, `rejects riskPct > 10`, `accepts valid input without target`) that merely call `conveneCommitteeTool.inputSchema.safeParse(...)`, duplicating the schema test in `packages/ai/test/tools.test.ts` and testing static Zod constraints (`z.number().positive()`, `z.number().max(10)`). Meanwhile, lines 125–249 test the real 4-desk committee synthesis, opposing liquidity flagging, weighted directional agreement, and error resilience.
- **Exact Instructions for Executing Agent:**
  - **Delete:**
    - The 4 redundant `inputSchema.safeParse` tests at lines 251–295 (`rejects negative entry price`, `rejects zero stop price`, `rejects riskPct > 10`, `accepts valid input without target`).
  - **Keep untouched:**
    - All 6 behavioral `execute()` tests in `describe('convene_committee tool', ...)` (lines 125–249).
- **Execution note (2026-10-17):** ⏭️ **No-op — stale plan reference.** The current revision of this file is behavioral-only (232 lines, ending at the `execute()` tests); the 4 redundant `inputSchema.safeParse` tests at lines 251–295 no longer exist, so nothing was pruned. The `convene_committee` schema assertion retained in `packages/ai/test/tools.test.ts` (Batch 2 item #9) covers that surface.

#### 8. `packages/ai/test/provider-id-from-model.test.ts`
- **File Path:** `packages/ai/test/provider-id-from-model.test.ts`
- **Production Target:** `packages/ai/src/usage.ts`
- **Verdict:** `[PRUNE SPECIFIC TESTS]`
- **Technical Diagnosis:** Lines 42–55 define a local `function canonicalize(prefix: string): string | null` inside the test file (with an outdated hardcoded `KNOWN` set missing `iamhc` and `hcnsec`), and `describe('Phase D — canonical BYOK id mapping')` (lines 79–103) tests that local function instead of any production export. Meanwhile, `describe('Phase D — providerIdFromModel')` (lines 57–77) tests the real exported `providerIdFromModel` from `src/usage.ts`.
- **Exact Instructions for Executing Agent:**
  - **Delete:**
    - The local `function canonicalize(prefix: string)` (lines 42–55) and `describe('Phase D — canonical BYOK id mapping', ...)` (lines 79–103).
  - **Keep untouched:**
    - `describe('Phase D — providerIdFromModel', ...)` (lines 57–77).

#### 9. `packages/ai/test/tools.test.ts`
- **File Path:** `packages/ai/test/tools.test.ts`
- **Production Target:** `packages/ai/src/tools/index.ts`
- **Verdict:** `[PRUNE SPECIFIC TESTS]`
- **Technical Diagnosis:** Lines 68–124 test `toolRegistry.listNames()`, `toolRegistry.resolve()`, and snake_case naming invariants across all 32 registered tools. However, `it('get_price tool has correct input schema')` (lines 126–132) only asserts `expect(schema.describe()).toBeTruthy()`, and lines 134–186 duplicate schema `safeParse` checks already covered in `compute-risk.test.ts`, `get-calendar.test.ts`, and `convene-committee.test.ts`.
- **Exact Instructions for Executing Agent:**
  - **Delete:**
    - `it('get_price tool has correct input schema', ...)` (lines 126–132).
    - `it('compute_risk tool validates input schema', ...)` (lines 134–158).
    - `it('get_calendar tool validates input schema', ...)` (lines 160–173).
  - **Keep untouched:**
    - `contains all expected tool entries`, `every tool has description, inputSchema, and execute`, `every tool name matches the withTelemetry wrapper name`, and `convene_committee tool validates input schema`.

#### 10. `apps/web/src/__tests__/ux/landing-motion-empirical.test.tsx`
- **File Path:** `apps/web/src/__tests__/ux/landing-motion-empirical.test.tsx`
- **Production Target:** `apps/web/src/components/landing/LandingPageView.tsx`
- **Verdict:** `[PRUNE SPECIFIC TESTS]`
- **Technical Diagnosis:** Mixes 6 real React Testing Library component tests (`LandingPageView`, `LandingStepper`, `LandingArchitecture`, `Landing3DHologram`, `TickerTape`) with 3 `fs.readFileSync` source-grepping tests (`it('verifies MotionRoot configures LazyMotion...')` at lines 95–102, `it('verifies app/page.tsx wraps LandingPageView...')` at lines 104–111, and `it('verifies dynamic reduced-motion event listener and cleanup contracts in source implementation')` at lines 236–267).
- **Exact Instructions for Executing Agent:**
  - **Delete:**
    - `it('verifies MotionRoot configures LazyMotion with domAnimation features and user reducedMotion')` (lines 95–102).
    - `it('verifies app/page.tsx wraps LandingPageView inside MotionRoot')` (lines 104–111).
    - `it('verifies dynamic reduced-motion event listener and cleanup contracts in source implementation')` (lines 236–267) and remove `readSource` / `fs.readFileSync` imports.
  - **Keep untouched:**
    - All 6 component rendering and user-interaction tests in `Tier 1`, `Tier 2`, and `Tier 3` (lines 114–234).

#### 11. `apps/web/src/__tests__/ux/route-safety-and-telemetry.test.tsx`
- **File Path:** `apps/web/src/__tests__/ux/route-safety-and-telemetry.test.tsx`
- **Production Target:** `apps/web/src/components/layout/TopBar.tsx`
- **Verdict:** `[PRUNE SPECIFIC TESTS]`
- **Technical Diagnosis:** Mixes 5 real `<TopBar />` component tests (lines 112–140, 152–159) with 3 self-testing / `readFileSync` blocks: (1) `describe('Tier 1 & Tier 3: Route Fallback & Safety')` (lines 48–107) defines local `DEFAULT_SYMBOL`, `resolveChartRoute`, and `sanitizeSymbol` inside the test file and tests them; (2) `it('enforces telemetry suppression contract on /chat route')` (lines 142–150) defines a local `isTelemetrySuppressed` function and tests it; (3) `describe('Tier 2 & Tier 4: Navigation Rail & Table Bounded Scroll Contracts')` (lines 162–204) greps `LandingHeader.tsx`, `TopBar.tsx`, and `positions/page.tsx` via `fs.readFileSync`.
- **Exact Instructions for Executing Agent:**
  - **Delete:**
    - `describe('Tier 1 & Tier 3: Route Fallback & Safety (/chart Redirect & Symbol Fallback)', ...)` (lines 48–107).
    - `it('enforces telemetry suppression contract on /chat route while preserving on /journal and /settings', ...)` (lines 142–150).
    - `describe('Tier 2 & Tier 4: Navigation Rail & Table Bounded Scroll Contracts', ...)` (lines 162–204) and remove `readSource` / `fs.readFileSync`.
  - **Keep untouched:**
    - The 5 real `<TopBar />` component rendering tests inside `describe('Tier 3: Telemetry Occlusion Suppression on /chat Layout', ...)` (lines 112–140 and 152–159).

#### 12. `apps/web/test/auth-flow.test.ts`
- **File Path:** `apps/web/test/auth-flow.test.ts`
- **Production Target:** `apps/web/src/lib/auth-redirect.ts`
- **Verdict:** `[PRUNE SPECIFIC TESTS]`
- **Technical Diagnosis:** 9 of the 12 `describe` blocks in this 403-line file define local functions (`validatePassword`, `parseBcryptCost`, `hashToken`, `validate2FA`, `isSessionValid`, `isSessionExpired`) or local Zod schemas inside the test file and test those local copies without importing Kestrel's auth modules! Only `describe('isFailedSignIn')` (lines 173–191), `describe('sanitizeNext (open-redirect prevention)')` (lines 193–222), and `describe('withServerActionLogging redirect handling (P0-3)')` (lines 363–402) import and test real production code (`src/lib/auth-redirect.ts` and `src/lib/action-logger.ts`).
- **Exact Instructions for Executing Agent:**
  - **Delete:**
    - The 9 self-testing local-closure `describe` blocks: `register input validation` (lines 31–81), `register password hashing` (lines 83–99), `password strength validation` (lines 101–139), `bcrypt cost parsing` (lines 141–171), `password max-length (bcrypt 72-byte truncation defense)` (lines 224–240), `token hashing` (lines 242–269), `2FA validation logic` (lines 271–294), `session validation logic (P0-4)` (lines 296–333), and `remember me logic (FEAT-04)` (lines 335–361).
  - **Keep untouched (and consolidate `sanitizeNext` to `it.each`):**
    - `describe('isFailedSignIn', ...)` (lines 173–191).
    - `describe('sanitizeNext (open-redirect prevention)', ...)` (lines 193–222).
    - `describe('withServerActionLogging redirect handling (P0-3)', ...)` (lines 363–402).

#### 13. `apps/web/test/news-ui.test.tsx`
- **File Path:** `apps/web/test/news-ui.test.tsx`
- **Production Target:** `apps/web/src/app/news/news-toolbar.tsx`
- **Verdict:** `[PRUNE SPECIFIC TESTS]`
- **Technical Diagnosis:** Lines 25–67 (`describe('News toolbar (Phase 10)')`) render `<NewsToolbar />` and test search query submission, clear button, and currency chip toggling. Lines 69–88 (`describe('News page source contracts (Phase 10)')`) use `fs.readFileSync` on `src/app/news/page.tsx` and `src/app/news/news-row.tsx` to grep for string literals (`'SentimentGauge'`, `'NewsToolbar'`).
- **Exact Instructions for Executing Agent:**
  - **Delete:**
    - `describe('News page source contracts (Phase 10)', ...)` (lines 69–88) and remove `node:fs` / `node:path` imports.
  - **Keep untouched:**
    - `describe('News toolbar (Phase 10)', ...)` (lines 25–67).

#### 14. `apps/web/test/phase7-9-ui.test.tsx`
- **File Path:** `apps/web/test/phase7-9-ui.test.tsx`
- **Production Target:** `apps/web/src/components/chat/parts/text-part.tsx`
- **Verdict:** `[PRUNE SPECIFIC TESTS]`
- **Technical Diagnosis:** Lines 26–79 render `<TextPart />` (testing 65ch measure and table scroll container) and `<PasswordField />` (testing show/hide toggle and `aria-pressed`). Lines 81–137 (`describe('Phase 7–9 source contracts')`) use `fs.readFileSync` across 9 `.tsx` files to grep for CSS class substrings.
- **Exact Instructions for Executing Agent:**
  - **Delete:**
    - `describe('Phase 7–9 source contracts', ...)` (lines 81–137) and remove `readWebFile` / `node:fs` imports.
  - **Keep untouched:**
    - `describe('Phase 7 — chat message reading', ...)` (lines 26–56) and `describe('Phase 9 — auth components', ...)` (lines 58–79).

#### 15. `apps/web/test/polish-flash-gauge.test.tsx`
- **File Path:** `apps/web/test/polish-flash-gauge.test.tsx`
- **Production Target:** `apps/web/src/app/news/sentiment-gauge.tsx`
- **Verdict:** `[PRUNE SPECIFIC TESTS]`
- **Technical Diagnosis:** Lines 41–159 render `<SentimentGauge />` and `<WatchlistClient />` (testing SVG needle rotation, empty state, and live price uptick/downtick flash classes with fake timers). Lines 161–184 (`describe('Empty-state polish')`) use `fs.readFileSync` to grep 3 source files for `'EmptyState'`. 
- **Exact Instructions for Executing Agent:**
  - **Delete:**
    - `describe('Empty-state polish', ...)` (lines 161–184) and remove `readWebFile` / `node:fs` imports.
  - **Keep untouched:**
    - `describe('News sentiment gauge', ...)` (lines 41–89) and `describe('Watchlist live price flash', ...)` (lines 91–159).

#### 16. `apps/web/test/session-validation-policy.test.ts`
- **File Path:** `apps/web/test/session-validation-policy.test.ts`
- **Production Target:** `apps/web/src/lib/session.ts`
- **Verdict:** `[PRUNE SPECIFIC TESTS]`
- **Technical Diagnosis:** The first test (`it('invalidates the session when auth cannot acquire the database client')` at lines 54–59) uses `fs.readFileSync('src/lib/auth/callbacks.ts')` to grep for string literals (which is replaced by behavioral tests in `apps/web/test/auth-callbacks.test.ts` in Batch 4). The remaining 4 tests (lines 61–136) execute the real `validateSession` against mocked DB states (missing session, expired session, valid session with throttled activity touch, and DB query failure).
- **Exact Instructions for Executing Agent:**
  - **Delete:**
    - `it('invalidates the session when auth cannot acquire the database client', ...)` (lines 54–59) and remove `node:fs` / `node:path` imports.
  - **Keep untouched:**
    - The 4 behavioral `validateSession` tests (lines 61–136).

#### 17. `apps/web/tests/e2e/chat-ui.spec.ts`
- **File Path:** `apps/web/tests/e2e/chat-ui.spec.ts`
- **Production Target:** `apps/web/src/components/chat/chat-client.tsx`
- **Verdict:** `[PRUNE SPECIFIC TESTS]`
- **Technical Diagnosis:** In `test.describe('Chat UI — tool card parts')` (lines 226–237), `test('tool cards have border and surface styling when present')` does not render any tool card — it just navigates to `/login` and asserts `await expect(body).toHaveCSS('background-color', 'rgb(10, 10, 10)')`, which is a stale pre-Hoplite Dark background color (`globals.css` sets `--color-bg: #121212` = `rgb(18, 18, 18)`). All other `test.describe` blocks in `chat-ui.spec.ts` test real chat composer, starter prompts, mode toggle, and thread sidebar behavior.
- **Exact Instructions for Executing Agent:**
  - **Delete:**
    - `test.describe('Chat UI — tool card parts', ...)` (lines 226–237).
  - **Keep untouched:**
    - All other `test.describe` blocks in `apps/web/tests/e2e/chat-ui.spec.ts` (lines 19–224).

### Batch 3: Unit Test Consolidations (25 Files — `[CONSOLIDATE TO TABLE-DRIVEN]`) — ✅ COMPLETE

**Status: ✅ COMPLETE (2026-10-17) — 25/25.** Items **#10, #11, #12, and #15** (all `@kestrel/ai` targets) were executed early on 2026-10-17 because the Batch 1 preamble required their edge-case merges before the duplicate fragment files could be deleted. The remaining 21 items were consolidated to parameterized `it.each` tables on 2026-10-17. Where the plan's exact instructions referenced APIs that no longer exist in this revision (e.g. `makeCandles` `count`/`baseClose`/`startTime` options, `ERROR_HTTP_STATUS`, `getProviderHealth` status transitions, `formatHealthAge`, `--color-bearish` token names), the consolidation was executed against the **actual** production surface while preserving or strengthening the original coverage; each item's status note documents the adaptation. All 21 rewritten files pass in isolation, and 4 items targeted stale references in already-high-signal files (see their notes). Execution evidence is recorded in the **Batch 3 verification evidence** block above.

Refactor the following 25 test files to replace repetitive copy-paste `it` blocks with parameterized `it.each` tables covering all boundary conditions.

#### ✅ 1. `packages/test-utils/src/factories/candles.test.ts`
**Status: ✅ DONE (2026-10-17).** 16 `it` blocks consolidated to 3 aggregated/table-driven tests (10 expanded cases) covering default + custom OHLCV candles and tick spread/spacing. The plan's `count`/`baseClose`/`step`/`startTime` options do not exist in the current `makeCandles` API, so the `it.each` table uses explicit `closes` permutations instead. Verified green in isolation (10 tests).
- **File Path:** `packages/test-utils/src/factories/candles.test.ts`
- **Production Target:** `packages/test-utils/src/factories/candles.ts`
- **Verdict:** `[CONSOLIDATE TO TABLE-DRIVEN]`
- **Technical Diagnosis:** Contains 6 separate `it` blocks testing option permutations (`count`, `baseClose`, `step`, `highs`/`lows`, `symbol`/`tf`, `startTime`) of `makeCandles`. Consolidating into a parameterized `it.each` keeps `packages/test-utils` compliant with `pnpm test:empty-guard` while cutting boilerplate.
- **Exact Instructions for Executing Agent:**
  - Consolidate the 6 `it` blocks into 2 tests:
    1. `it('builds valid OHLCV candles from an explicit closes array with custom highs/lows')` covering `makeCandles([100, 105, 102], { highs: [110, 115, 112], lows: [95, 98, 96], symbol: 'EURUSD', tf: '4h', startTime: 1_700_000_000_000 })`.
    2. `it.each` over option variations: `[{ opts: { count: 0 }, expectedLen: 0 }, { opts: { count: 5, baseClose: 2000, step: 10 }, expectedLen: 5, firstClose: 2000, lastClose: 2040 }]`.

#### ✅ 2. `packages/indicators/test/defaults.test.ts`
**Status: ✅ DONE (2026-10-17).** The 8 per-timeframe `it` blocks are now a single `it.each` table (`1m`→2 … `1w`→5). Verified green in isolation (8 tests).
- **File Path:** `packages/indicators/test/defaults.test.ts`
- **Production Target:** `packages/indicators/src/smc/defaults.ts`
- **Verdict:** `[CONSOLIDATE TO TABLE-DRIVEN]`
- **Technical Diagnosis:** Contains 8 separate 3-line `it` blocks calling `defaultSwingLookback(tf)` for each timeframe (`1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1d`, `1w`).
- **Exact Instructions for Executing Agent:**
  - Replace the 8 separate `it` blocks with a single `it.each([['1m', 2], ['5m', 2], ['15m', 3], ['30m', 3], ['1h', 3], ['4h', 5], ['1d', 5], ['1w', 5]])('returns %i lookback bars for %s timeframe', (tf, expected) => { expect(defaultSwingLookback(tf)).toBe(expected); })`.

#### ✅ 3. `packages/shared/test/error-patterns.test.ts`
**Status: ✅ DONE (2026-10-17).** The 9 matching `it` blocks are now a single `it.each` table asserting `retryable` + `code` (or `code === undefined` for the code-less patterns) + `description` per input; the `ERROR_PATTERNS` invariants and the unknown-error null case are untouched. Verified green in isolation (12 tests).
- **File Path:** `packages/shared/test/error-patterns.test.ts`
- **Production Target:** `packages/shared/src/error-patterns.ts`
- **Verdict:** `[CONSOLIDATE TO TABLE-DRIVEN]`
- **Technical Diagnosis:** Lines 40–112 (`describe('findErrorPattern')`) contain 9 nearly identical `it` blocks matching `AppError` codes and message patterns (`BUDGET_EXCEEDED`, `onboarding`, `CSRF`, `PROVIDER_UNAVAILABLE`, `UNAUTHORIZED`, `FORBIDDEN`, `RATE_LIMITED`, `VALIDATION`, `INTERNAL`).
- **Exact Instructions for Executing Agent:**
  - Keep `describe('ERROR_PATTERNS')` (lines 21–38) and `it('returns null for unknown errors')` (lines 41–44).
  - Consolidate the 9 matching `it` blocks in `describe('findErrorPattern')` (lines 46–111) into a single `it.each` table mapping `[label, errorInstance, expectedCode, expectedRetryable]`.

#### ✅ 4. `packages/shared/test/errors.test.ts`
**Status: ✅ DONE (2026-10-17).** `ERROR_CODES` (2 tests → 1) and `AppError` (2 → 1) are consolidated, and the 9 factory describes are now one `it.each` table (13 cases) asserting `code`/`status`/`message`/`details` (including the previously untested `conflict` factory); the `formatErrorResponse` tests are untouched. The plan's `ERROR_HTTP_STATUS` / `providerError` / `rateLimitError` / `budgetExceededError` / `authError` names do not exist in this revision — the actual factories (`validationError`, `unauthorized`, `forbidden`, `conflict`, `notFound`, `rateLimited`, `providerUnavailable`, `budgetExceeded`, `internalError`) are covered. Verified green in isolation (21 tests).
- **File Path:** `packages/shared/test/errors.test.ts`
- **Production Target:** `packages/shared/src/errors.ts`
- **Verdict:** `[CONSOLIDATE TO TABLE-DRIVEN]`
- **Technical Diagnosis:** Contains 24 repetitive `it` blocks across `ERROR_HTTP_STATUS`, `KestrelError`, and the 6 factory functions (`providerError`, `rateLimitError`, `budgetExceededError`, `authError`, `notFoundError`, `validationError`).
- **Exact Instructions for Executing Agent:**
  - Consolidate `describe('ERROR_HTTP_STATUS')` (7 `it` blocks) into a single `it.each` over all 7 `ErrorCode` mappings (`['PROVIDER_DOWN', 503]`, `['RATE_LIMITED', 429]`, `['BUDGET_EXCEEDED', 402]`, `['VALIDATION', 400]`, `['NOT_FOUND', 404]`, `['UNAUTHORIZED', 401]`, `['FORBIDDEN', 403]`).
  - Consolidate the 6 factory `describe` blocks (`providerError`, `rateLimitError`, `budgetExceededError`, `authError`, `notFoundError`, `validationError`) into a single `it.each` table verifying `code`, `httpStatus`, `message`, `details`, and `cause` preservation.

#### ✅ 5. `packages/shared/test/normalization.test.ts`
**Status: ✅ DONE (2026-10-17).** The unrolled assertion lists are now 4 `it.each` tables: 25 symbol aliases (each asserting `normalizeSymbol` + `SymbolSchema.parse` + `isKnownSymbol`), 4 rejected instruments, 20 timeframe aliases (`normalizeTimeframe` + `TimeframeSchema.parse`), and 3 invalid timeframes. Verified green in isolation (52 tests).
- **File Path:** `packages/shared/test/normalization.test.ts`
- **Production Target:** `packages/shared/src/schemas/market.ts`
- **Verdict:** `[CONSOLIDATE TO TABLE-DRIVEN]`
- **Technical Diagnosis:** Contains long unrolled assertion lists testing `normalizeSymbol`, `SymbolSchema`, `isKnownSymbol`, `normalizeTimeframe`, and `TimeframeSchema` across 25+ symbol aliases and 18+ timeframe aliases.
- **Exact Instructions for Executing Agent:**
  - Consolidate `normalizeSymbol` + `SymbolSchema.parse` + `isKnownSymbol` into an `it.each` table of `[rawAlias, canonicalSymbol]` (`['Gold', 'XAUUSD']`, `['OANDA:XAU_USD', 'XAUUSD']`, `['Cable', 'GBPUSD']`, `['Fibre', 'EURUSD']`, `['BTCUSD', 'BTCUSDT']`, `['BINANCE:BTCUSDT', 'BTCUSDT']`, `['Ethereum', 'ETHUSDT']`, etc.) and an `it.each` table for rejected symbols (`'US100'`, `'XAGUSD'`, `'DOGEUSDT'`, `''`).
  - Consolidate `normalizeTimeframe` + `TimeframeSchema.parse` into an `it.each` table of `[rawTf, canonicalTf]` (`['1M', '1m']`, `['M15', '15m']`, `['H1', '1h']`, `['hourly', '1h']`, `['H4', '4h']`, `['D1', '1d']`, `['daily', '1d']`, `['W1', '1w']`, `['weekly', '1w']`) and invalid timeframes (`'2h'`, `'monthly'`, `'invalid'`).

#### ✅ 6. `packages/shared/test/symbol-catalog.test.ts`
**Status: ✅ DONE (2026-10-17).** The invariant loops (catalog completeness, defaults, category partitions) are kept; per-symbol spot checks are now an `it.each` metadata table (5 representative catalog symbols × `category`/`decimals`/`pipSize`/`capabilities.contractSize`/`tradingView`), plus `it.each` tables for valid/invalid strict-schema boundaries. The plan's `US500`/`USOIL`/`assetClass`/`tvTicker` references do not exist in this revision (18-symbol catalog, `category`/`tradingView` fields). Verified green in isolation (20 tests).
- **File Path:** `packages/shared/test/symbol-catalog.test.ts`
- **Production Target:** `packages/shared/src/schemas/market.ts`
- **Verdict:** `[CONSOLIDATE TO TABLE-DRIVEN]`
- **Technical Diagnosis:** Contains 24 repetitive `it` blocks testing individual symbols and asset classes across `ALL_SYMBOLS`, `SYMBOL_MAP`, `SYMBOLS_BY_CLASS`, `SymbolSchema`, `TimeframeSchema`, and `SessionTagSchema`.
- **Exact Instructions for Executing Agent:**
  - Keep the invariant loop test (`has complete metadata for every symbol`, lines 49–61).
  - Consolidate the per-symbol spot checks (`XAUUSD`, `EURUSD`, `USDJPY`, `US500`, `BTCUSDT`, `USOIL`) into a single `it.each` table verifying `{ symbol, assetClass, decimals, pipSize, contractSize, tvTicker }`.
  - Consolidate the valid/invalid `SymbolSchema`, `TimeframeSchema`, and `SessionTagSchema` boundary checks (`'', 'INVALID', 'xauusd', '2h', 'sydney'`) into a single `it.each` table.

#### ✅ 7. `packages/data/test/biquote-map.test.ts`
**Status: ✅ DONE (2026-10-17).** `toBiquoteSymbol`/`assertSupportedSymbol` supported + unsupported cases, the 8 timeframe mappings (incl. `1w → null`), and the 2 datetime parses are now `it.each` tables; the offender-in-error-message test and the unparseable-date throw are kept. Verified green in isolation (21 tests).
- **File Path:** `packages/data/test/biquote-map.test.ts`
- **Production Target:** `packages/data/src/providers/biquote/map.ts`
- **Verdict:** `[CONSOLIDATE TO TABLE-DRIVEN]`
- **Technical Diagnosis:** Contains unrolled assertion lists for `toBiquoteSymbol`, `toBiquoteTimeframe`, `parseBiquoteDate`, and `assertSupportedSymbol`.
- **Exact Instructions for Executing Agent:**
  - Consolidate `toBiquoteSymbol` / `assertSupportedSymbol` supported and unsupported symbols (`'XAUUSD'`, `'EURUSD'`, `'GBPUSD'`, `' eurusd '`, and unsupported `'BTCUSD'`, `'BTCUSDT'`, `'DOGEUSDT'`, `'GARAN'`, `'ZZZZZZ'`) and `toBiquoteTimeframe` (`1m`..`1d` -> identity, `'1w'` -> `null`) into parameterized `it.each` tables.

#### ✅ 8. `packages/data/test/health.test.ts`
**Status: ✅ DONE (2026-10-17).** The scoring cases are now a single `it.each` history table (`[]`→0.5, 1/2/3/5 consecutive failures→0, 1 success→1, mixed histories→0.5/0.67) — preserving the original 3-failure + recovery coverage and extending it; the failure-snapshot test and the 5-minute window expiry test (fake timers) are kept. The plan's `getProviderHealth` + `unknown → healthy → degraded → down` status API does not exist in this revision — the implemented API is `getScore`/`getHealth`. Verified green in isolation (11 tests).
- **File Path:** `packages/data/test/health.test.ts`
- **Production Target:** `packages/data/src/health.ts`
- **Verdict:** `[CONSOLIDATE TO TABLE-DRIVEN]`
- **Technical Diagnosis:** Contains 15 `it` blocks testing `recordSuccess`, `recordFailure`, `getProviderHealth`, and status transitions (`unknown` -> `healthy` -> `degraded` at 1–2 consecutive failures -> `down` at >=3 consecutive failures -> reset to `healthy` on success).
- **Exact Instructions for Executing Agent:**
  - Consolidate the failure-count status transition cases (`0 -> healthy`, `1 -> degraded`, `2 -> degraded`, `3 -> down`, `5 -> down`, `recovery -> healthy`) into a single `it.each` table while keeping the latency EMA and multi-provider isolation tests.

#### ✅ 9. `packages/ai/src/portfolio/risk-service.test.ts`
**Status: ✅ DONE (2026-10-17).** The 9 `computePnL` scenarios are now a single `it.each` table (8 rows) asserting `unrealizedPnlUsd`/`%`, `riskUsd`, `rewardUsd`, `riskRewardRatio`, and `distanceToStopPct` via a null-aware close helper; `stale: false` + `currentPrice` are asserted for every row. Verified green in isolation (8 tests).
- **File Path:** `packages/ai/src/portfolio/risk-service.test.ts`
- **Production Target:** `packages/ai/src/portfolio/risk-service.ts`
- **Verdict:** `[CONSOLIDATE TO TABLE-DRIVEN]`
- **Technical Diagnosis:** Contains 9 separate `it` blocks testing `computePnL(pos, currentPrice)` across long/short winning/losing XAUUSD and EURUSD positions, stop-loss/take-profit R:R calculations, null stop/target, and distance-to-stop percentages.
- **Exact Instructions for Executing Agent:**
  - Consolidate the 9 `computePnL` scenarios into a single parameterized `it.each` table covering:
    - Winning long XAUUSD (`2650 -> 2700`, `1.0` lot -> `+$5000`, `riskUsd: 5000`, `rewardUsd: 10000`, `rr: 2.0`)
    - Losing long XAUUSD (`2650 -> 2600`, `1.0` lot -> `-$5000`)
    - Winning short XAUUSD (`2650 -> 2600`, `1.0` lot -> `+$5000`, `stopLoss: 2700`, `takeProfit: 2550`)
    - Winning long EURUSD (`1.10 -> 1.11`, `1.0` lot -> `+$1000`)
    - Position with `stopLoss: null, takeProfit: null` (`riskUsd: null, rewardUsd: null, riskRewardRatio: null, distanceToStopPct: null`)
    - Long & short `distanceToStopPct` at `2620` and `2680`.

#### ✅ 10. `packages/ai/src/retry.test.ts`
**Status: ✅ DONE (executed 2026-10-17 as a Batch 1 deletion prerequisite, per the Batch 1 preamble).** `getRetryAfterMs` consolidated into a single table-driven `it.each`; mid-backoff `AbortSignal` cancellation tests absorbed from the deleted `chaos-retry.test.ts`. Verified green in isolation (21 tests).
- **File Path:** `packages/ai/src/retry.test.ts`
- **Production Target:** `packages/ai/src/retry.ts`
- **Verdict:** `[CONSOLIDATE TO TABLE-DRIVEN]`
- **Technical Diagnosis:** Tests `withRetry` and `getRetryAfterMs`. Should absorb the unique mid-backoff `AbortSignal` timer test from `packages/ai/test/chaos-retry.test.ts` (deleted in Batch 1) and consolidate `getRetryAfterMs` header format variations into `it.each`.
- **Exact Instructions for Executing Agent:**
  - Consolidate `describe('getRetryAfterMs')` (8 `it` blocks, lines 131–175) into a single `it.each` table covering integer seconds (`'2' -> 2000`), numeric `retryAfter: 3 -> 3000`, 60s cap (`'9999' -> 60000`), `headers.get('retry-after') -> 5000`, future HTTP-date, past HTTP-date (`null`), empty headers (`null`), and non-object errors (`null`, `'string'`).
  - Add a test in `describe('withRetry')` verifying that aborting an `AbortSignal` before or during backoff immediately rejects with `AbortError` without starting another attempt (replacing `chaos-retry.test.ts`).

#### ✅ 11. `packages/ai/src/sentiment/social-sentiment-service.test.ts`
**Status: ✅ DONE (executed 2026-10-17 as a Batch 1 deletion prerequisite, per the Batch 1 preamble).** `scoreToLabel` and `detectContrarianSignal` consolidated into `it.each` tables; the 2 `AbortSignal` tests from the deleted `packages/ai/test/social-sentiment-service.test.ts` merged into `describe('SocialSentimentService')` (with `vi.unstubAllGlobals()` cleanup).
- **File Path:** `packages/ai/src/sentiment/social-sentiment-service.test.ts`
- **Production Target:** `packages/ai/src/sentiment/social-sentiment-service.ts`
- **Verdict:** `[CONSOLIDATE TO TABLE-DRIVEN]`
- **Technical Diagnosis:** Contains 10 separate `it` blocks for `scoreToLabel` and `detectContrarianSignal`, and overlaps with `packages/ai/test/social-sentiment-service.test.ts` (deleted in Batch 1).
- **Exact Instructions for Executing Agent:**
  - Consolidate `describe('scoreToLabel')` (lines 31–57) into a single `it.each([[0.6, 'very_bullish'], [0.5, 'very_bullish'], [0.2, 'bullish'], [0.15, 'bullish'], [0, 'neutral'], [0.1, 'neutral'], [-0.1, 'neutral'], [-0.15, 'bearish'], [-0.2, 'bearish'], [-0.5, 'very_bearish'], [-0.6, 'very_bearish']])`.
  - Consolidate `describe('detectContrarianSignal')` (lines 59–90) into a single `it.each([[80, true, 'contrarian bearish'], [75, true, 'contrarian bearish'], [74, false, null], [50, false, null], [26, false, null], [25, true, 'contrarian bullish'], [20, true, 'contrarian bullish'], [null, false, null]])`.
  - Merge the 2 `AbortSignal` tests (`passes the abort signal to the external request` and `does not swallow cancellation as an unavailable-data result`) from `packages/ai/test/social-sentiment-service.test.ts` into `describe('SocialSentimentService')`.

#### ✅ 12. `packages/ai/test/cost.test.ts`
**Status: ✅ DONE (executed 2026-10-17 as a Batch 1 deletion prerequisite, per the Batch 1 preamble).** Per-model `estimateCostUsd` rates consolidated into one `it.each` table; `estimateKnownCostUsd` strict-accounting cases (`UnknownModelPricingError`, negative/NaN token rejection, bare-BYOK parity, `DEFAULT_MAX_DAILY_USD`) merged from the deleted `cost-estimate.test.ts`; reservation/spend-query tests untouched. Verified green in isolation (48 tests).
- **File Path:** `packages/ai/test/cost.test.ts`
- **Production Target:** `packages/ai/src/cost.ts`
- **Verdict:** `[CONSOLIDATE TO TABLE-DRIVEN]`
- **Technical Diagnosis:** Contains 10 repetitive `it` blocks in `describe('estimateCostUsd')` (lines 146–200), and overlaps with `packages/ai/test/cost-estimate.test.ts` (deleted in Batch 1).
- **Exact Instructions for Executing Agent:**
  - Consolidate the per-model `estimateCostUsd` rate tests into a single `it.each` table (`openai/gpt-4.1`, `openai/gpt-4.1-mini`, `google/gemini-2.5-flash-lite`, `google/gemini-3.5-flash`, bare `gemini-3.5-flash`, `anthropic/claude-3.7-sonnet`, `anthropic/claude-sonnet-4`, unknown model fallback `5/15` -> `20`, and `0` tokens -> `0`).
  - Merge `estimateKnownCostUsd` from `cost-estimate.test.ts` (import `estimateKnownCostUsd` and `UnknownModelPricingError` from `../src/cost`, asserting exact cost for known models and throwing `UnknownModelPricingError` on unknown models or negative/NaN token counts).
  - Keep all `tryReserveBudget`, `reconcileBudgetReservation`, `releaseBudgetReservation`, `recoverStaleBudgetReservations`, and spend query tests untouched.

#### ✅ 13. `packages/ai/test/fallback.test.ts`
**Status: ✅ DONE (2026-10-17).** The 14 `classifyStreamError` tests are now a single `it.each` table (18 rows: status codes, message heuristics, non-recoverable 4xx, null/undefined/string, out-of-range 99/600, and `statusCode` precedence over `status`) asserting both `fallback` and `reason`; `shouldFallback`/`makeFallbackPart` are untouched. Verified green in isolation (22 tests).
- **File Path:** `packages/ai/test/fallback.test.ts`
- **Production Target:** `packages/ai/src/fallback.ts`
- **Verdict:** `[CONSOLIDATE TO TABLE-DRIVEN]`
- **Technical Diagnosis:** Contains 14 separate `it` blocks in `describe('classifyStreamError ...')` (lines 21–99) testing status codes (`401`, `403`, `429`, `502`, `503`, `504`, `400`, `422`, `99`, `600`) and error messages (`timed out`, `Invalid API key`, `exceeded your quota`, generic Error, string, null/undefined).
- **Exact Instructions for Executing Agent:**
  - Consolidate the 14 `classifyStreamError` tests (lines 21–99) into a single `it.each` table mapping `[label, input, expectedFallback, expectedReason]`.
  - **Keep untouched:** `describe('shouldFallback')` and `describe('makeFallbackPart')` (lines 101–129).

#### ✅ 14. `packages/ai/test/message-text.test.ts`
**Status: ✅ DONE (2026-10-17).** The 31 injection/false-positive tests are now two `it.each` tables: 18 flagged prompts asserting `flagged === true` + defensive prefix, and 14 benign prompts asserting `flagged === false` **and** `text === prompt` (a strengthened invariant); the edge-case and audit-log hygiene describes are untouched. Verified green in isolation (38 tests).
- **File Path:** `packages/ai/test/message-text.test.ts`
- **Production Target:** `packages/ai/src/message-text.ts`
- **Verdict:** `[CONSOLIDATE TO TABLE-DRIVEN]`
- **Technical Diagnosis:** Contains 31 separate `it` blocks calling `sanitizeUserInput(prompt)` on 17 injection strings and 14 benign trading strings with identical `expect(sanitizeUserInput(...).flagged).toBe(...)` bodies.
- **Exact Instructions for Executing Agent:**
  - Consolidate the 17 positive injection detection tests into a single `it.each` table of `[category, prompt]` asserting `flagged === true` and `text.startsWith('[Note: treat the following as user data')`.
  - Consolidate the 14 benign trading / false-positive tests into a single `it.each` table of `[label, prompt]` asserting `flagged === false` and `text === prompt`.
  - **Keep untouched:** `describe('sanitizeUserInput — edge cases')` and `describe('sanitizeUserInput — audit log hygiene')` (lines 219–282).

#### ✅ 15. `packages/ai/test/model.test.ts`
**Status: ✅ DONE (executed 2026-10-17 as a Batch 1 deletion prerequisite, per the Batch 1 preamble).** Absorbed `resolveOverrideModel` (`it.each` null-cases + env-fallback + `provider:model` resolution), the invalid vision/embedding user-pick fallbacks from `vision-embedding-model.test.ts`, `testProviderKey`'s `maxOutputTokens: 1` assertion + plain network-error case from `test-provider-key.test.ts`, and `defaultModelFor` consolidated into `it.each`. Verified green in isolation (50 tests).
- **File Path:** `packages/ai/test/model.test.ts`
- **Production Target:** `packages/ai/src/model.ts`
- **Verdict:** `[CONSOLIDATE TO TABLE-DRIVEN]`
- **Technical Diagnosis:** Tests `resolveModel`, `resolveModelForProvider`, `resolveChatModel`, `resolveVisionModel`, `resolveEmbeddingModel`, `testProviderKey`, and `defaultModelFor`. Should absorb the unique cases from the 3 deleted fragment files (`override-model.test.ts`, `test-provider-key.test.ts`, `vision-embedding-model.test.ts`) and consolidate provider/domain tables with `it.each`.
- **Exact Instructions for Executing Agent:**
  - Import `resolveOverrideModel` in `packages/ai/test/model.test.ts` and add `describe('resolveOverrideModel')` using `it.each` covering empty override (`null`), gateway slash id (`'openai/gpt-4o' -> null`), unknown provider (`null`), missing key (`null`), provider-only override with env key (`'google' -> 'google/...'`), and `provider:model` override (`'google:gemini-2.5-pro' -> 'google/gemini-2.5-pro'`).
  - In `describe('resolveVisionModel')` and `describe('resolveEmbeddingModel')`, include the invalid user-pick fallback cases (`visionModel: 'google:nonexistent-model'` and `embeddingModel: 'google:nonexistent-model'`).
  - In `describe('testProviderKey')`, assert `callArgs.maxOutputTokens === 1` on success and include the plain network error (`new Error('fetch failed')`) case.
  - Consolidate `describe('defaultModelFor')` into an `it.each` table.

#### ✅ 16. `packages/ai/test/parse-indicator-spec.test.ts`
**Status: ✅ DONE (2026-10-17).** The 11 tests are now 2 `it.each` tables: 9 valid specs → parsed objects and 11 invalid specs → `null` (incl. `rsi:-5` and the empty string). Verified green in isolation (20 tests).
- **File Path:** `packages/ai/test/parse-indicator-spec.test.ts`
- **Production Target:** `packages/ai/src/alerts/evaluator.ts`
- **Verdict:** `[CONSOLIDATE TO TABLE-DRIVEN]`
- **Technical Diagnosis:** Contains 11 separate `it` blocks calling `parseIndicatorSpec(spec)` with valid and invalid indicator strings.
- **Exact Instructions for Executing Agent:**
  - Consolidate into 2 `it.each` tables:
    1. Valid specs: `[['rsi', { kind: 'rsi', params: { period: 14 } }], ['ema', { kind: 'ema', params: { period: 20 } }], ['rsi:14', { kind: 'rsi', params: { period: 14 } }], ['ema:50', { kind: 'ema', params: { period: 50 } }], ['atr:21', { kind: 'atr', params: { period: 21 } }], ['macd:12,26,9', { kind: 'macd', params: { fast: 12, slow: 26, signal: 9 } }], ['bollinger:20,2', { kind: 'bollinger', params: { period: 20, multiplier: 2 } }], ['pivots', { kind: 'pivots', params: {} }], ['RSI:14', { kind: 'rsi', params: { period: 14 } }]]`.
    2. Invalid specs returning `null`: `['rsi:14:bogus', 'ema:14,bogus', 'rsi 14', 'foo', 'foo:14', 'rsi:14,9', 'ema:14,21,55', 'rsi:0', 'rsi:-5', 'pivots:1', '']`.

#### ✅ 17. `packages/ai/test/rate-limits.test.ts`
**Status: ✅ DONE (2026-10-17).** The 10 header cases are now a single `it.each` table: OpenAI, Anthropic, Groq, Anthropic-over-OpenAI precedence, mixed-case, NaN numeric field (`remainingRequests: undefined`), `null`/`undefined` input, irrelevant headers, and `{}` — each asserting either `undefined` or a partial match. Verified green in isolation (10 tests).
- **File Path:** `packages/ai/test/rate-limits.test.ts`
- **Production Target:** `packages/ai/src/rate-limits.ts`
- **Verdict:** `[CONSOLIDATE TO TABLE-DRIVEN]`
- **Technical Diagnosis:** Contains 10 separate `it` blocks testing `extractRateLimits(headers)` across OpenAI, Anthropic, Groq, mixed-case, NaN, empty, and null/undefined inputs.
- **Exact Instructions for Executing Agent:**
  - Consolidate into a single `it.each` table covering OpenAI headers, Anthropic headers, Groq headers, mixed-case header precedence (Anthropic overriding OpenAI), NaN numeric field (`undefined`), empty/irrelevant headers (`undefined`), and `null`/`undefined` input (`undefined`).

#### ✅ 18. `packages/ai/test/redact.test.ts`
**Status: ✅ DONE (2026-10-17).** The 14 `redactString` tests are now a single `it.each` table asserting the **exact** redacted output (the two JSON-style cases upgraded from `toContain` to exact `<redacted>` assertions); the object-pattern describe is untouched. Verified green in isolation (23 tests).
- **File Path:** `packages/ai/test/redact.test.ts`
- **Production Target:** `packages/ai/src/diagnostics/redact.ts`
- **Verdict:** `[CONSOLIDATE TO TABLE-DRIVEN]`
- **Technical Diagnosis:** Contains 14 separate `it` blocks in `describe('redactSecrets — string patterns')` with identical 3-line bodies (`const out = redactString(input); expect(out).toBe(...)`).
- **Exact Instructions for Executing Agent:**
  - Consolidate the 14 `redactString` tests in `describe('redactSecrets — string patterns')` into a single `it.each` table covering `Bearer`, `Basic`, `Token`, embedded URL credentials, `?token=`/`?key=` query params, JSON double/single-quoted keys, `api_key=`, `password=`, `x-api-key:`, multi-secret strings, and non-sensitive strings.
  - **Keep untouched:** `describe('redactSecrets — object patterns')` (lines 112–211).

#### ✅ 19. `packages/ai/test/validate-provider-config.test.ts`
**Status: ✅ DONE (2026-10-17).** The 8 rejection/acceptance tests are now a single `it.each` table (10 cases: vertex + google-vertex removal, service-account JSON, short/empty keys, both mismatched-prefix directions, and 3 valid keys) asserting `ok` + reason regex; the `testProviderKey` rejection test is kept. Verified green in isolation (11 tests).
- **File Path:** `packages/ai/test/validate-provider-config.test.ts`
- **Production Target:** `packages/ai/src/model.ts`
- **Verdict:** `[CONSOLIDATE TO TABLE-DRIVEN]`
- **Technical Diagnosis:** Contains 8 separate `it` blocks testing `validateProviderConfig(provider, key)` across removed providers, service account JSON, short/empty keys, mismatched prefixes, and valid keys.
- **Exact Instructions for Executing Agent:**
  - Consolidate `validateProviderConfig` cases into a single `it.each` table covering `['vertex', 'any-key-12345', false, /Vertex AI has been removed/i]`, `['google-vertex', 'any-key-12345', false, /Vertex AI has been removed/i]`, `['google', serviceAccountJson, false, /service account JSON is not supported/i]`, `['openai', 'short', false, /too short/i]`, `['openai', '   ', false, /API key is required/i]`, `['openai', 'sk-ant-api03-abcdef12345', false, /Anthropic key provided for OpenAI/i]`, `['anthropic', 'sk-proj-abcdef12345678', false, /OpenAI project key provided for Anthropic/i]`, `['openai', 'sk-proj-valid-openai-key-12345', true, undefined]`, `['google', 'AIzaSyValidGeminiKey1234567890', true, undefined]`, and `['anthropic', 'sk-ant-valid-anthropic-key-12345', true, undefined]`.

#### ✅ 20. `apps/web/test/cn.test.ts`
**Status: ✅ DONE (2026-10-17).** All 21 `it` blocks are now a single `it.each` table (20 rows) covering empty/falsy/boolean inputs, objects/nested objects, nested arrays, and 9 tailwind-merge conflict pairs. Verified green in isolation (20 tests).
- **File Path:** `apps/web/test/cn.test.ts`
- **Production Target:** `apps/web/src/lib/cn.ts`
- **Verdict:** `[CONSOLIDATE TO TABLE-DRIVEN]`
- **Technical Diagnosis:** Contains 21 separate `it` blocks testing a 1-line `twMerge(clsx(inputs))` wrapper (`apps/web/src/lib/cn.ts`).
- **Exact Instructions for Executing Agent:**
  - Consolidate all 21 `it` blocks into a single `it.each` table testing empty/null/undefined/boolean inputs, conditional objects, nested arrays, and Tailwind class conflict resolution (`'px-2 py-1' + 'px-4' -> 'py-1 px-4'`, `'text-red-500' + 'text-blue-500' -> 'text-blue-500'`).

#### ✅ 21. `apps/web/test/format-number.test.ts`
**Status: ✅ DONE (2026-10-17).** Each helper's describe is now a single `it.each` table: `formatMs` 11 boundary cases (999.6 rounding, 1000ms flip, large durations), `formatNumber` 4 cases, `formatRelativeTime` 11 exact buckets + the 30+ day short-date fallback; `formatAbsoluteTime` and `downloadCSV` (jsdom) tests are untouched. The plan's `formatCurrency`/`formatCompact`/`formatSignedPercent`/`formatQuantity`/`formatRatio`/`formatTimestamp`/`formatPrice` helpers do not exist in this revision (`apps/web/src/lib/format-number.ts` exports `formatMs`/`formatNumber`/`formatRelativeTime`/`formatAbsoluteTime`/`downloadCSV`). Verified green in isolation (30 tests).
- **File Path:** `apps/web/test/format-number.test.ts`
- **Production Target:** `apps/web/src/lib/format-number.ts`
- **Verdict:** `[CONSOLIDATE TO TABLE-DRIVEN]`
- **Technical Diagnosis:** Contains 33 separate `it` blocks testing pure numeric/date formatting helpers (`formatCurrency`, `formatCompact`, `formatSignedPercent`, `formatPercent`, `formatQuantity`, `formatRatio`, `formatTimestamp`, `formatPrice`).
- **Exact Instructions for Executing Agent:**
  - Consolidate each helper's `describe` block into a single `it.each` table covering `0`, `-0`, positive/negative numbers, `NaN`, `Infinity`, `-Infinity`, `null`, `undefined`, and asset-specific decimal precision (`XAUUSD` 2dp, `EURUSD` 5dp, `USDJPY` 3dp).

#### ✅ 22. `apps/web/test/format.test.ts`
**Status: ✅ DONE (2026-10-17).** The 18 `formatRelative` tests are now an `it.each` bucket table (16 rows: future/0/59_999ms → just now, 60s → 1m, floors-90s, 1h/2h/23h, 1d/6d, 1w/3w/4w) plus non-finite (`NaN`/`±Infinity`) and string/Date-input tables; the >30-day locale-date and invalid-string cases are kept. Verified green in isolation (24 tests).
- **File Path:** `apps/web/test/format.test.ts`
- **Production Target:** `apps/web/src/lib/format.ts`
- **Verdict:** `[CONSOLIDATE TO TABLE-DRIVEN]`
- **Technical Diagnosis:** Contains 18 separate `it` blocks testing `formatRelativeTime` and `formatMs` across time bucket boundaries (`0ms`, `30s`, `1m`, `45m`, `1h`, `5h`, `1d`, `3d`, `999ms`, `1000ms`, `1500ms`).
- **Exact Instructions for Executing Agent:**
  - Consolidate `describe('formatRelativeTime')` into a single `it.each` table covering `null`/`undefined` (`'never'`), future timestamps (`'just now'`), `<60s` (`'just now'`), `60s` (`'1m ago'`), `45m`, `3599s` (`'59m ago'`), `3600s` (`'1h ago'`), `86399s` (`'23h ago'`), and `86400s` (`'1d ago'`).
  - Consolidate `describe('formatMs')` into a single `it.each` table covering `null`/`undefined` (`'—'`), `0` (`'0ms'`), `42.7` (`'43ms'`), `999` (`'999ms'`), `1000` (`'1.0s'`), and `12345` (`'12.3s'`).

#### ✅ 23. `apps/web/test/health-badge.test.ts`
**Status: ✅ DONE (2026-10-17).** The 11 `getHealthTone` tests are now a single `it.each` table covering every staleness boundary (undefined → grey, sticky red failures, 24h/7d exact-edge flips, invalid date → grey); `NOW` is now passed as epoch ms to match the real `now: number` signature. The plan's `formatHealthAge`/`TONE_CLS`/`TONE_DOT` exports and `apps/web/src/lib/health-badge.ts` path do not exist in this revision — the production target is `apps/web/src/components/ui/health-tone.ts`. Verified green in isolation (11 tests).
- **File Path:** `apps/web/test/health-badge.test.ts`
- **Production Target:** `apps/web/src/lib/health-badge.ts`
- **Verdict:** `[CONSOLIDATE TO TABLE-DRIVEN]`
- **Technical Diagnosis:** Contains 24 separate `it` blocks testing `getHealthTone` and `formatHealthAge` across staleness threshold boundaries (`null`, `NaN`, `-1`, `0`, `59_999`, `60_000`, `299_999`, `300_000`).
- **Exact Instructions for Executing Agent:**
  - Consolidate `describe('getHealthTone')` (11 `it` blocks) into a single `it.each` table testing default thresholds (`freshMs=60_000, warnMs=300_000`) and custom thresholds across `null`, `undefined`, `NaN`, `-500`, `0`, `59_999` (`'ok'`), `60_000` (`'warn'`), `299_999` (`'warn'`), and `300_000` (`'err'`).
  - Consolidate `describe('formatHealthAge')` (8 `it` blocks) into a single `it.each` table while keeping `describe('TONE_CLS and TONE_DOT')`.

#### ✅ 24. `apps/web/test/session.test.ts`
**Status: ✅ DONE (2026-10-17).** The 19 session/weekend/weekday tests are now a single `it.each` table (19 rows) asserting the full `{ session, label, weekday }` object for every UTC window and boundary (00:00/06:59/07:00/11:59/12:00/16:59/17:00, Friday 21:59/22:00, Sunday 21:59/22:00, Saturday/Sunday daytime, Monday weekday field). The plan's `expectedIsOpen` field does not exist in `SessionInfo`. Verified green in isolation (19 tests).
- **File Path:** `apps/web/test/session.test.ts`
- **Production Target:** `apps/web/src/lib/session.ts`
- **Verdict:** `[CONSOLIDATE TO TABLE-DRIVEN]`
- **Technical Diagnosis:** Contains 19 separate `it` blocks testing `getSessionInfo(now)` across UTC hours and weekend days (`Saturday`, `Sunday`, `Friday 21:00 UTC`, `Sunday 22:00 UTC`, `Asia 00–07`, `London 07–12`, `NY/London Overlap 12–16`, `New York 16–21`, `Off-Hours 21–24`).
- **Exact Instructions for Executing Agent:**
  - Consolidate all UTC session and weekend boundary tests into a single `it.each` table mapping `[isoTimestamp, expectedName, expectedShortName, expectedIsOpen]` across all 9 session windows and boundary transitions (`Friday 20:59 UTC`, `Friday 21:00 UTC`, `Saturday 12:00 UTC`, `Sunday 21:59 UTC`, `Sunday 22:00 UTC`, `Wednesday 03:00 UTC`, `Wednesday 07:00 UTC`, `Wednesday 12:00 UTC`, `Wednesday 16:00 UTC`, `Wednesday 21:00 UTC`).

#### ✅ 25. `apps/web/tests/e2e/theme-tokens.spec.ts`
**Status: ✅ DONE (2026-10-17).** The 10 per-token tests (which each re-navigated and asserted one property, including **stale pre-Hoplite values**) are now one consolidated test that navigates once and reads every `:root` token + `body` background in a single `page.evaluate`, asserting the **actual** `globals.css` values: `--color-bear #e02c10`, `--color-bull #3f9e3d`, `--color-brand #ff3616`, `--color-bg #121212`, `--color-bg-elev-1 #1a1a1a`, `--color-border #2c2c2c`, `--color-fg #f0f0f0`, `--color-fg-muted #8e8e8e`, `--radius-sm 4px`, body `rgb(18, 18, 18)`. The plan's `--color-bearish`/`--color-bullish`/`--color-surface`/`--color-muted`/`--radius-md` token names and the `JetBrains Mono` font test do not exist in this revision. `playwright test --list` parses cleanly (1 test × chromium/firefox/webkit + the auth setup).
- **File Path:** `apps/web/tests/e2e/theme-tokens.spec.ts`
- **Production Target:** `apps/web/src/app/globals.css`
- **Verdict:** `[CONSOLIDATE TO TABLE-DRIVEN]`
- **Technical Diagnosis:** Contains 7 separate `test(...)` blocks that each navigate to `/login` to check one CSS custom property on `:root` AND assert **stale pre-Hoplite Dark hex values** (`#ef4444`, `#22c55e`, `#f56e0f`, `#0a0a0a`, `#141414`, `#262626`, `#808080`, `2px`) that contradict `apps/web/src/app/globals.css` (`#e02c10`, `#3f9e3d`, `#ff3616`, `#121212`, `#1a1a1a`, `#2c2c2c`, `#8e8e8e`, `4px`).
- **Exact Instructions for Executing Agent:**
  - Consolidate the 6 `:root` custom property tests into a single E2E test (`test('root CSS custom properties match Hoplite Dark @theme tokens in globals.css')`) that navigates to `/login` once, reads all `:root` variables in a single `page.evaluate`, and asserts the actual `globals.css` values:
    - `--color-bearish`: `'#e02c10'`
    - `--color-bullish`: `'#3f9e3d'`
    - `--color-accent`: `'#ff3616'`
    - `--color-bg`: `'#121212'`
    - `--color-surface`: `'#1a1a1a'`
    - `--color-border`: `'#2c2c2c'`
    - `--color-muted`: `'#8e8e8e'`
    - `--radius-md`: `'4px'`
    - `body` computed `background-color`: `'rgb(18, 18, 18)'`
  - Keep `test('JetBrains Mono font is configured via next/font variable')`.

### Batch 4: Mock-to-Integration & Behavioral Replacements (7 Files — `[REPLACE MOCKS WITH INTEGRATION]`)

**Status: ✅ COMPLETE (2026-10-17) — 7/7.** All seven files now execute real production entry points. Where the plan's exact instructions referenced APIs absent from this revision, the rewrite was adapted against the actual production surface (documented in the **Batch 4 verification evidence** block above and per-item status notes below). All 75 rewritten-file tests pass, the four touched workspaces are fully green (`db` 48, `worker` 147, `web` 1,134, `ai` 1,465), and `pnpm test:empty-guard` / `pnpm typecheck` / `pnpm lint` / `pnpm knip --no-progress` all pass.

Rewrite or expand the following 7 test files so they execute the real production functions and cross-package integrations instead of local closures, `fs.readFileSync` greps, or over-mocked internal modules.

#### ✅ 1. `packages/db/test/with-user-scope.test.ts`
**Status: ✅ DONE (2026-10-17).** Tautological shape test deleted; `withUserScope` now compiles through `new PgDialect().sqlToQuery(...)` against the real `schema.alerts` / `schema.chatThreads` / `schema.journalEntries` Drizzle tables, asserting `"<table>"."user_id" = $1` + `params: ['user-123']`, plus a distinct-userId binding case. Verified green in isolation (4 tests).
- **File Path:** `packages/db/test/with-user-scope.test.ts`
- **Production Target:** `packages/db/src/with-user-scope.ts`
- **Verdict:** `[REPLACE MOCKS WITH INTEGRATION]`
- **Technical Diagnosis:** Currently tests `withUserScope` against a fake `{ userId: { name: 'user_id' } }` object literal and includes a tautological test (`it('produces a SQL fragment (does not validate the column shape)')` at lines 44–52) that passes a table WITHOUT a `userId` column using `as unknown as { userId: any }` and asserts `not.toThrow()`. Meanwhile, real Drizzle schema tables (`schema.alerts`, `schema.chatThreads`, `schema.journalEntries`) and `withTenantDb` from `packages/db/src/tenant.ts` are not exercised here.
- **Exact Instructions for Executing Agent:**
  - Delete `it('produces a SQL fragment (does not validate the column shape)')` (lines 44–52).
  - Test `withUserScope` against real Drizzle tables from `packages/db/src/schema` (`schema.alerts`, `schema.chatThreads`, `schema.journalEntries`) using Drizzle's `PgDialect` (`new PgDialect().sqlToQuery(withUserScope(schema.alerts, 'user-123'))`) and assert the compiled SQL string is `"alerts"."user_id" = $1` with `params: ['user-123']`.

#### ✅ 2. `apps/worker/test/symbol-manager.test.ts`
**Status: ✅ DONE (2026-10-17) — adapted to the actual class-based API (see the Batch 4 evidence block).** The module under test is the class-based `SymbolManager` (DB via `listDistinctSymbols`), not the plan's `refreshActiveSymbols`/`onSymbolsChanged` functions. The rewrite mocks only `@kestrel/db.listDistinctSymbols` and drives the real class: default-watchlist fallback on an empty table, valid-DB-symbols-replace-defaults + unknown filtering, `symbolsChanged`/`biquoteChanged`/`binanceChanged` added/removed diff math, unchanged-set no-op, DB-failure retention with `log.error`, and no double-start. Verified green in isolation (6 tests).
- **File Path:** `apps/worker/test/symbol-manager.test.ts`
- **Production Target:** `apps/worker/src/symbol-manager.ts`
- **Verdict:** `[REPLACE MOCKS WITH INTEGRATION]`
- **Technical Diagnosis:** Every single real assertion in `apps/worker/test/symbol-manager.test.ts` (lines 58–124) is commented out (`// expect(active).toEqual(...)`) and replaced with `expect(true).toBe(true)` because `symbol-manager.ts` was refactored to query `user_symbols` via `getDb().selectDistinct({ symbol: schema.userSymbols.symbol }).from(schema.userSymbols)` and notify listeners via `onSymbolsChanged`.
- **Exact Instructions for Executing Agent:**
  - Rewrite `apps/worker/test/symbol-manager.test.ts` to test the real `refreshActiveSymbols`, `getActiveSymbols`, `onSymbolsChanged`, and `stopSymbolManager` exports from `../src/symbol-manager`:
    1. Mock `@kestrel/db` `getDb` to return `{ selectDistinct: () => ({ from: () => Promise.resolve(mockRows) }) }`.
    2. **Test 1 (`returns default symbols when user_symbols table is empty`):** Set `mockRows = []`, call `await refreshActiveSymbols()`, and assert `getActiveSymbols()` equals `getDefaultSymbols()` (`['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'US500', 'BTCUSDT']`).
    3. **Test 2 (`merges valid user symbols with defaults and filters out invalid symbols`):** Set `mockRows = [{ symbol: 'AUDUSD' }, { symbol: 'INVALID_SYM' }]`, call `await refreshActiveSymbols()`, and assert `getActiveSymbols()` contains `'AUDUSD'` and all default symbols, and does NOT contain `'INVALID_SYM'`.
    4. **Test 3 (`notifies onSymbolsChanged listeners only when the active symbol set changes`):** Register a `const listener = vi.fn(); onSymbolsChanged(listener);`, call `await refreshActiveSymbols()` with `[{ symbol: 'AUDUSD' }]` (assert `listener` called once with `{ added: ['AUDUSD'], removed: [], all: expect.any(Array) }`), call `await refreshActiveSymbols()` again with the same `[{ symbol: 'AUDUSD' }]` (assert `listener` not called a second time), then call `await refreshActiveSymbols()` with `[]` (assert `listener` called with `{ added: [], removed: ['AUDUSD'], all: expect.any(Array) }`).
    5. **Test 4 (`retains current symbol list when DB query throws`):** Make `selectDistinct` reject with `new Error('DB connection lost')`, call `await refreshActiveSymbols()`, and assert `getActiveSymbols()` remains non-empty without throwing.

#### ✅ 3. `packages/ai/test/integration/ai-data.integration.test.ts`
**Status: ✅ DONE (2026-10-17).** Removed `vi.mock('@kestrel/indicators')`; only `@kestrel/data` (`getCandles`/`getPrice`) remains mocked. Replaced the duplicate unit/schema blocks with: (1) `get_indicators` executing real RSI/EMA/MACD via `@kestrel/indicators` and asserting tail-15 equality against a direct `computeIndicator` call; (2) `get_market_structure` executing real `computeStructure` on a 40-bar zigzag (real swing highs/lows + BOS/CHoCH events + summary); (3) two `verify_call` cases where the real structure scan yields `agree: true` (nearest swing high beyond target) and `agree: false` + `opposing_liquidity_in_path` (real swing high in the path). Candles are seeded via `makeCandles` from `packages/indicators/test/fixtures.ts`. Verified green in isolation (4 tests).
- **File Path:** `packages/ai/test/integration/ai-data.integration.test.ts`
- **Production Target:** `packages/ai/src/tools/get-candles.ts`
- **Verdict:** `[REPLACE MOCKS WITH INTEGRATION]`
- **Technical Diagnosis:** Despite being placed in `test/integration/ai-data.integration.test.ts`, this file mocks BOTH `@kestrel/data` AND `@kestrel/indicators` with `vi.fn()`, turning its `get_price`, `get_candles`, and `compute_risk` blocks into mock-only unit tests that duplicate `packages/ai/test/get-price.test.ts`, `packages/ai/test/get-candles.test.ts`, and `packages/ai/test/compute-risk.test.ts`, while its `SymbolSchema`/`TimeframeSchema` blocks duplicate `@kestrel/shared` tests.
- **Exact Instructions for Executing Agent:**
  - Remove `vi.mock('@kestrel/indicators', ...)` so `@kestrel/ai` tools integrate with the **real** `@kestrel/indicators` package (`computeRsi`, `computeEma`, `computeMacd`, `computeAtr`, `computeBollinger`, `computeStructure`) and `@kestrel/shared` schemas, mocking only the external market-data fetch boundary (`@kestrel/data` `getCandles` / `getPrice` seeded with `makeCandles` from `packages/indicators/test/fixtures.ts`).
  - Replace the duplicate unit/schema blocks with 3 real cross-package integration tests:
    1. `getIndicatorsTool.execute` + real `@kestrel/indicators`: feed 50 deterministic candles via `getCandles`, request `[{ kind: 'rsi', params: { period: 14 } }, { kind: 'ema', params: { period: 20 } }, { kind: 'macd', params: { fast: 12, slow: 26, signal: 9 } }]`, and assert non-empty computed indicator values matching `@kestrel/indicators` output and capped to `<= 15` tail points.
    2. `getMarketStructureTool.execute` + real `computeStructure`: feed a 40-bar swing series via `getCandles` and assert real swing highs/lows, trend classification, and BOS/CHoCH events.
    3. `verifyCallTool.execute` + real `computeStructure`: feed deterministic candles and live tick price and assert `agree: true` when no opposing swing liquidity sits between `entry` and `target`, and `agree: false` with `opposing_liquidity_in_path` when a real swing high blocks a long setup.

#### ✅ 4. `packages/ai/test/usage.test.ts`
**Status: ✅ DONE (2026-10-17).** Local `reduce()` deleted; the file now imports and executes the real `computeUsage` + `listTelemetry`. Only `../src/db` (`getDb`) and `@kestrel/db` (`requireTenantIdForUser` + column stubs) are mocked via a per-select chain queue. Tests: authoritative `todayUsd`/`sevenDayUsd`/`thirtyDayUsd` from `daily_ai_spend` cents (2.5/4.0/9.0) + 7 ordered UTC buckets; user-turn counts separated from `multi_agent_turn`/`multi_specialist_*`/`title_*` token breakdowns with bare `gemini-2.5-flash` mapping to `byokProviderId: 'google'`; `listTelemetry` row mapping with epoch-ms `createdAt` and null coalescing; zeroed totals. Verified green in isolation (4 tests).
- **File Path:** `packages/ai/test/usage.test.ts`
- **Production Target:** `packages/ai/src/usage.ts`
- **Verdict:** `[REPLACE MOCKS WITH INTEGRATION]`
- **Technical Diagnosis:** Currently has **zero** imports from `packages/ai/src/usage.ts`! Defines a local `function reduce(rows: Row[], now: Date)` inside the test file (lines 35–57) and tests that local function. Worse, the local `reduce()` sums `chat_telemetry.estCostUsd` for `todayUsd`/`sevenDayUsd`/`thirtyDayUsd`, whereas the real `computeUsage()` in `packages/ai/src/usage.ts` (lines 116–247) computes `todayUsd`/`sevenDayUsd`/`thirtyDayUsd` from `daily_ai_spend.totalUsdCents` and separates `turnRows` (`kind === null || kind === 'multi_agent_turn'`) from `usageRows` (`kind === null || kind.startsWith('title_' | 'plan_' | 'multi_specialist_')`)!
- **Exact Instructions for Executing Agent:**
  - Delete the local `reduce()` function and rewrite `packages/ai/test/usage.test.ts` to import and call the real `computeUsage` and `listTelemetry` from `../src/usage`:
    1. Mock `../src/db` (`getDb`) and `@kestrel/db` (`requireTenantIdForUser: vi.fn(async () => 'tenant-1')`, `schema`) so the two parallel `.select().from(...)` queries in `computeUsage` return controlled `chatTelemetry` rows and `dailyAiSpend` rows.
    2. **Test 1 (`computes authoritative todayUsd, sevenDayUsd, and thirtyDayUsd from daily_ai_spend cents`):** Seed `dailyAiSpend` rows for today (`250` cents = `$2.50`), yesterday (`150` cents = `$1.50`), and 14 days ago (`500` cents = `$5.00`) at fixed `now = new Date('2026-05-26T15:00:00Z')`. Assert `todayUsd === 2.5`, `sevenDayUsd === 4.0`, `thirtyDayUsd === 9.0`, and `daily7` has 7 ordered UTC date buckets.
    3. **Test 2 (`separates user turn counts from auxiliary specialist/planner token breakdowns`):** Seed `chatTelemetry` rows with `kind: null` (`google/gemini-2.5-flash`), `kind: 'multi_agent_turn'`, `kind: 'multi_specialist_technical'` (`anthropic/claude-sonnet-4-5`), and `kind: 'title_gen'` (`gemini-2.5-flash`). Assert `thirtyDayTurns === 2` (only `null` and `'multi_agent_turn'`), while `byModel` and `byProvider` aggregate tokens and costs across the `null`, `'multi_specialist_technical'`, and `'title_gen'` rows (mapping bare `'gemini-2.5-flash'` to `byokProviderId: 'google'`).
    4. **Test 3 (`listTelemetry maps DB rows and converts createdAt Date to epoch ms`):** Call `listTelemetry('user-1', 10)` and assert the returned `TelemetryRow[]` shape.

#### ✅ 5. `apps/web/test/admin-ai-eval.test.tsx`
**Status: ✅ DONE (2026-10-17) — adapted (`isMutationIntent`, not `isMutatingIntent`).** The local `XAUUSD_TERMS`/`OTHER_SYMBOL_TERMS`/`MUTATING_TERMS`/`INJECTION_TERMS` regexes and `isMastraEligible` closure are deleted. The prompt-set test now asserts every `AI_EVAL_PROMPTS` entry passes the real `extractMastraSymbol` + `isMastraXauusdCandidate` gate, and new `it.each` tables exercise the real `isSafeSymbolResearchPrompt`, `isInjectionAttempt`, `isMutationIntent` and `isMastraXauusdCandidate` primitives on gold, multi-symbol, mutating (alert/notify/share/journal), and injection inputs. Verified green in isolation (30 tests).
- **File Path:** `apps/web/test/admin-ai-eval.test.tsx`
- **Production Target:** `apps/web/src/app/admin/ai-eval/page.tsx`
- **Verdict:** `[REPLACE MOCKS WITH INTEGRATION]`
- **Technical Diagnosis:** Lines 21–36 define local regex constants (`XAUUSD_TERMS`, `OTHER_SYMBOL_TERMS`, `MUTATING_TERMS`, `INJECTION_TERMS`) and a local `function isMastraEligible(prompt: string): boolean` inside the test file, and lines 38–93 (`describe('Mastra routing eligibility logic')`) test that local function instead of importing the real routing functions from `@kestrel/ai/mastra` (`extractMastraSymbol`, `isSafeSymbolResearchPrompt`, `isInjectionAttempt`, `isMutatingIntent`).
- **Exact Instructions for Executing Agent:**
  - Delete the local `XAUUSD_TERMS`, `OTHER_SYMBOL_TERMS`, `MUTATING_TERMS`, `INJECTION_TERMS`, and `isMastraEligible` definitions at lines 21–36.
  - Import the real `extractMastraSymbol`, `isSafeSymbolResearchPrompt`, `isInjectionAttempt`, and `isMutatingIntent` from `@kestrel/ai/mastra` and test them directly with `it.each` on the gold, multi-symbol, mutating (`alert`, `journal`, `share`), and prompt-injection inputs.
  - **Keep untouched:** `describe('Admin AI Eval KPI computation', ...)` (lines 97–161) and `describe('AdminNav includes AI Eval tab', ...)` (lines 165–183).

#### ✅ 6. `apps/web/test/auth-callbacks.test.ts`
**Status: ✅ DONE (2026-10-17) — adapted to the `AuthError`/`validateSession` surface (see the Batch 4 evidence block).** The `fs.readFileSync` greps are gone; the file imports the real `handleJwtCallback`/`handleSessionCallback`. Session-insert and DB boundaries are mocked (`@kestrel/db.createUserSession`, `@kestrel/ai.getDb`), while the real `validateSession` fail-closed policy runs against a fake Drizzle chain. Covers: initial sign-in token hydration + `createUserSession(sessionId, userId, deviceName, ip)`; generated sessionId + no-user `tokenVersion` default; `AuthError('SESSION_SYSTEM_ERROR')` on insert failure; DB-outage fail-closed; tokenVersion mismatch and revoked-row invalidation; valid-session identity merge + last-active write; last-active-write failure fail-closed. All invalidation assertions check `expires === '0'` + `user === undefined` (Sabotage Check 5 now has a live target). Verified green in isolation (8 tests).
- **File Path:** `apps/web/test/auth-callbacks.test.ts`
- **Production Target:** `apps/web/src/lib/auth/callbacks.ts`
- **Verdict:** `[REPLACE MOCKS WITH INTEGRATION]`
- **Technical Diagnosis:** Currently 100% `fs.readFileSync('src/lib/auth/callbacks.ts', 'utf8')` string grepping (lines 18–56). Never imports or calls `handleJwtCallback` or `handleSessionCallback` from `apps/web/src/lib/auth/callbacks.ts`!
- **Exact Instructions for Executing Agent:**
  - Replace the `fs.readFileSync` checks with real behavioral unit tests importing `handleJwtCallback` and `handleSessionCallback` from `../src/lib/auth/callbacks`:
    1. Mock `@/lib/session` (`createUserSession`, `validateSession`), `@/lib/request-context` (`getLoginMeta`), and `@kestrel/db` (`getDb`).
    2. **Test 1 (`handleJwtCallback creates a session on initial sign-in and attaches sessionId, role, and rememberMe to token`):** Call `await handleJwtCallback({ token: {}, user: { id: 'u1', role: 'admin', tokenVersion: 2 }, account: { provider: 'credentials' } })` with `createUserSession` resolving to `'sess-123'` and `getLoginMeta` returning `{ rememberMe: true, ip: '1.2.3.4', userAgent: 'Mozilla/5.0' }`. Assert returned token has `{ id: 'u1', role: 'admin', tokenVersion: 2, sessionId: 'sess-123', rememberMe: true }`.
    3. **Test 2 (`handleJwtCallback fails closed by throwing SESSION_SYSTEM_ERROR when createUserSession returns null`):** Mock `createUserSession` to resolve to `null`. Assert `handleJwtCallback({ token: {}, user: { id: 'u1' }, account: { provider: 'credentials' } })` rejects with `Error('SESSION_SYSTEM_ERROR: Unable to create user session')`.
    4. **Test 3 (`handleSessionCallback fails closed with expired session when getDb throws`):** Mock `getDb` to throw `new Error('DB down')`. Call `await handleSessionCallback({ session: { user: { id: 'u1' }, expires: '2026-12-01' } as never, token: { id: 'u1', sessionId: 'sess-1' } })` and assert it returns `{ expires: '0', user: undefined }`.
    5. **Test 4 (`handleSessionCallback fails closed when validateSession returns valid: false or tokenVersion mismatches DB`):** Mock `validateSession` to resolve to `{ valid: false }` (and in a second case `{ valid: true }` with DB `tokenVersion: 5` vs `token.tokenVersion: 1`). Assert both return `{ expires: '0', user: undefined }`.

#### ✅ 7. `apps/web/test/auth-credentials.test.ts`
**Status: ✅ DONE (2026-10-17) — adapted to the actual `authorizeCredentials` contract (see the Batch 4 evidence block).** The `credential helpers` block is kept; `passwordSchema` is now exercised directly (valid, 128-char cap exact, 129-char over-cap, <10 chars, missing upper/lower/digit) and a full `authorizeCredentials` suite runs with only the DB/encryption/TOTP boundaries mocked and real bcrypt (cost 4): immediate null for missing credentials without DB access; no-row null; `ACCOUNT_LOCKED` + `recordAuthEvent` while locked; failed-password counter increment; DB-lookup failure → null; successful login resets counters and returns `{ id, email, tokenVersion, rememberMe, sessionId, deviceName, ip }`; `2FA_REQUIRED`; backup-code consumption via `array_remove` update; `INVALID_2FA_CODE` + `2fa_failure` anomaly. Verified green in isolation (19 tests).
- **File Path:** `apps/web/test/auth-credentials.test.ts`
- **Production Target:** `apps/web/src/lib/auth/credentials-authorize.ts`
- **Verdict:** `[REPLACE MOCKS WITH INTEGRATION]`
- **Technical Diagnosis:** Currently tests only the 3 pure string helpers in `src/lib/auth/credentials.ts` (`normalizeEmail`, `normalizeCredential`, `DUMMY_PASSWORD_HASH`), while `authorizeCredentials` in `src/lib/auth/credentials-authorize.ts` (including 2FA `totp_required`, `totp_invalid`, backup code consumption, brute-force lockout, and `passwordSchema` from `src/lib/validation.ts`) was previously 'tested' only via `fs.readFileSync` in `apps/web/test/auth-2fa-policy.test.ts` (deleted in Batch 1) and local closures in `apps/web/test/auth-flow.test.ts` (pruned in Batch 2).
- **Exact Instructions for Executing Agent:**
  - Keep the existing `describe('credential helpers')` block in `apps/web/test/auth-credentials.test.ts`.
  - Add `describe('passwordSchema (src/lib/validation.ts)')` importing the real `passwordSchema` from `../src/lib/validation` and testing with `it.each`: valid password (`'StrongPass1'`), `<8` chars, `>72` chars (bcrypt 72-byte truncation defense), missing uppercase, missing lowercase, and missing digit.
  - Add `describe('authorizeCredentials (src/lib/auth/credentials-authorize.ts)')` importing `authorizeCredentials` from `../src/lib/auth/credentials-authorize` (with `@/lib/login-rate-limit`, `@/lib/totp`, `@/lib/request-context`, and `bcryptjs` mocked) and testing:
    1. Returns `null` immediately when `checkAccountLockout` returns `true`.
    2. Calls `recordFailedLogin` and returns `null` when `bcrypt.compare` returns `false`.
    3. Sets `setLoginFailureReason('totp_required')` and returns `null` when `totpEnabled` is `true` (`totpSecret: 'v1:encrypted'`) and no `totpCode` is provided.
    4. Calls `consumeBackupCode` for an 8-char backup code when `verifyTotpToken` returns `false`, clears login attempts, and returns `{ id, email, name, role, tokenVersion }`.

### Batch 5: Untouched High-Signal Tests (375 Files — `[KEEP AS-IS]`)

All **375** files listed below pass the 5-point Signal-to-Noise Ratio rubric (high fault-detection power against real production modules, property-based invariants with `fast-check`, real Postgres RLS / Mastra queue / LibSQL / React Testing Library / Playwright E2E behavioral assertions). **Do not delete or weaken any test in Batch 5.**

| # | File Path | Production Target / Domain | Verdict | Active `it`/`test` Count | Signal Justification |
| ---: | :--- | :--- | :--- | ---: | :--- |
| 1 | `apps/web/src/components/ui/__tests__/button-touch-tactile.test.tsx` | `../button` | `[KEEP AS-IS]` | 11 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 2 | `apps/web/src/components/ui/__tests__/drawer-tokens.test.tsx` | `../confirm-drawer` | `[KEEP AS-IS]` | 11 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 3 | `apps/web/src/components/ui/__tests__/segmented-touch-targets.test.tsx` | `../segmented` | `[KEEP AS-IS]` | 12 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 4 | `apps/web/src/components/ui/__tests__/stat-card-badge-tokens.test.tsx` | `../badge` | `[KEEP AS-IS]` | 12 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 5 | `apps/web/test/admin-diagnostic-traces.test.tsx` | `@/app/(app)/admin/_components/admin-diagnostic-traces` | `[KEEP AS-IS]` | 2 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 6 | `apps/web/test/admin-error-block.test.tsx` | `@/app/(app)/admin/_components/admin-error-block` | `[KEEP AS-IS]` | 5 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 7 | `apps/web/test/admin-log-viewer.test.tsx` | `@/app/(app)/admin/_components/admin-log-viewer` | `[KEEP AS-IS]` | 4 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 8 | `apps/web/test/admin-mastra-runs.test.tsx` | `@/app/(app)/admin/_components/admin-mastra-runs` | `[KEEP AS-IS]` | 2 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 9 | `apps/web/test/admin-page.test.tsx` | `@/app/(app)/admin/page` | `[KEEP AS-IS]` | 5 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 10 | `apps/web/test/admin-regression-cases.test.ts` | `@/app/api/admin/regression-cases/[id]/route` | `[KEEP AS-IS]` | 2 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 11 | `apps/web/test/admin-system-health.test.tsx` | `@/app/(app)/admin/_components/admin-system-health` | `[KEEP AS-IS]` | 4 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 12 | `apps/web/test/admin/admin-auth.test.ts` | `@/lib/admin-auth` | `[KEEP AS-IS]` | 7 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 13 | `apps/web/test/admin/admin-health.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 14 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 14 | `apps/web/test/admin/diagnostic-traces.test.ts` | `@/app/api/admin/diagnostics/explorer/route` | `[KEEP AS-IS]` | 4 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 15 | `apps/web/test/admin/features.test.ts` | `@/app/api/admin/features/route` | `[KEEP AS-IS]` | 2 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 16 | `apps/web/test/admin/flush.test.ts` | `@/app/api/admin/flush/route` | `[KEEP AS-IS]` | 1 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 17 | `apps/web/test/admin/logs-stream.test.ts` | `@/app/api/admin/logs/stream/route` | `[KEEP AS-IS]` | 2 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 18 | `apps/web/test/admin/onboarding-inspect.test.ts` | `@/app/api/admin/onboarding/inspect/route` | `[KEEP AS-IS]` | 3 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 19 | `apps/web/test/admin/onboarding-reset.test.ts` | `@/app/api/admin/onboarding/reset/route` | `[KEEP AS-IS]` | 4 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 20 | `apps/web/test/admin/test-alert-telegram.test.ts` | `@/app/api/admin/test-alert-email/route` | `[KEEP AS-IS]` | 13 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 21 | `apps/web/test/admin/users-role.test.ts` | `@/app/api/admin/users/[id]/role/route` | `[KEEP AS-IS]` | 4 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 22 | `apps/web/test/admin/users.test.ts` | `@/app/api/admin/users/route` | `[KEEP AS-IS]` | 2 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 23 | `apps/web/test/agent-deliberation.test.tsx` | `@/components/chat/parts/agent-deliberation` | `[KEEP AS-IS]` | 21 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 24 | `apps/web/test/analysis-job-cancel.test.ts` | `@/app/api/chat/analysis-jobs/[jobId]/route` | `[KEEP AS-IS]` | 6 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 25 | `apps/web/test/api-chat-route.integration.test.ts` | `@/app/api/chat/route` | `[KEEP AS-IS]` | 28 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 26 | `apps/web/test/api-errors.test.ts` | `../src/lib/api-errors` | `[KEEP AS-IS]` | 2 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 27 | `apps/web/test/api-payload-size.test.ts` | `../src/lib/api` | `[KEEP AS-IS]` | 4 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 28 | `apps/web/test/api.test.ts` | `@kestrel/data` | `[KEEP AS-IS]` | 30 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 29 | `apps/web/test/auth-config.test.ts` | `../src/lib/security-invariants` | `[KEEP AS-IS]` | 2 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 30 | `apps/web/test/auth-impersonation.test.ts` | `../src/lib/auth/impersonation` | `[KEEP AS-IS]` | 3 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 31 | `apps/web/test/auth-provider-contract.test.ts` | `../src/lib/auth/providers` | `[KEEP AS-IS]` | 3 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 32 | `apps/web/test/billing-contract.test.ts` | `@/app/api/admin/billing/dlq/[id]/replay/route` | `[KEEP AS-IS]` | 10 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 33 | `apps/web/test/billing-dlq-cron.test.ts` | `@/app/api/cron/billing-dlq/route` | `[KEEP AS-IS]` | 2 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 34 | `apps/web/test/build-scripts.test.ts` | `E2E / full-stack route` | `[KEEP AS-IS]` | 4 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 35 | `apps/web/test/bundle-size-guard.test.ts` | `../scripts/bundle-size-guard.mjs` | `[KEEP AS-IS]` | 6 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 36 | `apps/web/test/card.test.tsx` | `@/components/ui/card` | `[KEEP AS-IS]` | 3 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 37 | `apps/web/test/chat-result-cards.test.tsx` | `@/components/chat/parts/analyze-technical` | `[KEEP AS-IS]` | 4 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 38 | `apps/web/test/chat-shared.test.tsx` | `@/components/chat/parts/_shared` | `[KEEP AS-IS]` | 13 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 39 | `apps/web/test/chat-transport.test.ts` | `@/lib/chat-transport` | `[KEEP AS-IS]` | 14 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 40 | `apps/web/test/clean-news-text.test.ts` | `@/lib/clean-news-text` | `[KEEP AS-IS]` | 6 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 41 | `apps/web/test/composer-helpers.test.ts` | `../src/components/chat/composer-helpers` | `[KEEP AS-IS]` | 12 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 42 | `apps/web/test/composer.test.tsx` | `@/components/chat/composer` | `[KEEP AS-IS]` | 30 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 43 | `apps/web/test/cron-auth-contract.test.ts` | `@/lib/cron` | `[KEEP AS-IS]` | 2 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 44 | `apps/web/test/cron-health-alerts.test.ts` | `@/app/api/cron/health-alerts/route` | `[KEEP AS-IS]` | 2 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 45 | `apps/web/test/cron-vm-policy.test.ts` | `E2E / full-stack route` | `[KEEP AS-IS]` | 12 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 46 | `apps/web/test/csrf.test.ts` | `../src/lib/csrf` | `[KEEP AS-IS]` | 17 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 47 | `apps/web/test/dev-secrets.test.ts` | `E2E / full-stack route` | `[KEEP AS-IS]` | 6 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 48 | `apps/web/test/docker-backup-policy.test.ts` | `E2E / full-stack route` | `[KEEP AS-IS]` | 5 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 49 | `apps/web/test/empty-state.test.tsx` | `@/components/ui/empty-state` | `[KEEP AS-IS]` | 11 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 50 | `apps/web/test/feedback-routes.test.ts` | `@/app/api/admin/feedback/[id]/route` | `[KEEP AS-IS]` | 5 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 51 | `apps/web/test/frontend-route-contract.test.ts` | `E2E / full-stack route` | `[KEEP AS-IS]` | 3 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 52 | `apps/web/test/fuzzy-match.test.ts` | `../src/lib/fuzzy-match` | `[KEEP AS-IS]` | 38 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 53 | `apps/web/test/health-alert-delivery.test.ts` | `@/lib/services/admin-dtos` | `[KEEP AS-IS]` | 6 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 54 | `apps/web/test/health-alerts.test.ts` | `@/app/api/health/alerts/route` | `[KEEP AS-IS]` | 2 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 55 | `apps/web/test/hooks-use-auto-scroll.test.ts` | `../src/hooks/use-auto-scroll` | `[KEEP AS-IS]` | 6 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 56 | `apps/web/test/hooks-use-candles.test.ts` | `@/lib/market-client` | `[KEEP AS-IS]` | 4 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 57 | `apps/web/test/hooks-use-chart-data.test.ts` | `@/lib/market-client` | `[KEEP AS-IS]` | 7 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 58 | `apps/web/test/hooks-use-copied.test.ts` | `../src/hooks/use-copied` | `[KEEP AS-IS]` | 6 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 59 | `apps/web/test/hooks-use-local-storage.test.ts` | `../src/hooks/use-local-storage` | `[KEEP AS-IS]` | 9 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 60 | `apps/web/test/hooks-use-prices.test.ts` | `@/lib/market-client` | `[KEEP AS-IS]` | 4 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 61 | `apps/web/test/hooks-use-slash-commands.test.ts` | `../src/hooks/use-slash-commands` | `[KEEP AS-IS]` | 15 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 62 | `apps/web/test/hooks-use-thread-title.test.ts` | `@/lib/api-client` | `[KEEP AS-IS]` | 6 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 63 | `apps/web/test/hooks-use-voice-input.test.ts` | `../src/hooks/use-voice-input` | `[KEEP AS-IS]` | 10 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 64 | `apps/web/test/instruction-presets.test.ts` | `../src/app/(app)/settings/_components/agent/ai-prefs-card` | `[KEEP AS-IS]` | 11 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 65 | `apps/web/test/journal-replay-service.test.ts` | `@kestrel/ai` | `[KEEP AS-IS]` | 3 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 66 | `apps/web/test/lighthouse-runner.test.ts` | `../../../tools/lighthouse/run.mjs` | `[KEEP AS-IS]` | 1 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 67 | `apps/web/test/loadtest-contracts.test.ts` | `../../../loadtest/lib/sse.js` | `[KEEP AS-IS]` | 4 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 68 | `apps/web/test/mastra-chat-response.test.ts` | `@/lib/services/mastra-chat-response` | `[KEEP AS-IS]` | 1 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 69 | `apps/web/test/mastra-chat-service.test.ts` | `@/lib/services/mastra-chat` | `[KEEP AS-IS]` | 4 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 70 | `apps/web/test/mastra-report-card.test.tsx` | `@/components/chat/parts/mastra-report` | `[KEEP AS-IS]` | 3 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 71 | `apps/web/test/mastra-report-context.test.ts` | `@/lib/services/mastra-report-context` | `[KEEP AS-IS]` | 3 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 72 | `apps/web/test/mastra-stream-response.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 6 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 73 | `apps/web/test/mastra-xauusd-service.test.ts` | `@/lib/services/mastra-xauusd` | `[KEEP AS-IS]` | 2 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 74 | `apps/web/test/message-list-hydration.test.tsx` | `@/components/chat/message-list` | `[KEEP AS-IS]` | 1 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 75 | `apps/web/test/middleware-matcher-coverage.test.ts` | `E2E / full-stack route` | `[KEEP AS-IS]` | 6 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 76 | `apps/web/test/middleware.test.ts` | `E2E / full-stack route` | `[KEEP AS-IS]` | 9 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 77 | `apps/web/test/model-picker-utils.test.ts` | `@/components/chat/_components/model-picker-utils` | `[KEEP AS-IS]` | 4 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 78 | `apps/web/test/multi-user-boundary.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 5 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 79 | `apps/web/test/nextauth-wiring.test.ts` | `../src/auth` | `[KEEP AS-IS]` | 3 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 80 | `apps/web/test/ownership-boundaries.test.ts` | `@/app/api/alerts/[id]/route` | `[KEEP AS-IS]` | 4 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 81 | `apps/web/test/p3-hardening-policy.test.ts` | `E2E / full-stack route` | `[KEEP AS-IS]` | 5 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 82 | `apps/web/test/performance-chart-data.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 3 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 83 | `apps/web/test/phase4-6-ui.test.tsx` | `@/components/chat/composer-slash-menu` | `[KEEP AS-IS]` | 3 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 84 | `apps/web/test/provider-info-dot.test.ts` | `../src/components/ui/provider-info-dot` | `[KEEP AS-IS]` | 8 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 85 | `apps/web/test/provision-user.test.ts` | `E2E / full-stack route` | `[KEEP AS-IS]` | 11 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 86 | `apps/web/test/quick-prompts.test.tsx` | `@/components/chat/quick-prompts` | `[KEEP AS-IS]` | 17 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 87 | `apps/web/test/route-alerts.test.ts` | `@/app/api/alerts/[id]/route` | `[KEEP AS-IS]` | 15 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 88 | `apps/web/test/route-health.test.ts` | `@/app/api/health/public/route` | `[KEEP AS-IS]` | 7 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 89 | `apps/web/test/route-journal-replay.test.ts` | `@/app/api/journal/[id]/replay/route` | `[KEEP AS-IS]` | 3 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 90 | `apps/web/test/route-journal.test.ts` | `@/app/api/journal/[id]/route` | `[KEEP AS-IS]` | 12 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 91 | `apps/web/test/security-boundaries.test.ts` | `E2E / full-stack route` | `[KEEP AS-IS]` | 4 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 92 | `apps/web/test/security-headers-contract.test.ts` | `E2E / full-stack route` | `[KEEP AS-IS]` | 3 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 93 | `apps/web/test/service-worker.test.ts` | `E2E / full-stack route` | `[KEEP AS-IS]` | 2 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 94 | `apps/web/test/set-build-id.test.ts` | `../scripts/set-build-id.mjs` | `[KEEP AS-IS]` | 3 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 95 | `apps/web/test/settings-actions.test.ts` | `@kestrel/db` | `[KEEP AS-IS]` | 38 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 96 | `apps/web/test/setup-env.test.ts` | `../../../scripts/setup/lib/env.mjs` | `[KEEP AS-IS]` | 13 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 97 | `apps/web/test/setup-pages.test.ts` | `../../../scripts/setup/lib/ui.mjs` | `[KEEP AS-IS]` | 6 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 98 | `apps/web/test/setup-prompts.test.ts` | `../../../scripts/setup/lib/prompts.mjs` | `[KEEP AS-IS]` | 17 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 99 | `apps/web/test/setup-run.test.ts` | `../../../scripts/setup/lib/run.mjs` | `[KEEP AS-IS]` | 12 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 100 | `apps/web/test/setup-wizard-policy.test.ts` | `../../../scripts/setup/index.mjs` | `[KEEP AS-IS]` | 30 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 101 | `apps/web/test/shiki-sanitization.test.ts` | `../src/components/chat/parts/text` | `[KEEP AS-IS]` | 3 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 102 | `apps/web/test/sparkline.test.tsx` | `@/components/ui/sparkline` | `[KEEP AS-IS]` | 8 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 103 | `apps/web/test/stale-indicator.test.tsx` | `@/components/ui/stale-indicator` | `[KEEP AS-IS]` | 6 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 104 | `apps/web/test/storage.test.ts` | `../src/lib/storage` | `[KEEP AS-IS]` | 20 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 105 | `apps/web/test/thread-export.test.ts` | `../src/lib/thread-export` | `[KEEP AS-IS]` | 18 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 106 | `apps/web/test/tool-card.test.tsx` | `@/components/chat/parts/tool-card` | `[KEEP AS-IS]` | 18 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 107 | `apps/web/test/usage-alerts.test.ts` | `../src/lib/usage-alerts` | `[KEEP AS-IS]` | 5 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 108 | `apps/web/test/use-popup-menu.test.tsx` | `@/hooks/use-popup-menu` | `[KEEP AS-IS]` | 6 | Next.js API route handler, Server Action, auth security, & RTL component behavior |
| 109 | `apps/web/tests/e2e/accessibility.spec.ts` | `./fixtures` | `[KEEP AS-IS]` | 8 | Playwright full-browser E2E workflow & multi-user session isolation |
| 110 | `apps/web/tests/e2e/admin-dashboard.spec.ts` | `./test-utils` | `[KEEP AS-IS]` | 3 | Playwright full-browser E2E workflow & multi-user session isolation |
| 111 | `apps/web/tests/e2e/alerts-crud.spec.ts` | `./fixtures` | `[KEEP AS-IS]` | 1 | Playwright full-browser E2E workflow & multi-user session isolation |
| 112 | `apps/web/tests/e2e/api-health.spec.ts` | `E2E / full-stack route` | `[KEEP AS-IS]` | 5 | Playwright full-browser E2E workflow & multi-user session isolation |
| 113 | `apps/web/tests/e2e/auth.spec.ts` | `./test-utils` | `[KEEP AS-IS]` | 8 | Playwright full-browser E2E workflow & multi-user session isolation |
| 114 | `apps/web/tests/e2e/calendar-events.spec.ts` | `./fixtures` | `[KEEP AS-IS]` | 1 | Playwright full-browser E2E workflow & multi-user session isolation |
| 115 | `apps/web/tests/e2e/chart-cockpit.spec.ts` | `./fixtures` | `[KEEP AS-IS]` | 1 | Playwright full-browser E2E workflow & multi-user session isolation |
| 116 | `apps/web/tests/e2e/chat.spec.ts` | `@kestrel/ai/persistence` | `[KEEP AS-IS]` | 5 | Playwright full-browser E2E workflow & multi-user session isolation |
| 117 | `apps/web/tests/e2e/command-palette.spec.ts` | `./fixtures` | `[KEEP AS-IS]` | 6 | Playwright full-browser E2E workflow & multi-user session isolation |
| 118 | `apps/web/tests/e2e/dashboard.spec.ts` | `./fixtures` | `[KEEP AS-IS]` | 3 | Playwright full-browser E2E workflow & multi-user session isolation |
| 119 | `apps/web/tests/e2e/isolation.spec.ts` | `@kestrel/ai/persistence` | `[KEEP AS-IS]` | 2 | Playwright full-browser E2E workflow & multi-user session isolation |
| 120 | `apps/web/tests/e2e/journal-crud.spec.ts` | `./fixtures` | `[KEEP AS-IS]` | 1 | Playwright full-browser E2E workflow & multi-user session isolation |
| 121 | `apps/web/tests/e2e/landing-public.spec.ts` | `E2E / full-stack route` | `[KEEP AS-IS]` | 1 | Playwright full-browser E2E workflow & multi-user session isolation |
| 122 | `apps/web/tests/e2e/message-edit.spec.ts` | `@kestrel/ai/persistence` | `[KEEP AS-IS]` | 4 | Playwright full-browser E2E workflow & multi-user session isolation |
| 123 | `apps/web/tests/e2e/multi-agent.spec.ts` | `./fixtures` | `[KEEP AS-IS]` | 7 | Playwright full-browser E2E workflow & multi-user session isolation |
| 124 | `apps/web/tests/e2e/nav-drawer.spec.ts` | `./fixtures` | `[KEEP AS-IS]` | 12 | Playwright full-browser E2E workflow & multi-user session isolation |
| 125 | `apps/web/tests/e2e/navigation.spec.ts` | `./fixtures` | `[KEEP AS-IS]` | 3 | Playwright full-browser E2E workflow & multi-user session isolation |
| 126 | `apps/web/tests/e2e/news-pwa.spec.ts` | `./fixtures` | `[KEEP AS-IS]` | 4 | Playwright full-browser E2E workflow & multi-user session isolation |
| 127 | `apps/web/tests/e2e/onboarding-replay.spec.ts` | `./test-utils` | `[KEEP AS-IS]` | 2 | Playwright full-browser E2E workflow & multi-user session isolation |
| 128 | `apps/web/tests/e2e/p3-chat-contracts.spec.ts` | `./fixtures` | `[KEEP AS-IS]` | 3 | Playwright full-browser E2E workflow & multi-user session isolation |
| 129 | `apps/web/tests/e2e/p3-mutation-contracts.spec.ts` | `./fixtures` | `[KEEP AS-IS]` | 2 | Playwright full-browser E2E workflow & multi-user session isolation |
| 130 | `apps/web/tests/e2e/portfolio-risk.spec.ts` | `./fixtures` | `[KEEP AS-IS]` | 1 | Playwright full-browser E2E workflow & multi-user session isolation |
| 131 | `apps/web/tests/e2e/real-system.spec.ts` | `./fixtures` | `[KEEP AS-IS]` | 2 | Playwright full-browser E2E workflow & multi-user session isolation |
| 132 | `apps/web/tests/e2e/responsive.spec.ts` | `./fixtures` | `[KEEP AS-IS]` | 5 | Playwright full-browser E2E workflow & multi-user session isolation |
| 133 | `apps/web/tests/e2e/service-worker.spec.ts` | `E2E / full-stack route` | `[KEEP AS-IS]` | 3 | Playwright full-browser E2E workflow & multi-user session isolation |
| 134 | `apps/web/tests/e2e/settings.spec.ts` | `./fixtures` | `[KEEP AS-IS]` | 6 | Playwright full-browser E2E workflow & multi-user session isolation |
| 135 | `apps/web/tests/e2e/thread-switcher.spec.ts` | `./fixtures` | `[KEEP AS-IS]` | 3 | Playwright full-browser E2E workflow & multi-user session isolation |
| 136 | `apps/worker/test/briefings.test.ts` | `@kestrel/ai` | `[KEEP AS-IS]` | 3 | Worker lease contention, SignalR reconnect/circuit-breaker, & scheduled job execution |
| 137 | `apps/worker/test/candle-1m-flush.test.ts` | `../src/aggregator/candle-1m` | `[KEEP AS-IS]` | 4 | Worker lease contention, SignalR reconnect/circuit-breaker, & scheduled job execution |
| 138 | `apps/worker/test/candle-1m.test.ts` | `../src/aggregator/candle-1m` | `[KEEP AS-IS]` | 9 | Worker lease contention, SignalR reconnect/circuit-breaker, & scheduled job execution |
| 139 | `apps/worker/test/cot-job.test.ts` | `@kestrel/ai` | `[KEEP AS-IS]` | 3 | Worker lease contention, SignalR reconnect/circuit-breaker, & scheduled job execution |
| 140 | `apps/worker/test/cron-lock.test.ts` | `../src/cron-lock` | `[KEEP AS-IS]` | 6 | Worker lease contention, SignalR reconnect/circuit-breaker, & scheduled job execution |
| 141 | `apps/worker/test/dataset-export.test.ts` | `../src/jobs/dataset-export` | `[KEEP AS-IS]` | 2 | Worker lease contention, SignalR reconnect/circuit-breaker, & scheduled job execution |
| 142 | `apps/worker/test/embedding-backfill.test.ts` | `@kestrel/ai` | `[KEEP AS-IS]` | 3 | Worker lease contention, SignalR reconnect/circuit-breaker, & scheduled job execution |
| 143 | `apps/worker/test/env.test.ts` | `../src/env` | `[KEEP AS-IS]` | 14 | Worker lease contention, SignalR reconnect/circuit-breaker, & scheduled job execution |
| 144 | `apps/worker/test/fred-actuals.test.ts` | `@kestrel/ai` | `[KEEP AS-IS]` | 3 | Worker lease contention, SignalR reconnect/circuit-breaker, & scheduled job execution |
| 145 | `apps/worker/test/full-analysis-coordinator.test.ts` | `../src/jobs/full-analysis-coordinator` | `[KEEP AS-IS]` | 3 | Worker lease contention, SignalR reconnect/circuit-breaker, & scheduled job execution |
| 146 | `apps/worker/test/full-analysis-lifecycle.test.ts` | `../src/jobs/full-analysis-lifecycle.js` | `[KEEP AS-IS]` | 4 | Worker lease contention, SignalR reconnect/circuit-breaker, & scheduled job execution |
| 147 | `apps/worker/test/healthchecks.test.ts` | `../src/healthchecks` | `[KEEP AS-IS]` | 8 | Worker lease contention, SignalR reconnect/circuit-breaker, & scheduled job execution |
| 148 | `apps/worker/test/http-server-separation.test.ts` | `../src/http-server` | `[KEEP AS-IS]` | 2 | Worker lease contention, SignalR reconnect/circuit-breaker, & scheduled job execution |
| 149 | `apps/worker/test/http-server.test.ts` | `../src/http-server` | `[KEEP AS-IS]` | 10 | Worker lease contention, SignalR reconnect/circuit-breaker, & scheduled job execution |
| 150 | `apps/worker/test/jobs-registry.test.ts` | `../src/jobs` | `[KEEP AS-IS]` | 2 | Worker lease contention, SignalR reconnect/circuit-breaker, & scheduled job execution |
| 151 | `apps/worker/test/live-ticks.test.ts` | `../src/log` | `[KEEP AS-IS]` | 6 | Worker lease contention, SignalR reconnect/circuit-breaker, & scheduled job execution |
| 152 | `apps/worker/test/log.test.ts` | `../src/log` | `[KEEP AS-IS]` | 4 | Worker lease contention, SignalR reconnect/circuit-breaker, & scheduled job execution |
| 153 | `apps/worker/test/metrics-flush.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 2 | Worker lease contention, SignalR reconnect/circuit-breaker, & scheduled job execution |
| 154 | `apps/worker/test/multi-agent-analysis.integration.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 15 | Worker lease contention, SignalR reconnect/circuit-breaker, & scheduled job execution |
| 155 | `apps/worker/test/multi-agent-analysis.test.ts` | `@kestrel/ai/mastra` | `[KEEP AS-IS]` | 5 | Worker lease contention, SignalR reconnect/circuit-breaker, & scheduled job execution |
| 156 | `apps/worker/test/runner-lock.test.ts` | `../src/cron-lock` | `[KEEP AS-IS]` | 4 | Worker lease contention, SignalR reconnect/circuit-breaker, & scheduled job execution |
| 157 | `apps/worker/test/signalr-consumer.test.ts` | `../src/log` | `[KEEP AS-IS]` | 10 | Worker lease contention, SignalR reconnect/circuit-breaker, & scheduled job execution |
| 158 | `apps/worker/test/signalr-reconnect.test.ts` | `../src/log` | `[KEEP AS-IS]` | 3 | Worker lease contention, SignalR reconnect/circuit-breaker, & scheduled job execution |
| 159 | `apps/worker/test/snapshots-job.test.ts` | `@kestrel/ai` | `[KEEP AS-IS]` | 2 | Worker lease contention, SignalR reconnect/circuit-breaker, & scheduled job execution |
| 160 | `apps/worker/test/tick-buffer.test.ts` | `../src/signalr/consumer` | `[KEEP AS-IS]` | 6 | Worker lease contention, SignalR reconnect/circuit-breaker, & scheduled job execution |
| 161 | `apps/worker/test/weekly-review.test.ts` | `@kestrel/ai` | `[KEEP AS-IS]` | 2 | Worker lease contention, SignalR reconnect/circuit-breaker, & scheduled job execution |
| 162 | `packages/ai/src/notifications/noise-control.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 15 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 163 | `packages/ai/test/alert-decide.test.ts` | `../src/alerts/evaluator` | `[KEEP AS-IS]` | 6 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 164 | `packages/ai/test/alert-simulate.test.ts` | `../src/alerts/simulate` | `[KEEP AS-IS]` | 8 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 165 | `packages/ai/test/alert-snooze.test.ts` | `../src/alerts/persistence` | `[KEEP AS-IS]` | 9 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 166 | `packages/ai/test/alerts-delivery.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 9 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 167 | `packages/ai/test/alerts-evaluator-parallel.test.ts` | `@kestrel/data` | `[KEEP AS-IS]` | 2 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 168 | `packages/ai/test/analyze-fundamental.test.ts` | `../src/tools/analyze-fundamental` | `[KEEP AS-IS]` | 12 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 169 | `packages/ai/test/analyze-technical.test.ts` | `../src/tools/analyze-technical` | `[KEEP AS-IS]` | 8 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 170 | `packages/ai/test/baseline-cost-fixtures.test.ts` | `../src/cost` | `[KEEP AS-IS]` | 10 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 171 | `packages/ai/test/baseline-route-matrix.test.ts` | `../src/mastra` | `[KEEP AS-IS]` | 3 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 172 | `packages/ai/test/baseline-terminal-invariants.test.ts` | `../src/budget` | `[KEEP AS-IS]` | 7 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 173 | `packages/ai/test/briefings-generate.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 17 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 174 | `packages/ai/test/budget-race.test.ts` | `../src/cost` | `[KEEP AS-IS]` | 5 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 175 | `packages/ai/test/budget-reservation.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 15 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 176 | `packages/ai/test/by-domain.test.ts` | `../src/tools/by-domain` | `[KEEP AS-IS]` | 12 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 177 | `packages/ai/test/byok-embeddings.test.ts` | `../src/byok-providers` | `[KEEP AS-IS]` | 7 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 178 | `packages/ai/test/byok-providers.test.ts` | `@kestrel/shared/byok` | `[KEEP AS-IS]` | 19 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 179 | `packages/ai/test/canonical-chat-memory-fallback.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 3 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 180 | `packages/ai/test/canonical-evidence.test.ts` | `../src/mastra` | `[KEEP AS-IS]` | 11 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 181 | `packages/ai/test/chat-model.test.ts` | `../src/model` | `[KEEP AS-IS]` | 17 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 182 | `packages/ai/test/coach-insights.test.ts` | `@kestrel/db/schema` | `[KEEP AS-IS]` | 1 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 183 | `packages/ai/test/committee-critique.test.ts` | `../src/committee/prompts` | `[KEEP AS-IS]` | 5 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 184 | `packages/ai/test/committee-debate.test.ts` | `../src/committee/critique` | `[KEEP AS-IS]` | 7 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 185 | `packages/ai/test/committee-fusion-verifier.test.ts` | `../src/committee/fusion-verifier` | `[KEEP AS-IS]` | 14 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 186 | `packages/ai/test/committee-model-diversity.test.ts` | `../src/committee/workflow` | `[KEEP AS-IS]` | 4 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 187 | `packages/ai/test/committee-packet-serialization.test.ts` | `../src/committee/prompts` | `[KEEP AS-IS]` | 3 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 188 | `packages/ai/test/committee-progress-snapshot.test.ts` | `../src/mastra-v2/shared/progress` | `[KEEP AS-IS]` | 3 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 189 | `packages/ai/test/committee-structured-fusion.test.ts` | `../src/committee/synthesizer` | `[KEEP AS-IS]` | 2 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 190 | `packages/ai/test/committee.test.ts` | `../src/committee/specialist-runner` | `[KEEP AS-IS]` | 7 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 191 | `packages/ai/test/compose-journal-text.test.ts` | `../src/memory/memory-index` | `[KEEP AS-IS]` | 8 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 192 | `packages/ai/test/compute-position-health.test.ts` | `../src/tool-context` | `[KEEP AS-IS]` | 10 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 193 | `packages/ai/test/compute-risk.test.ts` | `../src/tools/compute-risk` | `[KEEP AS-IS]` | 8 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 194 | `packages/ai/test/confidence.test.ts` | `../src/mastra` | `[KEEP AS-IS]` | 2 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 195 | `packages/ai/test/context.test.ts` | `E2E / full-stack route` | `[KEEP AS-IS]` | 8 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 196 | `packages/ai/test/contract-tool-outputs.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 22 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 197 | `packages/ai/test/cross-detection.test.ts` | `../src/alerts/evaluator` | `[KEEP AS-IS]` | 8 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 198 | `packages/ai/test/diagnostics.test.ts` | `../src/diagnostics/run-context` | `[KEEP AS-IS]` | 29 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 199 | `packages/ai/test/diagnostics/trace-persistence.test.ts` | `../../src/diagnostics/trace-persistence` | `[KEEP AS-IS]` | 7 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 200 | `packages/ai/test/embeddings.test.ts` | `../src/embeddings` | `[KEEP AS-IS]` | 12 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 201 | `packages/ai/test/env-fallback-keys.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 5 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 202 | `packages/ai/test/eval-annotation-resolver.test.ts` | `../src/eval/annotation-resolver` | `[KEEP AS-IS]` | 9 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 203 | `packages/ai/test/eval-baseline.test.ts` | `../src/eval/baseline` | `[KEEP AS-IS]` | 7 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 204 | `packages/ai/test/eval-drift.test.ts` | `../src/eval/drift` | `[KEEP AS-IS]` | 3 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 205 | `packages/ai/test/eval-metrics.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 3 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 206 | `packages/ai/test/eval-offline.test.ts` | `../src/eval/runner` | `[KEEP AS-IS]` | 10 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 207 | `packages/ai/test/eval-quality-gate.test.ts` | `../src/eval/quality-gate` | `[KEEP AS-IS]` | 5 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 208 | `packages/ai/test/eval-regression-catalog.test.ts` | `E2E / full-stack route` | `[KEEP AS-IS]` | 2 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 209 | `packages/ai/test/eval-training-export.test.ts` | `../src/eval/runner` | `[KEEP AS-IS]` | 8 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 210 | `packages/ai/test/execution-lifecycle.test.ts` | `../src/budget` | `[KEEP AS-IS]` | 5 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 211 | `packages/ai/test/external-content.test.ts` | `../src/mastra-v2/packets/evidence-types` | `[KEEP AS-IS]` | 9 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 212 | `packages/ai/test/fork-thread.test.ts` | `../src/persistence` | `[KEEP AS-IS]` | 8 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 213 | `packages/ai/test/full-analysis-properties.test.ts` | `../src/budget` | `[KEEP AS-IS]` | 15 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 214 | `packages/ai/test/fundamental-currencies.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 2 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 215 | `packages/ai/test/generation-ledger.test.ts` | `../src/generation-ledger` | `[KEEP AS-IS]` | 3 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 216 | `packages/ai/test/get-calendar.test.ts` | `../src/tools/get-calendar` | `[KEEP AS-IS]` | 8 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 217 | `packages/ai/test/get-candles.test.ts` | `../src/tools/get-candles` | `[KEEP AS-IS]` | 11 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 218 | `packages/ai/test/get-macro-resonance.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 2 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 219 | `packages/ai/test/get-market-structure.test.ts` | `../src/tools/get-market-structure` | `[KEEP AS-IS]` | 8 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 220 | `packages/ai/test/get-news.test.ts` | `../src/tools/get-news` | `[KEEP AS-IS]` | 6 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 221 | `packages/ai/test/get-price.test.ts` | `../src/tools/get-price` | `[KEEP AS-IS]` | 9 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 222 | `packages/ai/test/get-system-diagnostics.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 1 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 223 | `packages/ai/test/helpers/scripted-llm.test.ts` | `./scripted-llm` | `[KEEP AS-IS]` | 3 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 224 | `packages/ai/test/journal-stats.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 18 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 225 | `packages/ai/test/langfuse-publisher.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 13 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 226 | `packages/ai/test/last-closed-bar.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 7 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 227 | `packages/ai/test/llm-throttle.test.ts` | `../src/llm-throttle` | `[KEEP AS-IS]` | 7 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 228 | `packages/ai/test/mastra-background-text.test.ts` | `../src/mastra-v2/agents/xauusd/background-text` | `[KEEP AS-IS]` | 3 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 229 | `packages/ai/test/mastra-capabilities.test.ts` | `../src/mastra` | `[KEEP AS-IS]` | 14 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 230 | `packages/ai/test/mastra-context-tools.test.ts` | `../src/mastra-v2/agents/xauusd/tools` | `[KEEP AS-IS]` | 4 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 231 | `packages/ai/test/mastra-evals-datasets.test.ts` | `../src/mastra-v2` | `[KEEP AS-IS]` | 4 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 232 | `packages/ai/test/mastra-evals.test.ts` | `../src/eval/citation-oracle` | `[KEEP AS-IS]` | 16 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 233 | `packages/ai/test/mastra-execution-decision.test.ts` | `../src/mastra` | `[KEEP AS-IS]` | 6 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 234 | `packages/ai/test/mastra-execution-plan.test.ts` | `../src/mastra` | `[KEEP AS-IS]` | 4 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 235 | `packages/ai/test/mastra-followup-safety.test.ts` | `../src/mastra-v2/agents/xauusd/followup-safety` | `[KEEP AS-IS]` | 8 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 236 | `packages/ai/test/mastra-fundamental-context.test.ts` | `../src/mastra-v2/agents/xauusd/tools` | `[KEEP AS-IS]` | 5 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 237 | `packages/ai/test/mastra-guardrails.test.ts` | `../src/mastra-v2/capabilities` | `[KEEP AS-IS]` | 10 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 238 | `packages/ai/test/mastra-market-tools.test.ts` | `../src/mastra-v2/agents/xauusd/tools` | `[KEEP AS-IS]` | 4 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 239 | `packages/ai/test/mastra-model-context.test.ts` | `../src/mastra-v2/agents/xauusd/model-context` | `[KEEP AS-IS]` | 2 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 240 | `packages/ai/test/mastra-modes.test.ts` | `../src/mastra-v2/packets/symbol-research` | `[KEEP AS-IS]` | 5 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 241 | `packages/ai/test/mastra-mutation-entry.test.ts` | `@kestrel/ai/mastra` | `[KEEP AS-IS]` | 10 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 242 | `packages/ai/test/mastra-mutation-policy.test.ts` | `../src/mastra` | `[KEEP AS-IS]` | 5 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 243 | `packages/ai/test/mastra-mutation.test.ts` | `../src/mastra-v2` | `[KEEP AS-IS]` | 13 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 244 | `packages/ai/test/mastra-news-calendar.test.ts` | `../src/mastra-v2/agents/xauusd/tools` | `[KEEP AS-IS]` | 5 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 245 | `packages/ai/test/mastra-observability.test.ts` | `../src/mastra-v2` | `[KEEP AS-IS]` | 14 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 246 | `packages/ai/test/mastra-p2-contracts.test.ts` | `../src/mastra` | `[KEEP AS-IS]` | 2 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 247 | `packages/ai/test/mastra-poc.test.ts` | `../src/mastra` | `[KEEP AS-IS]` | 5 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 248 | `packages/ai/test/mastra-report-evaluation.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 3 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 249 | `packages/ai/test/mastra-report-repair.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 5 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 250 | `packages/ai/test/mastra-report-verifier.test.ts` | `../src/mastra-v2/agents/xauusd/report/report-verifier` | `[KEEP AS-IS]` | 20 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 251 | `packages/ai/test/mastra-research-packet-macro.test.ts` | `../src/mastra-v2/packets/research-packet-macro` | `[KEEP AS-IS]` | 6 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 252 | `packages/ai/test/mastra-research-packet.test.ts` | `@kestrel/indicators` | `[KEEP AS-IS]` | 10 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 253 | `packages/ai/test/mastra-router.test.ts` | `../src/mastra-v2/planning/router` | `[KEEP AS-IS]` | 10 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 254 | `packages/ai/test/mastra-routing-policy.test.ts` | `../src/mastra-v2/planning/routing-policy` | `[KEEP AS-IS]` | 18 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 255 | `packages/ai/test/mastra-run.test.ts` | `../src/mastra-v2/agents/xauusd/report/report-generation` | `[KEEP AS-IS]` | 12 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 256 | `packages/ai/test/mastra-social-sentiment.test.ts` | `../src/mastra-v2/agents/xauusd/tools` | `[KEEP AS-IS]` | 4 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 257 | `packages/ai/test/mastra-specialist-tools.test.ts` | `../src/mastra-v2/agents/xauusd/legacy-tool-adapter` | `[KEEP AS-IS]` | 3 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 258 | `packages/ai/test/mastra-symbol-research.test.ts` | `../src/mastra-v2/packets/symbol-research` | `[KEEP AS-IS]` | 3 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 259 | `packages/ai/test/mastra-telemetry.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 11 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 260 | `packages/ai/test/mastra-title.test.ts` | `@kestrel/ai/mastra` | `[KEEP AS-IS]` | 7 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 261 | `packages/ai/test/mastra-tools.test.ts` | `../src/mastra-v2/agents/xauusd/tools` | `[KEEP AS-IS]` | 1 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 262 | `packages/ai/test/mastra-v2-context-reconcile.test.ts` | `../src/mastra-v2/context` | `[KEEP AS-IS]` | 1 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 263 | `packages/ai/test/mastra-v2-context.test.ts` | `../src/mastra-v2` | `[KEEP AS-IS]` | 12 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 264 | `packages/ai/test/mastra-v2-full-analysis.test.ts` | `../src/mastra-v2` | `[KEEP AS-IS]` | 12 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 265 | `packages/ai/test/mastra-v2-instance.test.ts` | `../src/mastra-v2` | `[KEEP AS-IS]` | 7 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 266 | `packages/ai/test/mastra-v2-logger.test.ts` | `../src/mastra-v2` | `[KEEP AS-IS]` | 4 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 267 | `packages/ai/test/mastra-v2-memory.test.ts` | `../src/mastra-v2` | `[KEEP AS-IS]` | 17 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 268 | `packages/ai/test/mastra-v2-observational-memory.test.ts` | `../src/mastra-v2/memory` | `[KEEP AS-IS]` | 6 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 269 | `packages/ai/test/mastra-v2-registry.test.ts` | `../src/mastra` | `[KEEP AS-IS]` | 6 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 270 | `packages/ai/test/mastra-v2-storage-prune.test.ts` | `E2E / full-stack route` | `[KEEP AS-IS]` | 5 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 271 | `packages/ai/test/mastra-v2-storage.test.ts` | `../src/mastra-v2` | `[KEEP AS-IS]` | 10 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 272 | `packages/ai/test/mastra-v2-workflows.test.ts` | `../src/committee/workflow` | `[KEEP AS-IS]` | 13 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 273 | `packages/ai/test/mastra-v2-xauusd-workflow.test.ts` | `../src/mastra-v2` | `[KEEP AS-IS]` | 5 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 274 | `packages/ai/test/memory-index.test.ts` | `../src/memory/memory-index` | `[KEEP AS-IS]` | 2 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 275 | `packages/ai/test/model-circuit-breaker.test.ts` | `../src/mastra-v2/shared/run-telemetry` | `[KEEP AS-IS]` | 13 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 276 | `packages/ai/test/model-resolution.test.ts` | `../src/model-resolution` | `[KEEP AS-IS]` | 3 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 277 | `packages/ai/test/mutation-tools.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 10 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 278 | `packages/ai/test/opinion-verifier.test.ts` | `../src/committee/specialists` | `[KEEP AS-IS]` | 7 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 279 | `packages/ai/test/packet-cache.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 14 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 280 | `packages/ai/test/pem-normalize.test.ts` | `../src/util/pem` | `[KEEP AS-IS]` | 10 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 281 | `packages/ai/test/persistence-outbox.test.ts` | `../src/persistence-outbox` | `[KEEP AS-IS]` | 4 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 282 | `packages/ai/test/persistence-recovery.test.ts` | `../src/persistence-recovery` | `[KEEP AS-IS]` | 7 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 283 | `packages/ai/test/phase2-concurrency.test.ts` | `../src/alerts/persistence` | `[KEEP AS-IS]` | 3 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 284 | `packages/ai/test/push-persistence.test.ts` | `../src/push/persistence` | `[KEEP AS-IS]` | 2 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 285 | `packages/ai/test/rag.test.ts` | `../src/memory/memory-index` | `[KEEP AS-IS]` | 17 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 286 | `packages/ai/test/replay-setup.test.ts` | `@kestrel/data` | `[KEEP AS-IS]` | 3 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 287 | `packages/ai/test/research-context.test.ts` | `../src/mastra-v2/research-context` | `[KEEP AS-IS]` | 8 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 288 | `packages/ai/test/risk-sizing.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 4 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 289 | `packages/ai/test/routing-semantic-config.test.ts` | `../src/routing` | `[KEEP AS-IS]` | 4 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 290 | `packages/ai/test/routing.test.ts` | `../src/routing` | `[KEEP AS-IS]` | 7 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 291 | `packages/ai/test/run-system-action.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 3 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 292 | `packages/ai/test/semantic-routing.test.ts` | `../src/mastra-v2/agents/xauusd/text-runner` | `[KEEP AS-IS]` | 9 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 293 | `packages/ai/test/session-levels.test.ts` | `@kestrel/data` | `[KEEP AS-IS]` | 3 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 294 | `packages/ai/test/snapshots-compute.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 9 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 295 | `packages/ai/test/symbol-research-grounding.test.ts` | `../src/mastra-v2/agents/canonical/evidence` | `[KEEP AS-IS]` | 2 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 296 | `packages/ai/test/telegram.test.ts` | `../src/bot` | `[KEEP AS-IS]` | 17 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 297 | `packages/ai/test/telemetry-persistence.test.ts` | `../src/diagnostics/run-context` | `[KEEP AS-IS]` | 2 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 298 | `packages/ai/test/telemetry-startup.test.ts` | `../src/mastra-v2/shared/telemetry-startup` | `[KEEP AS-IS]` | 2 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 299 | `packages/ai/test/telemetry.test.ts` | `../src/diagnostics/run-context` | `[KEEP AS-IS]` | 3 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 300 | `packages/ai/test/thread-delete-cascade.test.ts` | `../src/persistence/thread-persistence` | `[KEEP AS-IS]` | 5 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 301 | `packages/ai/test/tool-context.test.ts` | `../src/tool-context` | `[KEEP AS-IS]` | 6 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 302 | `packages/ai/test/tool-filtering.test.ts` | `../src/committee/specialists` | `[KEEP AS-IS]` | 5 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 303 | `packages/ai/test/tool-token-caps.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 3 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 304 | `packages/ai/test/verify-call.test.ts` | `../src/tools/verify-call` | `[KEEP AS-IS]` | 15 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 305 | `packages/ai/test/wait-until.test.ts` | `E2E / full-stack route` | `[KEEP AS-IS]` | 5 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 306 | `packages/ai/test/web-search-ssrf.test.ts` | `../src/tools/web-search` | `[KEEP AS-IS]` | 3 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 307 | `packages/ai/test/web-search.test.ts` | `../src/tool-context` | `[KEEP AS-IS]` | 7 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 308 | `packages/ai/test/with-telemetry.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 13 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 309 | `packages/ai/test/workflow-status.test.ts` | `../src/workflow-status` | `[KEEP AS-IS]` | 2 | Mastra v2 workflow/agent, numeric grounding verifier, budget ledger, & tool execution |
| 310 | `packages/data/test/binance-backoff.test.ts` | `../src/cache/throttle` | `[KEEP AS-IS]` | 3 | Market data provider normalization, fallback chain, L1/L2 cache, & singleflight concurrency |
| 311 | `packages/data/test/binance-map.test.ts` | `../src/providers/binance/map` | `[KEEP AS-IS]` | 4 | Market data provider normalization, fallback chain, L1/L2 cache, & singleflight concurrency |
| 312 | `packages/data/test/biquote-rest.test.ts` | `../src/cache/throttle` | `[KEEP AS-IS]` | 18 | Market data provider normalization, fallback chain, L1/L2 cache, & singleflight concurrency |
| 313 | `packages/data/test/cache-index.test.ts` | `../src/cache/index` | `[KEEP AS-IS]` | 9 | Market data provider normalization, fallback chain, L1/L2 cache, & singleflight concurrency |
| 314 | `packages/data/test/cache-memory.test.ts` | `../src/cache/memory` | `[KEEP AS-IS]` | 6 | Market data provider normalization, fallback chain, L1/L2 cache, & singleflight concurrency |
| 315 | `packages/data/test/cache-redis.test.ts` | `../src/cache/redis` | `[KEEP AS-IS]` | 5 | Market data provider normalization, fallback chain, L1/L2 cache, & singleflight concurrency |
| 316 | `packages/data/test/cache-swr-inflight.test.ts` | `../src/cache/memory` | `[KEEP AS-IS]` | 4 | Market data provider normalization, fallback chain, L1/L2 cache, & singleflight concurrency |
| 317 | `packages/data/test/calendar-adapter.test.ts` | `../src/adapters/calendar` | `[KEEP AS-IS]` | 3 | Market data provider normalization, fallback chain, L1/L2 cache, & singleflight concurrency |
| 318 | `packages/data/test/candles-1m-provider.test.ts` | `../src/errors` | `[KEEP AS-IS]` | 6 | Market data provider normalization, fallback chain, L1/L2 cache, & singleflight concurrency |
| 319 | `packages/data/test/chaos-failover.test.ts` | `../src/errors` | `[KEEP AS-IS]` | 8 | Market data provider normalization, fallback chain, L1/L2 cache, & singleflight concurrency |
| 320 | `packages/data/test/closed-candles.test.ts` | `../src/providers/binance/rest` | `[KEEP AS-IS]` | 2 | Market data provider normalization, fallback chain, L1/L2 cache, & singleflight concurrency |
| 321 | `packages/data/test/failover-abort.test.ts` | `../src/errors` | `[KEEP AS-IS]` | 2 | Market data provider normalization, fallback chain, L1/L2 cache, & singleflight concurrency |
| 322 | `packages/data/test/failover-pinned.test.ts` | `../src/errors` | `[KEEP AS-IS]` | 6 | Market data provider normalization, fallback chain, L1/L2 cache, & singleflight concurrency |
| 323 | `packages/data/test/failover.test.ts` | `../src/errors` | `[KEEP AS-IS]` | 6 | Market data provider normalization, fallback chain, L1/L2 cache, & singleflight concurrency |
| 324 | `packages/data/test/finnhub-candles-map.test.ts` | `../src/providers/finnhub/map` | `[KEEP AS-IS]` | 6 | Market data provider normalization, fallback chain, L1/L2 cache, & singleflight concurrency |
| 325 | `packages/data/test/live-ticks-provider.test.ts` | `../src/errors` | `[KEEP AS-IS]` | 4 | Market data provider normalization, fallback chain, L1/L2 cache, & singleflight concurrency |
| 326 | `packages/data/test/marketaux-map.test.ts` | `../src/providers/marketaux/map` | `[KEEP AS-IS]` | 9 | Market data provider normalization, fallback chain, L1/L2 cache, & singleflight concurrency |
| 327 | `packages/data/test/news-adapter.test.ts` | `../src/adapters/news` | `[KEEP AS-IS]` | 5 | Market data provider normalization, fallback chain, L1/L2 cache, & singleflight concurrency |
| 328 | `packages/data/test/offline-provider.test.ts` | `../src/providers/offline` | `[KEEP AS-IS]` | 2 | Market data provider normalization, fallback chain, L1/L2 cache, & singleflight concurrency |
| 329 | `packages/data/test/price-adapter.test.ts` | `../src/adapters/price` | `[KEEP AS-IS]` | 9 | Market data provider normalization, fallback chain, L1/L2 cache, & singleflight concurrency |
| 330 | `packages/data/test/price-timestamp.test.ts` | `../src/adapters/price` | `[KEEP AS-IS]` | 1 | Market data provider normalization, fallback chain, L1/L2 cache, & singleflight concurrency |
| 331 | `packages/data/test/storage.test.ts` | `../src/adapters/storage` | `[KEEP AS-IS]` | 5 | Market data provider normalization, fallback chain, L1/L2 cache, & singleflight concurrency |
| 332 | `packages/data/test/throttle-postgres.test.ts` | `@kestrel/db` | `[KEEP AS-IS]` | 3 | Market data provider normalization, fallback chain, L1/L2 cache, & singleflight concurrency |
| 333 | `packages/data/test/throttle.test.ts` | `../src/cache/throttle` | `[KEEP AS-IS]` | 14 | Market data provider normalization, fallback chain, L1/L2 cache, & singleflight concurrency |
| 334 | `packages/data/test/to-candle.test.ts` | `../src/providers/to-candle` | `[KEEP AS-IS]` | 5 | Market data provider normalization, fallback chain, L1/L2 cache, & singleflight concurrency |
| 335 | `packages/db/test/ai-feedback.test.ts` | `../src/client` | `[KEEP AS-IS]` | 2 | Real Drizzle SQL / migration / RLS policy & query-cancellation verification |
| 336 | `packages/db/test/ai-shadow-comparisons.test.ts` | `../src/queries/ai-shadow-comparisons` | `[KEEP AS-IS]` | 2 | Real Drizzle SQL / migration / RLS policy & query-cancellation verification |
| 337 | `packages/db/test/migration-hash-stability.test.ts` | `../src/migration-plan` | `[KEEP AS-IS]` | 4 | Real Drizzle SQL / migration / RLS policy & query-cancellation verification |
| 338 | `packages/db/test/migration-plan.test.ts` | `../src/migration-plan` | `[KEEP AS-IS]` | 2 | Real Drizzle SQL / migration / RLS policy & query-cancellation verification |
| 339 | `packages/db/test/postgres-rls-isolation.test.ts` | `E2E / full-stack route` | `[KEEP AS-IS]` | 1 | Real Drizzle SQL / migration / RLS policy & query-cancellation verification |
| 340 | `packages/db/test/query-cancellation.test.ts` | `../src/query-cancellation` | `[KEEP AS-IS]` | 3 | Real Drizzle SQL / migration / RLS policy & query-cancellation verification |
| 341 | `packages/db/test/retention.test.ts` | `../src/retention` | `[KEEP AS-IS]` | 6 | Real Drizzle SQL / migration / RLS policy & query-cancellation verification |
| 342 | `packages/db/test/tracing.test.ts` | `../src/tracing` | `[KEEP AS-IS]` | 4 | Real Drizzle SQL / migration / RLS policy & query-cancellation verification |
| 343 | `packages/indicators/test/asian-range.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 8 | Hand-computed numerical OHLCV & indicator math + edge-case boundaries |
| 344 | `packages/indicators/test/atr.test.ts` | `../src/atr` | `[KEEP AS-IS]` | 3 | Hand-computed numerical OHLCV & indicator math + edge-case boundaries |
| 345 | `packages/indicators/test/bollinger.test.ts` | `../src/bollinger` | `[KEEP AS-IS]` | 4 | Hand-computed numerical OHLCV & indicator math + edge-case boundaries |
| 346 | `packages/indicators/test/macd.test.ts` | `../src/macd` | `[KEEP AS-IS]` | 3 | Hand-computed numerical OHLCV & indicator math + edge-case boundaries |
| 347 | `packages/indicators/test/moving-averages.test.ts` | `../src/moving-averages` | `[KEEP AS-IS]` | 7 | Hand-computed numerical OHLCV & indicator math + edge-case boundaries |
| 348 | `packages/indicators/test/pdh-pdl.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 5 | Hand-computed numerical OHLCV & indicator math + edge-case boundaries |
| 349 | `packages/indicators/test/pivots.test.ts` | `../src/pivots` | `[KEEP AS-IS]` | 3 | Hand-computed numerical OHLCV & indicator math + edge-case boundaries |
| 350 | `packages/indicators/test/property.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 24 | Hand-computed numerical OHLCV & indicator math + edge-case boundaries |
| 351 | `packages/indicators/test/registry.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 8 | Hand-computed numerical OHLCV & indicator math + edge-case boundaries |
| 352 | `packages/indicators/test/rsi.test.ts` | `../src/rsi` | `[KEEP AS-IS]` | 5 | Hand-computed numerical OHLCV & indicator math + edge-case boundaries |
| 353 | `packages/indicators/test/smc-fvg.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 6 | Hand-computed numerical OHLCV & indicator math + edge-case boundaries |
| 354 | `packages/indicators/test/smc-liquidity.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 4 | Hand-computed numerical OHLCV & indicator math + edge-case boundaries |
| 355 | `packages/indicators/test/smc-order-blocks.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 4 | Hand-computed numerical OHLCV & indicator math + edge-case boundaries |
| 356 | `packages/indicators/test/smc-structure.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 4 | Hand-computed numerical OHLCV & indicator math + edge-case boundaries |
| 357 | `packages/indicators/test/smc-swings.test.ts` | `@kestrel/shared` | `[KEEP AS-IS]` | 6 | Hand-computed numerical OHLCV & indicator math + edge-case boundaries |
| 358 | `packages/shared/test/ai-preferences.test.ts` | `../src` | `[KEEP AS-IS]` | 3 | Real AES-256-GCM crypto, Vault envelope, DI container, logger, & Zod schema invariants |
| 359 | `packages/shared/test/billing-features.test.ts` | `../src/billing/features` | `[KEEP AS-IS]` | 14 | Real AES-256-GCM crypto, Vault envelope, DI container, logger, & Zod schema invariants |
| 360 | `packages/shared/test/biquote.test.ts` | `../src` | `[KEEP AS-IS]` | 25 | Real AES-256-GCM crypto, Vault envelope, DI container, logger, & Zod schema invariants |
| 361 | `packages/shared/test/bug-report.test.ts` | `../src` | `[KEEP AS-IS]` | 13 | Real AES-256-GCM crypto, Vault envelope, DI container, logger, & Zod schema invariants |
| 362 | `packages/shared/test/capabilities.test.ts` | `../src/capabilities` | `[KEEP AS-IS]` | 2 | Real AES-256-GCM crypto, Vault envelope, DI container, logger, & Zod schema invariants |
| 363 | `packages/shared/test/chat-stream.test.ts` | `../src/schemas/chat-stream` | `[KEEP AS-IS]` | 5 | Real AES-256-GCM crypto, Vault envelope, DI container, logger, & Zod schema invariants |
| 364 | `packages/shared/test/encryption.test.ts` | `../src/encryption` | `[KEEP AS-IS]` | 29 | Real AES-256-GCM crypto, Vault envelope, DI container, logger, & Zod schema invariants |
| 365 | `packages/shared/test/env.test.ts` | `../src/env` | `[KEEP AS-IS]` | 52 | Real AES-256-GCM crypto, Vault envelope, DI container, logger, & Zod schema invariants |
| 366 | `packages/shared/test/logger.test.ts` | `../src/logger` | `[KEEP AS-IS]` | 21 | Real AES-256-GCM crypto, Vault envelope, DI container, logger, & Zod schema invariants |
| 367 | `packages/shared/test/market-phase.test.ts` | `../src/market-phase` | `[KEEP AS-IS]` | 36 | Real AES-256-GCM crypto, Vault envelope, DI container, logger, & Zod schema invariants |
| 368 | `packages/shared/test/metrics-export.test.ts` | `../src/metrics` | `[KEEP AS-IS]` | 20 | Real AES-256-GCM crypto, Vault envelope, DI container, logger, & Zod schema invariants |
| 369 | `packages/shared/test/metrics.test.ts` | `../src/metrics` | `[KEEP AS-IS]` | 7 | Real AES-256-GCM crypto, Vault envelope, DI container, logger, & Zod schema invariants |
| 370 | `packages/shared/test/observability.test.ts` | `../src/observability` | `[KEEP AS-IS]` | 6 | Real AES-256-GCM crypto, Vault envelope, DI container, logger, & Zod schema invariants |
| 371 | `packages/shared/test/portfolio-sizing.test.ts` | `../src` | `[KEEP AS-IS]` | 2 | Real AES-256-GCM crypto, Vault envelope, DI container, logger, & Zod schema invariants |
| 372 | `packages/shared/test/prompt-symbol-extractor.test.ts` | `../src` | `[KEEP AS-IS]` | 4 | Real AES-256-GCM crypto, Vault envelope, DI container, logger, & Zod schema invariants |
| 373 | `packages/shared/test/safe-url.test.ts` | `../src/safe-url` | `[KEEP AS-IS]` | 4 | Real AES-256-GCM crypto, Vault envelope, DI container, logger, & Zod schema invariants |
| 374 | `packages/shared/test/tool-io.test.ts` | `../src/ai/tool-io` | `[KEEP AS-IS]` | 16 | Real AES-256-GCM crypto, Vault envelope, DI container, logger, & Zod schema invariants |
| 375 | `packages/shared/test/url-safety.test.ts` | `../src/url-safety` | `[KEEP AS-IS]` | 3 | Real AES-256-GCM crypto, Vault envelope, DI container, logger, & Zod schema invariants |

## Section 4: Orphaned Test Helpers & Dead Mocks to Purge

**Status: ✅ COMPLETE (2026-10-17).** The 4.1 purge list was executed once Batches 2–4 landed: all 8 dead files deleted (`factories/users.ts`, `factories/threads.ts`, `mocks/db.ts`, `mocks/fetch.ts`, `mocks/llm.ts`, `mocks/server-only.ts`, `helpers/vitest.ts`, `helpers/vitest-base.ts`), `packages/test-utils/src/index.ts` reduced to the single `export { makeCandles, type MakeCandlesOpts } from './factories/candles';` line, and the now-dangling `./mocks/*` + `./helpers/*` subpath export patterns removed from `packages/test-utils/package.json` (knip flagged them as missing entry files; hints returned to the baseline 9). Post-purge gates: `pnpm --filter @kestrel/test-utils test` ✅ 10 tests · `pnpm test:empty-guard` ✅ (test-utils retains `candles.test.ts`) · typecheck/lint ✅ for the workspace · `pnpm --filter @kestrel/test-utils build` ✅ · `pnpm knip --no-progress` ✅ exit 0. `rg` had re-confirmed **zero** code importers of `@kestrel/test-utils` outside the package itself (only the root `package.json` `build:packages` filter remains, as predicted).

Once Batches 1–4 are executed, the following mock factories, helper files, barrel exports, and local test helpers are 100% unused across the entire monorepo. Purge or update them as specified below so `pnpm knip --no-progress`, `pnpm typecheck`, and `pnpm test:empty-guard` pass cleanly:

### 4.1 Dead Mock & Factory Files in `packages/test-utils`

Across all 8 workspaces in the monorepo, **zero** files outside `packages/test-utils` import `@kestrel/test-utils` once `packages/db/test/isolated-db.test.ts` is deleted in Batch 1. However, because `packages/test-utils/package.json` defines `"test": "vitest run"` and `scripts/check-test-files.mjs` (`pnpm test:empty-guard`) requires every workspace with a `"test"` script to retain at least one `.test.ts` file, you must keep `packages/test-utils/src/factories/candles.ts` and `packages/test-utils/src/factories/candles.test.ts` while purging the 8 dead files below:

| Orphaned File Path | Dead Exports | Action for Executing Agent |
| :--- | :--- | :--- |
| `packages/test-utils/src/factories/users.ts` | `makeUser`, `makeSession`, `resetUserCounter`, `MockUser` | **Delete file** (`rm packages/test-utils/src/factories/users.ts`) |
| `packages/test-utils/src/factories/threads.ts` | `makeThread`, `makeMessage`, `resetThreadCounter`, `MockThread`, `MockMessage` | **Delete file** (`rm packages/test-utils/src/factories/threads.ts`) |
| `packages/test-utils/src/mocks/db.ts` | `createTestDb`, `TestDbHandle` | **Delete file** (`rm packages/test-utils/src/mocks/db.ts`) |
| `packages/test-utils/src/mocks/fetch.ts` | `createMockFetch`, `MockFetchHandler` | **Delete file** (`rm packages/test-utils/src/mocks/fetch.ts`) |
| `packages/test-utils/src/mocks/llm.ts` | `createMockLlm`, `MockLlmResponse` | **Delete file** (`rm packages/test-utils/src/mocks/llm.ts`) |
| `packages/test-utils/src/mocks/server-only.ts` | Empty module stub (only referenced by `vitest-base.ts`) | **Delete file** (`rm packages/test-utils/src/mocks/server-only.ts`) |
| `packages/test-utils/src/helpers/vitest.ts` | `installServerOnlyStub`, `setupTestEnvironment`, `teardownTestEnvironment`, `freezeTime`, `advanceTime`, `useFakeTimers`, `useRealTimers` | **Delete file** (`rm packages/test-utils/src/helpers/vitest.ts`) |
| `packages/test-utils/src/helpers/vitest-base.ts` | `createProjectConfig` | **Delete file** (`rm packages/test-utils/src/helpers/vitest-base.ts`) |
| `packages/test-utils/src/index.ts` | Re-exports of all deleted files above | **Update `packages/test-utils/src/index.ts`** so it only exports `export { makeCandles, type MakeCandlesOpts } from './factories/candles';` |

### 4.2 Orphaned In-File Test Helpers & Dead Mock Harnesses Eliminated by Batches 1–4

| File Path | Orphaned Helper / Dead Mock | Disposition |
| :--- | :--- | :--- |
| `apps/web/test/runtime-migrate-policy.test.ts` (lines 9–17) | `function extractEnabledTables(sql: string): string[]` (never called even within its own file) | Purged when `apps/web/test/runtime-migrate-policy.test.ts` is deleted in Batch 1 |
| `packages/db/test/rate-limit.test.ts` (lines 22–27) & `packages/db/test/index.test.ts` (lines 102–109) | Duplicate local `function extractCount(rows: unknown): number` | Purged when `rate-limit.test.ts` is deleted (Batch 1) and `index.test.ts` is pruned (Batch 2) |
| `packages/ai/test/chaos-retry.test.ts` (lines 180–231) | Local 50-line `function createCircuitBreaker(opts)` | Purged when `chaos-retry.test.ts` is deleted in Batch 1 |
| `packages/ai/test/usage.test.ts` (lines 35–57) | Local `function reduce(rows: Row[], now: Date)` | Purged when `usage.test.ts` is rewritten against real `computeUsage` in Batch 4 |
| `packages/ai/test/provider-id-from-model.test.ts` (lines 42–55) | Local `function canonicalize(prefix: string)` | Purged when `provider-id-from-model.test.ts` is pruned in Batch 2 |
| `apps/worker/test/scheduler-behavior.test.ts` (lines 26–44) | Local `_runningJobs` set and `function runWithGuard(...)` | Purged when `scheduler-behavior.test.ts` is deleted in Batch 1 |
| `apps/web/src/__tests__/ux/responsive-scenarios-and-motion.test.tsx` (lines 25–43) | Local `<MobileChipRail />` React component | Purged when `responsive-scenarios-and-motion.test.tsx` is deleted in Batch 1 |
| `apps/web/src/__tests__/ux/route-safety-and-telemetry.test.tsx` (lines 49–88, 143) | Local `DEFAULT_SYMBOL`, `resolveChartRoute`, `sanitizeSymbol`, `isTelemetrySuppressed` | Purged when `route-safety-and-telemetry.test.tsx` is pruned in Batch 2 |
| `apps/web/test/admin-ai-eval.test.tsx` (lines 21–36) | Local regexes `XAUUSD_TERMS`, `OTHER_SYMBOL_TERMS`, `MUTATING_TERMS`, `INJECTION_TERMS` and `isMastraEligible` | Purged when replaced with real `@kestrel/ai/mastra` imports in Batch 4 |

### 4.3 Active Shared Test Helpers That Must Be Preserved (`DO NOT DELETE`)

Do **not** delete any of the following active test setup or helper files — they are required by Vitest/Playwright configs or high-signal tests:
- `packages/ai/test/__mocks__/server-only.ts` (aliased in `packages/ai/vitest.config.ts`)
- `packages/ai/test/helpers/full-analysis-queue-db.ts` (used by `mastra-v2-full-analysis.test.ts`, `full-analysis-properties.test.ts`, `mastra-audit-v2-regressions.test.ts`)
- `packages/ai/test/helpers/scripted-llm.ts` (used by `packages/ai/test/scripted-llm.test.ts`)
- `packages/db/test/fixtures/two-tenant.ts` (used by `packages/db/test/postgres-rls-isolation.test.ts`)
- `packages/indicators/test/fixtures.ts` (used across 13 indicator test files and `packages/ai/test/integration/ai-data.integration.test.ts`)
- `apps/worker/test/empty.ts` (aliased to `server-only` in `apps/worker/vitest.config.ts`)
- `apps/web/test/empty.ts` and `apps/web/test/vitest.setup.ts` (configured in `apps/web/vitest.config.ts`)
- `apps/web/test/auth-helpers.ts` (used by `apps/web/test/idor-actions.test.ts`)
- `apps/web/tests/e2e/auth-setup.ts`, `env-loader.ts`, `fixtures.ts`, `global-setup.ts`, `test-utils.ts` (used by Playwright E2E suite)

## Section 5: Verification & "Sabotage Check" Protocol for the Executing Agent

**Status: ✅ COMPLETE (2026-10-17).** Every gate in the sequence below has now been executed and passes — including the full `pnpm test` turbo gate, which ran clean once more cores were available (4-core box) with `--concurrency=1` to neutralize the documented low-core flake: **9/9 turbo tasks successful · 3,530 passed / 24 env-gated skips / 0 failed** (`db` 48+1 · `shared` 450 · `web` 1,134 · `indicators` 102 · `ai` 1,465+22 · `test-utils` 10 · `data` 174+1 · `worker` 147). All **5 sabotage checks** were executed with fail-on-mutation / green-on-revert evidence — see the per-check execution records below. Three plan line-references had drifted in this revision and were adapted (RSI check matched exactly; the risk-service and canonical-evidence mutation sites moved; the `mastra-v2-canonical.test.ts` verification file is now `canonical-evidence.test.ts`), and the checks still poisoned the suite immediately via the exact tests the plan named.

After completing Batches 1–4 and Section 4, run the full verification sequence below:

```bash
pnpm test:empty-guard     # ✅ passes — all 8 workspaces (2026-10-17)
pnpm typecheck            # ✅ 15/15 turbo tasks (2026-10-17)
pnpm lint                 # ✅ 14/14 turbo tasks with 0 errors (after the typescript@~6.0.3 lint-toolchain pin)
pnpm knip --no-progress   # ✅ exit 0 (after removing the unused `glob` dep from apps/web + the dead test-utils subpath exports)
pnpm test                 # ✅ 9/9 turbo tasks — 3,530 passed / 24 env-gated skips / 0 failed (2026-10-17, `--concurrency=1`, ANTHROPIC_* unset)
```

Once all checks pass, execute the **5 Mandatory Sabotage Checks** below. For each check:
1. Apply the specified 1-line mutation to the production source file.
2. Run the exact test command and confirm it **FAILS immediately**.
3. Revert the production source file immediately (`git checkout -- <file>`) and re-run the test command to confirm it passes.

> **✅ All 5 sabotage checks executed 2026-10-17 — every mutation failed the suite and every revert restored green.** Per-check execution records are inline below; where the plan's line/file references had drifted in this revision, the adapted mutation target is noted and the detection still came from the exact test the plan named.

### Sabotage Check 1: Wilder's RSI Smoothing & Division-by-Zero Guard (`@kestrel/indicators`)
- **Production File:** `packages/indicators/src/rsi.ts`
- **Line Number:** Line 58 (`if (avgLoss === 0) return 100;`)
- **Temporary Sabotage Mutation:** Change `if (avgLoss === 0) return 100;` to `if (avgLoss === 0) return 0;` (inverting the all-gains RSI ceiling from `100` to `0`).
- **Verification Command:**
  ```bash
  pnpm --filter @kestrel/indicators exec vitest run test/rsi.test.ts test/property.test.ts
  ```
- **Expected Failure:** `test/rsi.test.ts` (`returns 100 when all moves are gains`) and `test/property.test.ts` (`monotonically increasing closes produce RSI = 100`) must immediately fail. Revert `packages/indicators/src/rsi.ts` afterward.
- **✅ Execution record (2026-10-17):** mutation applied → `pnpm --filter @kestrel/indicators exec vitest run test/rsi.test.ts test/property.test.ts` → **1 failed | 28 passed** — `rsi > returns 100 when only gains` (`expected +0 to be 100`). Adaptation: the property suite passed under this mutation (its generators do not pin the all-gains ceiling in this revision); the dedicated unit test is the deterministic catcher. Reverted via `git checkout -- packages/indicators/src/rsi.ts` → **29 passed**.

### Sabotage Check 2: Cross-Asset USD-Base & Crypto P&L Contract Math (`@kestrel/ai`)
- **Production File:** `packages/ai/src/portfolio/risk-service.ts`
- **Line Number:** Line 77 (`if (quoteCurrency !== 'USD' && currentPrice > 0)`)
- **Temporary Sabotage Mutation:** Change `if (quoteCurrency !== 'USD' && currentPrice > 0)` to `if (quoteCurrency === 'USD' && currentPrice > 0)` (breaking quote-to-USD conversion for USD-base forex pairs like `USDJPY`, `USDCAD`, `USDCHF` and mis-scaling USD-quoted assets).
- **Verification Command:**
  ```bash
  pnpm --filter @kestrel/ai exec vitest run test/risk-sizing.test.ts src/portfolio/risk-service.test.ts
  ```
- **Expected Failure:** `test/risk-sizing.test.ts` (`computes realistic P&L for crypto positions without 100,000x multiplier` and `computes converted USD P&L for USD-base pairs like USDJPY`) and `src/portfolio/risk-service.test.ts` must immediately fail. Revert `packages/ai/src/portfolio/risk-service.ts` afterward.
- **✅ Execution record (2026-10-17):** the plan's `quoteCurrency !== 'USD' && currentPrice > 0` line no longer exists — the guard now lives in the `isUsdBase` predicate (`computePnL`, line 50: `def?.baseCurrency === 'USD' && def.quoteCurrency !== 'USD' && def.quoteCurrency !== 'USDT'`). Equivalent mutation applied: `def.quoteCurrency !== 'USD'` → `def.quoteCurrency === 'USD'` (USD-base pairs lose quote conversion). Result → **1 failed | 11 passed** — `risk-sizing > computes converted USD P&L for USD-base pairs like USDJPY`. Adaptation: `src/portfolio/risk-service.test.ts` passed under this mutation (it exercises the same conversion only indirectly); the USDJPY conversion test is the deterministic catcher. Reverted via `git checkout -- packages/ai/src/portfolio/risk-service.ts` → **12 passed**.

### Sabotage Check 3: Atomic Daily AI Budget Reservation & Reconcile Ledger (`@kestrel/ai`)
- **Production File:** `packages/ai/src/cost.ts`
- **Line Number:** Line 236 (`if (estCents > capCents) {`)
- **Temporary Sabotage Mutation:** Change `if (estCents > capCents) {` to `if (estCents < capCents) {` (inverting the budget ceiling guard in `tryReserveBudget`).
- **Verification Command:**
  ```bash
  pnpm --filter @kestrel/ai exec vitest run test/cost.test.ts test/budget-reservation.test.ts
  ```
- **Expected Failure:** `test/cost.test.ts` (`reserves budget when under cap`) and `test/budget-reservation.test.ts` must immediately fail on valid reservations under the daily cap. Revert `packages/ai/src/cost.ts` afterward.
- **✅ Execution record (2026-10-17):** line text matched exactly (at line 237 in this revision, one line below the plan's reference). Mutation applied → `pnpm --filter @kestrel/ai exec vitest run test/cost.test.ts test/budget-reservation.test.ts` → **1 failed | 62 passed** — `tryReserveBudget > reserves budget when under cap`. Adaptation: `test/budget-reservation.test.ts` passed under this mutation; the named `cost.test.ts` test is the deterministic catcher. Reverted via `git checkout -- packages/ai/src/cost.ts` → **63 passed**.

### Sabotage Check 4: Deterministic Numeric Grounding & Anti-Hallucination Verifier (`@kestrel/ai`)
- **Production File:** `packages/ai/src/mastra-v2/agents/canonical/evidence.ts`
- **Line Number:** Line 242 (`const ok = findings.length === 0;`)
- **Temporary Sabotage Mutation:** Change `const ok = findings.length === 0;` to `const ok = true;` (allowing ungrounded/hallucinated price levels in AI responses to bypass `checkCanonicalEvidence`).
- **Verification Command:**
  ```bash
  pnpm --filter @kestrel/ai exec vitest run test/mastra-v2-canonical.test.ts test/symbol-research-grounding.test.ts
  ```
- **Expected Failure:** `test/symbol-research-grounding.test.ts` (`blocks conversation text containing hallucinated price levels`) and `test/mastra-v2-canonical.test.ts` must immediately fail because `CanonicalEvidenceBlockedError` is no longer thrown. Revert `packages/ai/src/mastra-v2/agents/canonical/evidence.ts` afterward.
- **✅ Execution record (2026-10-17):** the plan's `const ok = findings.length === 0;` is an inline object property in this revision — line 134: `return { ok: findings.length === 0, findings, numericClaimCount: claims.length };`. Equivalent mutation applied: `ok: findings.length === 0` → `ok: true`. Verification-file adaptation: `test/mastra-v2-canonical.test.ts` does not exist; the canonical-evidence coverage lives in `packages/ai/test/canonical-evidence.test.ts`. Result with command `vitest run test/canonical-evidence.test.ts test/symbol-research-grounding.test.ts` → **7 failed | 6 passed**, including both plan-named checks (`canonical evidence gate > blocks a fabricated value even when a market-data tool ran` and `symbol research conversation grounding > blocks conversation text containing hallucinated price levels`). Reverted via `git checkout -- packages/ai/src/mastra-v2/agents/canonical/evidence.ts` → **13 passed**.

### Sabotage Check 5: NextAuth Session Validation Fail-Closed Guard (`@kestrel/web`)
- **Production File:** `apps/web/src/lib/auth/callbacks.ts`
- **Line Number:** Line 15 (`const EXPIRED_SESSION = { expires: '0', user: undefined };`)
- **Temporary Sabotage Mutation:** Change `user: undefined` to `user: { id: 'leaked-user' }` inside `EXPIRED_SESSION` (causing revoked/expired sessions or DB outages in `handleSessionCallback` to leak a truthy `session.user`).
- **Verification Command:**
  ```bash
  pnpm --filter @kestrel/web exec vitest run test/auth-callbacks.test.ts
  ```
- **Expected Failure:** The rewritten `apps/web/test/auth-callbacks.test.ts` (from Batch 4) must immediately fail via its `expectInvalidated(result)` assertions (`expires === '0'` + `user === undefined`) on DB failure and session invalidation. **Line-number adaptation:** this revision has no `EXPIRED_SESSION` const — the equivalent mutation is the inline `return { ...session, user: undefined, expires: '0' }` in `apps/web/src/lib/auth/callbacks.ts` (~line 61); flip `user: undefined` to `user: { id: 'leaked-user' }`. Revert `apps/web/src/lib/auth/callbacks.ts` afterward.
- **✅ Execution record (2026-10-17, pre-verified with Batch 4):** mutation applied → `pnpm --filter @kestrel/web exec vitest run test/auth-callbacks.test.ts` → **1 failed | 7 passed** (the DB-outage fail-closed test); reverted via `git checkout -- apps/web/src/lib/auth/callbacks.ts` → **8 passed**.

## Post-Plan Completion Pass (2026-10-17, after Section 5)

The plan itself was fully executed; this pass additionally ran the three verification gates the plan listed as operations but never scheduled end-to-end — the env-gated Postgres suites, the Playwright E2E suite, and `pnpm test:coverage` — and fixed everything they exposed. **Three real production bugs were found and fixed** (all with regression guards), plus three test-infrastructure problems and two build-configuration gaps.

### 1. Env-gated Postgres suites — 24 previously-skipped tests, all green

| Suite | Command (gated) | Result |
| :--- | :--- | :--- |
| RLS isolation | `pnpm test:postgres-rls` | ✅ 1/1 |
| Full-analysis queue (+ properties) | `RUN_AI_QUEUE_POSTGRES_TESTS=1` + `TEST_POSTGRES_ADMIN_URL` → `vitest run test/full-analysis-properties.test.ts test/mastra-v2-full-analysis.test.ts` | ✅ 34/34 (was 18 failing) |
| Data throttle | `RUN_PG_TESTS=true` + `THROTTLE_TEST_DATABASE_URL` + `THROTTLE_TEST_DATABASE_CONFIRM` | ✅ 1/1 |

**Bug A — atomic claim returned untyped rows (`packages/db/src/queries/full-analysis-queue.ts`).** The `FOR UPDATE SKIP LOCKED` fast path ran raw `db.execute(... RETURNING q.*)`; drizzle's `db.execute` bypasses the row mapper, so callers received snake_case keys (`run_id`) and unparsed timestamp strings under a `FullAnalysisQueueRow` type. `claimNextFullAnalysisRun` then read `row.runId === undefined`, treated every job as a payload-identity mismatch, and crashed in `failFullAnalysisQueue` with postgres.js `UNDEFINED_VALUE`. **Fix:** the atomic statement now returns only the claimed id; the row is re-read through the typed drizzle builder (real `Date` instances, JS keys). Regression-guarded by the new db integration suite + the AI queue suite.

**Bug B — stale-recovery predicate regression (same file).** The perf refactor (`d6d33894`) silently changed the recovery contract from `lease_expired OR updated_at <= staleBefore` to `lease_expired OR (lease IS NULL AND updated_at <= staleBefore)`, so the heartbeat fallback could never fire for claimed rows. **Fix:** restored the unconditional `OR` — the tests encode the pre-refactor contract.

**Test drift C — stale progress assertion (`packages/ai/test/mastra-v2-full-analysis.test.ts`).** The suite asserted the retired `{ step }` payload; the live contract is the `CommitteeProgressSnapshot` (`{ mode, agents }`) consumed by `AgentDeliberation`. Updated to assert the real snapshot semantics.

### 2. New db integration suite — `packages/db/test/queries-postgres.test.ts` (15 tests, gated)

The db package's query layer had **zero direct coverage** (it is mocked by every consumer package). The new suite provisions a disposable database from `TEST_POSTGRES_ADMIN_URL`, applies the real Drizzle migrations, and exercises: queue enqueue/idempotency, both claim paths, heartbeat, progress, complete/fail/requeue/ledger snapshot, stale recovery + attempt cap, cancel scoping, row reads/list/stats, purge, plus journal CRUD/soft-delete and watchlist management. Gate: `RUN_POSTGRES_RLS_TESTS=1` + `TEST_POSTGRES_ADMIN_URL`.

### 3. Coverage gate — `packages/db` fixed properly; `apps/web` found unattainable (needs an owner decision)

- **Fix without weakening thresholds:** with the gates enabled, `packages/db` measures **44.30%** lines/statements vs its existing **43%** threshold (the new integration suite contributes ~600 covered lines). All other workspaces pass: test-utils 100, indicators 91.75, shared 93.47, data 73.11, worker 58.63, ai passes.
- **`apps/web` cannot pass its 50% threshold (pre-existing):** measured **25.45%** (12,173 / 47,841 lines) with 123 files / 1,134 tests. Reaching 50% would need **+11,747 covered lines**; even excluding every `src/app/**` file the ceiling is ~29%. The threshold dates from 2026-07-20 when the app was ~⅓ its current size. **Not changed unilaterally** — options are (a) re-baseline the web thresholds to measured reality with a comment, or (b) fund a component/route coverage program. Recommendation: re-baseline now and set a ratchet.

### 4. Build/config gaps closed

- **`turbo.json` `test` task now declares the gating env vars** (`RUN_POSTGRES_RLS_TESTS`, `TEST_POSTGRES_ADMIN_URL`, `RUN_AI_QUEUE_POSTGRES_TESTS`, `RUN_PG_TESTS`, `THROTTLE_TEST_*`, `DB_DISABLE_SSL`, `KESTREL_LOCAL_DOCKER`). Turbo's strict env mode was silently stripping them, so the gated suites could never run under `turbo run test` — which is exactly how CI invokes coverage.
- **`.github/workflows/ci-fast.yml` unit-tests job now exports the Postgres gate envs**, so the suites the job's pgvector service container was always provisioned for actually execute in CI (and the coverage gate can pass there).
- **Bug D — `/api/health` returned 500 for every authenticated caller (`apps/web/src/app/api/health/route.ts`).** `checkCronRuns` bound a JavaScript `Date` into raw SQL; postgres.js `unsafe()` accepts strings/Buffers and threw `ERR_INVALID_ARG_TYPE` inside the driver. Verified live: authenticated request → 500 before, **200 `{"status":"ok",...}` after**. Fixed by binding an ISO string with an explicit `::timestamptz` cast. (`admin-health.ts` already used the string pattern.)

### 5. Playwright E2E — run and triaged (previously never executed in this environment)

- **Infra fixes:** installed the exact chromium/headless-shell revision the pinned Playwright expects (+ firefox/webkit OS deps); `CI=1` local runs now use the production build (`pnpm build && pnpm start`) or `REUSE_EXISTING_SERVER=true` with a pre-warmed server to avoid cold dev-compile timeouts.
- **Bug E — E2E fixture created a second organization membership (`apps/web/tests/e2e/test-utils.ts`).** The `user` insert trigger auto-provisions a personal org (id = user id); `ensureTestUser` added `org-<id>` on top, so `getTenantIdForUser` failed closed ("Multiple active organization memberships") for every `authedPage` fixture (≈400 of 493 tests). **Fix:** use the trigger-provisioned personal org and purge stale memberships so reruns self-heal. Also updated `auth.spec.ts` "redirects to login" to hit `/chat` ( `/` is now the public landing page).
- **Bug F — cross-file race in the web suite (`apps/web/test/build-scripts.test.ts`).** The missing-template test renamed the shared `scripts/sw.template.js` while `service-worker.test.ts` ran in a parallel worker and read it (intermittent 2-test failure). **Fix:** run a throwaway copy of the generator in an isolated temp root — shared state is never mutated.
- **Results:** full run (all 6 projects, dev server): **372 passed / 9 skipped / 112 failed** — after retrying the failing subset with CI retries against the production build: 99 pass, and **32 persist**. Of those, api-health (2) and the auth redirect (2) are now fixed and verified green; **~28 remain, all stale assertions against the Hoplite-redesigned UI** (exact inventory: `navigation` 8 × `/settings/*`, `settings` 6 flows, `multi-agent` 4, `chat-ui` 3, and one each in `alerts-crud`, `chart-cockpit`, `chat`, `journal-crud`, `message-edit`, `news-pwa`, `onboarding-replay`, `portfolio-risk`). This is an E2E re-audit workstream (Batch 6 candidate), not a code regression: the app renders correctly (verified via failure screenshots) and every page loads.

### 6. Final gate status after the completion pass

```bash
pnpm test:empty-guard     # ✅ all 8 workspaces
pnpm typecheck            # ✅ 15/15 turbo tasks
pnpm lint                 # ✅ 14/14 turbo tasks, 0 errors
pnpm knip --no-progress   # ✅ exit 0 (9 advisory config hints)
pnpm test -- --concurrency=1   # ✅ 9/9 turbo tasks — 3,530 passed / 24 env-gated skips / 0 failed
pnpm test:coverage        # ⚠️ 7/9 workspaces pass incl. db 44.30%; apps/web 25.45% vs 50% needs a decision (§3)
pnpm test:e2e             # ⚠️ infra fixed; ~28 stale assertions remain for the E2E re-audit (§5)
```

Local infrastructure note: the disposable `kestrel-coverage-pg` container was removed; the compose `kestrel-db-1` (migrated) was left running so the gated suites and E2E can be re-run directly.
