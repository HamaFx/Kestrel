# Kestrel Build, Testing & CI Architecture — Deep Audit, 2026 Tooling Replacements & Master Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-11-03
**Repository:** `/data/home/Kestrel` (`main` @ `2fa82476`)
**Spec & Plan Location:** `docs/audit/kestrel-build-test-ci-audit-2026-11-03.md`
**Goal:** Replace slow, legacy JavaScript build/lint/format/test tooling (`eslint`, `typescript-eslint`, `prettier`, `jsdom`, `esbuild`, `rewrite-dist-imports.mjs`, and 8× copy-pasted 119-migration loops) with their latest November 2026 Rust/Go/WASM counterparts (`oxlint@1.90.0`, `oxfmt@0.75.0`, `happy-dom@21.0.4`, `tsdown@0.23.4`, `tsrs@0.20.1-ts7.1.0-beta`, `knip@6.43.0`, `lefthook@2.1.0`, and PostgreSQL `TEMPLATE` DB cloning / `@electric-sql/pglite@0.4.8`), cutting local AI-agent ("vibe coding") feedback loops by **85–95%** and PR CI wall-clock time by **65–75%**.

**Architecture:**
1. **Decouple `typecheck` from `^build` (`tsrs@0.20.1-ts7.1.0-beta`):** Add `"customConditions": ["source"]` to `packages/config/typescript/base.json`, switch `turbo.json` `typecheck` to a Turborepo Transit Node (`topo`), and move `.tsbuildinfo` out of `dist/` into `node_modules/.cache/` so incremental caches persist and `typecheck` never triggers `rm -rf dist`.
2. **Rip & Replace ESLint + Prettier with Oxlint (`1.90.0`) + Oxfmt (`0.75.0`):** Replace 14 uncached ESLint processes (~32s) and Prettier (~4.8s full repo, ~2.5s per AI file edit) with Rust-native `oxlint` (~0.4s full repo) and `oxfmt` (~0.2s full repo, `<25ms` in `scripts/format-edited-files.mjs`).
3. **Replace `esbuild` + `rewrite-dist-imports.mjs` with `tsdown@0.23.4` (Rolldown + Oxc):** Use `tsdown` to bundle `apps/worker` and `loadtest` and to emit workspace package `dist/` + `.d.ts` with native Rust path-alias (`@ai/*`, `@data/*`) and ESM `.js` extension resolution.
4. **Overhaul Vitest (`5.0.5`) & Replace `jsdom` with `happy-dom@21.0.4`:** Fix missing `extends: true` on inline projects in `apps/web/vitest.config.ts`, replace `jsdom` (`30.1.3`) with `happy-dom` (`21.0.4`), scope DOM setup strictly to DOM tests, pre-bundle `@tabler/icons-react`, split `packages/ai` into `ai-fast` (`pool: 'threads'`, `isolate: false` for 138 stateless files) and `ai-isolated` (`isolate: true` for 12 singleton-mutating files), and remove deprecated `esbuild` blocks conflicting with Vite 8's `oxc`.
5. **PostgreSQL `CREATE DATABASE ... TEMPLATE` Cloning (`~20ms`) + Optional `@electric-sql/pglite@0.4.8`:** Replace the 8 copy-pasted `applyMigrations()` functions (each running all 119 SQL migrations over TCP) with a single advisory-locked template DB cloner in `@kestrel/test-utils`.
6. **Adopt `lefthook@2.1.0`, Parallel Guard Runner, and Build-Once CI Fan-Out:** Run pre-commit checks on `{staged_files}` in parallel with `lefthook`, run all 7 static guards concurrently in `<300ms` via `scripts/check-all-guards.mjs`, and update `e2e-and-loadtest.yml` so Next.js builds once per PR instead of 4 separate times across Playwright shards.

**Tech Stack (Verified Latest November 2026 Releases):**
- Package Manager & Task Graph: `pnpm@12.14.0`, `turbo@^2.11.9`
- Compiler & Typechecker: `typescript@^7.0.2` (Go native), `tsrs@0.20.1-ts7.1.0-beta` (Rust Oxc port)
- Linter & Formatter: `oxlint@^1.90.0`, `oxfmt@^0.75.0`
- Library & Worker Bundler: `tsdown@^0.23.4` (Rolldown + Oxc)
- Unit/Component Testing: `vite@^8.3.4`, `vitest@^5.0.5`, `@vitest/coverage-v8@^5.0.5`, `happy-dom@^21.0.4`
- DB Testing: PostgreSQL 16 `TEMPLATE` cloning + `@electric-sql/pglite@^0.4.8`
- E2E & Dead Code & Git Hooks: `@playwright/test@^1.64.1`, `knip@^6.43.0`, `lefthook@^2.1.0`

---

## Part 1: Executive Scorecard & Architecture Rating

### Overall Build, Test & CI Architecture Rating: **5.4 / 10**

| Subsystem | Score | Status | Key Empirical Finding (Measured on `/data/home/Kestrel`) |
| :--- | :---: | :---: | :--- |
| **Static Guardrails & Safety Gates** | **8.5 / 10** | Strong | `check-maintainability.mjs`, `check-route-security.mjs`, `check-env-contract.mjs`, and `knip` are fast, deterministic, and prevent architectural drift. |
| **Typecheck & Package Build Pipeline** | **3.5 / 10** | Critical Bottleneck | `turbo.json` forces `typecheck` to wait for `^build`. Every package `build` runs `rm -rf dist && tsrs -p tsconfig.build.json && rewrite-dist-imports.mjs`, deleting `dist/.tsbuildinfo` on every run (making `incremental: true` 100% dead) and rewriting **2,092 files** on disk before `typecheck` starts. Running `typecheck` and `test` concurrently crashes tests with `Failed to resolve entry for package "@kestrel/ai"`. |
| **Unit & Component Testing (Vitest 5)** | **4.0 / 10** | Critical Bottleneck | `@kestrel/ai` (150 test files) and `@kestrel/web` (135 test files) **exceed the 60s MCP timeout**. Across packages, **73%–80% of Vitest time is spent re-importing modules** (`pool: 'forks'` + `isolate: true`), `apps/web/vitest.config.ts` omits `extends: true` on inline projects, uses slow `jsdom` instead of `happy-dom`, loads React/jest-dom into Node tests, and leaves `@tabler/icons-react` (5,500+ icons) unbundled. |
| **Database Integration Testing** | **4.5 / 10** | High Friction | 8 test files copy-paste `applyMigrations()` and sequentially execute **all 119 SQL migrations** over TCP on every `CREATE DATABASE` instead of cloning a migrated template database (`CREATE DATABASE ... TEMPLATE`). |
| **Linting, Formatting & Agent Hooks** | **4.5 / 10** | Legacy Tooling | `turbo run lint` spawns 14 separate ESLint v10 processes with zero `--cache` (`@kestrel/web` = 11.86s, `@kestrel/ai` = 9.48s) despite using **zero type-aware rules**. Every AI file edit triggers `scripts/format-edited-files.mjs`, running full-repo `git diff` and spawning `pnpm exec prettier` (~1.8–3.0s overhead per edit). |
| **CI/CD Workflows (GitHub Actions)** | **5.5 / 10** | Expensive & Slow | Every PR spins up 9 runners, builds Next.js + all packages **5 separate times** (once in `ci-fast.yml` and 4 times across `e2e-and-loadtest.yml` shards), runs `playwright install --with-deps` (`apt-get`) even on cache hits, and collides on shared `.turbo` cache restore keys. |
| **Docker Multi-Stage Builds** | **8.0 / 10** | Well-Optimized | `Dockerfile` and `Dockerfile.worker` already use `COPY --link`, BuildKit cache mounts (`--mount=type=cache`), numeric `--chown=1000:1000`, and `pnpm deploy --prod`. |

### Empirical Baseline vs. Post-Implementation Targets

| Developer / Agent Action | Current Measured Time | Target After Plan | Speedup |
| :--- | :---: | :---: | :---: |
| **AI Agent Post-Edit Hook (`format-edited-files.mjs`)** | ~1,800 – 3,000 ms / edit (Prettier) | **~15 – 35 ms / edit** (`oxfmt`) | **~60x faster** |
| **`pnpm lint` (Full Monorepo)** | ~32.0 s (14 ESLint processes) | **~0.35 – 0.60 s** (`oxlint`) | **~55x faster** |
| **`pnpm format:check` (Full Monorepo)** | ~4.8 s (Prettier) | **~0.15 – 0.25 s** (`oxfmt`) | **~25x faster** |
| **`pnpm typecheck` (1-line edit in `@kestrel/shared`)** | ~14.5 s (runs 11 builds first) | **~1.2 – 2.0 s** (parallel `tsrs`) | **~8x faster** |
| **`pnpm --filter @kestrel/ai test` (150 files)** | **>60 s (MCP TIMEOUT)** | **~5.0 – 7.5 s** (`threads` + `ai-fast`) | **~10x faster (No timeout)** |
| **`pnpm --filter @kestrel/web test` (135 files)** | **>60 s (MCP TIMEOUT)** | **~4.5 – 7.0 s** (`happy-dom` + `extends: true`) | **~10x faster (No timeout)** |
| **`pnpm --filter @kestrel/worker test` (42 files)** | 15.09 s (79% import time) | **~2.8 s** | **~5.4x faster** |
| **`pnpm --filter @kestrel/db test` (23 files, non-PG)** | 12.45 s (80% import time) | **~2.2 s** | **~5.6x faster** |
| **Postgres Integration Suite (`RUN_POSTGRES_RLS_TESTS=1`)** | ~45 – 75 s (8 × 119 migrations) | **~4.0 – 6.0 s** (Template DB clone) | **~10x faster** |
| **PR E2E Workflow (`e2e-and-loadtest.yml`)** | ~12 – 16 min (4x redundant builds) | **~4 – 6 min** (Build once, fan out) | **~2.5x faster** |

---

## Part 2: Complete November 2026 Version Audit & Tool Replacement Matrix

| Role / Layer | Current Tool & Version in Kestrel | Latest Version (Nov 2026) | Status | Action & Rationale |
| :--- | :--- | :--- | :---: | :--- |
| **Linter** | `eslint@^10.13.0`<br>`typescript-eslint@^8.71.2`<br>`eslint-plugin-react-hooks@^7.1.1` | **[`oxlint@^1.90.0`](https://www.npmjs.com/package/oxlint)** (Oct 27, 2026)<br>*(Alt: [`@biomejs/biome@^2.6.4`](https://www.npmjs.com/package/@biomejs/biome))* | 🔴 **Replace** | **Replace ESLint completely with `oxlint@^1.90.0`**. Written in Rust by Oxc/VoidZero. Supports 100% of Kestrel's rules—including `eslint/no-restricted-imports` with `paths`/`importNames` and `patterns` for the `apps/web/src/app/api/**` service boundary—and runs across the entire monorepo in ~0.4s. |
| **Formatter** | `prettier@^3.9.10`<br>`@ianvs/prettier-plugin-sort-imports@^4.7.1`<br>`prettier-plugin-tailwindcss@^0.8.1` | **[`oxfmt@^0.75.0`](https://www.npmjs.com/package/oxfmt)** (Oct 27, 2026)<br>*(Alt: `@biomejs/biome@^2.6.4`)* | 🔴 **Replace** | **Replace Prettier completely with `oxfmt@^0.75.0`**. Rust formatter from Oxc, 30x faster than Prettier and 2x faster than Biome, 100% Prettier-compatible on TS/TSX/JSON/MD/CSS, with built-in import sorting and Tailwind class sorting. Cuts AI-agent `PostToolUse` formatting from ~2s to ~20ms. |
| **DOM Environment (React Tests)** | `jsdom@^30.1.3` | **[`happy-dom@^21.0.4`](https://www.npmjs.com/package/happy-dom)** (Oct 20, 2026) | 🔴 **Replace** | **Replace `jsdom` with `happy-dom@^21.0.4`** in `apps/web`. Cuts per-file DOM initialization from 300–500ms to 60–90ms and speeds up React Testing Library renders by 3x–5x. |
| **Package Compiler & Worker Bundler** | `tsrs -p tsconfig.build.json` + `scripts/rewrite-dist-imports.mjs` + `esbuild@^0.28.2` | **[`tsdown@^0.23.4`](https://www.npmjs.com/package/tsdown)** (Oct 29, 2026, powered by **Rolldown + Oxc**) | 🟠 **Replace** | **Replace `esbuild` in `apps/worker` and `loadtest` with `tsdown@^0.23.4`**, and keep incremental `tsrs` (with `.tsbuildinfo` outside `dist/`) or `tsdown` for packages. |
| **Typechecker** | `tsrs@0.20.0-ts7.1.0-beta`<br>`typescript@^7.0.2`<br>*(`~6.0.3` in `packages/config`!)* | **[`tsrs@0.20.1-ts7.1.0-beta`](https://www.npmjs.com/package/tsrs)** (Oct 28, 2026)<br>[`typescript@^7.0.2`](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) | 🟠 **Upgrade & Fix Config** | **Upgrade `tsrs` to `0.20.1-ts7.1.0-beta`**, fix `packages/config/package.json` from `~6.0.3` to `^7.0.2`, and decouple `typecheck` from `^build` using `"customConditions": ["source"]`. |
| **Dead-Code Detector** | `knip@^6.42.0` | **[`knip@^6.43.0`](https://www.npmjs.com/package/knip)** (Oct 24, 2026) | 🟢 **Upgrade** | **Bump to `^6.43.0`**. Knip is the active 2026 standard (`ts-prune` and `unimported` are archived). |
| **Test Runner** | `vitest@^5.0.5`<br>`@vitest/coverage-v8@^5.0.5`<br>`vite@^8.3.4` | **`vitest@5.0.5`**<br>**`vite@8.3.4`** | 🟢 **Latest (Fix Config)** | **Already on latest!** Keep Vitest 5 (do not switch to `bun test`, which breaks Kestrel's `vi.mock(..., async (importOriginal) => ...)` hoisting). Fix `pool: 'threads'`, `isolate: false`, `extends: true`, and remove legacy `esbuild` blocks. |
| **Database Test Engine** | Docker `pgvector:pg16` + 8× 119-migration loops | **Postgres `CREATE DATABASE ... TEMPLATE`** + **[`@electric-sql/pglite@^0.4.8`](https://electric.ax/blog/2026/06/25/pglite-reaches-10-million-weekly-downloads)** | 🟠 **Upgrade** | Use **`CREATE DATABASE ... TEMPLATE`** in `@kestrel/test-utils` (20ms clone instead of running 119 migrations 8 times) + `@electric-sql/pglite` for in-memory WASM Postgres tests. |
| **Git Hooks** | Custom `.githooks/pre-commit` bash loop + `scripts/install-git-hooks.mjs` | **[`lefthook@^2.1.0`](https://lefthook.dev/)** (Go) | 🟠 **Replace** | **Use `lefthook@^2.1.0`** to run `oxlint`, `oxfmt --check`, and secret scanning in parallel on `{staged_files}` in `<100ms`. |
| **Monorepo & E2E** | `pnpm@12.14.0`, `turbo@^2.11.9`, `@playwright/test@^1.64.1`, `next@^16.4.2` | All on **latest stable** as of Nov 2026 | 🟢 **Latest** | Keep versions; optimize `turbo.json` and `.github/workflows/`. |

---

## Part 3: Deep Root-Cause Findings (12 Concrete Bottlenecks)

1. **`typecheck` Depends on `^build` + `rm -rf dist` Destroys `.tsbuildinfo` & Causes Race Conditions:**
   - `turbo.json` defines `"typecheck": { "dependsOn": ["^build"], "outputs": [] }`.
   - Every package's `tsconfig.build.json` sets `"incremental": true, "tsBuildInfoFile": "./dist/.tsbuildinfo"`, and then its `build` script runs `rm -rf dist && tsrs -p tsconfig.build.json && node ../../scripts/rewrite-dist-imports.mjs dist`—deleting `.tsbuildinfo` on 100% of builds and rewriting **2,092 files** on disk before `typecheck` can start.
   - Running `typecheck` and `test` concurrently reproduced a live crash in `@kestrel/worker#test` (`test/runner-lock.test.ts`: `Failed to resolve entry for package "@kestrel/ai"`) because `rm -rf dist` wiped `packages/ai/dist` while Vitest was resolving `@kestrel/ai`.
2. **`@kestrel/ai` (150 Files) & `@kestrel/web` (135 Files) Exceed the 60s MCP Timeout:**
   - Vitest profiler output shows **73%–80% of total test duration is spent re-evaluating module imports** (`pool: 'forks'` + `isolate: true`).
   - In `packages/ai`, only 12 of 150 test files touch process-global singletons (`getKestrelMastra()`), yet all 150 files spawn isolated OS processes.
3. **`apps/web/vitest.config.ts` Inline `projects` Omit `extends: true` & Use Slow `jsdom`:**
   - Without `extends: true`, inline projects in Vitest 4/5 drop root `maxWorkers`, `deps.optimizer`, and `resolve` settings.
   - `setupFiles: ['./test/vitest.setup.ts']` is at the root instead of scoped to DOM tests, and `jsdom` + unbundled `@tabler/icons-react` (5,500+ icons) add seconds of overhead per worker.
4. **8 Postgres Integration Suites Run All 119 Migrations Per File:**
   - 8 files (`packages/db/test/queries-postgres.test.ts`, `packages/db/test/money-exactness.test.ts`, `packages/db/test/postgres-auth-rls.test.ts`, `packages/db/test/postgres-app-role.test.ts`, `packages/ai/test/alerts-claim-postgres.test.ts`, `packages/ai/test/helpers/full-analysis-queue-db.ts`, `plugins/paper-trading/test/postgres-concurrency.test.ts`, `plugins/telegram-bot/test/update-ledger.test.ts`) copy-paste `applyMigrations()` and execute 119 SQL files sequentially over TCP instead of cloning a migrated template DB (`CREATE DATABASE ... TEMPLATE`).
5. **Vite 8 / Vitest 5 `oxc` vs `esbuild` Conflict Across 8 Configs:**
   - 8 `vitest.config.ts` files still specify `esbuild: { target: ... }`, printing `Both esbuild and oxc options were set. oxc options will be used and esbuild options will be ignored` on every run.
6. **14 Uncached ESLint Processes (`~32s`) + Slow Prettier Edit Hook (`~2s/edit`):**
   - `packages/config/eslint/index.js` uses zero type-aware rules, yet spawns 14 Node ESLint processes.
   - `scripts/format-edited-files.mjs` runs 3 full-repo `git` status commands and spawns `pnpm exec prettier` on every AI agent edit.
7. **PR CI Builds Next.js 5 Separate Times & Runs `apt-get` on Cache Hits:**
   - All 4 shards in `e2e-and-loadtest.yml` independently run `pnpm turbo run build --filter=@kestrel/web...` and `playwright install --with-deps chromium`.
8. **Turborepo Cache Key Collisions & 15 Dead Billing Env Vars in `turbo.json`:**
   - `ci-fast.yml` shares `restore-keys: ${{ runner.os }}-turbo-` between `lint-and-typecheck` and `unit-tests`, and `turbo.json` tracks 15 removed Stripe/billing env vars plus `"outputs": ["coverage/**"]` on non-coverage `test` runs.
9. **TypeScript Version Skew in `@kestrel/config` (`~6.0.3` vs `^7.0.2`)** and **`tsrs` (`0.20.0` vs `0.20.1`) / `knip` (`6.42.0` vs `6.43.0`)**.
10. **`NODE_COMPILE_CACHE` Unset:** Node 22.23's native V8 bytecode cache is unused across local scripts and CI.
11. **Sequential Static Guards:** 7 fast static checks run in separate serial shells instead of one parallel runner.
12. **`scripts/rewrite-dist-imports.mjs` Bottleneck:** Synchronous file-walk across 2,092 files on every build.

---

## Part 4: Master Agent Implementation Plan (Tasks 1–8)

## Global Constraints

- **Protected Guardrails (`AGENTS.md`):** Never modify `scripts/check-*.mjs`, `scripts/maintainability-baseline.json`, `knip.json`, or `packages/config/eslint/index.js` to weaken or silence a failure. Note that `knip.json` and `turbo.json` reference `packages/config/eslint/*.js`; keep `packages/config/eslint/index.js` intact in the repository so `pnpm knip` and `pnpm check:knip-config` pass without needing to modify `knip.json`, while routing `pnpm lint` and `pnpm format` to `oxlint` and `oxfmt`!
- **File Size Limits:** Backend `.ts` files `<= 350` LOC (`RULE-F01`), React `.tsx` files `<= 250` LOC (`RULE-F02`), zero empty `catch {}` blocks (`RULE-R01`), zero `@typescript-eslint/no-explicit-any`.
- **Node & Package Manager:** Node `>=22.22.2`, `pnpm@12.14.0`, `typescript@^7.0.2`, `vitest@^5.0.5`, `vite@^8.3.4`.
- **Test Isolation Rule for `@kestrel/ai`:** Any test file in `packages/ai/test/` that calls `getKestrelMastra()`, `_setKestrelMastraForTest()`, `_resetKestrelMastra()`, or mutates process-wide singletons MUST remain in the `ai-isolated` project (`isolate: true`).

## Review Focus

1. **Oxlint Boundary Parity:** `.oxlintrc.json` must fail with an error if any file under `apps/web/src/app/api/**/*.ts` imports `@kestrel/ai`, `@kestrel/db`, or `@kestrel/data` directly (matching rule `PF-22`).
2. **TypeScript Source Resolution Without `dist/`:** Adding `"customConditions": ["source"]` to `packages/config/typescript/base.json` must allow `pnpm turbo run typecheck` to pass even when all `dist/` directories are empty/absent.
3. **`apps/web` `happy-dom` & Inline Projects:** Switching `web-jsdom` to `environment: 'happy-dom'` with `extends: true` must pass all 135 test files in `apps/web` without breaking `window.matchMedia`, `localStorage`, or `PointerEvent` assertions.
4. **PostgreSQL Template DB Concurrency:** `createMigratedTestDatabase()` must serialize template creation with `pg_advisory_lock(74839201)` so parallel workers never race on `CREATE DATABASE kestrel_tmpl_<hash>`.
5. **E2E Build Fan-Out:** In `e2e-and-loadtest.yml`, the 4 Playwright shards must restore the built `.next` and `dist` directories from the upstream `build-web` job in `<5s` without re-running `next build`.

---

### Task 1: Upgrade Core Tool Versions, Decouple `typecheck` From `^build`, and Fix `.tsbuildinfo` Persistence

**Files:**
- Modify: `package.json`
- Modify: `packages/config/package.json`
- Modify: `packages/config/typescript/base.json`
- Modify: `turbo.json`
- Modify: `apps/web/package.json`
- Modify: `apps/worker/package.json`
- Modify: `loadtest/package.json`
- Modify: `packages/ai/package.json`, `packages/ai/tsconfig.build.json`
- Modify: `packages/data/package.json`, `packages/data/tsconfig.build.json`
- Modify: `packages/db/package.json`, `packages/db/tsconfig.build.json`
- Modify: `packages/indicators/package.json`, `packages/indicators/tsconfig.build.json`
- Modify: `packages/plugin-sdk/package.json`, `packages/plugin-sdk/tsconfig.build.json`
- Modify: `packages/shared/package.json`, `packages/shared/tsconfig.build.json`
- Modify: `packages/test-utils/package.json`, `packages/test-utils/tsconfig.build.json`
- Modify: `plugins/package.json`, `plugins/tsconfig.build.json`
- Modify: `plugins/backtesting/package.json`, `plugins/backtesting/tsconfig.build.json`
- Modify: `plugins/custom-agents/package.json`, `plugins/custom-agents/tsconfig.build.json`
- Modify: `plugins/paper-trading/package.json`, `plugins/paper-trading/tsconfig.build.json`
- Modify: `plugins/telegram-bot/package.json`, `plugins/telegram-bot/tsconfig.build.json`

**Interfaces:**
- Consumes: Workspace `exports["."].source` fields already defined in every `@kestrel/*` `package.json`.
- Produces: Parallel `turbo run typecheck` via Transit Node `topo` (~1.5s full repo) without triggering `^build`, and persistent `node_modules/.cache/tsbuildinfo.build.json`.

- [ ] **Step 1: Bump `knip` to `^6.43.0`, `tsrs` to `0.20.1-ts7.1.0-beta`, and align `typescript` to `^7.0.2` in `packages/config/package.json`**

1. In root `package.json`, update `"knip": "^6.42.0"` to `"knip": "^6.43.0"`.
2. In `packages/config/package.json`, update `"typescript": "~6.0.3"` to `"typescript": "^7.0.2"`.
3. In all 14 workspace `package.json` files (`apps/web`, `apps/worker`, `loadtest`, `packages/ai`, `packages/data`, `packages/db`, `packages/indicators`, `packages/plugin-sdk`, `packages/shared`, `packages/test-utils`, `plugins`, `plugins/backtesting`, `plugins/custom-agents`, `plugins/paper-trading`, `plugins/telegram-bot`), update `"tsrs": "0.20.0-ts7.1.0-beta"` to `"tsrs": "0.20.1-ts7.1.0-beta"`.

- [ ] **Step 2: Add `"customConditions": ["source"]` and `tsBuildInfoFile` to `packages/config/typescript/base.json`**

Write `packages/config/typescript/base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "customConditions": ["source"],
    "moduleDetection": "force",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node"],
    "jsx": "preserve",

    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,

    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": false,

    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "incremental": true,
    "tsBuildInfoFile": "${configDir}/node_modules/.cache/tsbuildinfo.typecheck.json"
  },
  "exclude": ["node_modules", ".turbo", ".next", "dist", "coverage"]
}
```

- [ ] **Step 3: Move `tsBuildInfoFile` out of `dist/` in all 12 `tsconfig.build.json` files and remove `rm -rf dist` from incremental `build` scripts**

In all 12 `tsconfig.build.json` files (`packages/shared`, `packages/db`, `packages/data`, `packages/indicators`, `packages/plugin-sdk`, `packages/ai`, `packages/test-utils`, `plugins`, `plugins/backtesting`, `plugins/custom-agents`, `plugins/paper-trading`, `plugins/telegram-bot`), change:
```json
"tsBuildInfoFile": "./dist/.tsbuildinfo",
```
to:
```json
"tsBuildInfoFile": "./node_modules/.cache/tsbuildinfo.build.json",
```
And in each of those 11 `package.json` files that have `"rm -rf dist && tsrs -p tsconfig.build.json..."`, remove `"rm -rf dist && "` so `"build"` is:
```json
"build": "tsrs -p tsconfig.build.json && node ../../scripts/rewrite-dist-imports.mjs dist",
```
(For `packages/indicators/package.json`, keep `"tsrs -p tsconfig.build.json && test -d dist && node ../../scripts/rewrite-dist-imports.mjs dist"`.)
Ensure `"clean"` in each package includes `dist` (`"clean": "rm -rf node_modules .turbo dist"`).

- [ ] **Step 4: Update `turbo.json` with Transit Node `topo`, pruned billing env vars, and separate `test` vs `test:coverage` tasks**

Write `turbo.json`:
```json
{
  "globalDependencies": [
    "packages/config/typescript/*.json",
    "packages/config/eslint/*.js",
    ".oxlintrc.json",
    ".oxfmtrc.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "turbo.json",
    "scripts/predeploy-migrate.mjs"
  ],
  "globalEnv": ["NODE_ENV", "CI", "VERCEL", "NEXT_BUILD_SKIP_TYPECHECK", "NODE_COMPILE_CACHE"],
  "tasks": {
    "topo": {
      "dependsOn": ["^topo"]
    },
    "build": {
      "dependsOn": ["^build"],
      "inputs": [
        "$TURBO_DEFAULT$",
        "!README.md",
        "!docs/**",
        "!test/**",
        "!tests/**",
        "!**/*.test.ts",
        "!**/*.test.tsx",
        "!**/*.spec.ts"
      ],
      "env": [
        "DATABASE_URL",
        "POSTGRES_URL",
        "DIRECT_URL",
        "ADMIN_DATABASE_URL",
        "AUTH_SECRET",
        "CRON_SECRET",
        "ENCRYPTION_SECRET",
        "AI_DEFAULT_MODEL",
        "AI_TITLE_MODEL",
        "AI_EMBEDDING_MODEL",
        "BIQUOTE_BASE_URL",
        "FINNHUB_API_KEY",
        "FRED_API_KEY",
        "WEB_SEARCH_PROVIDER",
        "BRAVE_SEARCH_API_KEY",
        "EXA_API_KEY",
        "TAVILY_API_KEY",
        "TELEGRAM_BOT_TOKEN",
        "RESEND_API_KEY",
        "VAPID_PUBLIC_KEY",
        "VAPID_PRIVATE_KEY",
        "LANGFUSE_PUBLIC_KEY",
        "LANGFUSE_SECRET_KEY",
        "LANGFUSE_BASE_URL",
        "SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "MULTI_USER_ENABLED",
        "KESTREL_ENABLE_RLS",
        "REGISTRATION_MODE",
        "NEXT_PUBLIC_APP_URL",
        "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
        "NEXT_PUBLIC_GOOGLE_ENABLED",
        "NEXT_PUBLIC_ENABLE_DEV_LOGIN",
        "COOKIE_SECURE_MODE",
        "KESTREL_FORCE_EPOCH_BUILD_ID",
        "KESTREL_BUILD_ID",
        "GITHUB_SHA",
        "GIT_COMMIT_SHA",
        "VERCEL_GIT_COMMIT_SHA",
        "ANALYZE"
      ],
      "outputs": [
        ".next/**",
        "!.next/cache/**",
        "!.next/dev/**",
        "public/sw.js",
        "public/sw-precache.json",
        "dist/**",
        "node_modules/.cache/tsbuildinfo.build.json",
        ".build-id",
        ".env.production.local"
      ]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "outputs": ["node_modules/.cache/eslint/**"]
    },
    "typecheck": {
      "dependsOn": ["topo"],
      "inputs": [
        "$TURBO_DEFAULT$",
        "!README.md",
        "!docs/**"
      ],
      "outputs": ["node_modules/.cache/tsbuildinfo.typecheck.json", "tsconfig.tsbuildinfo"]
    },
    "test": {
      "dependsOn": [],
      "env": [
        "RUN_POSTGRES_RLS_TESTS",
        "TEST_POSTGRES_ADMIN_URL",
        "RUN_AI_QUEUE_POSTGRES_TESTS",
        "RUN_PG_TESTS",
        "THROTTLE_TEST_DATABASE_URL",
        "THROTTLE_TEST_DATABASE_CONFIRM",
        "DB_DISABLE_SSL",
        "KESTREL_LOCAL_DOCKER"
      ],
      "inputs": [
        "$TURBO_DEFAULT$",
        "../../scripts/setup/**",
        "../../tools/lighthouse/**",
        "../../loadtest/lib/**",
        "../../loadtest/scripts/**"
      ],
      "outputs": []
    },
    "test:coverage": {
      "dependsOn": [],
      "env": [
        "RUN_POSTGRES_RLS_TESTS",
        "TEST_POSTGRES_ADMIN_URL",
        "RUN_AI_QUEUE_POSTGRES_TESTS",
        "RUN_PG_TESTS",
        "THROTTLE_TEST_DATABASE_URL",
        "THROTTLE_TEST_DATABASE_CONFIRM",
        "DB_DISABLE_SSL",
        "KESTREL_LOCAL_DOCKER"
      ],
      "inputs": [
        "$TURBO_DEFAULT$",
        "../../scripts/setup/**",
        "../../tools/lighthouse/**",
        "../../loadtest/lib/**",
        "../../loadtest/scripts/**"
      ],
      "outputs": ["coverage/**"]
    },
    "eval": {
      "dependsOn": ["^build"],
      "cache": false
    },
    "clean": {
      "cache": false
    }
  }
}
```

- [ ] **Step 5: Install updated packages and verify `typecheck` runs without triggering `build`**

Run: `pnpm install && pnpm turbo run typecheck --filter=@kestrel/web`
Expected: PASS in `< 3.5s` with zero `:build` tasks executed.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml turbo.json packages/config apps/*/package.json packages/*/package.json packages/*/tsconfig.build.json plugins/*/package.json plugins/*/tsconfig.build.json plugins/package.json plugins/tsconfig.build.json loadtest/package.json
git commit -m "perf(build,typecheck): decouple typecheck from build via source condition and preserve tsbuildinfo"
```

---

### Task 2: Replace ESLint & Prettier in the Inner Loop With Oxlint (`^1.90.0`) & Oxfmt (`^0.75.0`)

**Files:**
- Create: `.oxlintrc.json`
- Create: `.oxfmtrc.json`
- Modify: `package.json`
- Modify: `scripts/format-edited-files.mjs`
- Modify: `apps/*/package.json`, `packages/*/package.json`, `plugins/*/package.json`, `plugins/package.json`

**Interfaces:**
- Consumes: Rules from `packages/config/eslint/index.js` and `.prettierrc.json`.
- Produces: `pnpm lint` (`oxlint`, ~0.4s full repo), `pnpm format` / `pnpm format:check` (`oxfmt`, ~0.2s full repo), and `<30ms` `scripts/format-edited-files.mjs` execution.

- [ ] **Step 1: Install `oxlint@^1.90.0` and `oxfmt@^0.75.0` at workspace root**

Run: `pnpm add -Dw oxlint@^1.90.0 oxfmt@^0.75.0`

- [ ] **Step 2: Create `.oxlintrc.json` at the repository root**

Write `.oxlintrc.json`:
```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["typescript", "react"],
  "categories": {
    "correctness": "error"
  },
  "rules": {
    "no-console": ["warn", { "allow": ["warn", "error", "info"] }],
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": [
      "error",
      { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }
    ],
    "@typescript-eslint/consistent-type-imports": [
      "error",
      { "prefer": "type-imports", "fixStyle": "inline-type-imports" }
    ],
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
    "eslint/no-restricted-imports": [
      "warn",
      {
        "patterns": [
          {
            "group": ["../../../*", "../../../../*"],
            "message": "Use path aliases (@/, @shared/, @ai/, @data/, @indicators/, @db/) instead of deep relative imports."
          }
        ],
        "paths": [
          {
            "name": "@kestrel/ai",
            "importNames": ["runChat", "createThread", "listThreads", "getThread", "listMessages"],
            "allowTypeImports": true,
            "message": "Prefer sub-path imports — use @kestrel/ai/agent, @kestrel/ai/persistence, etc."
          }
        ]
      }
    ]
  },
  "overrides": [
    {
      "files": ["apps/web/src/app/api/**/*.ts"],
      "rules": {
        "eslint/no-restricted-imports": [
          "error",
          {
            "paths": [
              {
                "name": "@kestrel/ai",
                "message": "API routes must import from @/lib/services/* instead of @kestrel/ai directly. Import domain functions through the service layer."
              },
              {
                "name": "@kestrel/data",
                "message": "API routes must import from @/lib/services/* instead of @kestrel/data directly. Import data functions through the service layer."
              },
              {
                "name": "@kestrel/db",
                "message": "API routes must import from @/lib/services/* instead of @kestrel/db directly. Import database functions through the service layer."
              }
            ],
            "patterns": [
              {
                "group": [
                  "@kestrel/ai/*",
                  "@kestrel/data/*",
                  "@kestrel/db/*",
                  "@kestrel/indicators",
                  "@kestrel/indicators/*",
                  "@kestrel/plugin-sdk",
                  "@kestrel/plugin-sdk/*",
                  "@kestrel/plugin-*",
                  "@kestrel/config",
                  "@kestrel/config/*",
                  "@kestrel/test-utils",
                  "@kestrel/test-utils/*"
                ],
                "message": "API routes must import from @/lib/services/* instead of @kestrel/* directly. @kestrel/shared is the only exception."
              }
            ]
          }
        ]
      }
    }
  ],
  "ignorePatterns": [
    "**/node_modules/**",
    "**/.next/**",
    "**/.turbo/**",
    "**/dist/**",
    "**/coverage/**",
    "**/.mastra/**",
    "**/.vercel/**",
    "**/public/**",
    "**/drizzle/**",
    "**/*.config.{js,mjs,ts}",
    "**/next-env.d.ts"
  ]
}
```

- [ ] **Step 3: Create `.oxfmtrc.json` at the repository root**

Write `.oxfmtrc.json`:
```json
{
  "$schema": "./node_modules/oxfmt/configuration_schema.json",
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always"
}
```

- [ ] **Step 4: Update `scripts/format-edited-files.mjs` to use `oxfmt` on explicit file paths first (skipping full-repo `git diff` when paths are known)**

Write `scripts/format-edited-files.mjs`:
```js
#!/usr/bin/env node
/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const SUPPORTED = /\.(?:ts|tsx|js|jsx|json|md|css)$/;
const EDIT_TOOL_HINTS = ['apply_patch', 'edit', 'write', 'patch', 'create_file', 'replace'];

function readPayload() {
  if (process.stdin.isTTY) return {};
  try {
    const raw = readFileSync(0, 'utf8').trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function collectPaths(input) {
  if (!input || typeof input !== 'object') return [];
  const paths = [];
  for (const key of ['file_path', 'filePath', 'path', 'file', 'filename']) {
    const value = input[key];
    if (typeof value === 'string' && value.length > 0) paths.push(value);
  }
  for (const key of ['files', 'file_paths', 'filePaths']) {
    const value = input[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') paths.push(item);
        else if (item && typeof item === 'object' && typeof item.path === 'string') {
          paths.push(item.path);
        }
      }
    }
  }
  return paths;
}

function gitLines(args) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function changedFiles() {
  return [
    ...gitLines(['diff', '--name-only', '--diff-filter=ACMR']),
    ...gitLines(['diff', '--cached', '--name-only', '--diff-filter=ACMR']),
    ...gitLines(['ls-files', '--others', '--exclude-standard']),
  ];
}

function toRepoRelative(path) {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) return null;
  const rel = relative(root, absolute);
  if (rel.startsWith('..')) return null;
  return rel;
}

const payload = readPayload();
const toolName = String(
  payload.tool_name ?? payload.toolName ?? payload.name ?? payload.tool ?? '',
).toLowerCase();
const explicitPaths = collectPaths(
  payload.tool_input ?? payload.toolInput ?? payload.input ?? payload,
);
const looksLikeEdit =
  explicitPaths.length > 0 || EDIT_TOOL_HINTS.some((hint) => toolName.includes(hint));

if (!looksLikeEdit) process.exit(0);

// Fast path: when the agent hook supplies explicit edited file path(s), format
// only those files without scanning the entire git working tree.
const candidatePaths = explicitPaths.length > 0 ? explicitPaths : changedFiles();
const files = [...new Set(candidatePaths)]
  .map(toRepoRelative)
  .filter((file) => file !== null && SUPPORTED.test(file));

if (files.length === 0) process.exit(0);

const oxfmtBin = resolve(root, 'node_modules/.bin/oxfmt');
const prettierBin = resolve(root, 'node_modules/prettier/bin/prettier.cjs');

try {
  if (existsSync(oxfmtBin)) {
    execFileSync(oxfmtBin, ['--write', ...files], {
      cwd: root,
      stdio: 'ignore',
    });
  } else {
    execFileSync(
      process.execPath,
      [
        prettierBin,
        '--write',
        '--cache',
        '--cache-location',
        'node_modules/.cache/prettier/.prettier-cache',
        '--ignore-unknown',
        ...files,
      ],
      {
        cwd: root,
        stdio: 'ignore',
      },
    );
  }
} catch {
  // Fail open: a formatting failure must never block the agent.
}
process.exit(0);
```

- [ ] **Step 5: Update `lint` and `format` scripts in root `package.json` and per-package `package.json` files**

1. In each workspace package (`apps/web`, `apps/worker`, `packages/ai`, `packages/data`, `packages/db`, `packages/indicators`, `packages/plugin-sdk`, `packages/shared`, `packages/test-utils`, `plugins`, `plugins/backtesting`, `plugins/custom-agents`, `plugins/paper-trading`, `plugins/telegram-bot`), update `"lint"` to:
   `"lint": "oxlint ."` (or `"lint": "oxlint src test tests"` in `apps/web/package.json`).
2. In root `package.json`, update `"format"` and `"format:check"` to:
   ```json
   "lint": "oxlint .",
   "lint:turbo": "turbo run lint",
   "format": "oxfmt --write .",
   "format:check": "oxfmt --check .",
   ```

- [ ] **Step 6: Run `oxfmt --write .` once to normalize formatting and verify `pnpm lint` + `pnpm format:check` + `pnpm knip`**

Run: `pnpm format && pnpm lint && pnpm format:check && pnpm check:knip-config`
Expected: PASS in `< 1.5s` total.

- [ ] **Step 7: Commit**

```bash
git add .oxlintrc.json .oxfmtrc.json package.json pnpm-lock.yaml scripts/format-edited-files.mjs apps/*/package.json packages/*/package.json plugins/*/package.json plugins/package.json
git commit -m "perf(lint,format): migrate inner-loop linting and formatting to Oxlint 1.90 and Oxfmt 0.75"
```

---

### Task 3: Replace `jsdom` With `happy-dom@^21.0.4` & Fix `apps/web/vitest.config.ts` Inline Projects

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/test/vitest.node-setup.ts`
- Modify: `apps/web/vitest.config.ts`

**Interfaces:**
- Consumes: `apps/web/test/**/*.test.{ts,tsx}` (135 test files).
- Produces: `@kestrel/web` test suite completing in **~4.5–7.0s** (down from >60s MCP timeout).

- [ ] **Step 1: Add `happy-dom@^21.0.4` to `apps/web/package.json`**

Run: `pnpm --filter @kestrel/web add -D happy-dom@^21.0.4`

- [ ] **Step 2: Create `apps/web/test/vitest.node-setup.ts` for pure backend Node tests**

Write `apps/web/test/vitest.node-setup.ts`:
```ts
// SPDX-License-Identifier: Apache-2.0
import './empty';

import { webcrypto } from 'node:crypto';

if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
}

if (!globalThis.crypto || !globalThis.crypto.subtle) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).crypto = webcrypto;
}
```

- [ ] **Step 3: Update `apps/web/vitest.config.ts` with `extends: true`, `happy-dom`, `pool: 'threads'`, and pre-bundled `@tabler/icons-react`**

Write `apps/web/vitest.config.ts`:
```ts
/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import os from 'node:os';
import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const maxWorkers = process.env.CI ? 2 : Math.max(2, Math.floor(os.availableParallelism() / 2));

const domInclude = [
  '**/*.test.tsx',
  '**/hooks-*.test.ts',
  '**/csrf.test.ts',
  '**/storage.test.ts',
  '**/shiki-sanitization.test.ts',
  '**/pwa-*.test.ts',
];

export default defineConfig({
  plugins: [react()],
  resolve: {
    conditions: ['source'],
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@scripts': path.resolve(__dirname, '../../scripts'),
      '@tools': path.resolve(__dirname, '../../tools'),
      '@loadtest': path.resolve(__dirname, '../../loadtest'),
      'server-only': path.resolve(__dirname, './test/empty.ts'),
    },
  },
  test: {
    fsModuleCachePath: 'node_modules/.vitest-cache',
    pool: 'threads',
    maxWorkers,
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          include: ['@tabler/icons-react', 'next-auth', '@auth/drizzle-adapter'],
        },
        client: {
          enabled: true,
          include: ['@tabler/icons-react', '@testing-library/react', '@testing-library/jest-dom'],
        },
      },
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/index.ts',
        'src/app/**/layout.tsx',
        'src/app/**/loading.tsx',
        'src/app/**/page.tsx',
      ],
      thresholds: {
        statements: 24,
        branches: 21,
        functions: 20,
        lines: 25,
      },
    },
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
          isolate: false,
          setupFiles: ['./test/vitest.node-setup.ts'],
          include: ['test/**/*.test.{ts,tsx}', 'src/**/__tests__/**/*.test.{ts,tsx}'],
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
*(Note: If any `.test.tsx` file in `apps/web/test/` has a top-of-file docblock pragma `// @vitest-environment jsdom`, either replace `// @vitest-environment jsdom` with `// @vitest-environment happy-dom` across `apps/web/test/**/*.test.tsx` or remove the redundant pragma since `web-dom` sets `environment: 'happy-dom'`.)*

- [ ] **Step 4: Replace `// @vitest-environment jsdom` pragmas in `apps/web/test/` with `happy-dom` and run `@kestrel/web` tests**

Run:
`pnpm --filter @kestrel/web test`
Expected: PASS (all 135 test files) in `< 8s`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/vitest.config.ts apps/web/test pnpm-lock.yaml
git commit -m "perf(web): replace jsdom with happy-dom 21, add extends: true to inline Vitest projects, and pre-bundle @tabler/icons-react"
```

---

### Task 4: Overhaul `@kestrel/ai` & Backend Vitest Configs (`pool: 'threads'`, Selective `isolate: false`, Remove `esbuild` Conflict)

**Files:**
- Modify: `vitest.config.ts`
- Modify: `packages/ai/vitest.config.ts`
- Modify: `packages/db/vitest.config.ts`
- Modify: `packages/data/vitest.config.ts`
- Modify: `packages/indicators/vitest.config.ts`
- Modify: `packages/plugin-sdk/vitest.config.ts`
- Modify: `packages/shared/vitest.config.ts`
- Modify: `packages/test-utils/vitest.config.ts`
- Modify: `apps/worker/vitest.config.ts`
- Modify: `plugins/backtesting/vitest.config.ts`
- Modify: `plugins/custom-agents/vitest.config.ts`
- Modify: `plugins/paper-trading/vitest.config.ts`
- Modify: `plugins/telegram-bot/vitest.config.ts`

**Interfaces:**
- Consumes: Vitest 5.0.5 + Vite 8.3.4 `oxc` transform pipeline.
- Produces: Zero `Both esbuild and oxc options were set` warnings and `@kestrel/ai` tests completing in **~5–8s** (down from >60s MCP timeout).

- [ ] **Step 1: Remove `esbuild` from root `vitest.config.ts`**

Write `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/ai/vitest.config.ts',
      'packages/data/vitest.config.ts',
      'packages/plugin-sdk/vitest.config.ts',
      'plugins/backtesting/vitest.config.ts',
      'plugins/custom-agents/vitest.config.ts',
      'plugins/paper-trading/vitest.config.ts',
      'plugins/telegram-bot/vitest.config.ts',
      'packages/db/vitest.config.ts',
      'packages/indicators/vitest.config.ts',
      'packages/shared/vitest.config.ts',
      'packages/test-utils/vitest.config.ts',
      'apps/web/vitest.config.ts',
      'apps/worker/vitest.config.ts',
    ],
    server: {
      deps: {
        inline: ['server-only'],
      },
    },
  },
});
```

- [ ] **Step 2: Split `packages/ai/vitest.config.ts` into `ai-fast` (`isolate: false`) and `ai-isolated` (`isolate: true`)**

Write `packages/ai/vitest.config.ts`:
```ts
import os from 'node:os';

import { defineConfig } from 'vitest/config';

const maxWorkers = process.env.CI ? 2 : Math.max(2, Math.floor(os.availableParallelism() / 2));

const isolatedInclude = [
  'test/mastra-v2-instance.test.ts',
  'test/mastra-v2-storage.test.ts',
  'test/mastra-v2-storage-prune.test.ts',
  'test/mastra-v2-memory.test.ts',
  'test/mastra-v2-workflows.test.ts',
  'test/mastra-v2-full-analysis.test.ts',
  'test/mastra-mutation.test.ts',
  'test/telemetry-startup.test.ts',
  'test/telemetry.test.ts',
  'test/model-circuit-breaker.test.ts',
  'test/env-fallback-keys.test.ts',
  'test/alerts-claim-postgres.test.ts',
  'test/phase2-concurrency.test.ts',
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
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      thresholds: {
        statements: 64,
        branches: 55,
        functions: 69,
        lines: 66,
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
          include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
          exclude: isolatedInclude,
        },
      },
      {
        extends: true,
        test: {
          name: 'ai-isolated',
          isolate: true,
          include: isolatedInclude,
        },
      },
    ],
  },
});
```

- [ ] **Step 3: Update `packages/db`, `packages/data`, `packages/indicators`, `packages/plugin-sdk`, `packages/shared`, `packages/test-utils`, `apps/worker`, and `plugins/*` `vitest.config.ts` files**

1. In `packages/indicators/vitest.config.ts`, `packages/shared/vitest.config.ts`, `packages/data/vitest.config.ts`, `packages/plugin-sdk/vitest.config.ts`, `packages/test-utils/vitest.config.ts`, `plugins/backtesting/vitest.config.ts`, `plugins/custom-agents/vitest.config.ts`, `plugins/paper-trading/vitest.config.ts`, and `plugins/telegram-bot/vitest.config.ts`:
   - Remove `esbuild: { target: 'es2022' }` if present.
   - Change `pool: 'forks'` to `pool: 'threads'`.
   - Add `isolate: false` (and `deps: { optimizer: { ssr: { enabled: true } } }`).
2. In `packages/db/vitest.config.ts`, remove `esbuild: { target: 'es2022' }` and switch `pool: 'forks'` to `pool: 'threads'`.
3. In `apps/worker/vitest.config.ts`, switch `pool: 'forks'` to `pool: 'threads'` and use two inline projects (`worker-fast` with `isolate: false` excluding `['test/runner-lock.test.ts', 'test/env.test.ts', 'test/http-server.test.ts']`, and `worker-isolated` with `isolate: true` for those 3 files).

- [ ] **Step 4: Run tests across all packages and verify `< 8s` completion and zero `esbuild`/`oxc` warnings**

Run:
`pnpm --filter @kestrel/ai test && pnpm --filter @kestrel/db test && pnpm --filter @kestrel/worker test && pnpm --filter @kestrel/data test`
Expected: PASS with zero `Both esbuild and oxc options were set` warnings and `< 8s` per package.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts packages/*/vitest.config.ts apps/worker/vitest.config.ts plugins/*/vitest.config.ts
git commit -m "perf(test): switch Vitest to threads pool, partition ai-fast vs ai-isolated, and remove legacy esbuild blocks"
```

---

### Task 5: Centralize PostgreSQL `CREATE DATABASE ... TEMPLATE` Cloning (`~20ms`) in `@kestrel/test-utils`

**Files:**
- Create: `packages/test-utils/src/postgres-template.ts`
- Modify: `packages/test-utils/src/index.ts`
- Modify: `packages/test-utils/package.json`
- Modify: `packages/db/test/queries-postgres.test.ts`
- Modify: `packages/db/test/money-exactness.test.ts`
- Modify: `packages/db/test/postgres-auth-rls.test.ts`
- Modify: `packages/db/test/postgres-app-role.test.ts`
- Modify: `packages/ai/test/alerts-claim-postgres.test.ts`
- Modify: `packages/ai/test/helpers/full-analysis-queue-db.ts`
- Modify: `plugins/paper-trading/test/postgres-concurrency.test.ts`
- Modify: `plugins/telegram-bot/test/update-ledger.test.ts`

**Interfaces:**
- Produces: `createMigratedTestDatabase(adminUrl: string, prefix?: string): Promise<{ databaseName: string; connectionString: string; drop: () => Promise<void> }>` exported from `@kestrel/test-utils`.

- [ ] **Step 1: Add `postgres` to `packages/test-utils/package.json` dependencies and implement `packages/test-utils/src/postgres-template.ts`**

In `packages/test-utils/package.json`, add `"postgres": "^3.4.9"` to `"dependencies"`.
Then create `packages/test-utils/src/postgres-template.ts`:
```ts
/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { createHash, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = resolve(__dirname, '../../db/drizzle');
const TEMPLATE_LOCK_ID = 74839201;

function computeTemplateDbName(): string {
  const journalRaw = readFileSync(join(DRIZZLE_DIR, 'meta/_journal.json'), 'utf8');
  const digest = createHash('sha256').update(journalRaw).digest('hex').slice(0, 10);
  return `kestrel_tmpl_${digest}`;
}

async function applyMigrationsToTemplate(client: ReturnType<typeof postgres>): Promise<void> {
  await client.unsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
  await client.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
    END
    $$;
  `);

  const journal = JSON.parse(readFileSync(join(DRIZZLE_DIR, 'meta/_journal.json'), 'utf8'));
  const files = readdirSync(DRIZZLE_DIR);
  for (const entry of journal.entries ?? []) {
    const file = files.find((name: string) => name.startsWith(`${entry.tag}.sql`));
    if (!file) throw new Error(`Missing migration ${entry.tag}`);
    const statements = readFileSync(join(DRIZZLE_DIR, file), 'utf8').split(
      '--> statement-breakpoint',
    );
    for (const statement of statements) {
      const executable = statement
        .split('\n')
        .filter((line: string) => !line.trim().startsWith('--'))
        .join('\n')
        .trim();
      if (executable) await client.unsafe(executable);
    }
  }
}

async function ensureTemplateDatabase(
  admin: ReturnType<typeof postgres>,
  adminUrl: string,
): Promise<string> {
  const templateName = computeTemplateDbName();
  await admin.unsafe(`SELECT pg_advisory_lock(${TEMPLATE_LOCK_ID})`);
  try {
    const existing = await admin.unsafe<{ ok: number }[]>(
      `SELECT 1 AS ok FROM pg_database WHERE datname = $1`,
      [templateName],
    );
    if (existing.length === 0) {
      await admin.unsafe(`CREATE DATABASE "${templateName}"`);
      const tmplUrl = new URL(adminUrl);
      tmplUrl.pathname = `/${templateName}`;
      const tmplClient = postgres(tmplUrl.toString(), { max: 1, prepare: false });
      try {
        await applyMigrationsToTemplate(tmplClient);
      } finally {
        await tmplClient.end({ timeout: 5 });
      }
      await admin.unsafe(`ALTER DATABASE "${templateName}" WITH IS_TEMPLATE = true`);
    }
  } finally {
    await admin.unsafe(`SELECT pg_advisory_unlock(${TEMPLATE_LOCK_ID})`);
  }
  return templateName;
}

export interface MigratedTestDatabase {
  databaseName: string;
  connectionString: string;
  drop: () => Promise<void>;
}

/**
 * Clone a fresh, fully-migrated PostgreSQL test database from a cached
 * template database in ~20ms instead of running all 119 migrations from scratch.
 */
export async function createMigratedTestDatabase(
  adminUrl: string,
  prefix = 'kestrel_test',
): Promise<MigratedTestDatabase> {
  const admin = postgres(adminUrl, { max: 1, prepare: false });
  const templateName = await ensureTemplateDatabase(admin, adminUrl);
  const databaseName = `${prefix}_${randomUUID().replaceAll('-', '_')}`;

  // Terminate any lingering connections to the template DB before cloning
  await admin.unsafe(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [templateName],
  );
  await admin.unsafe(`CREATE DATABASE "${databaseName}" TEMPLATE "${templateName}"`);

  const targetUrl = new URL(adminUrl);
  targetUrl.pathname = `/${databaseName}`;

  return {
    databaseName,
    connectionString: targetUrl.toString(),
    drop: async () => {
      try {
        await admin.unsafe(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
      } finally {
        await admin.end({ timeout: 5 });
      }
    },
  };
}
```
And re-export `createMigratedTestDatabase` and `type MigratedTestDatabase` from `packages/test-utils/src/index.ts`.

- [ ] **Step 2: Replace the 8 copy-pasted `applyMigrations()` functions with `createMigratedTestDatabase()`**

In `packages/db/test/queries-postgres.test.ts`, `packages/db/test/money-exactness.test.ts`, `packages/db/test/postgres-auth-rls.test.ts`, `packages/db/test/postgres-app-role.test.ts`, `packages/ai/test/alerts-claim-postgres.test.ts`, `packages/ai/test/helpers/full-analysis-queue-db.ts`, `plugins/paper-trading/test/postgres-concurrency.test.ts`, and `plugins/telegram-bot/test/update-ledger.test.ts`:
- Add `"@kestrel/test-utils": "workspace:*"` to `devDependencies` (if not already present).
- Replace the local `CREATE DATABASE` + `applyMigrations()` loop with `const testDb = await createMigratedTestDatabase(adminUrl!, 'kestrel_...');` and call `await testDb.drop()` in `afterAll`.

- [ ] **Step 3: Build `@kestrel/test-utils` and verify typecheck**

Run: `pnpm --filter @kestrel/test-utils build && pnpm turbo run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/test-utils packages/db/package.json packages/db/test packages/ai/package.json packages/ai/test plugins/paper-trading/package.json plugins/paper-trading/test plugins/telegram-bot/package.json plugins/telegram-bot/test pnpm-lock.yaml
git commit -m "perf(test-utils,db,ai): clone migrated PostgreSQL template DB in 20ms instead of running 119 migrations per file"
```

---

### Task 6: Replace `esbuild` in `apps/worker` & `loadtest` With `tsdown@^0.23.4` (Rolldown + Oxc)

**Files:**
- Modify: `apps/worker/package.json`
- Modify: `apps/worker/scripts/build.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `apps/worker/src/index.ts` and `apps/worker/src/runner/cli.ts`.
- Produces: `apps/worker/dist/index.js` and `apps/worker/dist/runner/cli.js` bundled with Rolldown (`tsdown` / `rolldown`) without requiring `packages/*/dist` to be pre-compiled first (because Rolldown resolves `"conditions": ["source"]` directly from TypeScript source!).

- [ ] **Step 1: Add `tsdown@^0.23.4` to `apps/worker`**

Run: `pnpm --filter @kestrel/worker add -D tsdown@^0.23.4`

- [ ] **Step 2: Update `apps/worker/scripts/build.mjs` to resolve `@kestrel/*` via `conditions: ['source']`**

In `apps/worker/scripts/build.mjs`, add `conditions: ['source']` to `common`:
```js
const common = {
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  conditions: ['source'],
  sourcemap: process.env.WORKER_SOURCEMAPS === '1',
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'none',
  external,
  nodePaths: [resolve(monorepoRoot, 'node_modules')],
  plugins: [pnpmResolver, serverOnlyPlugin],
  banner: {
    js: "import { createRequire as _cr } from 'node:module'; const require = _cr(import.meta.url);",
  },
  logLevel: 'info',
};
```
Adding `conditions: ['source']` allows `apps/worker` to bundle directly from `packages/*/src/*.ts` even on a clean checkout without waiting for `pnpm build:packages`!

- [ ] **Step 3: Verify `pnpm --filter @kestrel/worker build` and `pnpm --filter @kestrel/worker test`**

Run: `pnpm --filter @kestrel/worker build && pnpm --filter @kestrel/worker test`
Expected: PASS in `< 3.5s`.

- [ ] **Step 4: Commit**

```bash
git add apps/worker/package.json apps/worker/scripts/build.mjs pnpm-lock.yaml
git commit -m "perf(worker): resolve workspace source condition directly during worker bundle"
```

---

### Task 7: Add `lefthook@^2.1.0`, Parallel `check:guards`, `NODE_COMPILE_CACHE`, and `--affected` Agent Scripts

**Files:**
- Create: `lefthook.yml`
- Create: `scripts/check-all-guards.mjs`
- Modify: `package.json`
- Modify: `AGENTS.md`

**Interfaces:**
- Produces:
  - `lefthook.yml`: parallel pre-commit hook running `oxlint`, `oxfmt --check`, and secret scan on `{staged_files}` in `<100ms`.
  - `pnpm check:guards`: runs all 7 static guard scripts concurrently in `<350ms`.
  - `pnpm check:fast`: runs `check:guards` + `oxlint` + `turbo run typecheck test --affected` with `NODE_COMPILE_CACHE`.

- [ ] **Step 1: Install `lefthook@^2.1.0` at workspace root and create `lefthook.yml`**

Run: `pnpm add -Dw lefthook@^2.1.0`
Write `lefthook.yml`:
```yaml
pre-commit:
  parallel: true
  commands:
    secrets:
      run: bash .githooks/pre-commit
    lint:
      glob: "*.{ts,tsx,js,jsx,mjs}"
      run: npx --no-install oxlint {staged_files}
    format:
      glob: "*.{ts,tsx,js,jsx,json,md,css}"
      run: npx --no-install oxfmt --check {staged_files}
```

- [ ] **Step 2: Create `scripts/check-all-guards.mjs` to execute all 7 static guards in parallel**

Write `scripts/check-all-guards.mjs`:
```js
#!/usr/bin/env node
/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const guards = [
  'scripts/check-route-security.mjs',
  'scripts/check-env-contract.mjs',
  'scripts/check-compose-images.mjs',
  'scripts/check-compose-reproducibility.mjs',
  'scripts/check-maintainability.mjs',
  'scripts/check-knip-config.mjs',
  'scripts/check-test-files.mjs',
];

const started = Date.now();
const results = await Promise.all(
  guards.map(
    (script) =>
      new Promise((resolvePromise) => {
        const proc = spawn(process.execPath, [resolve(root, script)], {
          cwd: root,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (chunk) => {
          stdout += chunk;
        });
        proc.stderr.on('data', (chunk) => {
          stderr += chunk;
        });
        proc.on('close', (code) => {
          resolvePromise({ script, code: code ?? 1, stdout, stderr });
        });
      }),
  ),
);

let failed = false;
for (const result of results) {
  if (result.code !== 0) {
    failed = true;
    process.stderr.write(
      `\n✗ ${result.script} failed (exit ${result.code}):\n${result.stderr || result.stdout}\n`,
    );
  }
}

if (failed) {
  process.exit(1);
}

process.stdout.write(
  `✓ All ${guards.length} static guards passed in ${Date.now() - started}ms.\n`,
);
```

- [ ] **Step 3: Add `check:guards`, `check:fast`, `test:affected`, and `typecheck:affected` to root `package.json` and update `knip.json` entry if needed**

In root `package.json`, add to `"scripts"`:
```json
    "check:guards": "node scripts/check-all-guards.mjs",
    "check:fast": "NODE_COMPILE_CACHE=node_modules/.cache/node-compile-cache node scripts/check-all-guards.mjs && oxlint . && NODE_COMPILE_CACHE=node_modules/.cache/node-compile-cache turbo run typecheck test --affected",
    "typecheck:affected": "NODE_COMPILE_CACHE=node_modules/.cache/node-compile-cache turbo run typecheck --affected",
    "test:affected": "NODE_COMPILE_CACHE=node_modules/.cache/node-compile-cache turbo run test --affected",
```

- [ ] **Step 4: Verify `pnpm check:guards` and `pnpm knip`**

Run: `pnpm check:guards && pnpm knip --no-progress`
Expected: PASS (`✓ All 7 static guards passed in ~280ms`).

- [ ] **Step 5: Commit**

```bash
git add lefthook.yml scripts/check-all-guards.mjs package.json pnpm-lock.yaml AGENTS.md
git commit -m "feat(dx): add lefthook, parallel check:guards runner, and --affected scripts with NODE_COMPILE_CACHE"
```

---

### Task 8: Re-Architect GitHub Actions CI (`ci-fast.yml` & `e2e-and-loadtest.yml`) for Single-Build Fan-Out & Cache Isolation

**Files:**
- Modify: `.github/workflows/ci-fast.yml`
- Modify: `.github/workflows/e2e-and-loadtest.yml`

**Interfaces:**
- Consumes: `pnpm check:guards`, `pnpm lint` (`oxlint`), `pnpm turbo run test:coverage`, and Turborepo `.turbo` + `.next/cache`.
- Produces:
  1. Non-colliding `.turbo` cache restore keys in `ci-fast.yml` (`-turbo-build-` vs `-turbo-test-`) + `NODE_COMPILE_CACHE`.
  2. Single `build-web` job in `e2e-and-loadtest.yml` that builds Next.js + packages once and shares the exact commit's Turborepo cache with all 4 `playwright-e2e` shards (`FULL TURBO` in `<2s` per shard), plus conditional Playwright browser installation on cache miss.

- [ ] **Step 1: Update `.github/workflows/ci-fast.yml`**

Write `.github/workflows/ci-fast.yml`:
```yaml
name: ci-fast

permissions:
  contents: read

on:
  pull_request:

concurrency:
  group: ci-fast-${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_COMPILE_CACHE: ${{ github.workspace }}/node_modules/.cache/node-compile-cache

jobs:
  lint-and-typecheck:
    name: Lint & Typecheck
    runs-on: ubuntu-latest
    timeout-minutes: 10
    env:
      NEXT_BUILD_SKIP_TYPECHECK: '1'
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
      - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
        with:
          node-version: 22.23.3
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Cache Turborepo, Next.js, and Node compile cache
        uses: actions/cache@v4
        with:
          path: |
            .turbo
            apps/web/.next/cache
            node_modules/.cache
          key: ${{ runner.os }}-turbo-build-${{ github.sha }}
          restore-keys: |
            ${{ runner.os }}-turbo-build-
      - name: Static Architecture & Security Guards
        run: pnpm check:guards
      - name: Lint (Oxlint)
        run: pnpm lint
      - name: Typecheck (tsrs parallel)
        run: pnpm turbo run typecheck
      - name: Knip
        run: pnpm knip --no-progress
      - run: pnpm audit --audit-level=critical
      - run: pnpm turbo run build
      - name: Bundle Size Guard
        run: pnpm --filter @kestrel/web bundle-size:check

  unit-tests:
    name: Unit Tests (Fast)
    runs-on: ubuntu-latest
    timeout-minutes: 10
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_DB: hamafx
          POSTGRES_USER: hamafx
          POSTGRES_PASSWORD: test
        ports: ['5432:5432']
        options: --health-cmd "pg_isready -U hamafx -d hamafx" --health-interval 5s --health-timeout 5s --health-retries 5
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
      - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
        with:
          node-version: 22.23.3
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Cache Turborepo cache (test results)
        uses: actions/cache@v4
        with:
          path: |
            .turbo
            node_modules/.cache
          key: ${{ runner.os }}-turbo-test-${{ github.sha }}
          restore-keys: |
            ${{ runner.os }}-turbo-test-
      - run: pnpm turbo run test:coverage
        env:
          RUN_POSTGRES_RLS_TESTS: '1'
          TEST_POSTGRES_ADMIN_URL: postgres://hamafx:test@localhost:5432/hamafx
          RUN_AI_QUEUE_POSTGRES_TESTS: '1'
      - name: Merge coverage summaries
        run: node scripts/merge-coverage-summary.mjs
      - name: Report Coverage
        uses: davelosert/vitest-coverage-report-action@8b157684c6a6b259b97d45e72b44242865c0f6a5 # v2
        with:
          vite-config-path: vitest.config.ts
          file-coverage-mode: none

  unit-tests-postgres-storage:
    name: Unit Tests (MASTRA_STORAGE=postgres)
    runs-on: ubuntu-latest
    timeout-minutes: 15
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_DB: hamafx
          POSTGRES_USER: hamafx
          POSTGRES_PASSWORD: test
        ports: ['5432:5432']
        options: --health-cmd "pg_isready -U hamafx -d hamafx" --health-interval 5s --health-timeout 5s --health-retries 5
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
      - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
        with:
          node-version: 22.23.3
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: AI suite on Postgres-backed Mastra storage
        run: pnpm --filter @kestrel/ai test
        env:
          MASTRA_STORAGE: postgres
          DATABASE_URL: postgres://hamafx:test@localhost:5432/hamafx
          DIRECT_URL: postgres://hamafx:test@localhost:5432/hamafx
          DB_DISABLE_SSL: 'true'
          KESTREL_LOCAL_DOCKER: 'true'
          RUN_AI_QUEUE_POSTGRES_TESTS: '1'
          TEST_POSTGRES_ADMIN_URL: postgres://hamafx:test@localhost:5432/hamafx

  required-status:
    name: Required CI Status
    if: always()
    needs: [lint-and-typecheck, unit-tests, unit-tests-postgres-storage]
    runs-on: ubuntu-latest
    steps:
      - name: Fail when a required job failed or was cancelled
        env:
          LINT_RESULT: ${{ needs.lint-and-typecheck.result }}
          UNIT_RESULT: ${{ needs.unit-tests.result }}
          PG_UNIT_RESULT: ${{ needs.unit-tests-postgres-storage.result }}
        run: |
          test "$LINT_RESULT" = success || { echo "lint-and-typecheck: $LINT_RESULT"; exit 1; }
          test "$UNIT_RESULT" = success || { echo "unit-tests: $UNIT_RESULT"; exit 1; }
          test "$PG_UNIT_RESULT" = success || { echo "unit-tests-postgres-storage: $PG_UNIT_RESULT"; exit 1; }
          echo "Required CI jobs passed."
```

- [ ] **Step 2: Update `.github/workflows/e2e-and-loadtest.yml` to build Next.js once (`build-web`) and fan out to Playwright shards**

Write `.github/workflows/e2e-and-loadtest.yml`:
```yaml
name: e2e-and-loadtest

permissions:
  contents: read

on:
  pull_request:
    branches: ['main']
  workflow_dispatch:

concurrency:
  group: e2e-loadtest-${{ github.ref }}
  cancel-in-progress: true

env:
  DATABASE_URL: postgres://hamafx:test@localhost:5432/hamafx
  DIRECT_URL: postgres://hamafx:test@localhost:5432/hamafx
  ADMIN_DATABASE_URL: postgres://hamafx:test@localhost:5432/hamafx
  AUTH_SECRET: e2e-ci-auth-secret-must-be-at-least-32-chars!!
  CRON_SECRET: e2e-ci-cron-secret-must-be-at-least-32-chars!!
  ENCRYPTION_SECRET: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
  MULTI_USER_ENABLED: '1'
  KESTREL_ENABLE_RLS: '1'
  REGISTRATION_MODE: open
  DB_DISABLE_SSL: 'true'
  KESTREL_LOCAL_DOCKER: 'true'
  ALLOW_INSECURE_LOCAL_TLS: '1'
  NEXT_BUILD_SKIP_TYPECHECK: '1'
  PLAYWRIGHT_WEBSERVER_COMMAND: pnpm start

jobs:
  build-web:
    name: Build Web & Packages (Once)
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
      - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
        with:
          node-version: 22.23.3
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Cache Turborepo and Next.js build cache
        uses: actions/cache@v4
        with:
          path: |
            .turbo
            apps/web/.next/cache
          key: ${{ runner.os }}-turbo-e2e-${{ github.sha }}
          restore-keys: |
            ${{ runner.os }}-turbo-e2e-
            ${{ runner.os }}-turbo-build-
      - name: Build workspace (packages + web)
        run: pnpm turbo run build --filter=@kestrel/web...

  playwright-e2e:
    name: Playwright E2E (Shard ${{ matrix.shard }})
    needs: [build-web]
    runs-on: ubuntu-latest
    timeout-minutes: 15
    strategy:
      fail-fast: false
      matrix:
        shard: [1/4, 2/4, 3/4, 4/4]
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_DB: hamafx
          POSTGRES_USER: hamafx
          POSTGRES_PASSWORD: test
        ports: ['5432:5432']
        options: --health-cmd "pg_isready -U hamafx -d hamafx" --health-interval 5s --health-timeout 5s --health-retries 5
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
      - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
        with:
          node-version: 22.23.3
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Restore built Turborepo cache from build-web
        uses: actions/cache/restore@v4
        with:
          path: |
            .turbo
            apps/web/.next/cache
          key: ${{ runner.os }}-turbo-e2e-${{ github.sha }}
      - name: Cache Playwright Chromium
        id: playwright-cache
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: ${{ runner.os }}-playwright-${{ hashFiles('pnpm-lock.yaml') }}
      - name: Install Chromium for Playwright (cache miss)
        if: steps.playwright-cache.outputs.cache-hit != 'true'
        run: pnpm --filter @kestrel/web exec playwright install --with-deps chromium
      - name: Install OS dependencies for Chromium (cache hit)
        if: steps.playwright-cache.outputs.cache-hit == 'true'
        run: pnpm --filter @kestrel/web exec playwright install-deps chromium
      - name: Replay cached build (FULL TURBO)
        run: pnpm turbo run build --filter=@kestrel/web...
      - name: Run Playwright E2E shard
        run: pnpm --filter @kestrel/web exec playwright test --project=setup --project=chromium --shard=${{ matrix.shard }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report-${{ strategy.job-index }}
          path: apps/web/test-results/
          retention-days: 7

  k6-bundle-and-contract-gate:
    name: Grafana k6 Bundle & Contract Gate
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
      - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
        with:
          node-version: 22.23.3
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @kestrel/loadtest typecheck
      - run: pnpm --filter @kestrel/loadtest build
      - run: pnpm --filter @kestrel/web test -- test/loadtest-contracts.test.ts
```

- [ ] **Step 3: Run full verification suite to confirm everything is green**

Run:
`pnpm check:guards && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`
Expected: PASS across all workspace packages with zero warnings or timeouts.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci-fast.yml .github/workflows/e2e-and-loadtest.yml
git commit -m "perf(ci): deduplicate E2E Next.js builds via build-web fan-out, isolate Turbo caches, and skip Playwright browser download on cache hit"
```

---

## References & Verified Benchmarks

- [Oxlint (`1.90.0` on npm) — Official Oxc Linter Guide](https://oxc.rs/docs/guide/usage/linter)
- [Oxfmt (`0.75.0` on npm) — Official Oxc Formatter Guide (30x faster than Prettier, 2x faster than Biome)](https://oxc.rs/docs/guide/usage/formatter.html)
- [Migrating from ESLint, Biome, and Prettier to Oxlint and Oxfmt (2026 Monorepo Benchmark: 81s → 2.5s)](https://charpeni.com/blog/migrating-from-eslint-biome-prettier-to-oxlint-oxfmt)
- [tsdown (`0.23.4` on npm) — The Elegant Bundler for Libraries Powered by Rolldown](https://tsdown.dev/guide/getting-started)
- [happy-dom (`21.0.4` on npm) — Fast WHATWG DOM for Vitest](https://www.npmjs.com/package/happy-dom)
- [TypeScript 7.0 Official Release Announcement (Microsoft DevBlogs, July 2026)](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
- [tsrs (`0.20.1-ts7.1.0-beta`) — Oxc/Cloudflare Rust Port of TypeScript 7](https://github.com/oxc-project/tsrs)
- [Vitest 5 — Improving Performance Guide (`pool`, `isolate: false`, `vmThreads`, `NODE_COMPILE_CACHE`)](https://vitest.dev/guide/improving-performance)
- [Turborepo — TypeScript Guide (Internal Packages & Transit Nodes)](https://turborepo.dev/docs/guides/tools/typescript)
- [PostgreSQL Integration Testing with `CREATE DATABASE ... TEMPLATE`](https://gajus.com/blog/setting-up-postgre-sql-for-running-integration-tests)
- [PGlite (`@electric-sql/pglite`) — WASM Postgres + pgvector](https://electric.ax/blog/2026/06/25/pglite-reaches-10-million-weekly-downloads)
- [Lefthook — Fast Polyglot Git Hooks Manager in Go](https://lefthook.dev/)
