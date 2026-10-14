# Kestrel Phase 1 Technical Audit — Monorepo Foundation, Boundaries, Type Contracts & Dead Code

- **Repository:** [`HamaFx/Kestrel`](https://github.com/HamaFx/Kestrel)
- **Audited Commit (`main` HEAD):** [`19167d075c1e05d77cb033e1e05d77cb033e1e7239deb892b0554`](https://github.com/HamaFx/Kestrel/commit/19167d075c1e05d77cb033e1e7239deb892b0554) (`2026-10-14T15:14:04Z`)
- **Scope:** `apps/web`, `apps/worker`, `packages/ai`, `packages/data`, `packages/db`, `packages/indicators`, `packages/shared`, `packages/config`, `packages/test-utils`, `loadtest`, root Turborepo/pnpm configuration, `scripts/`, and `docs/`
- **Mode:** Read-Only Gate (Zero application files modified)

## 1. Executive Health Summary

Kestrel's monorepo foundation is structurally mature—featuring strict ESM package boundaries, Zod environment schemas, PostgreSQL 16 + pgvector Row-Level Security (RLS), and CI gates for route security and environment contracts. However, recent rapid velocity across Audit v2 ([`6c0f7d7`](https://github.com/HamaFx/Kestrel/commit/6c0f7d7b97aa1412e92d1539750e92b8a0d80d6e)) and CI/test pipeline optimizations ([`0d01e14`](https://github.com/HamaFx/Kestrel/commit/0d01e1455920e7c51eedacc1cd192fd054ae14af), [`8b18a11`](https://github.com/HamaFx/Kestrel/commit/8b18a11cbea2676baad337cdb0b3c3226baee7c0), [`83cd16d`](https://github.com/HamaFx/Kestrel/commit/83cd16daa3ede9c2a5c198f55de1e7d79051abc3), [`fb04b5e`](https://github.com/HamaFx/Kestrel/commit/fb04b5e34fa254d3c8797dab05e73a8b602b6dc4)) introduced **16 concrete architectural, build-graph, type-contract, and documentation regressions** (`2 P0-Critical`, `5 P1-High`, `6 P2-Medium`, `3 P3-Low`).

| Audit Pillar                            | Health Rating             | Key Strengths                                                                                                                                         | Critical / High Risks Identified                                                                                                                                                                                                                                                                                                                                                                             |
| :-------------------------------------- | :------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Workspace & Turborepo Pipeline**   | **Amber (Degraded)**      | Incremental `tsc` `.tsbuildinfo` caching (`0d01e14`), deterministic build IDs, `pnpm` overrides for security advisories.                              | `turbo.json` drops `^build` from `test` while `apps/web`, `apps/worker`, and `packages/ai` lack `conditions: ['source']` (**F-01**); 5 dead subpaths in `packages/ai/package.json#exports` point to deleted files (**F-02**).                                                                                                                                                                                |
| **2. Boundary & Circular Dependencies** | **Amber (Degraded)**      | Client bundle in `apps/web` (`275` reachable client modules) is free of direct `@kestrel/db` or `node:crypto` leaks across `'use server'` boundaries. | Broken relative cross-package import in `apps/web/scripts/setup-telegram-webhook.ts:27` (**F-05**); upward import from `@kestrel/shared` test into `@kestrel/data` (**F-06**); 12 internal value-import circular dependency cycles in `packages/db` and `packages/ai` (**F-08**).                                                                                                                            |
| **3. Type Safety & Shared Contracts**   | **Red (Action Required)** | `0` `@ts-ignore` directives across the monorepo; `4` scoped `@ts-expect-error` annotations limited to unit tests.                                     | Worker `multi-agent-analysis.ts:215` casts raw `process.env` via `as unknown as` into `pickAiEnv`, leaving `"0"` strings truthy for booleans and skipping boot validation for `ENCRYPTION_SECRET` (**F-10**); `ENCRYPTION_SECRET` Zod schema accepts 32-char strings that crash AES-256-GCM at runtime (**F-11**); `apps/web` disables `exactOptionalPropertyTypes` and omits `test/` from `tsc` (**F-13**). |
| **4. Dead Code & Documentation**        | **Amber (Degraded)**      | `knip` is wired in CI for `src/` entrypoints; legacy `src/mastra/` shims were consolidated.                                                           | `4` orphaned scripts (`probe-durable.mjs`, `db-check.mjs`, `list-tables.mjs`, `setup-telegram-webhook.ts`) (**F-14**); `127` unused or test-only exports in `packages/shared` (**F-15**); `README.md`, `docs/troubleshooting.md`, `docs/release.md`, and `docker-compose.yml` contain contradictory commands and removed 5-mode diagrams (**F-16**).                                                         |

## 2. Severity-Ranked Findings Table

| ID       | Severity      | File:Line                                                                                                                                                                               | Issue                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Fix Complexity |
| :------- | :------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------- |
| **F-10** | `P0-Critical` | [`apps/worker/src/jobs/multi-agent-analysis.ts:215`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/worker/src/jobs/multi-agent-analysis.ts#L215) | Unsafe `process.env as unknown as Parameters<typeof pickAiEnv>[0]` bypasses `ServerEnvSchema` coercion (`"0"` becomes truthy `boolean`, numbers remain `string \| undefined`) and `apps/worker/src/env.ts` never validates `ENCRYPTION_SECRET` or AI env vars at boot.                                                                                                                                                                                         | **Medium**     |
| **F-11** | `P0-Critical` | [`packages/shared/src/env.ts:44`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/shared/src/env.ts#L44)                                       | `AuthEnv.ENCRYPTION_SECRET` only enforces `.min(32)` instead of 64 hex chars (`32` bytes), allowing 32-char secrets (such as `loadtest/docker-compose.loadtest.yml:113` and `README.md:285`) to pass boot validation and crash `encryptByok`/`decryptByok` (`packages/shared/src/encryption.ts:69`) at runtime.                                                                                                                                                | **Low**        |
| **F-01** | `P1-High`     | [`turbo.json:59-62`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/turbo.json#L59-L62)                                                                | `tasks.test` sets `"dependsOn": []`, but `apps/web/vitest.config.ts`, `apps/worker/vitest.config.ts`, and `packages/ai/vitest.config.ts` omit `resolve.conditions: ['source']`, causing clean-checkout or post-edit test runs to fail or execute against stale `dist/` artifacts.                                                                                                                                                                              | **Low**        |
| **F-02** | `P1-High`     | [`packages/ai/package.json:66-100`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/ai/package.json#L66-L100)                                  | Five `exports` subpaths (`./prompt`, `./portfolio`, `./notifications`, `./types`, `./verification`) reference deleted or moved `src/` and `dist/` files, causing `ERR_MODULE_NOT_FOUND` on import.                                                                                                                                                                                                                                                             | **Low**        |
| **F-05** | `P1-High`     | [`apps/web/scripts/setup-telegram-webhook.ts:27`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/web/scripts/setup-telegram-webhook.ts#L27)       | Broken relative import `../../packages/ai/src/telegram/client` resolves to non-existent `apps/packages/ai/src/telegram/client` (and deleted module path), hidden because `apps/web/tsconfig.json:14` excludes `scripts/`.                                                                                                                                                                                                                                      | **Low**        |
| **F-06** | `P1-High`     | [`packages/shared/test/storage-boundary.test.ts:1`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/shared/test/storage-boundary.test.ts#L1)   | Upward layer boundary violation: foundation package `@kestrel/shared` imports `@kestrel/data/adapters/storage` (undeclared dependency, reverse `shared -> data` edge), hidden because `packages/shared/tsconfig.json:3` excludes `test/`.                                                                                                                                                                                                                      | **Low**        |
| **F-12** | `P1-High`     | [`packages/shared/src/env-secrets.ts:65-69`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/shared/src/env-secrets.ts#L65-L69)                | `REQUIRED_HEALTH_ENV_VARS` checks deprecated `AUTH_COOKIE_SECRET` instead of `AUTH_SECRET` and omits required production secrets `ENCRYPTION_SECRET` and `ADMIN_DATABASE_URL` in `/api/health` (`apps/web/src/app/api/health/route.ts:137-150`).                                                                                                                                                                                                               | **Low**        |
| **F-03** | `P2-Medium`   | [`turbo.json:1-66`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/turbo.json#L1-L66)                                                                  | Missing `inputs` arrays on `build`/`typecheck`/`lint`/`test`, missing `packages/config/**` in `globalDependencies`, and missing `NEXT_PUBLIC_*`/`WORKER_MODE` in `build.env` cause cache invalidation on doc edits and stale cache hits on config changes.                                                                                                                                                                                                     | **Low**        |
| **F-04** | `P2-Medium`   | [`apps/web/package.json:48-49`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/web/package.json#L48-L49)                                          | Dependency & workspace config drift: `react` (`^19.2.8` in `apps/web` vs `^19.0.0` in `packages/ai`), `typescript` (`6.0.2` in `packages/config` vs `^7.0.2`), mixed exact/caret `@mastra/*` pins (`packages/ai/package.json:193-200`), redundant `packages/test-utils` in `pnpm-workspace.yaml:4`, and `target: 'node20'` in `apps/worker/scripts/build.mjs:113`.                                                                                             | **Low**        |
| **F-07** | `P2-Medium`   | [`apps/web/test/loadtest-contracts.test.ts:22-24`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/web/test/loadtest-contracts.test.ts#L22-L24)    | Cross-workspace relative imports in `apps/web/test/` (`../../../loadtest/*`, `../../../tools/lighthouse/run.mjs`, `../../../scripts/setup/*`) bypass workspace boundaries and Turborepo input tracking.                                                                                                                                                                                                                                                        | **Medium**     |
| **F-08** | `P2-Medium`   | [`packages/db/src/active-users.ts:30`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/db/src/active-users.ts#L30)                             | `12` internal value-import circular dependency cycles across `packages/db` (`index.ts` <-> `active-users.ts`, `queries/billing.ts`) and `packages/ai` (`alerts/rule-registry.ts` <-> `spec.ts`, `evaluator.ts` <-> `delivery.ts`, `bot/dispatcher.ts` <-> `help.ts`, `mastra-v2/capabilities` <-> `telemetry`).                                                                                                                                                | **Medium**     |
| **F-09** | `P2-Medium`   | [`packages/shared/src/index.ts:124-136`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/shared/src/index.ts#L124-L136)                        | Universal barrel `@kestrel/shared` has dead `export {} from './encryption'` (`:124`) and re-exports server-only `parseServerEnv`/`ServerEnvSchema` (`:127-136`); `apps/web/src/lib/env.ts` and `packages/db/src/index.ts` lack `import 'server-only'`.                                                                                                                                                                                                         | **Low**        |
| **F-13** | `P2-Medium`   | [`apps/web/tsconfig.json:4`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/web/tsconfig.json#L4)                                                 | Type-checking gaps & unsafe casts: `apps/web/tsconfig.json:4` sets `exactOptionalPropertyTypes: false` and excludes `test/`/`tests/` (`:14`); `tsconfig.base.json:30` leaks `@/*` path alias globally; `10` prod `any` and `82` prod `as unknown as` casts (including `decryptByok` cast in `apps/web/src/app/api/market/stream/route.ts:86`).                                                                                                                 | **Medium**     |
| **F-14** | `P3-Low`      | [`packages/ai/probe-durable.mjs:1`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/ai/probe-durable.mjs#L1)                                   | Orphaned scripts committed to repository (`packages/ai/probe-durable.mjs`, `packages/db/scripts/db-check.mjs`, `packages/db/scripts/list-tables.mjs`) with zero references in `package.json` or CI, plus `root/package.json:38` `build:packages` omitting `@kestrel/loadtest`.                                                                                                                                                                                 | **Low**        |
| **F-15** | `P3-Low`      | [`packages/shared/src/index.ts:20-160`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/shared/src/index.ts#L20-L160)                          | `127` exported symbols in `packages/shared` (`98` completely unused across the monorepo, `29` used exclusively in unit tests) bloat barrel surface area and IDE autocomplete.                                                                                                                                                                                                                                                                                  | **Medium**     |
| **F-16** | `P3-Low`      | [`README.md:195-221`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/README.md#L195-L221)                                                              | Outdated & contradictory documentation: `README.md:195-221` documents removed 5-mode committee (`quick`, `standard`, `auto`) and non-existent `BYOK_ENABLED=1` (`:296`); `docker-compose.yml:113` double-prefixes `127.0.0.1:` on `APP_PUBLISHED_PORT`; `docs/troubleshooting.md:89,233` and `docs/release.md:101` cite nonexistent scripts (`db:migrate`, `dev:local`, `pnpm changeset`); duplicate 14.8 KB `kestrel-ux-upgrade-plan.md` at root and `docs/`. | **Low**        |

## 3. Detailed Technical Breakdown & Proposed Patch Plan

### Area 1: Workspace & Turborepo Pipeline (`turbo.json`, `pnpm-workspace.yaml`, `package.json`)

#### Finding F-01 (`P1-High`) — `turbo.json` Drops `^build` Dependency from `test` While Three Workspaces Resolve `dist/` Instead of `source`

- **Locations:**
  - [`turbo.json:59-62`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/turbo.json#L59-L62)
  - [`apps/web/vitest.config.ts:28-33`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/web/vitest.config.ts#L28-L33)
  - [`apps/worker/vitest.config.ts:23-28`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/worker/vitest.config.ts#L23-L28)
  - [`packages/ai/vitest.config.ts:23-29`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/ai/vitest.config.ts#L23-L29)
- **Concrete Failure Scenario:**
  In commit [`0d01e14`](https://github.com/HamaFx/Kestrel/commit/0d01e1455920e7c51eedacc1cd192fd054ae14af), `turbo.json` changed `tasks.test.dependsOn` from `["^build"]` to `[]`. Commit [`8b18a11`](https://github.com/HamaFx/Kestrel/commit/8b18a11cbea2676baad337cdb0b3c3226baee7c0) subsequently added `"source"` export conditions to `packages/*/package.json` and added `resolve: { conditions: ['source'] }` to `packages/data/vitest.config.ts`, `packages/db/vitest.config.ts`, `packages/indicators/vitest.config.ts`, `packages/shared/vitest.config.ts`, and `packages/test-utils/vitest.config.ts`. However, **`apps/web/vitest.config.ts`, `apps/worker/vitest.config.ts`, and `packages/ai/vitest.config.ts` were never updated with `conditions: ['source']`**.
  When a developer or CI job runs `pnpm turbo run test` on a fresh checkout (as in [`.github/workflows/ci-fast.yml:84`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/.github/workflows/ci-fast.yml#L84), where the `unit-tests` job runs `pnpm turbo run test -- --coverage` without running `pnpm turbo run build` first!), Node/Vite resolves `@kestrel/shared`, `@kestrel/db`, `@kestrel/data`, `@kestrel/indicators`, and `@kestrel/ai` using the `"import": "./dist/..."` condition—which fails with `Cannot find module '@kestrel/shared'` when `dist/` is not pre-built, or silently tests against stale `dist/` build artifacts locally.
- **Remediation Diff:**

```diff
--- a/apps/web/vitest.config.ts
+++ b/apps/web/vitest.config.ts
@@ -26,6 +26,7 @@ export default defineConfig({
   plugins: [react()],
   esbuild: { target: 'esnext' },
   resolve: {
+    conditions: ['source'],
     alias: {
       '@': path.resolve(__dirname, './src'),
     },
--- a/apps/worker/vitest.config.ts
+++ b/apps/worker/vitest.config.ts
@@ -21,6 +21,9 @@ const maxWorkers = process.env.CI ? 2 : Math.max(2, Math.floor(os.availableParal

 export default defineConfig({
+  resolve: {
+    conditions: ['source'],
+  },
   test: {
     pool: 'forks',
     maxWorkers,
--- a/packages/ai/vitest.config.ts
+++ b/packages/ai/vitest.config.ts
@@ -21,6 +21,9 @@ const maxWorkers = process.env.CI ? 2 : Math.max(2, Math.floor(os.availableParal

 export default defineConfig({
   esbuild: { target: 'es2022' },
+  resolve: {
+    conditions: ['source'],
+  },
   test: {
     pool: 'forks',
     maxWorkers,
```

#### Finding F-02 (`P1-High`) — Dead `exports` Subpaths in `packages/ai/package.json` Pointing to Deleted or Relocated Modules

- **Locations:**
  - [`packages/ai/package.json:66-70`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/ai/package.json#L66-L70) (`./prompt`)
  - [`packages/ai/package.json:81-100`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/ai/package.json#L81-L100) (`./portfolio`, `./notifications`, `./types`, `./verification`)
- **Concrete Failure Scenario:**
  `packages/ai/package.json` exports 5 subpaths whose target files do not exist in `packages/ai/src/`:
  1. `"./prompt"` targets `./src/prompt/system.ts` and `./dist/prompt/system.js` (deleted in Audit v2 Phase 4).
  2. `"./portfolio"` targets `./src/portfolio.ts` and `./dist/portfolio.js` (actual source is `./src/portfolio/index.ts`).
  3. `"./notifications"` targets `./src/notifications.ts` and `./dist/notifications.js` (actual source is `./src/notifications/index.ts`).
  4. `"./types"` targets `./src/types.ts` and `./dist/types.js` (deleted).
  5. `"./verification"` targets `./src/verification.ts` and `./dist/verification.js` (deleted in Audit v2 Phase 4).
     Importing `@kestrel/ai/portfolio` or `@kestrel/ai/notifications` throws `ERR_MODULE_NOT_FOUND` at runtime and fails `tsc` resolution.
- **Remediation Diff:**

```diff
--- a/packages/ai/package.json
+++ b/packages/ai/package.json
@@ -63,11 +63,6 @@
       "types": "./dist/tools/registry.d.ts",
       "import": "./dist/tools/registry.js"
     },
-    "./prompt": {
-      "source": "./src/prompt/system.ts",
-      "types": "./dist/prompt/system.d.ts",
-      "import": "./dist/prompt/system.js"
-    },
     "./diagnostics": {
       "source": "./src/diagnostics/index.ts",
       "types": "./dist/diagnostics/index.d.ts",
@@ -79,24 +74,14 @@
       "import": "./dist/bot/index.js"
     },
     "./portfolio": {
-      "source": "./src/portfolio.ts",
-      "types": "./dist/portfolio.d.ts",
-      "import": "./dist/portfolio.js"
+      "source": "./src/portfolio/index.ts",
+      "types": "./dist/portfolio/index.d.ts",
+      "import": "./dist/portfolio/index.js"
     },
     "./notifications": {
-      "source": "./src/notifications.ts",
-      "types": "./dist/notifications.d.ts",
-      "import": "./dist/notifications.js"
-    },
-    "./types": {
-      "source": "./src/types.ts",
-      "types": "./dist/types.d.ts",
-      "import": "./dist/types.js"
-    },
-    "./verification": {
-      "source": "./src/verification.ts",
-      "types": "./dist/verification.d.ts",
-      "import": "./dist/verification.js"
+      "source": "./src/notifications/index.ts",
+      "types": "./dist/notifications/index.d.ts",
+      "import": "./dist/notifications/index.js"
     },
     "./catalogue": {
       "source": "./src/catalogue.ts",
```

#### Finding F-03 (`P2-Medium`) — Missing `inputs` Filters and Incomplete `globalDependencies` / `env` Keys in `turbo.json`

- **Locations:**
  - [`turbo.json:1-70`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/turbo.json#L1-L70)
- **Concrete Failure Scenario:**
  1. `turbo.json` omits `inputs` definitions across `build`, `lint`, `typecheck`, and `test`. Consequently, modifying any file under `docs/**` or `README.md` busts the Turborepo cache for `build` across every workspace, and modifying `test/**/*.test.ts` inside a package unnecessarily invalidates its `build` cache (`tsc -p tsconfig.build.json` excludes `test/**`).
  2. `globalDependencies` ([`turbo.json:2`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/turbo.json#L2)) lists only `["tsconfig.base.json"]`, omitting `packages/config/typescript/*.json` and `packages/config/eslint/*.js` (since `@kestrel/config` has no `build` script in [`packages/config/package.json:19-24`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/config/package.json#L19-L24), Turborepo does not track its task output hashes for `^build`).
  3. `tasks.build.env` ([`turbo.json:12-44`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/turbo.json#L12-L44)) omits `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `COOKIE_SECURE_MODE`, `KESTREL_FORCE_EPOCH_BUILD_ID`, and `ANALYZE`, which are baked into Next.js build output or `apps/web/scripts/set-build-id.mjs`. Re-building with a different `NEXT_PUBLIC_APP_URL` or `NEXT_PUBLIC_VAPID_PUBLIC_KEY` can replay a stale `.next/**` cache artifact with the wrong embedded public URL or VAPID key.
- **Remediation Diff:**

```diff
--- a/turbo.json
+++ b/turbo.json
@@ -1,5 +1,9 @@
 {
-  "globalDependencies": ["tsconfig.base.json"],
+  "globalDependencies": [
+    "tsconfig.base.json",
+    "packages/config/typescript/*.json",
+    "packages/config/eslint/*.js"
+  ],
   "globalEnv": [
     "NODE_ENV",
     "CI",
@@ -9,6 +13,17 @@
   "tasks": {
     "build": {
       "dependsOn": ["^build"],
+      "inputs": [
+        "$TURBO_DEFAULT$",
+        "!README.md",
+        "!docs/**",
+        "!test/**",
+        "!tests/**",
+        "!**/*.test.ts",
+        "!**/*.test.tsx",
+        "!**/*.spec.ts"
+      ],
       "env": [
         "DATABASE_URL",
         "POSTGRES_URL",
@@ -40,7 +55,12 @@
         "SUPABASE_SERVICE_ROLE_KEY",
         "MULTI_USER_ENABLED",
         "KESTREL_ENABLE_RLS",
-        "REGISTRATION_MODE"
+        "REGISTRATION_MODE",
+        "NEXT_PUBLIC_APP_URL",
+        "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
+        "COOKIE_SECURE_MODE",
+        "KESTREL_FORCE_EPOCH_BUILD_ID",
+        "ANALYZE"
       ],
       "outputs": [".next/**", "!.next/cache/**", "dist/**", ".build-id", ".env.production.local"]
     },
```

#### Finding F-04 (`P2-Medium`) — Dependency Version Drift, Redundant Workspace Glob, and Node Target Mismatch

- **Locations:**
  - [`apps/web/package.json:48-49`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/web/package.json#L48-L49) vs [`packages/ai/package.json:205`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/ai/package.json#L205) (`react: ^19.2.8` vs `^19.0.0`)
  - [`packages/config/package.json:33`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/config/package.json#L33) (`typescript: npm:@typescript/typescript6@^6.0.2` vs `^7.0.2`)
  - [`packages/ai/package.json:193-200`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/ai/package.json#L193-L200) (`@mastra/langfuse: 1.5.0`, `@mastra/observability: 1.17.1` exact vs caret ranges on `@mastra/core: ^1.60.0`)
  - [`pnpm-workspace.yaml:2-5`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/pnpm-workspace.yaml#L2-L5) (redundant `"packages/test-utils"` alongside `"packages/*"`)
  - [`package.json:42-44`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/package.json#L42-L44) (`postgres: ^3.4.5` in root `dependencies` rather than `devDependencies` or workspace-scoped)
  - [`apps/worker/scripts/build.mjs:113`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/worker/scripts/build.mjs#L113) (`target: 'node20'` while [`.nvmrc:1`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/.nvmrc#L1) and [`package.json:8`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/package.json#L8) require Node `>=22.13.0`)
- **Concrete Failure Scenario:**
  1. `apps/web` and `packages/ai` specify different semver ranges for `react` (`^19.2.8` vs `^19.0.0`), which can resolve to two distinct React instances in `node_modules/.pnpm` during lockfile updates.
  2. `packages/config` still carries `typescript: npm:@typescript/typescript6@^6.0.2` even though `pnpm-workspace.yaml:13` already patches `typescript-paths@1.5.2` to work with TypeScript 7 (`^7.0.2`), causing two full TypeScript compilers (TS 6 and TS 7) to be downloaded and installed.
  3. `pnpm-workspace.yaml:4` duplicates `packages/test-utils` which is already matched by `packages/*` on line 3.
- **Remediation Diff:**

```diff
--- a/pnpm-workspace.yaml
+++ b/pnpm-workspace.yaml
@@ -1,7 +1,6 @@
 packages:
   - "apps/*"
   - "packages/*"
-  - "packages/test-utils"
   - "loadtest"

 # Mastra CLI / @mastra/deployer bundle the config with the `typescript-paths`
--- a/packages/ai/package.json
+++ b/packages/ai/package.json
@@ -202,7 +202,7 @@
     "@opentelemetry/sdk-node": "^0.221.0",
     "ai": "^5.0.0",
     "drizzle-orm": "^0.45.2",
-    "react": "^19.0.0",
+    "react": "^19.2.8",
     "web-push": "^3.6.7",
     "zod": "^3.23.8"
   },
--- a/packages/config/package.json
+++ b/packages/config/package.json
@@ -30,6 +30,6 @@
     "typescript-eslint": "^8.19.0"
   },
   "devDependencies": {
-    "typescript": "npm:@typescript/typescript6@^6.0.2"
+    "typescript": "^7.0.2"
   },
   "license": "Apache-2.0"
--- a/apps/worker/scripts/build.mjs
+++ b/apps/worker/scripts/build.mjs
@@ -110,7 +110,7 @@ const common = {
   bundle: true,
   format: 'esm',
   platform: 'node',
-  target: 'node20',
+  target: 'node22',
   sourcemap: true,
   external,
   nodePaths: [resolve(monorepoRoot, 'node_modules')],
```

### Area 2: Boundary Violations & Circular Dependencies

#### Package Dependency Graph Verification

Scanning all `641` cross-package `@kestrel/*` import statements across `apps/*` and `packages/*` confirms the following package-level dependency edges:

| Source Workspace      | Imported `@kestrel/*` Packages                                                                                            | Layer Direction Compliance                                                                           |
| :-------------------- | :------------------------------------------------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------------------------- |
| `packages/config`     | None (self-referential ESLint config only)                                                                                | Compliant (Layer 0)                                                                                  |
| `packages/shared`     | **`@kestrel/data`** (`1` import in `test/storage-boundary.test.ts:1`)                                                     | **VIOLATION (F-06): `shared -> data`**                                                               |
| `packages/indicators` | `@kestrel/shared` (`28` imports)                                                                                          | Compliant (Layer 2)                                                                                  |
| `packages/db`         | `@kestrel/shared` (`5` imports)                                                                                           | Compliant (Layer 2)                                                                                  |
| `packages/data`       | `@kestrel/shared` (`24` imports), `@kestrel/db` (`11` imports)                                                            | Compliant with `docs/architecture.md:29` (`shared -> db + indicators -> data -> ai -> web + worker`) |
| `packages/ai`         | `@kestrel/shared` (`223`), `@kestrel/db` (`82`), `@kestrel/data` (`34`), `@kestrel/indicators` (`11`)                     | Compliant (Layer 4)                                                                                  |
| `apps/web`            | `@kestrel/shared` (`159`), `@kestrel/ai` (`71`), `@kestrel/db` (`59`), `@kestrel/data` (`7`), `@kestrel/indicators` (`2`) | **1 Broken Relative Import in `scripts/` (F-05)** + **Test Escapes (F-07)**                          |
| `apps/worker`         | `@kestrel/ai` (`34`), `@kestrel/shared` (`19`), `@kestrel/db` (`15`), `@kestrel/data` (`9`)                               | Compliant (Layer 5)                                                                                  |

#### Finding F-05 (`P1-High`) — Broken Cross-Package Relative Import in `apps/web/scripts/setup-telegram-webhook.ts:27`

- **Locations:**
  - [`apps/web/scripts/setup-telegram-webhook.ts:25-27`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/web/scripts/setup-telegram-webhook.ts#L25-L27)
  - [`apps/web/tsconfig.json:14`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/web/tsconfig.json#L14)
- **Concrete Failure Scenario:**
  `apps/web/scripts/setup-telegram-webhook.ts:27` contains:
  ```ts
  import { setBotCommands, telegramApiCall } from '../../packages/ai/src/telegram/client';
  ```
  1. Relative to `apps/web/scripts/`, `../../` resolves to `apps/`, so `../../packages/ai/src/telegram/client` resolves to `apps/packages/ai/src/telegram/client` (which does not exist).
  2. Reaching into another workspace's raw `src/` directory violates package encapsulation.
  3. Because `apps/web/tsconfig.json:14` only includes `src/**/*.ts`, `pnpm turbo run typecheck` never checks `apps/web/scripts/setup-telegram-webhook.ts`. Running the script via `pnpm tsx apps/web/scripts/setup-telegram-webhook.ts` crashes immediately on startup.
- **Remediation Diff:**
  Export `setBotCommands` and `telegramApiCall` from `@kestrel/ai/bot` (or `@kestrel/ai`) and import via the package specifier:

```diff
--- a/packages/ai/src/bot/index.ts
+++ b/packages/ai/src/bot/index.ts
@@ -26,3 +26,4 @@ export {
   unlinkTelegramAccount,
   verifyTelegramWebhookSecret,
 } from './telegram-adapter';
+export { setBotCommands, telegramApiCall } from '../telegram/client';
--- a/apps/web/scripts/setup-telegram-webhook.ts
+++ b/apps/web/scripts/setup-telegram-webhook.ts
@@ -22,9 +22,9 @@
 //
 // Or set VERCEL_PROJECT_PRODUCTION_URL / NEXT_PUBLIC_APP_URL env vars.

-import * as crypto from 'crypto';
+import * as crypto from 'node:crypto';

-import { setBotCommands, telegramApiCall } from '../../packages/ai/src/telegram/client';
+import { setBotCommands, telegramApiCall } from '@kestrel/ai/bot';
```

#### Finding F-06 (`P1-High`) — Upward Package Boundary Violation in `packages/shared/test/storage-boundary.test.ts:1`

- **Locations:**
  - [`packages/shared/test/storage-boundary.test.ts:1`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/shared/test/storage-boundary.test.ts#L1)
  - [`packages/shared/package.json:75-87`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/shared/package.json#L75-L87)
- **Concrete Failure Scenario:**
  `packages/shared/test/storage-boundary.test.ts:1` imports `{ deleteStorageObjects, listStorageObjects } from '@kestrel/data/adapters/storage'`. `@kestrel/shared` is the lowest-level runtime package and `@kestrel/data` depends on `@kestrel/shared` ([`packages/data/package.json:42`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/data/package.json#L42)). Having `@kestrel/shared` import `@kestrel/data` creates a circular package relationship (`shared <-> data`) and relies on pnpm hoisting an undeclared dependency. When `@kestrel/shared` is typechecked with `test/**/*.ts` included (see **F-13**) or tested in isolation before `@kestrel/data` exists, resolution fails.
- **Remediation Diff:**
  Move `packages/shared/test/storage-boundary.test.ts` to `packages/data/test/storage-boundary.test.ts` and import from `../src/adapters/storage`:

```diff
--- a/packages/shared/test/storage-boundary.test.ts
+++ /dev/null
@@ -1,31 +0,0 @@
-import { deleteStorageObjects, listStorageObjects } from '@kestrel/data/adapters/storage';
...
--- /dev/null
+++ b/packages/data/test/storage-boundary.test.ts
@@ -0,0 +1,31 @@
+import { deleteStorageObjects, listStorageObjects } from '../src/adapters/storage';
+import { describe, expect, it } from 'vitest';
```

#### Finding F-07 (`P2-Medium`) — Cross-Workspace Relative Imports in `apps/web/test/` Escaping `apps/web`

- **Locations:**
  - [`apps/web/test/loadtest-contracts.test.ts:22-24`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/web/test/loadtest-contracts.test.ts#L22-L24) (`../../../loadtest/lib/sse.js`, `../../../loadtest/lib/summary.js`, `../../../loadtest/scripts/compare-baseline.mjs`)
  - [`apps/web/test/lighthouse-runner.test.ts:3`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/web/test/lighthouse-runner.test.ts#L3) (`../../../tools/lighthouse/run.mjs`)
  - [`apps/web/test/setup-env.test.ts:25`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/web/test/setup-env.test.ts#L25) (`../../../scripts/setup/lib/env.mjs`)
  - [`apps/web/test/setup-pages.test.ts:26`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/web/test/setup-pages.test.ts#L26) (`../../../scripts/setup/lib/ui.mjs`)
  - [`apps/web/test/setup-prompts.test.ts:29`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/web/test/setup-prompts.test.ts#L29) (`../../../scripts/setup/lib/prompts.mjs`)
  - [`apps/web/test/setup-run.test.ts:27`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/web/test/setup-run.test.ts#L27) (`../../../scripts/setup/lib/run.mjs`)
  - [`apps/web/test/setup-wizard-policy.test.ts:26-41`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/web/test/setup-wizard-policy.test.ts#L26-L41) (`../../../scripts/setup/...`)
- **Concrete Failure Scenario:**
  `apps/web/test/` reaches 3 levels up (`../../../`) outside `apps/web` into `loadtest/`, `tools/lighthouse/`, and `scripts/setup/`.
  1. `tools/lighthouse/run.mjs:16-17` imports `chrome-launcher` and `lighthouse`, which are installed only in the root `package.json:49-51` `devDependencies`, not in `apps/web/package.json`.
  2. Turborepo scopes task cache hashes for `@kestrel/web#test` to files inside `apps/web/**` and its declared workspace dependencies (`@kestrel/ai`, `@kestrel/data`, `@kestrel/db`, `@kestrel/indicators`, `@kestrel/shared`). Modifying `loadtest/lib/summary.ts`, `tools/lighthouse/run.mjs`, or `scripts/setup/**` will **not** invalidate the `@kestrel/web#test` Turborepo cache, allowing broken loadtest/setup/lighthouse changes to pass CI with a false `FULL TURBO` cache hit!
- **Remediation Diff:**
  Include `../../scripts/setup/**`, `../../tools/lighthouse/**`, and `../../loadtest/**` in `turbo.json` `test.inputs`:

```diff
--- a/turbo.json
+++ b/turbo.json
@@ -59,6 +59,13 @@
     "test": {
       "dependsOn": [],
+      "inputs": [
+        "$TURBO_DEFAULT$",
+        "../../scripts/setup/**",
+        "../../tools/lighthouse/**",
+        "../../loadtest/lib/**",
+        "../../loadtest/scripts/**"
+      ],
       "outputs": ["coverage/**"]
     },
```

#### Finding F-08 (`P2-Medium`) — 12 Internal Value-Import Circular Dependency Cycles in `packages/db` and `packages/ai`

- **Locations:**
  1. **Cycle 1 (`packages/db`):** [`packages/db/src/index.ts:54`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/db/src/index.ts#L54) -> [`packages/db/src/active-users.ts:30`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/db/src/active-users.ts#L30) (`import { getDb, schema } from './index'`) -> `packages/db/src/index.ts`
  2. **Cycle 2 (`packages/db`):** [`packages/db/src/index.ts:58-66`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/db/src/index.ts#L58-L66) -> [`packages/db/src/queries/billing.ts:24`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/db/src/queries/billing.ts#L24) (`import { getDb, schema } from '../index'`) -> `packages/db/src/index.ts`
  3. **Cycle 3 (`packages/ai/alerts`):** [`packages/ai/src/alerts/rule-registry.ts:17-121`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/ai/src/alerts/rule-registry.ts#L17-L121) -> [`packages/ai/src/alerts/spec.ts:32`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/ai/src/alerts/spec.ts#L32) (`import { alertRuleRegistry } from './rule-registry'`) -> `packages/ai/src/alerts/rule-registry.ts`
  4. **Cycle 4 (`packages/ai/alerts`):** [`packages/ai/src/alerts/evaluator.ts:49`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/ai/src/alerts/evaluator.ts#L49) (`import { deliverAlert } from './delivery'`) <-> [`packages/ai/src/alerts/delivery.ts:45`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/ai/src/alerts/delivery.ts#L45) (`import { describeRule, type EvaluatorEnv, type RuleReading } from './evaluator'`)
  5. **Cycle 5 (`packages/ai/bot`):** [`packages/ai/src/bot/dispatcher.ts:30`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/ai/src/bot/dispatcher.ts#L30) (`import { helpCommand } from './commands/help'`) <-> [`packages/ai/src/bot/commands/help.ts:19`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/ai/src/bot/commands/help.ts#L19) (`import { getBotDispatcher } from '../dispatcher'`)
  6. **Cycles 6–8 (`packages/ai/mastra-v2` capabilities & telemetry):**
     - [`packages/ai/src/mastra-v2/capabilities/index.ts:23`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/ai/src/mastra-v2/capabilities/index.ts#L23) -> `agents/xauusd/tools/calendar-tool.ts` -> [`packages/ai/src/mastra-v2/shared/telemetry.ts:18`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/ai/src/mastra-v2/shared/telemetry.ts#L18) (`export { capabilityTelemetryLabels } from '../capabilities'`) -> `capabilities/index.ts`
     - [`packages/ai/src/mastra-v2/telemetry.ts:22`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/ai/src/mastra-v2/telemetry.ts#L22) -> `capabilities/index.ts` -> `calendar-tool.ts` -> `shared/telemetry.ts:30` -> [`packages/ai/src/mastra-v2/shared/run-telemetry.ts:26`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/ai/src/mastra-v2/shared/run-telemetry.ts#L26) (`import { flushMastraObservability } from '../telemetry'`) -> `mastra-v2/telemetry.ts`
  7. **Cycles 9–12 (`packages/ai/tools` & `mastra-v2/instance`):**
     - [`packages/ai/src/tools/index.ts:31`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/ai/src/tools/index.ts#L31) -> `tools/system.ts` -> `tools/convene-committee.ts` -> `mastra-v2/planning/mode-runner.ts` -> `committee/workflow.ts` -> `committee/critique.ts` -> [`packages/ai/src/committee/specialists.ts:34`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/ai/src/committee/specialists.ts#L34) (`import { registerAllTools, toolRegistry } from '../tools'`) -> `tools/index.ts`
     - [`packages/ai/src/mastra-v2/instance.ts:28`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/ai/src/mastra-v2/instance.ts#L28) -> `tools/index.ts` -> `tools/system.ts` -> `tools/convene-committee.ts` -> [`packages/ai/src/mastra-v2/planning/mode-runner.ts:46`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/ai/src/mastra-v2/planning/mode-runner.ts#L46) (`import { getKestrelMastra } from '../instance'`) -> `mastra-v2/instance.ts`
- **Concrete Failure Scenario:**
  In `packages/ai/src/alerts/rule-registry.ts:87-121`, `export const alertRuleRegistry = new AlertRuleRegistry()` and three `alertRuleRegistry.register(...)` calls execute eagerly at module load time, instantiating `LevelSpec` and `CrossingSpec` imported from `./spec`. Meanwhile, `./spec.ts:32` imports `alertRuleRegistry` from `./rule-registry`. If `./spec.ts` is imported first in an entrypoint or test, ESM evaluates `rule-registry.ts` before `spec.ts` finishes defining `LevelSpec` and `CrossingSpec`, throwing `ReferenceError: Cannot access 'LevelSpec' before initialization` when `specFactory` is invoked or referenced. Similarly, `packages/db/src/active-users.ts:30` and `packages/db/src/queries/billing.ts:24` import from their own parent barrel (`./index` / `../index`) instead of `./client`.
- **Remediation Diff:**

```diff
--- a/packages/db/src/active-users.ts
+++ b/packages/db/src/active-users.ts
@@ -27,7 +27,7 @@

 import { eq, isNull } from 'drizzle-orm';

-import { getDb, schema } from './index';
+import { getDb, schema } from './client';

 /**
  * Fetch all active user IDs from the database.
--- a/packages/db/src/queries/billing.ts
+++ b/packages/db/src/queries/billing.ts
@@ -21,7 +21,7 @@

 import { and, desc, eq, gte, lt } from 'drizzle-orm';

-import { getDb, schema } from '../index';
+import { getDb, schema } from '../client';

 export interface SubscriptionWithPlan {
--- a/packages/ai/src/alerts/delivery.ts
+++ b/packages/ai/src/alerts/delivery.ts
@@ -42,7 +42,8 @@ import { deletePushSubscription, listPushSubscriptions } from '../push/persisten
 import { sendWebPush } from '../push/send';
 import { evaluateNoise, hashContent } from '../notifications/noise-control';
 import { DbNoiseState, getNoiseConfig } from '../notifications/noise-state';
-import { describeRule, type EvaluatorEnv, type RuleReading } from './evaluator';
+import { alertRuleRegistry } from './rule-registry';
+import type { EvaluatorEnv, RuleReading } from './evaluator';
 import { markFiredForAlert } from './persistence';
```

#### Finding F-09 (`P2-Medium`) — Server-Only Re-Exports in `@kestrel/shared` Barrel and Missing `import 'server-only'` Guards

- **Locations:**
  - [`packages/shared/src/index.ts:124-136`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/shared/src/index.ts#L124-L136)
  - [`apps/web/src/lib/env.ts:24-33`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/web/src/lib/env.ts#L24-L33)
  - [`packages/db/src/index.ts:17-20`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/db/src/index.ts#L17-L20)
- **Concrete Failure Scenario:**
  1. `packages/shared/src/index.ts:124` contains `export {} from './encryption';` right below a comment stating `// Re-exporting it here would pull node:crypto into any client component that imports the barrel.` In ESM bundlers that do not elide empty side-effect-bearing module specifiers (`encryption.ts:38` has `import 'server-only';` which is a side-effect!), `export {} from './encryption'` still triggers module graph traversal into `encryption.ts`.
  2. `packages/shared/src/index.ts:127-136` re-exports `ServerEnvSchema`, `parseServerEnv`, `resolveDatabaseUrl`, `resolveDirectDatabaseUrl`, `resolveMigrationDatabaseUrl`, `isTransactionPoolerUrl`, and `pickAiEnv` from `./env` in the universal barrel (`@kestrel/shared`), even though [`packages/shared/package.json:31-35`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/shared/package.json#L31-L35) already provides a dedicated `@kestrel/shared/env` subpath.
  3. `apps/web/src/lib/env.ts` (which imports `node:fs` and reads `.kestrel/dev-secrets.json`) and `packages/db/src/index.ts` do not include `import 'server-only';`. If a future `'use client'` component accidentally imports `@/lib/env` or `@kestrel/db`, Next.js fails with cryptic webpack `node:fs`/`node:net` resolution errors instead of a clear `server-only` boundary error.
- **Remediation Diff:**

```diff
--- a/packages/shared/src/index.ts
+++ b/packages/shared/src/index.ts
@@ -121,7 +121,6 @@ export * from './bug-report';
 // BYOK encryption is server-only (uses node:crypto) — import directly
 // from '@kestrel/shared/encryption' instead. Re-exporting it here would
 // pull node:crypto into any client component that imports the barrel.
-export {} from './encryption';

 // Env (server-only — do NOT import from client code)
 export {
--- a/apps/web/src/lib/env.ts
+++ b/apps/web/src/lib/env.ts
@@ -21,6 +21,8 @@
 // Development secrets are auto-generated when missing and cached in
 // `.kestrel/dev-secrets.json` so encrypted BYOK payloads survive restarts.

+import 'server-only';
+
 import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
 import { resolve } from 'node:path';
```

### Area 3: Type Safety & Shared Contracts (`packages/shared` & `tsconfig.json`)

#### Finding F-10 (`P0-Critical`) — Worker `multi-agent-analysis.ts:215` Casts Raw `process.env` via `as unknown as` into `pickAiEnv` and Skips Boot Validation for AI/Encryption Secrets

- **Locations:**
  - [`apps/worker/src/jobs/multi-agent-analysis.ts:215`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/worker/src/jobs/multi-agent-analysis.ts#L215)
  - [`apps/worker/src/env.ts:46-162`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/worker/src/env.ts#L46-L162)
- **Concrete Failure Scenario:**
  In `apps/worker/src/jobs/multi-agent-analysis.ts:215`, the worker builds the AI environment object for durable Full-mode committee jobs via:
  ```ts
  const env = pickAiEnv(process.env as unknown as Parameters<typeof pickAiEnv>[0]);
  ```
  `pickAiEnv` ([`packages/shared/src/env.ts:460-482`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/shared/src/env.ts#L460-L482)) is a pure property-picker (`return { AI_DEFAULT_MODEL: env.AI_DEFAULT_MODEL, MAX_DAILY_USD: env.MAX_DAILY_USD, WEB_SEARCH_ENABLED: env.WEB_SEARCH_ENABLED, ... }`) that expects an **already-parsed `ServerEnv`** output from `ServerEnvSchema`! Because `process.env` is passed raw via `as unknown as`:
  1. **Boolean inversion bug:** In `.env` / `docker-compose.yml`, boolean flags are set to `"0"` (`WEB_SEARCH_ENABLED=0`, `AI_SEMANTIC_ROUTING_ENABLED=0`, `LOG_PROMPTS=0`). Without `ServerEnvSchema` transform (`v => v === '1' || v === 'true'`), `env.WEB_SEARCH_ENABLED`, `env.AI_SEMANTIC_ROUTING_ENABLED`, and `env.LOG_PROMPTS` are the non-empty string `"0"`—which is **truthy** in JavaScript!
  2. **Unparsed numbers & missing defaults:** `env.MAX_DAILY_USD`, `env.MAX_TOOL_ITERATIONS`, `env.WEB_SEARCH_MAX_RESULTS`, `env.WEB_SEARCH_MAX_CALLS_PER_TURN`, `env.WEB_SEARCH_CACHE_TTL_SECONDS`, and `env.WEB_SEARCH_TIMEOUT_MS` are either `string` (when set in `process.env`) or `undefined` (when unset, because Zod `.default(...)` never ran!). On line 228 (`userSettings.maxDailyUsd ?? env.MAX_DAILY_USD ?? DEFAULT_MAX_DAILY_USD`), if `MAX_DAILY_USD="5"` is set in `.env`, `env.MAX_DAILY_USD` is the string `"5"` instead of the number `5`!
  3. **Missing fail-fast boot validation in `apps/worker/src/env.ts`:** `WorkerEnvSchema` ([`apps/worker/src/env.ts:46-162`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/worker/src/env.ts#L46-L162)) never validates `ENCRYPTION_SECRET`, `AI_DEFAULT_MODEL`, `MAX_DAILY_USD`, or `WEB_SEARCH_*`. A production worker started without `ENCRYPTION_SECRET` passes `loadEnv()` at boot and only crashes later when claiming a user's queued Full-mode job or running daily briefings (`decryptByok` throws `ENCRYPTION_SECRET not set`).
- **Remediation Diff:**

```diff
--- a/apps/worker/src/env.ts
+++ b/apps/worker/src/env.ts
@@ -54,6 +54,11 @@ const WorkerEnvSchema = z.object({
   WORKER_HEALTH_TOKEN: optionalNonEmpty,
   /** Bearer token required for the BiQuote proxy in production. */
   BIQUOTE_PROXY_TOKEN: optionalNonEmpty,
+  /** 32-byte (64 hex chars) key required in production to decrypt user BYOK keys in worker jobs. */
+  ENCRYPTION_SECRET: z.preprocess(
+    (v) => (v === '' ? undefined : v),
+    z.string().regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_SECRET must be 64 hex characters (32 bytes)').optional(),
+  ),
   /** Bind address for the worker HTTP listener; keep private by default. */
   WORKER_HTTP_HOST: optionalNonEmpty,
@@ -186,6 +191,9 @@ export function loadEnv(input: NodeJS.ProcessEnv = process.env): WorkerEnv {
   if (result.data.NODE_ENV === 'production' && !result.data.BIQUOTE_PROXY_TOKEN) {
     throw new Error('BIQUOTE_PROXY_TOKEN must be set in production');
   }
+  if (result.data.NODE_ENV === 'production' && !result.data.ENCRYPTION_SECRET) {
+    throw new Error('ENCRYPTION_SECRET must be set in production');
+  }
   if (!result.data.DATABASE_URL && !result.data.POSTGRES_URL) {
     throw new Error('Either DATABASE_URL or POSTGRES_URL must be set');
   }
--- a/apps/worker/src/jobs/multi-agent-analysis.ts
+++ b/apps/worker/src/jobs/multi-agent-analysis.ts
@@ -42,7 +42,7 @@ import {
   type FullAnalysisCoordinator,
   type FullAnalysisJobPayload,
 } from '@kestrel/ai/mastra';
-import { pickAiEnv, type UIMessage } from '@kestrel/shared';
+import { parseServerEnv, pickAiEnv, type UIMessage } from '@kestrel/shared';
 import { createCategorizedLogger, logErrorContext } from '@kestrel/shared/logger';

 import type { TenantRouter } from '../tenant-router.js';
@@ -212,7 +212,7 @@ export async function runMultiAgentAnalysisJob(
           validateFullAnalysisPlanIdentity(executionPlan, { tenantId, payload }, symbol);
         }

-        const env = pickAiEnv(process.env as unknown as Parameters<typeof pickAiEnv>[0]);
+        const env = pickAiEnv(parseServerEnv(process.env));
         const expectedModel = `${payload.modelSnapshot.providerId}/${payload.modelSnapshot.bareModelId}`;
         const resolvedSnapshot = resolveSnapshotModel(userSettings, env, payload.modelSnapshot);
```

#### Finding F-11 (`P0-Critical`) — `ENCRYPTION_SECRET` Schema Permits 32-Char Strings That Crash AES-256-GCM at Runtime

- **Locations:**
  - [`packages/shared/src/env.ts:44`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/shared/src/env.ts#L44)
  - [`packages/shared/src/encryption.ts:68-73`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/shared/src/encryption.ts#L68-L73)
  - [`loadtest/docker-compose.loadtest.yml:113`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/loadtest/docker-compose.loadtest.yml#L113)
  - [`README.md:285`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/README.md#L285)
- **Concrete Failure Scenario:**
  `packages/shared/src/encryption.ts:68-73` decodes `ENCRYPTION_SECRET` as hex (`Buffer.from(secret, 'hex')`) and throws `500 Internal Error` if `key.length !== 32` (**requiring 64 hex characters**):
  ```ts
  const key = Buffer.from(secret, 'hex');
  if (key.length !== 32) {
    throw internalError(
      `ENCRYPTION_SECRET must be 32 bytes (64 hex chars), got ${secret.length} chars (${key.length} bytes)`,
    );
  }
  ```
  However, `packages/shared/src/env.ts:44` only validates `z.string().min(32, 'ENCRYPTION_SECRET must be at least 32 chars').optional()`.
  As a result, any 32-character secret—including the actual value committed in `loadtest/docker-compose.loadtest.yml:113` (`ENCRYPTION_SECRET: abcdef0123456789abcdef0123456789`, which is 32 hex chars = 16 bytes) and the example in `README.md:285` (`your_32_character_encryption_secret`)—**passes `parseServerEnv()` at boot** and then crashes every BYOK encryption/decryption call at runtime!
- **Remediation Diff:**

```diff
--- a/packages/shared/src/env.ts
+++ b/packages/shared/src/env.ts
@@ -41,7 +41,12 @@ const AuthEnv = z.object({
   AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 chars').optional(),
   AUTH_COOKIE_SECRET: z.string().min(32).optional(),
   CRON_SECRET: z.string().min(16, 'CRON_SECRET must be at least 16 chars').optional(),
-  ENCRYPTION_SECRET: z.string().min(32, 'ENCRYPTION_SECRET must be at least 32 chars').optional(),
+  ENCRYPTION_SECRET: z
+    .string()
+    .regex(
+      /^[0-9a-fA-F]{64}$/,
+      'ENCRYPTION_SECRET must be a 64-character hex string (32 bytes, e.g. openssl rand -hex 32)',
+    )
+    .optional(),
 });
--- a/loadtest/docker-compose.loadtest.yml
+++ b/loadtest/docker-compose.loadtest.yml
@@ -110,7 +110,7 @@ services:
       KESTREL_RUNTIME: worker
       WORKER_DB_POOL_MAX: "3"
       AUTH_SECRET: abcdef0123456789abcdef0123456789
-      ENCRYPTION_SECRET: abcdef0123456789abcdef0123456789
+      ENCRYPTION_SECRET: abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789
       CRON_SECRET: abcdef0123456789abcdef0123456789
```

#### Finding F-12 (`P1-High`) — `REQUIRED_HEALTH_ENV_VARS` Checks Legacy `AUTH_COOKIE_SECRET` and Omits `ENCRYPTION_SECRET`

- **Locations:**
  - [`packages/shared/src/env-secrets.ts:65-69`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/shared/src/env-secrets.ts#L65-L69)
  - [`apps/web/src/app/api/health/route.ts:137-150`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/web/src/app/api/health/route.ts#L137-L150)
- **Concrete Failure Scenario:**
  `REQUIRED_HEALTH_ENV_VARS` in `packages/shared/src/env-secrets.ts:65-69` is defined as `['DATABASE_URL', 'AUTH_COOKIE_SECRET', 'CRON_SECRET']`.
  1. `AUTH_COOKIE_SECRET` is a deprecated personal-mode variable ([`packages/shared/src/env.ts:28`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/shared/src/env.ts#L28)); `apps/web/src/app/api/health/route.ts:141-143` works around it via `if (key === 'AUTH_COOKIE_SECRET') return !process.env.AUTH_COOKIE_SECRET && !process.env.AUTH_SECRET;`, which still misleadingly reports `missing env vars: AUTH_COOKIE_SECRET` when `AUTH_SECRET` is unset.
  2. `ENCRYPTION_SECRET` is required in production ([`packages/shared/src/env.ts:344`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/shared/src/env.ts#L344)), yet `/api/health` never checks it—returning HTTP `200 OK` even when BYOK encryption is broken.
- **Remediation Diff:**

```diff
--- a/packages/shared/src/env-secrets.ts
+++ b/packages/shared/src/env-secrets.ts
@@ -63,6 +63,7 @@ export const SECRET_MIN_BYTES: Record<AutoGeneratedSecret, number> = {
  */
 export const REQUIRED_HEALTH_ENV_VARS = [
   'DATABASE_URL',
-  'AUTH_COOKIE_SECRET',
+  'AUTH_SECRET',
   'CRON_SECRET',
+  'ENCRYPTION_SECRET',
 ] as const;
--- a/apps/web/src/app/api/health/route.ts
+++ b/apps/web/src/app/api/health/route.ts
@@ -138,7 +138,7 @@ function checkEnv(): CheckResult {
   const required = REQUIRED_HEALTH_ENV_VARS as readonly string[];
   const missing = required.filter((key) => {
     if (key === 'DATABASE_URL') return !process.env.DATABASE_URL && !process.env.POSTGRES_URL;
-    if (key === 'AUTH_COOKIE_SECRET') {
+    if (key === 'AUTH_SECRET' || key === 'AUTH_COOKIE_SECRET') {
       return !process.env.AUTH_COOKIE_SECRET && !process.env.AUTH_SECRET;
     }
     return !process.env[key];
```

#### Finding F-13 (`P2-Medium`) — `tsconfig.json` Strictness Overrides, Unchecked Test/Script Directories, and Inventory of `any` / `as unknown as` Casts

- **Locations:**
  - [`apps/web/tsconfig.json:4-14`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/web/tsconfig.json#L4-L14) (`exactOptionalPropertyTypes: false`, omits `test/**/*.ts` and `tests/**/*.ts`)
  - [`packages/shared/tsconfig.json:3`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/shared/tsconfig.json#L3) (omits `test/**/*.ts`)
  - [`loadtest/tsconfig.json:1-13`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/loadtest/tsconfig.json#L1-L13) (standalone config omitting `tsconfig.base.json`)
  - [`tsconfig.base.json:29-31`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/tsconfig.base.json#L29-L31) (`"@/*": ["./apps/web/src/*"]` defined globally on base config)
  - [`apps/web/src/app/api/market/stream/route.ts:86`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/web/src/app/api/market/stream/route.ts#L86) (`(decryptByok(encryptedKeys) ?? {}) as unknown as Record<string, string>`)
  - [[GH:apps/web/src/app/(app)/chat/[threadId]/page.tsx:51]] (`parts: z.array(z.any())`)
  - [`apps/web/src/lib/services/calendar.ts:40`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/web/src/lib/services/calendar.ts#L40) (`[key: string]: any;`)
  - [`apps/web/src/lib/thread-export.ts:58`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/web/src/lib/thread-export.ts#L58) (`[key: string]: any;`)
  - [`packages/db/src/with-user-scope.ts:62`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/db/src/with-user-scope.ts#L62) (`return eq((table as any).userId, userId);`)
  - [`packages/ai/src/alerts/rule-registry.ts:100-119`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/ai/src/alerts/rule-registry.ts#L100-L119) & [`packages/ai/src/tools/set-alert.ts:47`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/ai/src/tools/set-alert.ts#L47) (`describe: (rule: any) => ...`)
- **Complete Audit Inventory of Type Escape Hatches:**
  - **`@ts-ignore`:** `0` occurrences across the entire monorepo.
  - **`@ts-expect-error`:** `4` occurrences total (`0` in production, `4` in tests: [`apps/web/test/hooks-use-slash-commands.test.ts:151`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/web/test/hooks-use-slash-commands.test.ts#L151), [`apps/web/test/shiki-sanitization.test.ts:36`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/web/test/shiki-sanitization.test.ts#L36), [`packages/ai/test/llm-throttle.test.ts:77`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/ai/test/llm-throttle.test.ts#L77), [`packages/ai/test/mastra-telemetry.test.ts:344`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/ai/test/mastra-telemetry.test.ts#L344)).
  - **Production `any` (`10` files / `16` lines):**
    1. [[GH:apps/web/src/app/(app)/chat/[threadId]/page.tsx:51]] — `parts: z.array(z.any())`
    2. [`apps/web/src/auth.ts:18`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/web/src/auth.ts#L18) — `const _nextAuth = NextAuth as any;`
    3. [`apps/web/src/proxy.ts:80`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/web/src/proxy.ts#L80) — `const proxy: any = auth(async (req) => {`
    4. [`apps/web/src/components/layout/install-nudge.tsx:66`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/web/src/components/layout/install-nudge.tsx#L66) — `(navigator as any).standalone === true`
    5. [`apps/web/src/lib/services/calendar.ts:40`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/web/src/lib/services/calendar.ts#L40) — `[key: string]: any;` on `CalendarEventDTO`
    6. [`apps/web/src/lib/thread-export.ts:58`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/web/src/lib/thread-export.ts#L58) — `[key: string]: any;` on `ExportMessagePart`
    7. [`packages/ai/src/alerts/rule-registry.ts:100`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/ai/src/alerts/rule-registry.ts#L100) (and lines `109`, `119`) — `describe: (rule: any) => ...`
    8. [`packages/ai/src/llm-client.ts:102`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/ai/src/llm-client.ts#L102) (and line `133`) — `(aiGenerateText as any)(callArgs)` and `(aiStreamText as any)(callArgs)`
    9. [`packages/ai/src/tools/set-alert.ts:47`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/ai/src/tools/set-alert.ts#L47) — `alertRuleRegistry.get(rule.type).describe(rule as any)`
    10. [`packages/ai/src/tools/with-telemetry.ts:83`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/ai/src/tools/with-telemetry.ts#L83) (and lines `93`, `117`, `217`), [`packages/db/src/with-user-scope.ts:62`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/db/src/with-user-scope.ts#L62), and [`loadtest/lib/utils.ts:30`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/loadtest/lib/utils.ts#L30)
  - **High-Risk Production `as unknown as` Casts (`82` total in production):**
    - [`apps/worker/src/jobs/multi-agent-analysis.ts:215`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/worker/src/jobs/multi-agent-analysis.ts#L215) — `process.env as unknown as Parameters<typeof pickAiEnv>[0]` (covered in **F-10**)
    - [`apps/web/src/app/api/market/stream/route.ts:86`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/web/src/app/api/market/stream/route.ts#L86) — `(decryptByok(encryptedKeys) ?? {}) as unknown as Record<string, string>` (unnecessary double cast; `ByokPayload` is `Partial<Record<ProviderId, string>>`, so values can be `undefined` under `noUncheckedIndexedAccess`)
    - [`packages/db/src/client.ts:358`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/db/src/client.ts#L358) (and line `409`), [`packages/db/src/queries/mutation-executions.ts:90`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/db/src/queries/mutation-executions.ts#L90) (and line `141`), and [`apps/web/src/lib/auth/provision-user.ts:118`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/apps/web/src/lib/auth/provision-user.ts#L118) — `tx as unknown as DbClient` (caused by `DbClient` not including `PgTransaction` in its type definition)
    - [`packages/db/drizzle.config.ts:98`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/db/drizzle.config.ts#L98) — `extensionsFilters: ['vector'] as unknown as ['postgis']`
- **Concrete Failure Scenario:**
  1. Moving `@/*` out of `tsconfig.base.json:29-31` prevents backend packages (`packages/*`, `apps/worker`) from accidentally resolving `@/*` to `./apps/web/src/*`.
  2. Including `test/**/*.ts` in `packages/shared/tsconfig.json:3` immediately catches **F-06** (`packages/shared/test/storage-boundary.test.ts:1`) during `pnpm turbo run typecheck`.
  3. Replacing `[key: string]: any` with `[key: string]: unknown` in `calendar.ts:40` and `thread-export.ts:58` and typing `withUserScope` with `AnyPgColumn` eliminates unsafe `any` propagation into callers.
- **Remediation Diff:**

```diff
--- a/tsconfig.base.json
+++ b/tsconfig.base.json
@@ -24,11 +24,7 @@
     "declaration": true,
     "declarationMap": true,
     "sourceMap": true,
-    "incremental": true,
-
-    "paths": {
-      "@/*": ["./apps/web/src/*"]
-    }
+    "incremental": true
   },
   "exclude": ["node_modules", ".turbo", ".next", "dist", "coverage"]
 }
--- a/packages/shared/tsconfig.json
+++ b/packages/shared/tsconfig.json
@@ -1,4 +1,4 @@
 {
   "extends": "@kestrel/config/typescript/base",
-  "include": ["src/**/*.ts"]
+  "include": ["src/**/*.ts", "test/**/*.ts"]
 }
--- a/apps/web/src/lib/services/calendar.ts
+++ b/apps/web/src/lib/services/calendar.ts
@@ -36,8 +36,7 @@ export interface CalendarEventDTO {
   impact: string;
   forecast?: string | null;
   previous?: string | null;
-  // eslint-disable-next-line @typescript-eslint/no-explicit-any
-  [key: string]: any;
+  [key: string]: unknown;
 }
--- a/apps/web/src/lib/thread-export.ts
+++ b/apps/web/src/lib/thread-export.ts
@@ -54,8 +54,7 @@
 export interface ExportMessagePart {
   type: string;
   /** text parts carry a `text` field; tool parts may carry `input` / `output`. */
-  // eslint-disable-next-line @typescript-eslint/no-explicit-any
-  [key: string]: any;
+  [key: string]: unknown;
 }
--- a/packages/db/src/with-user-scope.ts
+++ b/packages/db/src/with-user-scope.ts
@@ -34,7 +34,8 @@
 // code may be migrated incrementally. The helper is tested and correct.

 import { eq, type SQL } from 'drizzle-orm';
+import type { AnyPgColumn } from 'drizzle-orm/pg-core';

-export function withUserScope<T extends { userId: unknown }>(table: T, userId: string): SQL {
-  // eslint-disable-next-line @typescript-eslint/no-explicit-any
-  return eq((table as any).userId, userId);
+export function withUserScope<T extends { userId: AnyPgColumn }>(table: T, userId: string): SQL {
+  return eq(table.userId, userId);
 }
```

### Area 4: Dead Code & Orphaned Documentation

#### Finding F-14 (`P3-Low`) — Orphaned Scratch Scripts Committed to `packages/ai` and `packages/db`

- **Locations:**
  - [`packages/ai/probe-durable.mjs:1-107`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/ai/probe-durable.mjs#L1-L107) (`0` references; uses `/* eslint-disable */` and `@mastra/libsql` temporary probe)
  - [`packages/db/scripts/db-check.mjs:1-26`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/db/scripts/db-check.mjs#L1-L26) (`0` references; line 1 literally says `// Quick diagnostic against the live Postgres URL. Local-only; not committed.`)
  - [`packages/db/scripts/list-tables.mjs:1-21`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/db/scripts/list-tables.mjs#L1-L21) (`0` references; ad-hoc query script)
  - [`package.json:38`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/package.json#L38) (`build:packages` script omits `@kestrel/loadtest`)
- **Concrete Failure Scenario:**
  `packages/db/scripts/db-check.mjs` explicitly states `// Local-only; not committed.` on line 1, yet both it and `list-tables.mjs` are committed in `packages/db/scripts/` and ignored by [`knip.json:30-31`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/knip.json#L30-L31) (`"entry": ["src/**/*.ts", "scripts/**/*.ts"]` — `.mjs` is ignored by Knip because the glob only matches `.ts`!). Similarly, `packages/ai/probe-durable.mjs` sits at the root of `packages/ai/` and is ignored by Knip.
- **Remediation Diff:**
  Delete the three scratch scripts (`packages/ai/probe-durable.mjs`, `packages/db/scripts/db-check.mjs`, `packages/db/scripts/list-tables.mjs`) and wire `setup-telegram-webhook.ts` into `apps/web/package.json#scripts` (after applying **F-05**).

#### Finding F-15 (`P3-Low`) — 127 Unused or Test-Only Exported Symbols in `packages/shared`

- **Locations:**
  - [`packages/shared/src/index.ts:20-160`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/shared/src/index.ts#L20-L160)
  - [`packages/shared/src/env.ts:488-496`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/shared/src/env.ts#L488-L496) (`DEPRECATED_ENV_ALIASES`, `getDeprecatedEnvAliases`)
  - [`packages/shared/src/logger.ts:35-328`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/shared/src/logger.ts#L35-L328) (`LOG_CATEGORIES`, `createPinoLogger`, `createScopedLogger`, `AgentLogData`, `logForAgent`)
  - [`packages/shared/src/url-safety.ts:53-70`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/shared/src/url-safety.ts#L53-L70) (`isSafeOutboundHttpUrl`, `assertSafeOutboundHttpUrl` — superseded by `packages/shared/src/safe-url.ts`)
  - [`packages/shared/src/schemas/ui-parts.ts:41-251`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/shared/src/schemas/ui-parts.ts#L41-L251) (`PlanDomainSchema`, `VerifyWarningPart`, `CommitteeReportPartSchema`, `CiteSourceSchema`, `UsageMetaSchema`, `StreamToolPart`, `UiPartSchema`)
- **Concrete Failure Scenario:**
  Because [`knip.json:37-40`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/knip.json#L37-L40) configures `"packages/shared": { "entry": ["src/**/*.ts"] }`, Knip treats **every file** in `packages/shared/src/` as an independent public entry point and never flags unused exports in `packages/shared`! Cross-monorepo symbol analysis shows `98` exported types/consts/functions in `packages/shared/src/` have **zero** references anywhere outside their defining file, and another `29` exports are referenced only in `packages/shared/test/*.test.ts` (including `packages/shared/src/url-safety.ts`, which is a duplicate SSRF helper superseded by `packages/shared/src/safe-url.ts`, and `DEPRECATED_ENV_ALIASES = {}` in `packages/shared/src/env.ts:488-496`, which is an empty object left over after 0.3.0 removed legacy aliases).
- **Remediation Diff:**

```diff
--- a/knip.json
+++ b/knip.json
@@ -35,7 +35,19 @@
       "project": ["src/**/*.ts", "test/**/*.ts"]
     },
     "packages/shared": {
-      "entry": ["src/**/*.ts"],
+      "entry": [
+        "src/index.ts",
+        "src/schemas/*.ts",
+        "src/ai/*.ts",
+        "src/byok.ts",
+        "src/env.ts",
+        "src/env-secrets.ts",
+        "src/vault.ts",
+        "src/errors.ts",
+        "src/encryption.ts",
+        "src/logger.ts",
+        "src/metrics-export.ts"
+      ],
       "project": ["src/**/*.ts"]
     },
```

#### Finding F-16 (`P3-Low`) — Outdated & Contradictory Documentation and Duplicate `kestrel-ux-upgrade-plan.md`

- **Locations:**
  - [`README.md:195-221`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/README.md#L195-L221) (Documents 5 analysis modes `single`, `quick`, `standard`, `full`, `auto` and Mermaid router diagram, contradicting the 2-mode `single`/`full` implementation after Audit v2 Q8)
  - [`README.md:285-296`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/README.md#L285-L296) (Documents `ENCRYPTION_SECRET=your_32_character_encryption_secret` and nonexistent `BYOK_ENABLED=1`)
  - [`README.md:407`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/README.md#L407) & [`docs/troubleshooting.md:75`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/docs/troubleshooting.md#L75) vs [`docker-compose.yml:113`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/docker-compose.yml#L113) (`docker-compose.yml:113` defines `'127.0.0.1:${APP_PUBLISHED_PORT:-3000}:3000'`, so setting `APP_PUBLISHED_PORT=127.0.0.1:3002` as instructed in `docs/troubleshooting.md:75` and `README.md:407` expands to invalid `127.0.0.1:127.0.0.1:3002:3000` and breaks `docker compose up`)
  - [`docs/README.md:20`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/docs/README.md#L20) (References `architecture-explorer.html` and `architecture-explorer.json` in `docs/`, neither of which exists)
  - [`docs/troubleshooting.md:89`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/docs/troubleshooting.md#L89) (Instructs `pnpm --filter @kestrel/db db:migrate`, whereas [`packages/db/package.json:37`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/packages/db/package.json#L37) defines `migrate:apply`)
  - [`docs/troubleshooting.md:233`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/docs/troubleshooting.md#L233) (Instructs `KESTREL_OFFLINE_MODE=1 pnpm dev:local`, whereas `dev:local` was removed from `package.json` in commit `2ba34cc`)
  - [`docs/release.md:37`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/docs/release.md#L37) & [`docs/release.md:96-105`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/docs/release.md#L96-L105) (Instructs running `pnpm changeset`, which is not installed in the repository)
  - [`kestrel-ux-upgrade-plan.md:1`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/kestrel-ux-upgrade-plan.md#L1) & [`docs/kestrel-ux-upgrade-plan.md:1`](https://github.com/HamaFx/Kestrel/blob/19167d075c1e05d77cb033e1e7239deb892b0554/docs/kestrel-ux-upgrade-plan.md#L1) (Identical `14,878`-byte file duplicated at both repo root and `docs/`)
- **Remediation Diff:**

````diff
--- a/docker-compose.yml
+++ b/docker-compose.yml
@@ -110,7 +110,7 @@ services:
     ports:
       # APP_PUBLISHED_PORT lets operators (or the setup wizard) remap the
       # host port when 3000 is already taken. Binds localhost only.
-      - '127.0.0.1:${APP_PUBLISHED_PORT:-3000}:3000'
+      - '${APP_PUBLISHED_PORT:-127.0.0.1:3000}:3000'
     environment:
       DATABASE_URL: postgres://hamafx:${POSTGRES_PASSWORD}@db:5432/hamafx
--- a/docs/troubleshooting.md
+++ b/docs/troubleshooting.md
@@ -86,7 +86,7 @@ Avoid `3001`: that is Langfuse's published port when the observability profile i
 - For Docker: confirm the database container is healthy with `docker compose ps` and `docker compose logs db`.
 - For external PostgreSQL: verify `DATABASE_URL` is reachable and credentials are valid.
 - Ensure the database has the pgvector extension enabled (`CREATE EXTENSION IF NOT EXISTS vector;`).
-- Verify migrations ran successfully (`pnpm --filter @kestrel/db db:migrate`).
+- Verify migrations ran successfully (`pnpm --filter @kestrel/db migrate:apply`).

 ## Updating Kestrel
@@ -230,7 +230,7 @@ Providers are optional and subject to availability and licensing. Check provider
 For deterministic local development without market-data network requests:

 ```bash
-KESTREL_OFFLINE_MODE=1 pnpm dev:local
+KESTREL_OFFLINE_MODE=1 pnpm dev
````

--- a/docs/README.md
+++ b/docs/README.md
@@ -16,5 +16,3 @@ Repository-level policy and status documents:

- [Security policy](../SECURITY.md) — vulnerability reporting and security responsibilities
- [Contributing](../CONTRIBUTING.md) — contributor workflow and coding rules
- [Support](../SUPPORT.md) — support channels and diagnostic information
-

-The `architecture-explorer.html` and `architecture-explorer.json` files in this directory are static informational snapshots. They are not runtime dependencies and are not generated automatically during builds.

```

## 4. Proposed Patch Plan (Awaiting Approval Gate)

Once approved, the fixes above will be applied in four atomic, verifiable commits:

1. **Batch 1 — Runtime Env & Boot Fail-Fast Contracts (`F-10`, `F-11`, `F-12`):**
   - Replace raw `process.env as unknown as ...` in `apps/worker/src/jobs/multi-agent-analysis.ts:215` with `parseServerEnv(process.env)` and add `ENCRYPTION_SECRET` validation to `apps/worker/src/env.ts`.
   - Enforce `/^[0-9a-fA-F]{64}$/` on `ENCRYPTION_SECRET` in `packages/shared/src/env.ts:44` and fix the 32-char value in `loadtest/docker-compose.loadtest.yml:113`.
   - Update `REQUIRED_HEALTH_ENV_VARS` in `packages/shared/src/env-secrets.ts:65-69` to `['DATABASE_URL', 'AUTH_SECRET', 'CRON_SECRET', 'ENCRYPTION_SECRET']`.
2. **Batch 2 — Turborepo Pipeline, Package Exports & Dependency Alignment (`F-01`, `F-02`, `F-03`, `F-04`):**
   - Add `resolve: { conditions: ['source'] }` to `apps/web/vitest.config.ts`, `apps/worker/vitest.config.ts`, and `packages/ai/vitest.config.ts`.
   - Fix `./portfolio` and `./notifications` export subpaths and remove dead `./prompt`, `./types`, and `./verification` entries in `packages/ai/package.json:66-100`.
   - Add `inputs` and missing `env` keys to `turbo.json`, align `react` (`^19.2.8`) and `typescript` (`^7.0.2`), remove redundant `packages/test-utils` from `pnpm-workspace.yaml`, and update worker esbuild target to `node22`.
3. **Batch 3 — Package Boundaries, Circular Dependencies & Type Strictness (`F-05`, `F-06`, `F-07`, `F-08`, `F-09`, `F-13`):**
   - Fix `apps/web/scripts/setup-telegram-webhook.ts:27` to import from `@kestrel/ai/bot`.
   - Move `packages/shared/test/storage-boundary.test.ts` to `packages/data/test/storage-boundary.test.ts` and include `"test/**/*.ts"` in `packages/shared/tsconfig.json`.
   - Break barrel cycles in `packages/db/src/active-users.ts`, `packages/db/src/queries/billing.ts`, and `packages/ai/src/alerts/delivery.ts`.
   - Add `import 'server-only'` to `apps/web/src/lib/env.ts` and remove `export {} from './encryption'` from `packages/shared/src/index.ts:124`.
   - Replace `any` in `calendar.ts:40`, `thread-export.ts:58`, and `with-user-scope.ts:62`, and remove global `@/*` from `tsconfig.base.json`.
4. **Batch 4 — Dead Code & Documentation Cleanup (`F-14`, `F-15`, `F-16`):**
   - Remove orphaned scratch scripts (`packages/ai/probe-durable.mjs`, `packages/db/scripts/db-check.mjs`, `packages/db/scripts/list-tables.mjs`) and root duplicate `kestrel-ux-upgrade-plan.md`.
   - Update `README.md`, `docs/troubleshooting.md`, `docs/release.md`, `docs/README.md`, and `docker-compose.yml:113`.
```
