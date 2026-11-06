# Kestrel Open-Source Launch Readiness Roadmap (`v0.1.0`)

> **Status:** Complete (2026-11-06). All Tier 1, Tier 2, and Tier 3 tasks were implemented and verified. The Git history was cleaned with `git filter-repo` (all commits preserved) and the public release is live under the [Apache License 2.0](http://www.apache.org/licenses/LICENSE-2.0).

```
+---------------- [ OPEN-SOURCE READINESS ROADMAP ] ----------------+
|                                                                   |
| ●  tier 1: must-fix blockers (pre-public)                         |
| │  ├─ B1  scrub phase10 doc leak, archive agent plans & git purge |
| │  ├─ B2  repair local dev, .env.local loading & port 3000        |
| │  ├─ B3  unify TLS/Supabase CA in wait-for-db & migrate-runtime  |
| │  ├─ B4  remove ghost providers (Alpha Vantage, .cn proxies)     |
| │  └─ B5  align Gemini 3.5 defaults & root .kestrel/dev-secrets   |
| │                                                                 |
| ●  tier 2: core polish (launch ready)                             |
| │  ├─ P1  overhaul README.md local quickstart & CHANGELOG.md      |
| │  ├─ P2  patch @hono/node-server & move @mastra/deployer to dev  |
| │  └─ P3  clean supabase-inventory.mjs, turbo.json & drizzle warn |
| │                                                                 |
| ○  tier 3: nice-to-haves (post-launch)                            |
|    ├─ N1  fix ci-fast push trigger, evals-nightly & PR template   |
|    └─ N2  wire all 6 Postgres test suites & rename hfx_csrf       |
+-------------------------------------------------------------------+
```

## Global Agent Constraints (`AGENTS.md`)

1. **Protected Guardrails:** Never weaken `scripts/check-*.mjs`, `scripts/maintainability-baseline.json`, or `.oxlintrc.json` to silence a failure.
2. **Code-Shape Limits:** Backend `.ts` files must stay `<= 500` LOC (`RULE-F01`), React `.tsx` files `<= 450` LOC (`RULE-F02`), package `src/` roots `<= 10` loose files (`RULE-F05`), zero empty `catch {}` blocks (`RULE-R01`), and zero explicit `any` types.
3. **Plain-Text Figures (`docs/figures.md`):** Any framed diagram in `README.md`, `CONTRIBUTING.md`, `SUPPORT.md`, `DEPLOY.md`, or `docs/**` must use the [mdxcn](https://mdxcn.dev) dialect and pass `pnpm check:figures`.
4. **Mandatory Per-Task Verification Gate:**
   ```bash
   pnpm format
   pnpm check:guards
   pnpm knip --no-progress
   pnpm check:fast
   ```

## Executive Summary Table

| ID     | Tier                    | Task Summary                                                                                                                                                                                                                     | Primary Files                                                                                                                          |
| :----- | :---------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------- |
| **B1** | **1. Must-Fix Blocker** | Scrub leaked cloud IDs from `docs/`, remove internal agent execution plans, and prepare clean Git history                                                                                                                        | `docs/roadmaps/phase10-open-source-launch-readiness.md`, `docs/superpowers/`                                                           |
| **B2** | **1. Must-Fix Blocker** | Fix broken `pnpm setup --mode=external` (`dev:local` crash, `.env.local` loading, `DATABASE_URL` generation, port `3002` vs `3000`)                                                                                              | `scripts/setup/steps/{launch,config}.mjs`, `package.json`, `apps/web/package.json`, `apps/worker/package.json`                         |
| **B3** | **1. Must-Fix Blocker** | Add missing TLS/Supabase CA support to `wait-for-db.mjs` and `migrate-runtime.mjs`, and deduplicate `predeploy-migrate.mjs`                                                                                                      | `apps/web/scripts/{wait-for-db,migrate-runtime}.mjs`, `scripts/predeploy-migrate.mjs`, `Dockerfile`                                    |
| **B4** | **1. Must-Fix Blocker** | Remove ghost Alpha Vantage setup prompt, remove hardcoded `.cn` proxy gateways (`hcnsec`, `iamhc`, `dphn`), and align [Ollama](https://ollama.ai) / [OpenRouter](https://openrouter.ai/docs) docs                                | `scripts/setup/lib/market-data.mjs`, `packages/shared/src/crypto/byok.ts`, `packages/ai/src/_providers/**`, `README.md`                |
| **B5** | **1. Must-Fix Blocker** | Update retired `gemini-2.5-*` env defaults to `gemini-3.5-*` and anchor `.kestrel/dev-secrets.json` at the monorepo root                                                                                                         | `packages/shared/src/env/schema/ai.ts`, `.env.example`, `docs/configuration.md`, `apps/web/src/lib/env.ts`                             |
| **P1** | **2. Core Polish**      | Overhaul `README.md` (Option 2 local flow + provider matrix), `scripts/setup/steps/mode.mjs`, and `CHANGELOG.md`                                                                                                                 | `README.md`, `CHANGELOG.md`, `scripts/setup/steps/mode.mjs`                                                                            |
| **P2** | **2. Core Polish**      | Patch `@hono/node-server` ([GHSA-rmxm-3fg6-px4f](https://github.com/advisories/GHSA-rmxm-3fg6-px4f)) and move `@mastra/deployer` ([GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)) to `devDependencies` | `pnpm-workspace.yaml`, `packages/ai/package.json`                                                                                      |
| **P3** | **2. Core Polish**      | Remove dropped billing tables from `supabase-inventory.mjs`, clean `turbo.json`, and silence `drizzle.config.ts` Knip noise                                                                                                      | `packages/db/scripts/supabase-inventory.mjs`, `turbo.json`, `packages/db/drizzle.config.ts`                                            |
| **N1** | **3. Nice-to-Have**     | Add `push` trigger to `ci-fast.yml`, fix `evals-nightly.yml` + `eval-gate.ts` RLS/migration crash, and customize PR template                                                                                                     | `.github/workflows/{ci-fast,evals-nightly}.yml`, `packages/ai/scripts/eval-gate.ts`, `.github/PULL_REQUEST_TEMPLATE.md`                |
| **N2** | **3. Nice-to-Have**     | Wire all 6 Postgres integration test files into `run-postgres-rls-test.mjs` and migrate `hfx_csrf` cookie prefix to `kestrel_csrf`                                                                                               | `scripts/run-postgres-rls-test.mjs`, `apps/web/src/proxy.ts`, `apps/web/src/lib/auth/csrf.ts`, `packages/plugin-sdk/src/ui/fetcher.ts` |

## Tier 1: Must-Fix Blockers (Pre-Public)

### Task B1: Scrub Leaked Cloud IDs in `docs/`, Prune Internal Agent Plans & Sanitize Git History

#### Why It Matters

Commit `63647b0a` scrubbed live GCP and Cloudflare identifiers from `docs/audit/`, but accidentally pasted those exact values verbatim into `docs/roadmaps/phase10-open-source-launch-readiness.md:15` in `HEAD`. Additionally, `docs/superpowers/` contains internal agent task checklists, and the 1,363-commit `.git` history still contains personal email addresses, Cloud Run URLs, Vercel project IDs (`.vercel/project.json` in `e98b80be`), and legacy VM hostnames (`37f808aa`, `01b13d2e`).

#### Files to Modify or Delete

- Modify: `docs/roadmaps/phase10-open-source-launch-readiness.md:15`
- Delete: `docs/superpowers/plans/2026-11-03-kestrel-high-value-test-architecture-plan.md`
- Delete: `docs/superpowers/plans/2026-11-06-kestrel-open-source-launch-plan.md`
- Modify: `docs/roadmaps/README.md:29` (remove link to deleted `docs/superpowers/plans/2026-11-06-kestrel-open-source-launch-plan.md`)

#### Step-by-Step Implementation

1. In `docs/roadmaps/phase10-open-source-launch-readiness.md`, replace lines 3–5 and line 15 so no literal GCP project IDs, project numbers, or Cloudflare account IDs appear:
   ```markdown
   > **Status:** Complete (2026-11-06). All Phase 10A and Phase 10B open-source readiness tasks have been executed and verified.
   ```
   And replace line 15 with:
   ```markdown
   - [x] Scrubbed live GCP project IDs, project numbers, Cloud Run URLs (`*.run.app`), legacy `.env` paths, and Cloudflare account IDs from `docs/audit/kestrel-cloud-run-deployment-2026-11-02.md` and `docs/audit/kestrel-cloudflare-hosting-analysis-2026-11-01.md`.
   ```
   Also mark Tasks 1–5 (`lines 20-24`) as `- [x]` and remove the reference to `../superpowers/plans/2026-11-06-kestrel-open-source-launch-plan.md`.
2. Delete the internal `docs/superpowers/` directory:
   ```bash
   git rm -rf docs/superpowers
   ```
3. In `docs/roadmaps/README.md:29`, update the Phase 10 status row from `In Progress` to `Complete` and remove the link to `docs/superpowers/plans/2026-11-06-kestrel-open-source-launch-plan.md`.
4. **Pre-Public Git History Cutover (Run right before flipping repo visibility to Public):**
   - Delete stale local and remote tags/branches that point to pre-scrubbed commits:
     ```bash
     git tag -d pre-debloat-20261010 kestrel_pre_drizzle_v1 2>/dev/null || true
     git branch -D drizzle-v1-upgrade 2>/dev/null || true
     ```
   - Either squash `main` into a clean initial `v0.1.0` public release commit (`git checkout --orphan oss-main && git add -A && git commit -m "feat: initial open-source release of Kestrel v0.1.0" && git branch -M oss-main main`) so zero historical cloud IDs, `.vercel/project.json` blobs, or personal emails exist in `.git`, or run `git filter-repo` with a `.mailmap` mapping all personal emails to `152925723+HamaFx@users.noreply.github.com`.

#### Verification

```bash
! git grep -n -E '(gen-lang-client-|\.run\.app)' -- ':!OPEN_SOURCE_ROADMAP.md'
pnpm check:guards
```

### Task B2: Fix Broken Local Development & External Setup Wizard (`dev:local`, `.env.local`, Port `3000`)

#### Why It Matters

A developer running `pnpm setup --mode=external` or following `README.md` Option 2 hits four immediate failures:

1. `scripts/setup/steps/launch.mjs:136, 314` runs `pnpm dev:local`, which does not exist in `package.json` (`ERR_PNPM_NO_SCRIPT`).
2. `scripts/setup/steps/config.mjs:79, 108-110, 134` writes only optional market keys to `.env.local` (no `DATABASE_URL`, no secrets) and prints `Saved external-mode settings to .env` (wrong filename).
3. Root `package.json:7` (`pnpm dev`) only passes `--env-file-if-exists=.env` (ignoring `.env.local`), and `apps/worker/package.json:9` loads neither `.env` nor `.env.local`.
4. `apps/web/package.json:7` runs `next dev --port 3002`, contradicting `NEXT_PUBLIC_APP_URL=http://localhost:3000` and `NEXTAUTH_URL=http://localhost:3000` across `.env.example`, `README.md`, and `launch.mjs:35`.

#### Files to Modify

- `apps/web/package.json:7`
- `apps/worker/package.json:9`
- `package.json:7`
- `scripts/setup/steps/launch.mjs:136, 314`
- `scripts/setup/steps/config.mjs:79-140`

#### Step-by-Step Implementation

1. In `apps/web/package.json:7`, remove `--port 3002` so Next.js uses port `3000` by default (matching `NEXT_PUBLIC_APP_URL` and `NEXTAUTH_URL`):
   ```json
   "dev": "next dev",
   ```
2. In `apps/worker/package.json:9`, load `.env` and `.env.local` automatically during `pnpm dev`:
   ```json
   "dev": "tsx watch --env-file-if-exists=../../.env --env-file-if-exists=../../.env.local src/index.ts",
   ```
3. In root `package.json:7`, load both `.env` and `.env.local` in `scripts/dev.ts`:
   ```json
   "dev": "tsx --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/dev.ts && turbo run dev",
   ```
4. In `scripts/setup/steps/launch.mjs`:
   - At line 136, change `${packageManagerLabel(getPackageManager())} dev:local` to `${packageManagerLabel(getPackageManager())} dev`.
   - At line 314, change `['dev:local']` to `['dev']`.
5. In `scripts/setup/steps/config.mjs`:
   - In the `else` branch for external mode (`lines 108-110`), ensure default local development values (`MULTI_USER_ENABLED: '1'`, `KESTREL_ENABLE_RLS: '1'`, `REGISTRATION_MODE: 'first_user'`, plus `DATABASE_URL` if already in `process.env` or existing `.env` files) are preserved, and fix line 134 to print `.env.local`:
     ```js
     ok(io, `Saved external-mode settings to ${paint('.env.local', 'dim')}`);
     ```

#### Verification

```bash
node scripts/setup.mjs --dry-run --yes --mode=external
pnpm check:guards && pnpm check:fast
```

### Task B3: Unify TLS & Supabase CA Resolution in `wait-for-db.mjs`, `migrate-runtime.mjs` & `predeploy-migrate.mjs`

#### Why It Matters

- `apps/web/scripts/wait-for-db.mjs:13-18` connects via `postgres(databaseUrl)` without `ssl` options, which fails TLS verification or hangs when the Docker image is pointed at an external managed PostgreSQL or Supabase instance (Deployment Profile 2).
- `apps/web/scripts/migrate-runtime.mjs:39-53` defines a custom `resolveSslOptions()` that lacks the `SUPABASE_ROOT_CA_2021` certificate fallback.
- `scripts/predeploy-migrate.mjs:165-218` still embeds a duplicate 22-line `SUPABASE_ROOT_CA_2021` PEM instead of importing `packages/db/scripts/lib/ssl.mjs`.

#### Files to Modify

- `Dockerfile:121-125`
- `apps/web/scripts/wait-for-db.mjs`
- `apps/web/scripts/migrate-runtime.mjs`
- `scripts/predeploy-migrate.mjs`

#### Step-by-Step Implementation

1. Create a shared, zero-build-dependency ESM helper `packages/db/scripts/lib/ssl-standalone.mjs` (or inline the canonical `resolvePostgresSslOptions` with `SUPABASE_ROOT_CA_2021` in `packages/db/scripts/lib/ssl.mjs` without requiring `../../dist/` so it works both before `build` and inside the Docker `runner` image).
2. In `apps/web/scripts/wait-for-db.mjs` and `apps/web/scripts/migrate-runtime.mjs`, use the unified `resolveSslOptions(databaseUrl, process.env)` (including `SUPABASE_ROOT_CA_2021` when `databaseUrl` contains `supabase.co` or `supabase.com`, and `false` for `@localhost` / `@127.0.0.1` or `DB_DISABLE_SSL=true` with `KESTREL_LOCAL_DOCKER=true`).
3. In `scripts/predeploy-migrate.mjs:164-218`, replace the 50-line inline `SUPABASE_ROOT_CA_2021` + `sslOption` block with `resolveScriptSsl(url)` imported from `../packages/db/scripts/lib/ssl.mjs`.

#### Verification

```bash
pnpm check:guards && pnpm --filter @kestrel/db test
```

### Task B4: Resolve AI & Market Provider Mismatch (Ghost Alpha Vantage, `.cn` Proxies vs. Ollama)

#### Why It Matters

- `scripts/setup/lib/market-data.mjs:48-55` prompts users to configure `ALPHAVANTAGE_API_KEY`, which is completely unused across the entire repository. (Actual supported optional market keys in `@kestrel/data` are [Finnhub](https://finnhub.io/dashboard), [Marketaux](https://marketaux.com/dashboard), and [FRED](https://fredaccount.stlouisfed.org/apikeys), alongside no-key [BiQuote](https://biquote.io) and Binance.)
- `packages/shared/src/crypto/byok.ts:36-74` and `packages/ai/src/_providers/` hardcode three niche third-party proxy endpoints (`hcnsec` at `https://api.hcnsec.cn/v1`, `iamhc` at `https://api.iamhc.cn/v1`, and `dphn` at `https://lighthouse.dphn.ai/run/text-v/v1`) as first-class providers in the UI, while `README.md:84, 256, 414-416` promises in-app **Ollama** support that does not exist.
- `ByokPayload` (`packages/shared/src/crypto/byok.ts:60, 70`) still carries deprecated `vertex?: string` and market-data `finnhub?: string` inside the AI key payload.

#### Files to Modify or Delete

- Modify: `scripts/setup/lib/market-data.mjs:48-55`
- Modify: `packages/shared/src/crypto/byok.ts:36-74`
- Delete: `packages/ai/src/_providers/dphn.ts`
- Delete: `packages/ai/src/_providers/xai-deepseek-iamhc/iamhc.ts`
- Delete: `packages/ai/src/_providers/xai-deepseek-iamhc/hcnsec.ts`
- Delete: `packages/ai/src/_providers/helpers/{dsml,fetch,json-payload,sse,tool-arguments,types}.ts`
- Modify: `packages/ai/src/_providers/helpers/index.ts`
- Modify: `packages/ai/src/_providers/xai-deepseek-iamhc/index.ts`
- Modify: `packages/ai/src/_providers/registry.ts`
- Modify: `packages/ai/src/models/helpers.ts:35-48, 86-98`
- Modify: `packages/shared/src/env/schema/ai.ts:28-29` & `.env.example:59-60` (remove `DPHN_API_KEY`)
- Modify: `apps/web/src/app/(app)/settings/api-keys/_components/provider-setup-instructions.ts:76-92`
- Modify: `apps/web/src/app/(app)/settings/api-keys/_components/provider-logo.tsx:22, 75-89`
- Modify: `scripts/setup/steps/mode.mjs:58-59`
- Modify: `packages/ai/test/byok-providers.test.ts` & `packages/ai/test/journal-stats.test.ts:83-84`

#### Step-by-Step Implementation

1. In `scripts/setup/lib/market-data.mjs:48-55`, remove the `alphavantage` object from `MARKET_DATA_PROVIDERS` (leaving `finnhub`, `marketaux`, and `fred`). Check `apps/web/test/` or setup tests for any `alphavantage` fixture references.
2. In `packages/shared/src/crypto/byok.ts`:
   - Keep the 8 official first-party/global AI providers in `PROVIDER_IDS`:
     `['google', 'anthropic', 'openai', 'groq', 'mistral', 'openrouter', 'xai', 'deepseek'] as const`
     ([Google Gemini](https://ai.google.dev/gemini-api/docs/models), [Anthropic](https://platform.claude.com/docs/en/about-claude/models/overview), [OpenAI](https://developers.openai.com/api/docs/models), [Groq](https://console.groq.com/docs/models), [Mistral](https://docs.mistral.ai/models/overview), [OpenRouter](https://openrouter.ai/docs), [xAI](https://docs.x.ai/developers/models), and [DeepSeek](https://api-docs.deepseek.com/quick_start/pricing)).
   - Remove `dphn`, `iamhc`, `hcnsec`, `vertex`, and `finnhub` from `ByokPayload`.
3. Delete `packages/ai/src/_providers/dphn.ts`, `packages/ai/src/_providers/xai-deepseek-iamhc/{iamhc,hcnsec}.ts`, and the HCNSEC-only DSML/SSE normalizer files in `packages/ai/src/_providers/helpers/{dsml,fetch,json-payload,sse,tool-arguments,types}.ts`. Update `packages/ai/src/_providers/helpers/index.ts`, `packages/ai/src/_providers/xai-deepseek-iamhc/index.ts`, `packages/ai/src/_providers/registry.ts`, and `packages/ai/src/models/helpers.ts`.
4. Remove `DPHN_API_KEY` from `packages/shared/src/env/schema/ai.ts`, `packages/shared/src/env/ai-env.ts`, and `.env.example`.
5. Remove `iamhc` and `hcnsec` from `provider-setup-instructions.ts:76-92`, `provider-logo.tsx:75-89` (and `case 'vertex':` at line 22), `scripts/setup/steps/mode.mjs:59`, `packages/ai/test/byok-providers.test.ts`, and `packages/ai/test/journal-stats.test.ts`.

#### Verification

```bash
! git grep -n -i -E '(hcnsec|iamhc|dphn|alphavantage)' -- apps/ packages/ plugins/ scripts/ .env.example
pnpm check:guards && pnpm knip --no-progress && pnpm check:fast
```

### Task B5: Align Default AI Model IDs & Anchor `.kestrel/dev-secrets.json` to Repo Root

#### Why It Matters

- `packages/ai/src/_providers/google.ts:30-35` notes that `gemini-2.5-*` models return HTTP 404 on new Google API keys and sets the provider defaults to `gemini-3.5-flash` / `gemini-3.5-flash-lite`. However, `packages/shared/src/env/schema/ai.ts:30, 36` still defaults `AI_DEFAULT_MODEL` to `'google/gemini-2.5-flash'` and `AI_TITLE_MODEL` to `'google/gemini-2.5-flash-lite'`, and `.env.example:61-62` defaults them to `openai/gpt-4o` / `openai/gpt-4o-mini`.
- `apps/web/src/lib/env.ts:36` computes `const DEV_SECRETS_PATH = resolve('.kestrel/dev-secrets.json')`. Because Next.js runs with `cwd = apps/web`, it writes `apps/web/.kestrel/dev-secrets.json` instead of `<repo-root>/.kestrel/dev-secrets.json`.

#### Files to Modify

- `packages/shared/src/env/schema/ai.ts:30, 36`
- `.env.example:61-62`
- `docs/configuration.md:135`
- `apps/web/src/lib/env.ts:36, 48`
- `packages/shared/test/env.test.ts` (update any default model snapshot assertions)

#### Step-by-Step Implementation

1. In `packages/shared/src/env/schema/ai.ts:30, 36`:
   ```ts
   AI_DEFAULT_MODEL: z.string().default('google/gemini-3.5-flash'),
   AI_TITLE_MODEL: z.string().default('google/gemini-3.5-flash-lite'),
   ```
2. In `.env.example:61-62` and `docs/configuration.md:135`, update `AI_DEFAULT_MODEL=google/gemini-3.5-flash` and `AI_TITLE_MODEL=google/gemini-3.5-flash-lite`.
3. In `apps/web/src/lib/env.ts:36, 48`, resolve `.kestrel/dev-secrets.json` relative to the monorepo root (or fall back to `apps/web/.kestrel/dev-secrets.json` if an existing local install already created one there):
   ```ts
   const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
   const DEV_SECRETS_DIR = resolve(REPO_ROOT, '.kestrel');
   const DEV_SECRETS_PATH = resolve(DEV_SECRETS_DIR, 'dev-secrets.json');
   ```
   And use `mkdirSync(DEV_SECRETS_DIR, { recursive: true })` in `writeDevSecrets`.

#### Verification

```bash
pnpm --filter @kestrel/shared test && pnpm --filter @kestrel/web test && pnpm check:guards
```

## Tier 2: Core Polish (Launch Ready)

### Task P1: Overhaul `README.md`, `CHANGELOG.md` & Setup Wizard Copy

#### Why It Matters

- `README.md` Option 2 (`lines 93-102`) tells local developers to run `docker compose up -d db && pnpm install && pnpm dev` without generating `.env` secrets first or running migrations, which fails on Step 1.
- `README.md` (`lines 84, 248-257, 414-418`) lists retired 2024/2025 models (`Claude 3.7 Sonnet`, `Gemini 2.0 Flash`, `GPT-4o`) and non-existent in-app Ollama settings instead of the actual 8 BYOK providers (`Google Gemini`, `Anthropic`, `OpenAI`, `Groq`, `Mistral`, `OpenRouter`, `xAI`, `DeepSeek`).
- `scripts/setup/steps/mode.mjs:29, 71` claims `✓ Langfuse UI` is included in default Docker mode, even though Langfuse is an opt-in overlay (`--with-observability`).
- `CHANGELOG.md` references non-existent files (`docs/pwa.md`, `docs/deployment-matrix.md`, `docs/plans/kestrel-subscription-credit-billing-plan.md`, `CONTRIBUTING.md §9`, `release.yml`) and lists removed features (`Custom Agents plugin`, `Stripe/NOWPayments credit billing`) under `[Unreleased] -> Added`.

#### Files to Modify

- `README.md:84, 93-102, 248-257, 346, 414-418`
- `scripts/setup/steps/mode.mjs:29, 71`
- `CHANGELOG.md`

#### Step-by-Step Implementation

1. In `README.md:93-102` (Option 2: Local Development), update the commands so they work cleanly from a fresh clone:
   ```bash
   # 1. Generate local secrets (.env) and start PostgreSQL 16 + pgvector
   ./docker/init-secrets.sh
   docker compose up -d db

   # 2. Install workspace dependencies
   pnpm install

   # 3. Apply database migrations & start the dev stack (http://localhost:3000)
   pnpm setup
   ```
2. In `README.md:84, 248-257, 414-418`:
   - Update the Supported AI Providers table to list the 8 supported BYOK providers (`OpenAI`, `Google Gemini`, `Anthropic`, `Groq`, `DeepSeek`, `xAI (Grok)`, `Mistral AI`, `OpenRouter`) with their current catalog models.
   - Replace the Ollama FAQ (`lines 414-418`) with instructions on using OpenRouter or free-tier Gemini / Groq keys.
   - In `README.md:346`, change `# Shared TypeScript & ESLint configs` to `# Shared TypeScript & Tailwind token configs`.
3. In `scripts/setup/steps/mode.mjs:29, 71`, label Langfuse as `'Langfuse UI (opt-in)'` / `'Optional --with-observability'` so users aren't surprised when port `3001` is off by default.
4. Rewrite `CHANGELOG.md` into a clean, accurate `## [0.1.0] - 2026-11-06` initial open-source release summary that reflects the shipped architecture (Next.js 16 PWA, 4-Desk Mastra Committee, Drizzle v1 + PostgreSQL 16 RLS with `kestrel_app`, 8 BYOK providers, 6 market data providers, and 3 official plugins: Backtesting, Paper Trading, and Telegram Bot) with zero dead doc links or removed billing/custom-agent entries.

#### Verification

```bash
pnpm check:figures && pnpm check:guards && pnpm format:check
```

### Task P2: Patch `@hono/node-server` Advisory & Move `@mastra/deployer` to `devDependencies`

#### Why It Matters

`pnpm audit --prod` currently reports 2 security advisories in production dependencies:

1. `@hono/node-server` (`<2.1.3`, moderate severity, [GHSA-rmxm-3fg6-px4f](https://github.com/advisories/GHSA-rmxm-3fg6-px4f)) via `@mastra/deployer > @hono/node-ws > @hono/node-server`.
2. `deepmerge` (`<=4.3.1`, low severity, [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)) via `@mastra/deployer > @rollup/plugin-node-resolve > deepmerge`.
   `@mastra/deployer` is only used by the Mastra CLI (`mastra dev` / `mastra build`), never imported by `@kestrel/ai` runtime code.

#### Files to Modify

- `pnpm-workspace.yaml`
- `packages/ai/package.json`

#### Step-by-Step Implementation

1. In `packages/ai/package.json`, move `"@mastra/deployer": "^1.78.0"` from `"dependencies"` (`line 68`) to `"devDependencies"`.
2. In `pnpm-workspace.yaml`, add `'@hono/node-server': '>=2.1.3'` under `overrides:`.
3. Run `pnpm install` to update `pnpm-lock.yaml` and verify `pnpm audit --prod` reports **0 vulnerabilities**.

#### Verification

```bash
pnpm audit --prod
pnpm check:guards && pnpm knip --no-progress && pnpm typecheck
```

### Task P3: Clean Up `supabase-inventory.mjs`, `turbo.json` & `drizzle.config.ts`

#### Why It Matters

- `packages/db/scripts/supabase-inventory.mjs:196-198, 232-233` still queries dropped billing tables (`payments`, `subscriptions`, `billing_webhook_dlq`), causing `pendingBillingDlq` to emit a SQL error on every live inventory run.
- `turbo.json:4` lists deleted `packages/config/eslint/*.js` in `globalDependencies`, and `turbo run typecheck` prints cache-output warnings for `@kestrel/config#typecheck` and `@kestrel/loadtest#typecheck`.
- `packages/db/drizzle.config.ts:31-36` prints `[drizzle-kit] None of DIRECT_URL... is set` during every `pnpm knip` run.

#### Files to Modify

- `packages/db/scripts/supabase-inventory.mjs:196-198, 232-233`
- `turbo.json:4`
- `packages/config/package.json`
- `packages/db/drizzle.config.ts:31-36`

#### Step-by-Step Implementation

1. In `packages/db/scripts/supabase-inventory.mjs`:
   - Remove `'payments'`, `'subscriptions'`, and `'billing_webhook_dlq'` from `knownTables` (`lines 196-198`).
   - Remove `pendingBillingDlq` from `integrityQueries` (`lines 232-233`).
2. In `turbo.json:4`, remove `"packages/config/eslint/*.js"` from `globalDependencies`.
3. In `packages/config/package.json`, remove the dummy `"typecheck": "echo 'no typecheck for config'"` script (or add `"@kestrel/config#typecheck": { "outputs": [] }` and `"@kestrel/loadtest#typecheck": { "outputs": [] }` in `turbo.json`) so `pnpm typecheck` runs with zero Turbo warnings.
4. In `packages/db/drizzle.config.ts:31`, guard the `console.warn` so it only prints when invoked by `drizzle-kit` (`process.argv.some((a) => a.includes('drizzle-kit'))`), keeping `pnpm knip` output completely clean.

#### Verification

```bash
pnpm typecheck && pnpm knip --no-progress && pnpm check:guards
```

## Tier 3: Nice-to-Haves (Post-Launch)

### Task N1: Fix GitHub Actions Workflows (`ci-fast.yml`, `evals-nightly.yml`) & PR Template

#### Why It Matters

- `.github/workflows/ci-fast.yml:5-6` only runs on `pull_request`, so the `README.md:14` CI status badge (`?branch=main`) never updates on `main` pushes.
- `.github/workflows/evals-nightly.yml` starts an empty `kestrel_test` database without running migrations, sets `KESTREL_ENABLE_RLS=0` / `MULTI_USER_ENABLED=0`, and runs `packages/ai/scripts/eval-gate.ts` (which queries `schema.chatTelemetry` via unscoped `getDb()` instead of `withAdminDb`).
- `.github/PULL_REQUEST_TEMPLATE.md` is generic boilerplate that does not mention Kestrel's static guards or `oxfmt`/`oxlint` checks.

#### Files to Modify

- `.github/workflows/ci-fast.yml:5-6`
- `.github/workflows/evals-nightly.yml:17-54`
- `packages/ai/scripts/eval-gate.ts:27, 75-80`
- `.github/PULL_REQUEST_TEMPLATE.md`

#### Step-by-Step Implementation

1. In `.github/workflows/ci-fast.yml:5-6`, add `push: branches: ['main']`:
   ```yaml
   on:
     push:
       branches: ['main']
     pull_request:
   ```
2. In `packages/ai/scripts/eval-gate.ts:27, 75-80`, import `withAdminDb` from `@kestrel/db` and wrap the `schema.chatTelemetry` query in `await withAdminDb(async (db) => db.select(...))` so it works under RLS.
3. In `.github/workflows/evals-nightly.yml`:
   - Add a `pnpm --filter @kestrel/db migrate:apply` step after `Build packages`.
   - Set `ADMIN_DATABASE_URL: postgres://postgres:postgres@localhost:5432/kestrel_test`, `KESTREL_ENABLE_RLS: '1'`, and `MULTI_USER_ENABLED: '1'`.
4. Update `.github/PULL_REQUEST_TEMPLATE.md` checklist items to reference `pnpm check:guards`, `pnpm knip`, `pnpm format:check`, and `pnpm check:fast`, plus RLS tenant scoping (`withUserTenant` / `withUserTenantRO`).

#### Verification

```bash
pnpm check:guards && pnpm typecheck
```

### Task N2: Wire All 6 Postgres Test Suites into `run-postgres-rls-test.mjs` & Migrate `hfx_csrf` Cookie Name

#### Why It Matters

- `scripts/run-postgres-rls-test.mjs:46-57` only runs the 3 `@kestrel/db` Postgres test files (`postgres-app-role.test.ts`, `postgres-auth-rls.test.ts`, `money-exactness.test.ts`) and skips the other 3 Postgres-gated suites (`apps/web/test/settings-actions-app-role.test.ts`, `packages/ai/test/alerts-claim-postgres.test.ts`, `apps/worker/test/candle-outbox-postgres.test.ts`).
- Browser-visible CSRF cookies still use `hfx_csrf` / `__Host-hfx_csrf` (`apps/web/src/proxy.ts:95`, `apps/web/src/lib/auth/csrf.ts:28`, `packages/plugin-sdk/src/ui/fetcher.ts:23`), and `tools/lighthouse/run.mjs:37` still documents `hfx_auth`.

#### Files to Modify

- `scripts/run-postgres-rls-test.mjs`
- `apps/web/src/proxy.ts:95`
- `apps/web/src/lib/auth/csrf.ts:28`
- `packages/plugin-sdk/src/ui/fetcher.ts:23`
- `apps/web/test/csrf.test.ts` & `apps/web/test/middleware.test.ts`
- `tools/lighthouse/run.mjs:37`

#### Step-by-Step Implementation

1. In `scripts/run-postgres-rls-test.mjs`:
   - After Postgres becomes ready, run `pnpm --filter @kestrel/db migrate:apply` and `POSTGRES_APP_PASSWORD=kestrel-p2-app-password pnpm --filter @kestrel/db provision:app-role` against `url`.
   - Export `TEST_POSTGRES_ADMIN_URL`, `TEST_POSTGRES_APP_URL`, `RUN_POSTGRES_RLS_TESTS=1`, `RUN_AI_QUEUE_POSTGRES_TESTS=1`, and `DB_DISABLE_SSL=true`, and run all 6 Postgres integration test files across `@kestrel/db`, `@kestrel/ai`, `@kestrel/worker`, and `@kestrel/web`.
2. In `apps/web/src/proxy.ts:95`, change the minted cookie name to `useSecureCookie ? '__Host-kestrel_csrf' : 'kestrel_csrf'`, and accept either `kestrel_csrf` or legacy `hfx_csrf` during request reading in `apps/web/src/lib/auth/csrf.ts:28` and `packages/plugin-sdk/src/ui/fetcher.ts:23`. Update `apps/web/test/csrf.test.ts`, `apps/web/test/middleware.test.ts`, and `tools/lighthouse/run.mjs:37`.

#### Verification

```bash
pnpm test:postgres-rls
pnpm --filter @kestrel/web test
```

## Final Release Verification Gate

Once all tasks above are committed, run the complete pre-release verification sequence:

```bash
pnpm format:check
pnpm check:guards
pnpm lint
pnpm typecheck
pnpm knip --no-progress
pnpm audit --prod
pnpm test
pnpm test:postgres-rls
pnpm build:packages
pnpm --filter @kestrel/worker build
```
