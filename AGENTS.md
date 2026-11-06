# Kestrel — Agent Engineering Handbook

Self-hosted, multi-user BYOK AI trading research platform for Gold (`XAUUSD`), Forex (11 pairs), and Crypto (6 pairs). Built as a 14-workspace monorepo on **Node.js `>=22.22.2`**, **pnpm `12.14.0`**, **Turborepo `2.11`**, **TypeScript 7 (`tsrs` Rust compiler)**, **Next.js `16.4`**, **React `19.3`**, **Mastra v2 (`@mastra/core` `1.78`)**, **Vercel AI SDK 7**, **Drizzle ORM `1.0.0-rc.5`**, and **PostgreSQL 16 + `pgvector`**.

`CLAUDE.md` and `apps/web/AGENTS.md` delegate to this file. Treat this handbook as the single source of truth for all coding agents across the repository.

---

## 1. Monorepo Architecture & Package Ownership

Dependencies flow strictly downward from Layer 1 to Layer 4. Never introduce circular dependencies across packages.

```
+------------------- [ KESTREL MONOREPO LAYERS ] -------------------+
|                                                                   |
| ●  layer 1 · runtime apps     @kestrel/web → @kestrel/worker      |
| │                                                                 |
| ●  layer 2 · ai and plugins   @kestrel/ai → @kestrel/plugins (x3) |
| │                                                                 |
| ●  layer 3 · data and db      db · data · indicators · plugin-sdk |
| │                                                                 |
| ○  layer 4 · leaf foundations shared · config · test-utils · k6   |
+-------------------------------------------------------------------+
```

| Workspace Package         | Path                  | Canonical Responsibility & Public Exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| :------------------------ | :-------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`@kestrel/web`**        | `apps/web`            | Next.js 16 App Router PWA, Auth.js v5 + TOTP 2FA, CSRF/CSP nonce proxy (`src/proxy.ts`), 76+ API controllers (`src/app/api/**`), domain orchestration services (`src/lib/services/**`), TradingView + SVG telemetry charts, and the Kestrel hardware UI (`src/app/globals.css`).                                                                                                                                                                                                                                                                          |
| **`@kestrel/worker`**     | `apps/worker`         | Long-running Node daemon (`src/index.ts`) and one-shot CLI (`src/runner/cli.ts`). Runs 8 core `node-cron` jobs (`src/jobs/index.ts`), 3 plugin jobs, `pg-boss` queues (`backtest-run`, `backtest-sweep`, `candle-flush`), `:8081` health probes, and opt-in 24/7 BiQuote SignalR + Binance WebSocket tick streaming (`WORKER_ENABLE_TICK_STREAM=1`).                                                                                                                                                                                                      |
| **`@kestrel/ai`**         | `packages/ai`         | Mastra v2 engine (`src/mastra-v2/`), Unified Router (`routeUnified`), Pure 4-Desk Committee (`src/committee/`: `technical`, `fundamental`, `risk`, `sentiment` → 4/4 numeric verifier → `fusion` SSE), hybrid `pgvector` + FTS RAG (`src/memory/`, `src/models/rag/`), integer-cent budget ledger (`src/budget/`), and AI-owned persistence (`alerts`, `journal`, `threads`, `telemetry`, `briefings`, `cot`, `news`, `push`, `share`, `snapshots`). Subpaths: `.`, `./cost`, `./persistence`, `./cron`, `./mastra-v2`, `./plugins`, `./instrumentation`. |
| **`@kestrel/plugins`**    | `plugins`             | Server-safe plugin discovery barrel (`plugins/registry.ts` → `@kestrel/plugins`) and client/React UI discovery barrel (`plugins/ui-registry.ts` → `@kestrel/plugins/ui`). Links `@kestrel/plugin-backtesting` (QuickJS WASM sandbox + `pg-boss` parameter sweeps), `@kestrel/plugin-paper-trading` (tick-evaluated virtual broker), and `@kestrel/plugin-telegram-bot` (per-user BotFather webhook, commands, alerts, and briefings).                                                                                                                     |
| **`@kestrel/plugin-sdk`** | `packages/plugin-sdk` | Declarative plugin contract (`definePlugin`, `PluginHost`, `pluginHost`), route helpers, auto-encrypted `.meta({ secret: true })` Zod settings descriptors (`./settings`), React UI registry (`./ui`), and Node-only `SKILL.md` resolver (`./skill-dir`).                                                                                                                                                                                                                                                                                                 |
| **`@kestrel/db`**         | `packages/db`         | Drizzle ORM v1 schema (`55` tables across `src/schema/{core,ai,market,ops,plugins}`), `128` v1 migration folders (`drizzle/`), dual-role RLS scopes (`withUserTenant`, `withUserTenantRO`, `withAdminDb`), `pg-boss` queue constants (`./queue`), and canonical SQL queries (`src/queries/*`). Subpaths: `.`, `./schema`, `./client`, `./queue`.                                                                                                                                                                                                          |
| **`@kestrel/data`**       | `packages/data`       | Multi-provider market data registry (`BiQuote`, `Binance`, `Finnhub`, `FRED`, `CFTC`, `Marketaux`), rolling health-scored failover (`src/failover.ts`), L1/L2 SWR cache (`./cache`), and `DataWithMeta` staleness envelopes (`getPriceWithMeta`, `getCandlesWithMeta`).                                                                                                                                                                                                                                                                                   |
| **`@kestrel/indicators`** | `packages/indicators` | Pure, dependency-free O(N) indicator math (`sma`, `ema`, `rsi`, `atr`, `macd`, `bollinger`, `pivots`), extensible plugin indicator kinds, and objective price structure (`swings`, `pdh-pdl`, `asian-range`).                                                                                                                                                                                                                                                                                                                                             |
| **`@kestrel/shared`**     | `packages/shared`     | Zero-internal-dependency leaf package: 18-symbol catalog (`XAUUSD`, 11 FX, 6 Crypto), Zod 4 schemas (`./schemas/*`), AES-256-GCM BYOK encryption (`./encryption`, `./byok`, `./vault`), IPv4/IPv6/NAT64 SSRF guard (`assertSafeOutboundUrl`), env contracts (`./env`, `./env-secrets`), and Pino structured logger (`./logger`).                                                                                                                                                                                                                          |
| **`@kestrel/config`**     | `packages/config`     | Shared TypeScript configs (`./typescript/{base,nextjs,node}`) with `"customConditions": ["@kestrel/source"]` and shared Tailwind tokens (`./tailwind/tokens`).                                                                                                                                                                                                                                                                                                                                                                                            |
| **`@kestrel/test-utils`** | `packages/test-utils` | Fast PostgreSQL template-database cloner (`createMigratedTestDatabase` using `CREATE DATABASE ... TEMPLATE` with `pg_advisory_lock`) and test factories.                                                                                                                                                                                                                                                                                                                                                                                                  |
| **`@kestrel/loadtest`**   | `loadtest`            | k6 load and smoke test suite (`tests/smoke-all.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

---

## 2. Verification Gates & Commands

Run commands from `/data/home/Kestrel` using `pnpm` (never `npm` or `yarn`).

- **Fast Inner Loop (Run Before Every Commit):**
  ```bash
  pnpm check:fast
  ```
  Runs all 8 static guards in parallel (`pnpm check:guards`), full-repo `oxlint` (`pnpm lint`), and `turbo run typecheck test --affected` with `NODE_COMPILE_CACHE`.
- **Individual Verification Gates:**
  - Static architecture & security guards (~200ms): `pnpm check:guards`
  - Typecheck all workspaces (~2s via `tsrs --noEmit`): `pnpm typecheck`
  - Lint all files (~0.8s via Rust `oxlint`): `pnpm lint`
  - Format write / check (via Rust `oxfmt`): `pnpm format` / `pnpm format:check`
  - Dead-code & unused-export check: `pnpm knip`
  - Unit tests (single workspace): `pnpm --filter @kestrel/<pkg> test`
  - Full unit test suite: `pnpm test`
  - **PostgreSQL RLS & Concurrency Integration Suite (Mandatory when touching `@kestrel/db`, migrations, RLS policies, auth/tenant scoping, or queue claims):**
    ```bash
    pnpm test:postgres-rls
    ```
    Spins up an ephemeral `pgvector/pgvector:pg16` Docker container, provisions `kestrel_app` (`NOBYPASSRLS`) and `hamafx_admin`, and executes all 6 Postgres-gated test suites.
- **Formatting & Git Hooks:**
  - Formatting is handled exclusively by `oxfmt` (`.oxfmtrc.json`) and auto-runs on edited files via `.claude/settings.json` (`scripts/format-edited-files.mjs`) and on staged files via `lefthook.yml`. Never add Prettier or ESLint configs.

---

## 3. The 8 Static Guards & How Not to Trip Them

`pnpm check:guards` (`scripts/check-all-guards.mjs`) runs 8 static checks concurrently. **Never weaken or bypass `scripts/check-*.mjs`, `.oxlintrc.json`, or `scripts/maintainability-baseline.json` to silence a failure.** Only edit `knip.json` when registering a genuine new entrypoint that passes `pnpm check:knip-config`.

| Guard Script                            | Command                              | What It Enforces & How to Comply                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| :-------------------------------------- | :----------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`check-maintainability.mjs`**         | `pnpm check:maintainability`         | • **`RULE-F01` / `RULE-F04`:** Backend `.ts` files and static catalogs must be `<= 500` LOC.<br>• **`RULE-F02`:** React `.tsx` files must be `<= 450` LOC. Keep cohesive components whole; do **not** split a component into micro-files unless it exceeds 450 LOC.<br>• **`RULE-F05`:** At most `<= 10` loose files directly under `apps/*/src/lib`, `packages/*/src`, or `plugins/*/src` (group modules into domain subdirectories), and **zero** `.test.ts(x)` files inside `src/` (all tests live in `test/`).<br>• **`RULE-R01`:** Zero empty `catch {}` blocks (handle the error or include an explicit comment explaining why it is ignored).<br>• **`RULE-R06`:** Bans imports of deleted legacy subsystems (`@kestrel/ai/mastra`, `stripe`, `gammal`, `nowpayments`, `@kestrel/shared/billing`). |
| **`check-route-security.mjs`**          | `pnpm check:route-security`          | • Every `apps/web/src/app/api/**/route.ts` file (unless in the `intentionalPublic` allowlist) must import and call a real auth wrapper: `withAdminAuth` (`@/lib/auth/admin-auth`) for `/api/admin/**`, `withCronAuth` (`@/lib/http/cron`) for `/api/cron/**`, or `withAuth` / `compose` (`@/lib/http/api`) for user routes.<br>• Every `POST`, `PUT`, or `PATCH` handler must parse request bodies with `parseJsonBody` (`@/lib/http/api`), never raw `req.json()`.                                                                                                                                                                                                                                                                                                                                       |
| **`check-env-contract.mjs`**            | `pnpm check:env-contract`            | • Any new environment variable referenced in `docker-compose.yml` or `docker-compose.observability.yml` **must** also be declared in `.env.example`, `packages/shared/src/env/index.ts`, `scripts/setup/secret-template.json`, and (if used by worker) `apps/worker/src/env.ts` + `docs/configuration.md`.<br>• Compose must keep `MULTI_USER_ENABLED=1`, `KESTREL_ENABLE_RLS=1`, and `REGISTRATION_MODE=first_user`.                                                                                                                                                                                                                                                                                                                                                                                     |
| **`check-doc-figures.mjs`**             | `pnpm check:figures`                 | • Validates every `mdxcn` plain-text figure (`+--- [ TITLE ] ---+`) across `docs/**/*.md`, `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `SUPPORT.md`, and `DEPLOY.md` for exact character-width alignment and sanctioned glyphs (`docs/figures.md`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **`check-compose-images.mjs`**          | `pnpm check:compose-images`          | • Every `image:` line in `docker-compose.yml` and `docker-compose.observability.yml` must be pinned to an immutable `@sha256:<64-hex>` digest.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **`check-compose-reproducibility.mjs`** | `pnpm check:compose-reproducibility` | • Ensures `docker-compose.yml` connects `app` and `worker` as the non-bypass `kestrel_app` role (`DATABASE_URL`) and runs migrations via `DIRECT_URL` (`hamafx` superuser) in `apps/web/docker-entrypoint.sh` and `migrate-runtime.mjs`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **`check-knip-config.mjs`**             | `pnpm check:knip-config`             | • Bans `src/**` wildcards and brace expansion `{}` inside `packages/*` entries in `knip.json`, and requires every `packages/*` `src/` entry in `knip.json` to match `package.json#exports` or `scripts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **`check-test-files.mjs`**              | `pnpm test:empty-guard`              | • Ensures every testable workspace has at least one `.test.ts(x)` file with at least one active `it(` / `test(` assertion.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

---

## 4. Domain-Specific Engineering Rules

### A. Build System & `@kestrel/source` Export Resolution

- **Source-First Dev & Typecheck:** `packages/config/typescript/base.json` sets `"customConditions": ["@kestrel/source"]`. Every internal workspace `package.json` `exports` entry must list `"@kestrel/source": "./src/..."` **first** before `"types"` and `"import"` so `pnpm typecheck`, `pnpm dev`, and `vitest` resolve `.ts` source directly without building `dist/`.
- **Production Compilation:** `pnpm build:packages` runs `tsrs -p tsconfig.build.json` followed by `node ../../scripts/rewrite-dist-imports.mjs dist` (which rewrites `@ai/*` and `@data/*` intra-package aliases and appends Node ESM `.js` extensions). Never remove `rewrite-dist-imports.mjs` from package build scripts.
- **No Pass-Through Shims:** When moving or renaming a module, update all callers directly and delete the old file. Never leave 1-line re-export shims behind.

### B. Database, Migrations & Multi-Tenant RLS (`@kestrel/db`)

- **Dual-Role RLS Model:**
  - Runtime queries run under `kestrel_app` (`NOBYPASSRLS`) when `KESTREL_ENABLE_RLS=1`. **Under `kestrel_app`, an unscoped query against an RLS table does not throw an error—it silently returns `0` rows!**
  - Wrap every user-scoped read in `withUserTenantRO(userId, ...)` and every user-scoped write in `withUserTenant(userId, ...)` from `@kestrel/db`.
  - Wrap cross-tenant background worker or admin queries in `withAdminDb(...)` from `@kestrel/db` (which uses `ADMIN_DATABASE_URL` / `hamafx_admin` with `BYPASSRLS`).
- **Precision & Column Types:**
  - All monetary values that accumulate (balances, realized PnL, fees, AI costs) **must** use `numeric(20, 8)` (or integer USD cents for `daily_ai_spend` and `ai_budget_reservations`). Never use `real` or `double precision` for money.
  - Market OHLCV candles and live ticks (`src/schema/market/candles-1m.ts`, `live-ticks.ts`) use `double precision`.
- **Drizzle v1 Migrations (`packages/db/drizzle/`):**
  - Migrations use the Drizzle Kit v1 folder layout: `drizzle/<YYYYMMDDHHMMSS>_<name>/{migration.sql,snapshot.json}`.
  - Generate schema migrations with `pnpm --filter @kestrel/db migrate:gen` (or `migrate:gen:custom` for custom SQL) and validate with `pnpm --filter @kestrel/db migrate:check`. Never hand-create a `migration.sql` folder without its `snapshot.json`, and **never edit an already-applied `migration.sql`** (its SHA-256 hash is verified by `scripts/predeploy-migrate.mjs`).
  - Note: Historical `snapshot.json` files prior to `0127_tenant_fk_indexes` are placeholders from the v0-to-v1 layout conversion; `0127+` and the tip are authoritative.
  - Every new tenant table must define `tenant_isolation` RLS policies and remain accessible to `kestrel_app` (see `drizzle/20261029185320_0119_grant_app_role_privileges/migration.sql`).
- **Query Ownership:** Canonical shared SQL queries live in `packages/db/src/queries/*` and are exported from `@kestrel/db`. Do not duplicate queries that `@kestrel/ai` already owns in `packages/ai/src/*/persistence/`.

### C. AI Engine, 4-Desk Committee & Budget Ledger (`@kestrel/ai`)

- **Single Database Accessor Inside `@kestrel/ai`:** Inside `packages/ai/`, always call `getDb()` from `@ai/runtime/db` (using the intra-package `@ai/*` alias rather than deep `../../..` imports). Never import the raw client directly outside `src/runtime/db.ts`.
- **One Native Read-Only Tool Registry:** `nativeCanonicalTools()` (`src/mastra-v2/tools/canonical/index.ts`) merges the 7 canonical market tools (`get_price`, `get_candles`, `get_indicators`, `search_knowledge`, `get_news`, `get_cot`, `get_market_structure`) with `nativeReadOnlyTools()` (`src/mastra-v2/tools/read-only/{market,analysis,user-data,system,web}.ts`). Tool names are part of the capability manifest and domain filter contract—never rename a tool without updating all callers.
- **Freshness & Staleness Propagation:** Every read-only market tool must preserve and disclose the freshness metadata (`ageSeconds`, `stale`, `source`) returned by `@kestrel/data` (`getPriceWithMeta`, `getCandlesWithMeta`).
- **Pure 4-Desk Committee & Hard 4/4 Verification Gate (`src/committee/`):**
  - `Full` mode collects a cached `SymbolResearchPacket`, runs all 4 specialist desks (`technical`, `fundamental`, `risk`, `sentiment`) in parallel with `runWithModelFallback`, and enforces a **strict 4-of-4 verification gate** (`verifier.ts` / `grounding.ts` within `±0.5` numeric tolerance). If any desk fails after retry, the workflow fails closed with `MastraModeStrictFailureError`. Verified opinions feed the conflict-resolving `fusion` synthesizer streamed directly over SSE.
- **Run-Scoped Cost & Integer-Cent Budget Ledger:**
  - Record every LLM/embedding generation via `createGenerationLedger()` (`src/persistence/generation-ledger.ts`).
  - Budget reservations (`src/budget/budget-reservations.ts`) operate strictly in integer USD cents inside a `FOR UPDATE` transaction against `daily_ai_spend`. Never introduce float-based budget math.

### D. Web Application, API Boundaries & Design System (`@kestrel/web`)

- **API Controller vs. Service Boundary (Enforced by `.oxlintrc.json`):**
  - `apps/web/src/app/api/**/*.ts` routes are HTTP controllers. They must wrap handlers in `withAuth`, `withAdminAuth`, or `withCronAuth`, parse bodies with `parseJsonBody`, and format errors with `errorResponse` (`@/lib/http/api`).
  - API routes may import canonical functions from `@kestrel/ai`, `@kestrel/data`, `@kestrel/db` (query helpers), and `@kestrel/shared`, or call `@/lib/services/*` when web-specific orchestration is required.
  - API routes **must never** import raw Drizzle internals (`@kestrel/db/schema`, `@kestrel/db/client`, `schema`, or `getDb`) or `@kestrel/indicators` / `@kestrel/plugin-*` directly.
  - `apps/web/src/lib/services/*` must contain genuine domain orchestration or multi-step queries—never 1-line pass-through re-exports.
- **Design System & CSS Token Contract (`apps/web/src/app/globals.css`, `docs/design-system.md`):**
  - Aesthetic: _Classical Antiquity Meets Cyber-Industrial Hardware_ (obsidian surfaces, milled aluminum specular edges, and `#ff3616` ember accents).
  - Always use the real `@theme` CSS tokens defined in `src/app/globals.css`:
    - **Surfaces & Borders:** `--color-bg` (`#121212`), `--color-bg-elev-1` (`#161616`), `--color-bg-elev-2` (`#1d1d1d`), `--color-bg-elev-3` (`#282828`), `--color-border` (`#2c2c2c`), `--color-divider` (`#1f1f1f`).
    - **Text & Brand:** `--color-fg` (`#e5e5e5`), `--color-fg-muted`, `--color-fg-subtle`, `--color-brand` (`#ff3616`), `--color-accent`.
    - **Market Semantics & Charts:** `--color-bull` (`#3f9e3d`), `--color-bear` (`#f03e3e`), `--color-warn` (`#d98f00`), `--color-info` (`#4fa3b5`), `--chart-positive`, `--chart-negative`, `--chart-line-primary`, `--chart-grid`, `--chart-band`.
    - **Tactile Surface Utilities:** Use `surface-ground`, `surface-card`, `surface-panel`, `surface-well`, `surface-well-deep`, `surface-chip`, `surface-button`, `kbd-keycap`, and `icon-housing-{brand,bull,bear,danger,warn,info}` instead of ad-hoc borders/shadows.
    - **Typography:** `font-display` (Funnel Display), `font-sans` (Funnel Sans), `font-mono` (Geist Mono with `tabular-nums`), `font-redaction` (Redaction Italic), `font-bebas` (Bebas Neue).

### E. Worker Daemon & Plugin Architecture (`@kestrel/worker`, `@kestrel/plugin-sdk`, `plugins/*`)

- **Worker Job Registry (`apps/worker/src/jobs/`):**
  - Every core scheduled job must be registered in `JOBS` (`src/jobs/index.ts`) and typed in `JobName` (`src/jobs/types.ts` — currently `alerts`, `embedding-backfill`, `briefings`, `cot`, `fred-actuals`, `news`, `resonance-sync`, `retention`) with its cron schedule, `lock: 'daily' | 'none'`, and `hcUuidEnvVar`.
  - Job functions receive `{ log, signal, tenantRouter }`; always honor `ctx.signal` (`AbortSignal`) and keep web `/api/cron/*` fallback routes in parity with worker jobs.
- **Server vs. Client Plugin Split (`plugins/`):**
  - Keep `plugins/registry.ts` (server capabilities: tools, skills, cron jobs, tick listeners, alert channels, packet enrichers, API routes) 100% free of React/browser imports so `@kestrel/worker` never pulls in UI dependencies.
  - Register React UI surfaces (pages, dashboard widgets, chat cards, nav items) exclusively in `plugins/<id>/src/ui/index.tsx` and `plugins/ui-registry.ts`.
  - Plugin JSX uses Tailwind v4 classes scanned via `@source '../../../../plugins/*/src/**/*.{ts,tsx}';` in `apps/web/src/app/globals.css`.

---

## 5. Documentation Figures (`mdxcn`)

- **Markdown docs, PRs, and audits use fenced plain-text `mdxcn` figures (`+--- [ TITLE ] ---+`), never Mermaid or hand-drawn ASCII boxes.**
- Templates, chooser rules, and grammar live in `docs/figures.md` and `.claude/skills/mdxcn/SKILL.md`.
- Every line in a figure must have the exact same character width, start and end with `|` or `+`, and use only printable ASCII or the sanctioned glyph set in `scripts/check-doc-figures.mjs`.
- Always run `pnpm check:figures` (or `pnpm check:guards`) after editing any `.md` file.

---

## 6. Testing Architecture & Anti-Bloat Policy

- **Hard Cap on Test Sprawl (~100 Test Files Total Across Monorepo):**
  - Do **not** create a new `.test.ts` file for every bug fix, ticket, or phase (`phase2-*`, `p0-4-*`). Add behavioral cases to the existing canonical domain test file in `<workspace>/test/`, or skip writing a unit test if `pnpm typecheck` and `pnpm check:guards` already enforce the invariant.
  - Stateless unit tests must stay compatible with `isolate: false` (`pool: 'threads'`); only singleton-mutating or database tests belong in isolated projects.
- **Six Forbidden Low-Value Test Categories:**
  1. **No `readFileSync` Source Grepping:** Never read `.ts`, `.tsx`, `.css`, `.sh`, or `docker-compose.yml` files as strings inside Vitest. Static code-shape rules belong only in `scripts/check-*.mjs`.
  2. **No Tailwind / CSS Class Assertions:** Never assert `className` tokens (`rounded-xl`, `h-11`, `surface-panel`) or static DOM markup in `.test.tsx` files.
  3. **No Mocked-ORM Chain Tests:** Never mock `@kestrel/db` query builders (`select().from().where()`) to assert that a function called Drizzle. Test database and RLS invariants with `pnpm test:postgres-rls`.
  4. **No Pass-Through Controller / Job Mocks:** Never write a test that mocks `@/lib/services/*` or `@kestrel/ai` just to assert `expect(mockFn).toHaveBeenCalled()`.
  5. **No Third-Party / Schema / Stub Tests:** Never test `clsx`, `tailwind-merge`, `server-only` stubs, static constant arrays, or Drizzle column existence.
  6. **No Coverage Threshold Gaming:** Coverage thresholds are intentionally omitted from `vitest.config.ts`. Never write filler tests to pad line coverage.

---

## 7. Common Tasks Quick-Reference Cheat Sheet

| Task                                  | Files to Update                                                                                                                                                 | Verification Command                                                |
| :------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------ |
| **Add / edit an API route**           | `apps/web/src/app/api/<path>/route.ts` (wrap with `withAuth` / `withAdminAuth` / `withCronAuth`; use `parseJsonBody` & `errorResponse`)                         | `pnpm check:route-security && pnpm lint`                            |
| **Add an environment variable**       | `.env.example`, `packages/shared/src/env/index.ts`, `scripts/setup/secret-template.json`, `docs/configuration.md`, plus `apps/worker/src/env.ts` if worker-used | `pnpm check:env-contract && pnpm typecheck`                         |
| **Add / alter a database table**      | `packages/db/src/schema/**` (include `tenant_isolation` RLS policy & `numeric(20,8)` for money) → run `pnpm --filter @kestrel/db migrate:gen`                   | `pnpm --filter @kestrel/db migrate:check && pnpm test:postgres-rls` |
| **Add a package subpath export**      | `<pkg>/package.json#exports` (put `"@kestrel/source": "./src/..."` first, then `"types"` & `"import"`) and `<pkg>/tsconfig.build.json` if needed                | `pnpm check:knip-config && pnpm typecheck && pnpm build:packages`   |
| **Add a read-only AI tool**           | `packages/ai/src/tools/*` + register in `packages/ai/src/mastra-v2/tools/canonical/` or `read-only/` + update capability/domain allowlists                      | `pnpm --filter @kestrel/ai test && pnpm typecheck`                  |
| **Add a scheduled worker job**        | `apps/worker/src/jobs/<name>.ts` → register in `apps/worker/src/jobs/index.ts` & `JobName` in `types.ts` + keep `apps/web/src/app/api/cron/*` in parity         | `pnpm --filter @kestrel/worker test && pnpm typecheck`              |
| **Add / edit a documentation figure** | Use an `mdxcn` template from `docs/figures.md` (`+--- [ TITLE ] ---+`)                                                                                          | `pnpm check:figures`                                                |
