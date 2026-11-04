# Phase 7: Web State Sync, Build/Docker Fixes & Over-Engineering Cleanup

> **Goal:** Connect Dashboard state (`WatchlistWidget` and `PreSessionChecklistDrawer`) to PostgreSQL, fix all Docker/build/script/documentation defects, eliminate the `eventsource-parser` monkey-patch and dead dependencies, and optionally relax the file-fragmentation rules in `scripts/check-maintainability.mjs`.

---

> **Status:** Complete (2026-11-04). All four tasks delivered; `check:guards` 7/7, `knip` 0 findings, `check:fast` 29/29 after each task.
> **Verification Gate:** After each task, run `pnpm check:guards`, `pnpm knip`, and `pnpm check:fast`.

## Overview of Tasks

- [x] **Task 7.1 [Dashboard State Sync]:** Hydrate `WatchlistWidget` from the `user_symbols` database table and persist the Pre-Session Gameplan (`maxDailyR`, `primaryRule`) so the AI Risk Governor and AI Coach can read it.
- [x] **Task 7.2 [Docker, Build Scripts & Docs]:** Add `# syntax=docker/dockerfile:1.7` to Dockerfiles, fix `verify-production.mjs`, `merge-coverage-summary.mjs`, `predeploy-migrate.mjs`, `dev.ts`, `create-plugin.mjs`, `README.md`, and `DEPLOY.md`.
- [x] **Task 7.3 [Dependencies & Dead Artifacts]:** Rename `"source"` condition to `"@kestrel/source"` and delete `patches/eventsource-parser@3.1.1.patch`, remove unused `jsdom` and dead `seed:plans`/`seed:billing` scripts, and delete orphaned `infra/` and `packages/shared/src/metrics-export/*`.
- [x] **Task 7.4 [Owner-Authorized Maintainability & Schema Cleanup]:** Drop the 5 dead DB columns in migration `0126` and (with owner authorization) relax `scripts/check-maintainability.mjs` (`450 LOC .tsx`, `500 LOC .ts`, drop `RULE-F03` `useState` regex counter).

---

## Task 7.1: Connect Dashboard `WatchlistWidget` & Pre-Session Gameplan to PostgreSQL

### Problems

1. `WatchlistWidget` (`apps/web/src/app/(app)/dashboard/_components/widgets/watchlist-widget.tsx`) stores symbols in `localStorage` (`kestrel:watchlist-symbols:v1`), completely ignoring the user's database-backed watchlist configured in `/settings/symbols` (`user_symbols` table).
2. `PreSessionChecklistDrawer` (`apps/web/src/app/(app)/dashboard/_components/pre-session-checklist-drawer/use-session-gameplan.ts`) stores the trader's daily `maxDailyR`, `mindset`, and `primaryRule` only in `localStorage` (`kestrel:session-gameplan:YYYY-MM-DD`), so the AI Risk Governor in `/chat` and the AI Coach in `/journal` cannot access or enforce them.

### Files to Modify

- `apps/web/src/app/(app)/dashboard/page.tsx`
- `apps/web/src/app/(app)/dashboard/_components/dashboard-canvas/widget-registry.tsx`
- `apps/web/src/app/(app)/dashboard/_components/widgets/watchlist-widget.tsx`

### Implementation Steps

1. In `apps/web/src/app/(app)/dashboard/page.tsx`, include `listUserSymbols(userId)` (from `@kestrel/db`) inside the `withUserTenantRO` prefetch batch and pass `initialWatchlistSymbols` down to `WatchlistWidget` so it hydrates from the database watchlist (`user_symbols`) and persists additions/removals via the watchlist server action or API.
2. When a user locks in their daily Pre-Session Gameplan in `PreSessionChecklistDrawer`, also sync a compact summary into `user_settings` (or `plugin_storage` / working memory) so the AI Risk desk knows the user's active daily R cap and session rule.

### Verification

- Run `pnpm --filter @kestrel/web test` and `pnpm check:fast`.

---

## Task 7.2: Fix Dockerfiles, Build/Verification Scripts & Documentation Drift

### Problems Verified in Code

1. `Dockerfile` and `Dockerfile.worker` use `COPY --link` and `RUN --mount=type=cache` without `# syntax=docker/dockerfile:1.7` on line 1, causing Google Cloud Build to fail with `Unknown flag: link`.
2. `scripts/verify-production.mjs:122` probes `new URL('/health', workerUrl)` without a bearer token, whereas the worker exposes unauthenticated liveness at `/health/live` (`Dockerfile.worker:83`, `docker-compose.yml:206`).
3. `scripts/merge-coverage-summary.mjs:43` only scans `workspaceDirs('apps')` and `workspaceDirs('packages')`, omitting `workspaceDirs('plugins')`.
4. `package.json:7` runs `"dev": "tsx scripts/dev.ts && turbo run dev"` without `--env-file-if-exists=.env`, failing when `DATABASE_URL` is stored in `.env` rather than exported in the shell.
5. `scripts/predeploy-migrate.mjs:82` checks `DIRECT_URL` and `POSTGRES_URL_NON_POOLING` but omits `MIGRATION_DATABASE_URL` (which `DEPLOY.md:74,89` tells Vercel users to set).
6. `scripts/create-plugin.mjs:129,144,187` scaffolds deleted ESLint v10 configs (`eslint.config.js`, `"eslint": "^10.13.0"`) instead of `oxlint`.
7. `README.md:274` shows `DATABASE_URL=postgres://hamafx:...` (superuser bypassing RLS) instead of `kestrel_app`, and `README.md:19` shows `pnpm-9.15+` instead of `pnpm-12+`.
8. `DEPLOY.md:148-149` states `ENFORCE_BUDGET` is off by default, contradicting `docs/configuration.md:112` where `ENFORCE_BUDGET=1` is the default.
9. `loadtest/docker-compose.loadtest.yml:44,104` connects `app` and `worker` as the `kestrel` superuser instead of `kestrel_app`.

### Files to Modify

- `Dockerfile` & `Dockerfile.worker`
- `package.json`
- `scripts/verify-production.mjs`
- `scripts/merge-coverage-summary.mjs`
- `scripts/predeploy-migrate.mjs`
- `scripts/create-plugin.mjs`
- `README.md`, `DEPLOY.md`, `docs/configuration.md`
- `loadtest/docker-compose.loadtest.yml`

### Implementation Steps

1. Prepend `# syntax=docker/dockerfile:1.7` as line 1 of `Dockerfile` and `Dockerfile.worker`.
2. In root `package.json:7`, change `"dev"` to `"tsx --env-file-if-exists=.env scripts/dev.ts && turbo run dev"`.
3. In `scripts/verify-production.mjs:122`, change `new URL('/health', workerUrl)` to `new URL('/health/live', workerUrl)`.
4. In `scripts/merge-coverage-summary.mjs:43`, add `...workspaceDirs('plugins')`.
5. In `scripts/predeploy-migrate.mjs:82`, add `process.env.MIGRATION_DATABASE_URL` to the fallback list.
6. In `scripts/create-plugin.mjs`, replace the generated `eslint` script/devDependency and `eslint.config.js` with `"lint": "oxlint ."` and Vitest `pool: 'threads'`.
7. Update `README.md:19,274` (`pnpm-12+`, `postgres://kestrel_app:...`), `DEPLOY.md:74,83,89,148` (`DIRECT_URL` / `MIGRATION_DATABASE_URL`, `ENFORCE_BUDGET=1` default), and remove dead `CREDIT_LEDGER_RETENTION_DAYS` from `docs/configuration.md:191`.

### Verification

- Run `pnpm check:guards`, `pnpm knip`, and `pnpm check:fast`.

---

## Task 7.3: Eliminate `eventsource-parser` Patch, Prune Dead Dependencies & Orphaned Files

### Problems

1. `packages/config/typescript/base.json:6` sets `"customConditions": ["source"]`. Because `eventsource-parser@3.1.1` publishes a `"source": "./src/index.ts"` key in its npm `package.json`, bundlers try to compile its internal TypeScript source—requiring `patches/eventsource-parser@3.1.1.patch`. Using a scoped condition `"@kestrel/source"` in Kestrel's own workspace `package.json` files and `base.json` eliminates the collision with third-party `node_modules` packages permanently!
2. `apps/web/package.json:59` still lists unused `jsdom@^30.1.3` (replaced by `happy-dom`), and `packages/db/package.json:45-46` defines `seed:plans` and `seed:billing` pointing to non-existent files.
3. `infra/grafana/slos/kestrel-eval-success.yaml` is orphaned after Phase 4 removed the Prometheus `metrics-flush` job. (`packages/shared/src/metrics-export/*` was originally listed with it, but it is live: `flushMetrics` runs at the end of Mastra turns and in the eval runner, so it stays.)

### Files to Modify / Delete

- `packages/config/typescript/base.json`
- Workspace `package.json` files (`packages/*/package.json`, `plugins/package.json`, `plugins/*/package.json`)
- `pnpm-workspace.yaml` & `patches/eventsource-parser@3.1.1.patch` (delete patch)
- `apps/web/package.json` (remove `jsdom`)
- `packages/db/package.json` (remove `seed:plans`, `seed:billing`)
- Delete `infra/grafana/slos/kestrel-eval-success.yaml`
- Keep `packages/shared/src/metrics-export/*`: it still exports the OTLP Grafana exporter used by run telemetry and the eval runner.

### Implementation Steps

1. Replace `"source"` with `"@kestrel/source"` in `packages/config/typescript/base.json` (`"customConditions": ["@kestrel/source"]`) and in the `"exports"` map of all workspace `package.json` files (plus `vite.config` / `vitest.config.ts` `resolve.conditions` if referenced).
2. Remove `eventsource-parser@3.1.1` from `patchedDependencies` in `pnpm-workspace.yaml` and delete `patches/eventsource-parser@3.1.1.patch`.
3. Remove `"jsdom": "^30.1.3"` from `apps/web/package.json`, remove `"seed:plans"` and `"seed:billing"` from `packages/db/package.json`, and delete `infra/grafana/slos/kestrel-eval-success.yaml`.

### Verification

- Run `pnpm install`, `pnpm knip`, `pnpm check:guards`, and `pnpm check:fast`.

---

## Task 7.4: Database Schema Cleanup (`0126`) & Owner-Authorized Maintainability Rule Relaxation

> **Note for Coding Agents:** This task modifies `scripts/check-maintainability.mjs` and `AGENTS.md` with explicit owner authorization to stop artificial micro-file fragmentation. Update `AGENTS.md` and `scripts/check-maintainability.mjs` in the same commit.

### Problems

1. `user_settings` (`packages/db/src/schema/core/auth.ts:229-242`) still carries 4 dead spend-alert columns (`monthly_budget_limit`, `provider_spending_thresholds`, `spend_alerts_config`, `spend_alerts_state`) and `listAllUserSettings()` (`packages/db/src/queries/user-settings.ts:207`); `symbol_catalog` (`packages/db/src/schema/core/symbol-catalog.ts:30`) carries unused `n_data_symbol`; and `packages/db/src/schema/ops/plugins.ts:143-177` defines unused `createPluginTable`.
2. `scripts/check-maintainability.mjs` enforces `RULE-F02` (`<= 250 LOC` for `.tsx`), `RULE-F01` (`<= 350 LOC` for `.ts`), and `RULE-F03` (`<= 4 useState`, `<= 2 useEffect` via regex), forcing cohesive UI components to be split into 8–11 micro-files.

### Files to Modify

- `packages/db/src/schema/core/auth.ts`
- `packages/db/src/schema/core/symbol-catalog.ts`
- `packages/db/src/schema/ops/plugins.ts`
- `packages/db/src/queries/user-settings.ts`
- `packages/db/drizzle/0126_drop_dead_columns.sql` & `packages/db/drizzle/meta/_journal.json`
- `scripts/check-maintainability.mjs` & `AGENTS.md`

### Implementation Steps

1. Remove `createPluginTable` from `packages/db/src/schema/ops/plugins.ts` and `listAllUserSettings` from `packages/db/src/queries/user-settings.ts`.
2. Create migration `0126_drop_dead_columns.sql` (`ALTER TABLE "user_settings" DROP COLUMN IF EXISTS "monthly_budget_limit", DROP COLUMN IF EXISTS "provider_spending_thresholds", DROP COLUMN IF EXISTS "spend_alerts_config", DROP COLUMN IF EXISTS "spend_alerts_state"; ALTER TABLE "symbol_catalog" DROP COLUMN IF EXISTS "n_data_symbol";`), register it in `drizzle/meta/_journal.json` with a monotonic `when` timestamp, and remove those fields from the Drizzle table definitions and DTOs.
3. In `scripts/check-maintainability.mjs` and `AGENTS.md`:
   - Raise `MAX_TS_LOC` (`RULE-F01`) from `350` to `500`.
   - Raise `MAX_TSX_LOC` (`RULE-F02`) from `250` to `450`.
   - Remove `RULE-F03` (`MAX_USE_STATE = 4`, `MAX_USE_EFFECT = 2` regex check).

### Verification

- Run `pnpm --filter @kestrel/db test`, `pnpm check:guards`, `pnpm knip`, and `pnpm check:fast`.
