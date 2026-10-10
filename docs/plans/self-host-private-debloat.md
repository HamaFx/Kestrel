# Plan — Private Self-Host Debloat & Simplification

**Repo:** `HamaFx/Kestrel` (`/home/ubuntu/Kestrel`)  
**Branch base:** `main` at `757812a9 feat!: remove single-user mode and PGlite` (already fast-forward merged from `codex/private-multi-user`; `main` is now the single truth — no `codex/*` branch to keep)  
**Prior plan closed:** `docs/plans/remove-single-user-mode-keep-multi-user.md` — all 8 slices complete. This plan is the **follow-up private-only simplification** you asked for.  
**Goal:** make the repo **private self-hosted only** (you host yourself, no open-source / single-use / OSS-vs-private duality), and remove everything that is over-complicated, dead, or only exists to support the removed modes. Deliverable is **direct commits on `main`** (no feature branch), phased slices, each commit reviewable standalone. No deploy required for the code PR; Docker + Postgres gates are noted.  
**Audience:** an implementation agent with repo write access (no infra deploy needed for the code change). Branch is `main` — work lands there directly.

---

## 0. Decisions — LOCKED 2026-10-10 (your answers)

> You answered 2026-10-10. Where you said "choose best", the choice below is marked **(auto-picked)** with rationale. This table is the source of truth for all slices.

| # | Question | You chose | Interpretation for this plan |
|---|----------|-----------|------------------------------|
| **Q1** | Billing — keep any of it? | **B — Keep billing** ("yeah keep billing system its needed") | Billing stays. Slice 4 becomes polish-only (guard it as disabled-by-default, keep docs/retention), not deletion. |
| **Q2** | Bundled observability (Langfuse + ClickHouse/Redis/MinIO) | **B — Overlay (auto-picked)** | **Why B not A:** A would delete local tracing entirely; as a self-hoster you still want optional LLM trace inspection without tripling default RAM. B keeps `docker compose up -d` minimal (db+app+worker+backup) and moves the 5 observability services to `docker-compose.observability.yml` so `docker compose --profile observability` is truly opt-in. Best of both: minimal default + available when you need it. |
| **Q3** | Sentry | **A — Remove** | Delete `@sentry/*`, `SENTRY_*` env wiring, instrumentation hooks. Private self-host logs are sufficient. |
| **Q4** | Deployment profiles | **B — Keep both** | Docker Compose (default) + external Postgres both stay. |
| **Q5** | Repo visibility | **A — Private** | Treat repo as private: `CODE_OF_CONDUCT.md` deleted, `CONTRIBUTING.md`/`SECURITY.md` rewritten for private, OSS supply-chain artifacts retired. |
| **Q6** | License | **A — Keep Apache-2.0 + NOTICE** | No license change. |
| **Q7** | AI providers | **Delete Vertex only, keep all others, improve providers system** | Remove Google Vertex AI transport (`GOOGLE_VERTEX_*`, `AI_GATEWAY` stays as env fallback path is separate), keep `openai, anthropic, google (direct Gemini), groq, mistral, openrouter, xAI, deepseek, hcnsec/iamhc` etc., and refactor the provider system per Slice 5 scope below. |
| **Q8** | CI | **A — Minimal** | Keep `ci-fast.yml` + `codeql.yml` only. Delete the other 8 workflows. |
| **Q9** | Landing / marketing | **A — Keep** | Landing showcase stays. |
| **Q10** | Update mechanism | **A — Simple `git pull && docker compose up -d --build` (auto-picked)** | **Why A:** For a private self-host with no public GHCR consumers, `pnpm update` / `changesets` / `release.yml` / `docker-publish.yml` + Trivy provenance is OSS release overhead. `git pull && docker compose up -d --build` preserves `.env`/volumes and is what you already do on a private box. Delete `scripts/update.mjs`, changesets publish path, and the two release workflows. |
| **Q11** | `hamafx` → `kestrel` rename | **A — Keep stable (auto-picked)** | **Why A:** `hamafx_pgdata` / `hamafx` DB role names are volume/data identifiers. Renaming would require `docker volume` + `pg_dump` migration and risk data loss for zero user-visible benefit. Keep with explicit comment. |
| **Q12** | `AUTH_MODE=legacy` + `__system__` | **A — Delete (auto-picked)** | **Why A:** Legacy `__system__` header-spoof bypass exists for k6/loadtest and leaks into `proxy.ts`/`auth.config.ts`/`layout.tsx`. Private self-host always has Postgres — real sessions are simpler, more secure, and remove a fake-user code path. k6 can use a seeded real user or be moved out of required CI. |

No further blocking questions. Implementor starts on `main` at `757812a9`.

---

## 1. What was already done (so we don't re-do it)

* `codex/private-multi-user` → `main` merged (fast-forward `fc211958..757812a9`, pushed). 138 files, `+2025 / -5611`.
* Deleted: `OSS_SINGLE_USER_MODE`, `owner-first` advisory lock, `__system__` as auth user, PGlite (`packages/db/src/pglite-client.ts`, `local-db.ts`, fixtures, 20+ tests), `scripts/check-single-user-release.mjs`, `MULTI_USER=0 / RLS=0` assertions.
* Canonical now: `MULTI_USER_ENABLED=1`, `KESTREL_ENABLE_RLS=1`, `REGISTRATION_MODE ∈ {open, disabled}`, admin requires `role='admin'`, Postgres required everywhere, `ADMIN_DATABASE_URL` required for worker/cron.

---

## 2. Full audit — what is still over-complicated / removable / polishable

> Scope: everything reachable without a deploy — `turbo.json`, `.env.example`, `docker-compose.yml`, `scripts/`, `.github/workflows/`, `docs/`, `packages/*/src`, `apps/*`, `infra/`.

### 2.1 Source of complexity

| # | Area | What exists | Why it's complex / not needed private | Verdict (with locked decisions) |
|---|------|-------------|----------------------------------------|----------------------------------|
| 1 | **Dual env validation** | `packages/shared/src/env.ts` (539 lines) + `apps/web/src/lib/env.ts` (253 lines) + `apps/worker/src/env.ts` (193 lines) — 3 overlapping Zod schemas, duplicate `VERCEL_ENV=preview` fallbacks, two `normalizeRawSecrets`. | Same secrets validated 2–3 times; `apps/web/src/lib/env.ts` re-parses `NEXTAUTH_SECRET`, `DEV_SECRETS_PATH`, `LEGACY_DEV_SECRETS_PATH`. After PGlite removal, dev mode stalls are gone. | **Polish** — keep `packages/shared/src/env.ts` canonical; thin `apps/web/src/lib/env.ts` to dev-cache only; delete duplicated normalizers. |
| 2 | **`turbo.json:globalEnv` (48 entries)** | Lists `VERCEL`, `SUPABASE_*`, `POSTGRES_PRISMA_URL`, `AI_FUNDAMENTAL_MODEL`, etc. not present in `packages/shared/src/env.ts`. | Turborepo invalidates cache on these; `SUPABASE_*` is a dead Vercel/Supabase host artifact; `AI_FUNDAMENTAL_MODEL` was never a real var. | **Remove** — trim to vars that actually exist (Slice 9). |
| 3 | **Bundled observability adds 5 stateful services** | `docker-compose.yml` app = ~80 lines; observability profile = ~220 lines (`clickhouse` 1g, `redis`, `minio` (Chainguard), `langfuse`, `langfuse-worker`) + 4 named volumes + `docker/postgres/init-langfuse-db.sh`. | Triples RAM/CPU for a single-host install, slows `docker compose up`, forces `LANGFUSE_*` secrets even when unused. | **Q2=B — move to `docker-compose.observability.yml` overlay**; default compose stays minimal. |
| 4 | **11 release-verification scripts** (`check-*`, `generate-sbom`, `generate-license-report`, `verify-*`) | `package.json:scripts` has 11 `check:*` + 3 `generate:*`. `ci-fast` runs 7 `check:*` + `turbo lint/typecheck/build/bundle-size`. | OSS supply-chain gates (SBOM, provenance, license inventory, dep report) protect downstream consumers you don't have on a private host. | **Remove/consolidate per Q5/Q8/Q10** — Slice 1 + 6. |
| 5 | **`BYOK_ENABLED` feature flag** | `packages/shared/src/env.ts:BYOK_ENABLED` still toggles `default 0`, `.env.example`, `secret-template.json`, `docker-compose.yml`. Code never gates on it — `@kestrel/ai` BYOK is the only path; server-level keys are env fallbacks. | Dead flag adds a 4th `MULTI_USER/RLS/REGISTRATION` guard readers must understand. | **Delete** — BYOK is the only mode; env-fallback stays as fallback, not a flag. |
| 6 | **Auth legacy bypass** | `AUTH_MODE=legacy` in `apps/web/src/proxy.ts:92`, `auth.config.ts:64`, `layout.tsx:69`, plus `__system__` in `loadtest/lib/auth.ts`, `loadtest/docker-compose.loadtest.yml`. | Exists for k6; leaks into app layout/proxy. Private self-host shouldn't need a header-spoofed fake user. | **Q12=A — delete from app code**; isolate or drop loadtest profile. |
| 7 | **Compat shims** | `NEXTAUTH_SECRET` → `AUTH_SECRET` (grace to 0.3.0) in `packages/shared/src/env.ts:486` + `apps/web/src/lib/env.ts:195`, `LEGACY_DEV_SECRETS_PATH=.hamafx/dev-secrets.json`, `KESTREL_LOCAL_DOCKER` / `DB_DISABLE_SSL`, `UNLIMITED_SYMBOLS`, `PER_USER_BRIEFINGS`. | 0.2.0 grace is now done; keeping it prolongs two-truth config. `UNLIMITED_SYMBOLS` is dead (`transform(()=>false)`). | **Remove** — Slice 2 (leave only what Q4 needs). |
| 8 | **Billing surface** | `BILLING_ENABLED`, `NOWPAYMENTS_*` in env/compose/template, `packages/db/src/schema/billing.ts`, `queries/billing*`, `ipn-events`, `/api/billing/*`, DLQ retention 90d. | User kept billing (Q1=B) — keep it but ensure it's disabled-by-default and never forced in `docker-compose.yml`. | **Keep, polish** — ensure no compose-level force, docs say opt-in. |
| 9 | **Provider sprawl + Vertex removal** | `packages/ai/src/byok-providers.ts` registers 10+ providers; `GOOGLE_VERTEX_*` transport is GCP-specific complexity (service-account JSON, `GOOGLE_APPLICATION_CREDENTIALS_JSON`). | Vertex requires GCP project + SA JSON + separate model prefix `google-vertex/`; for private self-host direct Gemini (`GOOGLE_GENERATIVE_AI_API_KEY`) + other BYOK providers cover the need. Keep the other 9 providers and improve the registry. | **Q7 — delete Vertex only, improve registry** (Slice 5). |
| 10 | **CI sprawl** | 10 workflows (`ci-fast`, `ci-slow`, `codeql`, `docker-backup`, `docker-publish`, `e2e-staging`, `loadtest`, `pr-labeler`, `release`, `stale`) + E2E sharding + blob-merge. | For a private repo, E2E sharding + `pr-labeler` + `stale` are overhead. | **Q8=A — keep `ci-fast` + `codeql` only**. |
| 11 | **Tooling sprawl** | `package.json:scripts` = 22 scripts (`test:postgres-rls`, `test:ai-postgres-queue`, `dev:local`, `eval:publish`, `docker:prune`, `publish-packages`) + `scripts/` = 27 files. | Hard to know the blessed path; `pnpm setup` + `pnpm dev` + `pnpm test` should be ~5 commands. | **Consolidate** — Slice 6. |
| 12 | **Docs sprawl** | `docs/` = 10 pages + `docs/plans/` + `docs/audit/`; `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`, `CODE_OF_CONDUCT.md` assume public repo. | Private self-host needs 3 pages max (install, operate, troubleshoot). | **Trim per Q5=A** — Slice 8. |
| 13 | **DB migration history** (96 files) + legacy volume names (`hamafx_pgdata`) | Heavy but append-only; volume names are intentional compat per `docker-compose.yml:486`. | Don't rewrite migrations; volume names are correctly kept (Q11=A). | **Keep** — document only (Slice 9). |
| 14 | **`packages/ai` exports sprawl** (30 `exports` in `packages/ai/package.json`) | Each `exports` maps a subpath; downstream can import deep paths. | Less surface to break is fewer exports; not urgent private. | **Polish later** — leave for now, note only. |

### 2.2 Concrete inventory of files / symbols to touch (ripgrep-verified)

* **Env contract source of truth:** `packages/shared/src/env.ts`, `apps/web/src/lib/env.ts`, `apps/worker/src/env.ts`, `.env.example` (169 lines), `scripts/setup/secret-template.json`, `scripts/setup/lib/generate-env.mjs`, `docker-compose.yml` (501 lines, app/worker env blocks).
* **Global cache keys:** `turbo.json:globalEnv` (48 entries, includes dead `SUPABASE_*`/`VERCEL_*`).
* **Compose optional profile:** `docker-compose.yml:55-321` (`clickhouse`, `redis`, `minio`, `langfuse`, `langfuse-worker`, volumes `clickhouse-data`, `clickhouse-logs`, `redis-data`, `minio-data`, `docker/postgres/init-langfuse-db.sh`).
* **Bundled telemetry opts:** `packages/ai/src/mastra-v2/*`, `packages/ai/package.json` deps `@langfuse/*`, `@mastra/langfuse`, `@opentelemetry/*` (keep remote sink, drop bundled stack — Q2=B keeps remote env vars, drops services/volumes/file).
* **Billing (kept):** `BILLING_ENABLED|NOWPAYMENTS` hits `packages/shared/src/env.ts:190`, `docs/configuration.md`, `packages/ai/src/billing*`, `apps/web/src/app/api/billing/webhook/route.ts` — keep, ensure opt-in.
* **Auth bypass (to delete):** `AUTH_MODE.*legacy|__system__` hits `apps/web/src/proxy.ts:92`, `apps/web/src/auth.config.ts:64`, `apps/web/src/app/(app)/layout.tsx:69`, `loadtest/**`.
* **Compat shims:** `DEPRECATED_ENV_ALIASES`, `NEXTAUTH_SECRET`, `LEGACY_DEV_SECRETS_PATH`, `UNLIMITED_SYMBOLS`, `PER_USER_BRIEFINGS`, `KESTREL_LOCAL_DOCKER`, `DB_DISABLE_SSL`.
* **Providers:** `packages/ai/src/byok-providers.ts`, `packages/ai/src/model*.ts`, `GOOGLE_VERTEX_*` across `packages/shared/src/env.ts`, `apps/worker/src/env.ts`, `packages/ai/src/model-helpers.ts`.

---

## 3. Target state (after)

* Single deployable app: Docker Postgres + web + worker (+ backup) is the only required surface by default; observability lives in `docker-compose.observability.yml` overlay (Q2=B), not in default compose.
* One env contract: `packages/shared/src/env.ts` is canonical; `.env.example` mirrors it exactly; `turbo.json:globalEnv` mirrors the same set; `NEXTAUTH_SECRET`, `HAMAFX_*`, `OSS_SINGLE_USER_MODE`, `BYOK_ENABLED`, `SENTRY_*`, `GOOGLE_VERTEX_*`, `AUTH_MODE=legacy` do not exist.
* Auth: only real sessions; no `__system__` user in app code; admin requires `role='admin'`.
* Billing: kept, disabled-by-default (`BILLING_ENABLED=0`), never forced in `docker-compose.yml`; docs mark it opt-in.
* Providers: Vertex deleted, all other providers kept; registry improved (see Slice 5).
* Docs: ≤4 operator-facing pages focused on private self-host; no OSS-boundary prose.
* CI: `ci-fast.yml` + `codeql.yml` only (Q8=A); `release.yml`/`docker-publish.yml` deleted (Q10=A).
* Repo is private; `CODE_OF_CONDUCT.md` gone, `CONTRIBUTING.md`/`SECURITY.md` private-scoped; no stale/labeler.

---

## 4. Phased implementation (9 slices, dependency-ordered — all on `main`)

> Each slice lists **files**, **edit shape** (delete/rewrite/move), and **verify**. Implementor lands slices as **stacked commits directly on `main`** so review can be per-commit. Pre-merge gate for every slice: `pnpm check:env-contract && pnpm turbo run typecheck && pnpm turbo run lint && pnpm build:packages && docker compose config --quiet` (with tmp `.env` populated via `scripts/setup/lib/generate-env.mjs`). DB slice also runs `pnpm --filter @kestrel/ai test` with a throwaway Postgres.

### Slice 0 — Lock decisions & baseline

* **Do:** record this §0 decisions table in commit message body; run full inventory: `rg -n "VERCEL|SUPABASE|NEXTAUTH_SECRET|HAMAFX|BYOK_ENABLED|__system__|AUTH_MODE.*legacy|BILLING_ENABLED|LANGFUSE|SENTRY|GOOGLE_VERTEX" --glob '!node_modules' --glob '!.git' --glob '!.next' | sort > /tmp/preflight.txt` and attach to commit. Commit nothing code-yet beyond this plan file.
* **Files:** this plan file (already updated).
* **Verify:** `pnpm check:env-contract` clean on current `main`; `docker compose config --quiet` clean with `ADMIN_DATABASE_URL` populated.

### Slice 1 — OSS/public machinery (Q5=A, Q10=A)

* **Files:** `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `SUPPORT.md`, `SECURITY.md`, `NOTICE`, `docs/DEPENDENCY_LICENSES.md`, `scripts/check-oss-release.mjs`, `scripts/check-p0-release.mjs`, `scripts/check-p3-release.mjs`, `scripts/check-dependency-report.mjs`, `scripts/check-release-archive.mjs`, `scripts/check-release-metadata.mjs`, `scripts/check-git-history-secrets.mjs`, `scripts/generate-sbom.mjs`, `scripts/generate-license-report.mjs`, `scripts/publish-langfuse-eval.mjs`, `scripts/run-eval-nightly.mjs`, `scripts/add-license.ts`, `.github/workflows/release.yml`, `.github/workflows/docker-publish.yml`, `scripts/update.mjs`, `skills-lock.json` (if OSS-skill only), `package.json:scripts` entries for the deleted checks, `docs/audit/OPEN_SOURCE_READINESS_AUDIT.md` if present.
* **Do:** Delete `CODE_OF_CONDUCT.md`; rewrite `CONTRIBUTING.md` → "private repo — branch/PR notes" only; slim `SECURITY.md` to "report via private GH advisory; no public email"; delete `scripts/check-oss-release.mjs` (+ `pnpm check:oss-release` script) and supply-chain scripts (`generate-sbom`, `generate-license-report`, `check-dependency-report`, `check-release-archive`, `check-release-metadata`, `check-git-history-secrets` — or move the one you want to keep under `scripts/ops/`); delete `release.yml`/`docker-publish.yml` and drop `changesets` publish path (`package.json:scripts:publish-packages`, `.changeset/` if present); delete `scripts/update.mjs` (+ `pnpm update` script) — update path is now `git pull && docker compose up -d --build`. Keep only scans you explicitly want — default is to delete all 6 above. Update `README.md` "Updating Kestrel" section to document `git pull && docker compose up -d --build` instead of `pnpm update`.
* **Verify:** `rg -n "OSS release|check:oss-release|pnpm update" --glob '!node_modules'` returns nothing (or only changelog history); `pnpm lint && pnpm turbo run typecheck` clean; CI workflow YAML validates.

### Slice 2 — Env contract: single source of truth (blocks all later slices)

* **Files:** `packages/shared/src/env.ts`, `.env.example`, `apps/worker/src/env.ts`, `apps/web/src/lib/env.ts`, `turbo.json:globalEnv`, `scripts/check-env-contract.mjs`, `scripts/check-compose-reproducibility.mjs`, `scripts/verify-local-env.mjs`.
* **Do:**
  1. Delete `BYOK_ENABLED` from `RuntimeEnv` in `packages/shared/src/env.ts` (BYOK is implicit — env-fallback stays as direct `AI_GATEWAY_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` fallback, not a flag).
  2. Delete `UNLIMITED_SYMBOLS` (dead `transform(()=>false)`) and keep `PER_USER_BRIEFINGS` only if you actually use per-user briefings — else delete it too (default: delete both unless a query actually reads them).
  3. Delete `AUTH_MODE` entirely (Q12=A) — remove from `packages/shared/src/env.ts`, `apps/web/src/lib/env.ts`, `apps/worker/src/env.ts`, and any `AUTH_MODE` checks in app code; loadtest will be handled in Slice 6/9.
  4. Truncate `.env.example` deprecation tail (`## Deployment defaults` duplication at line 164) — single source block; remove `NEXTAUTH_SECRET`, `BYOK_ENABLED`, `GOOGLE_VERTEX_*`, `SENTRY_*`, `AUTH_MODE` lines per deletions; ensure remaining billing vars keep `BILLING_ENABLED=0` default (Q1=B keep).
  5. Rewrite `apps/web/src/lib/env.ts` to delegate normalization to `parseServerEnv` (delete `FALLBACK_PREVIEW_SECRET`, `normalizeRawSecrets` duplication, `AuthEnvSchema` duplicate of `AuthEnv`); keep only `DEV_SECRETS_PATH` caching and `loadOrGenerateDevSecrets` (drop `LEGACY_DEV_SECRETS_PATH` read).
  6. Trim `turbo.json:globalEnv` to actual roots: `NODE_ENV, DATABASE_URL, POSTGRES_URL, DIRECT_URL, ADMIN_DATABASE_URL, AUTH_SECRET, CRON_SECRET, ENCRYPTION_SECRET, AI_DEFAULT_MODEL, AI_TITLE_MODEL, AI_EMBEDDING_MODEL, BIQUOTE_BASE_URL, FINNHUB_API_KEY, FRED_API_KEY, WEB_SEARCH_* , TELEGRAM_* , RESEND_* , VAPID_* , LANGFUSE_PUBLIC_KEY/SECRET_KEY/BASE_URL (kept as optional remote), BILLING_* (kept per Q1), SUPABASE_URL/SECRET_KEY (if you still use Supabase storage)`. Delete `VERCEL_*`, `SUPABASE_ANON_KEY/JWT/…_PUBLISHABLE`, `POSTGRES_PRISMA_URL`, `ANALYZE`, `SENTRY_*`, `GOOGLE_VERTEX_*`, `AUTH_MODE`, `BYOK_ENABLED`.
  7. Shrink `check-env-contract.mjs` to required deployment flags (`AUTH_SECRET, CRON_SECRET, ENCRYPTION_SECRET, MULTI_USER_ENABLED=1, KESTREL_ENABLE_RLS=1, REGISTRATION_MODE=open`) + template↔example parity; drop OSS/BYOK/Sentry/Vertex assertions; keep billing vars as optional (Q1=B).
* **Verify:** `pnpm check:env-contract && pnpm check:compose-reproducibility`; `pnpm --filter @kestrel/shared test` (env tests) green; `pnpm --filter @kestrel/web typecheck`.

### Slice 3 — Docker Compose: minimal default + observability overlay (Q2=B, Q3=A)

* **Files:** `docker-compose.yml`, `docker-compose.observability.yml` (new), `docker/postgres/init-langfuse-db.sh`, `scripts/check-compose-images.mjs`, `scripts/check-compose-reproducibility.mjs`, `scripts/setup/secret-template.json`, `.env.example` observability block, `README.md` quickstart observability section, `docs/configuration.md` observability table, `docs/troubleshooting.md` Langfuse section, `packages/ai/package.json` (`@sentry/*` removal if present there), `apps/web/package.json` (`@sentry/nextjs`).
* **Do:**
  1. Extract services `clickhouse, redis, minio, langfuse, langfuse-worker` + their volumes (`clickhouse-data`, `clickhouse-logs`, `redis-data`, `minio-data`) from `docker-compose.yml` into new `docker-compose.observability.yml` overlay (not loaded by default). Keep `docker/postgres/init-langfuse-db.sh` only in the overlay repo path or delete it and let overlay create the `langfuse` DB via the same script mounted only when overlay is used.
  2. In `scripts/setup/secret-template.json` and `.env.example` observability block, delete generated `LANGFUSE_NEXTAUTH_SECRET / SALT / ENCRYPTION_KEY / CLICKHOUSE_PASSWORD / REDIS_PASSWORD / S3_*` secrets from the **default** template — keep optional remote `LANGFUSE_PUBLIC_KEY / SECRET_KEY / BASE_URL` as bare env vars (no generated secrets) for remote SaaS tracing; overlay re-introduces the generated secrets only when the overlay is chosen (document `scripts/setup --with-observability` or manual `./docker/init-secrets.sh` + overlay).
  3. Delete Sentry: remove `@sentry/nextjs` from `apps/web/package.json`, `@sentry/node` from `apps/worker/package.json`, `SENTRY_DSN` from `docker-compose.yml`/`.env.example`/`scripts/setup/secret-template.json`/`docs/configuration.md`, and instrumentation hooks (`apps/web/src/instrumentation.ts` or `sentry.*.config.*` if present).
  4. Update `README.md` quickstart observability section to `docker compose -f docker-compose.yml -f docker-compose.observability.yml --profile observability up -d` and `docs/troubleshooting.md` Langfuse section accordingly.
* **Verify:** `docker compose config --quiet` (default profile) renders only `db, app, worker, backup`; `docker compose -f docker-compose.yml -f docker-compose.observability.yml --profile observability config --quiet` renders the full observability stack; `pnpm check:compose-images` clean; `pnpm build` clean without Sentry.

### Slice 4 — Billing polish (Q1=B — keep, tighten)

* **Files:** `packages/shared/src/env.ts:BillingEnv` (keep), `packages/db/src/schema/billing.ts` (keep), `packages/db/queries/billing*.ts` (keep), `apps/web/src/app/api/billing/**` (keep), `docs/configuration.md` Billing table (keep), `docker-compose.yml` (ensure no force), `README.md` / `docs/release.md` checklists.
* **Do:** Keep billing. Tighten: ensure `docker-compose.yml` never forces `BILLING_ENABLED=1` (keep it `0` via `.env` default, no compose hard-pin); ensure `NOWPAYMENTS_*` are absent from `secret-template.json` unless you want them generated (default: keep them as bare optional env vars, not generated secrets); add a one-line doc note in `docs/configuration.md` Billing section: "disabled unless `BILLING_ENABLED=1` — self-host opt-in". No schema/route deletion. Update `docs/release.md` pre-release checklist to list billing as "optional — skip if `BILLING_ENABLED=0`".
* **Verify:** `rg -n "BILLING_ENABLED" --glob '*.yml' --glob '*.mjs'` shows no compose hard-pin of `1`; `pnpm turbo run typecheck` clean.

### Slice 5 — AI providers: delete Vertex only, improve registry

* **Files:** `packages/ai/src/byok-providers.ts`, `packages/ai/src/model*.ts`, `packages/ai/src/catalogue.ts`, `packages/shared/src/env.ts` (AiEnv), `apps/worker/src/env.ts`, `packages/ai/src/model-helpers.ts`, `packages/ai/src/mastra-v2/*`, `docs/configuration.md` AI table, `scripts/setup/steps/*.mjs` provider copy, `packages/ai/test/**` provider tests, `packages/ai/package.json` (`@ai-sdk/google-vertex`).
* **Do:**
  1. Delete Vertex transport: remove `GOOGLE_VERTEX_PROJECT`, `GOOGLE_VERTEX_LOCATION`, `GOOGLE_APPLICATION_CREDENTIALS_JSON`, `GOOGLE_APPLICATION_CREDENTIALS` from `packages/shared/src/env.ts:AiEnv` and `apps/worker/src/env.ts`; delete their handling in `packages/ai/src/model-helpers.ts:envFallbackKeys` / `resolveVertexAuth`; delete `@ai-sdk/google-vertex` from `packages/ai/package.json` and any `google-vertex/` model prefix handling (keep `google/` for direct Gemini via `GOOGLE_GENERATIVE_AI_API_KEY`).
  2. Keep all other providers (openai, anthropic, google-direct, groq, mistral, openrouter, xAI, deepseek, hcnsec etc.) — no deletion of their `BYOK_PROVIDERS` entries.
  3. **Improve the registry** (the "improve the providers system" you asked for) — minimal, low-risk polish:
     - Add `providerCapabilities` map in `byok-providers.ts` (`supportsVision`, `supportsEmbedding`, `supportsToolCalling`, `modelPrefix`) so routing does not re-derive per call.
     - Add `validateProviderConfig(providerId, apiKey)` helper that returns a typed `{ ok, reason }` (missing key, bad prefix, Vertex leftover) — use it in `Settings → API Keys` test-provider route for consistent UX.
     - Deduplicate `resolveChatModel` / `resolveEmbeddingModel` / `deriveTitleModel` fallback chains — single `resolveModelForRole(role, byok, envFallback)` helper.
     - Keep tests green; do not add new provider-specific business logic beyond the registry polish.
* **Verify:** `pnpm --filter @kestrel/ai test` green (Vertex cases removed, other providers still covered); `pnpm --filter @kestrel/ai typecheck`; `rg -n "google-vertex|GOOGLE_VERTEX|@ai-sdk/google-vertex" --glob '!node_modules'` returns 0.

### Slice 6 — CI + scripts declutter (Q8=A, Q10=A, Q12=A)

* **Files:** `.github/workflows/*`, `scripts/*.mjs`, `apps/web/package.json:scripts`, `package.json:scripts`, `knip.json`, `loadtest/**`.
* **Do:**
  1. Keep `ci-fast.yml` + `codeql.yml`; **delete** `ci-slow.yml, e2e-staging.yml, loadtest.yml, pr-labeler.yml, stale.yml, docker-backup.yml` (if present), and `docker-publish.yml`/`release.yml` (Q10=A). If `docker-backup.yml` contains useful backup smoke, keep it as `workflow_dispatch` only or move logic to `ci-fast` — default is delete.
  2. In retained `ci-fast.yml`, keep `lint-and-typecheck` + `unit-tests` (with Postgres service) and drop E2E sharding from required status — make E2E (`playwright`) `workflow_dispatch` only or delete the `e2e-tests` + `merge-e2e-reports` jobs entirely (default: delete).
  3. Delete `scripts/update.mjs` (+ `pnpm update` script), `scripts/add-license.ts`, and the 5 supply-chain scripts deleted in Slice 1 if not already; delete supply-chain `check:*` scripts from `package.json:scripts` (`check:oss-release`, `check:p0-release`, `check:p3-release`, `check:dependency-report`, `check:release-archive`, `check:release-metadata`, `check:git-history-secrets`, `generate:sbom`, `licenses:generate`) or move survivors to `scripts/ops/`.
  4. Handle `AUTH_MODE=legacy` fallout: remove `loadtest` from required CI; either delete `loadtest/` or keep it untracked by CI (move to `infra/loadtest/` unreferenced, or gate it behind a seeded real user instead of `__system__`). Default: keep `loadtest/` but remove its workflow; note in `loadtest/README.md` that it needs a real seeded user.
  5. Consolidate `scripts/` → keep `scripts/ops/{check-env-contract, check-compose-images, check-route-security}` for private correctness; archive the rest; trim `package.json:scripts` to: `dev, build, lint, typecheck, test, verify:local, verify:production, check:env-contract, check:route-security`.
  6. Keep `knip` as `continue-on-error` report-only or delete it (default: keep report-only in `ci-fast`).
* **Verify:** `gh workflow view ci-fast` renders 1-2 jobs + required status; `pnpm lint && pnpm typecheck` clean; deleted workflows are not referenced by any README/docs.

### Slice 7 — Frontend (Q9=A — keep landing)

* **Files:** none (landing kept). Optional polish: note in `docs/architecture.md` that landing is "portfolio showcase even on private host" — no code change required. If `three` is landing-only and you want a smaller private bundle, an optional follow-up is to lazy-load it (not required for this slice).
* **Verify:** `pnpm --filter @kestrel/web build` chunk size not regressed.

### Slice 8 — Docs & repo hygiene (Q5=A — private)

* **Files:** `README.md`, `docs/configuration.md`, `docs/deployment-matrix.md`, `docs/architecture.md`, `docs/troubleshooting.md`, `docs/release.md`, `docs/README.md`, `docs/design-system.md`, `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`, `CODE_OF_CONDUCT.md`, `docs/DEPENDENCY_LICENSES.md`, `docs/audit/**`.
* **Do:** Delete `CODE_OF_CONDUCT.md`. Rewrite `CONTRIBUTING.md` to "private repo — how we branch on `main` directly, commit discipline, no OSS CLA". Slim `SECURITY.md` to private advisory (GH private vulnerability reporting, no public email). Collapse `docs/` to: `README.md` (60-sec docker quickstart + BYOK + `git pull && docker compose up -d --build` update), `docs/configuration.md` (operator env table — billing kept, Sentry/Vertex/Legacy removed, observability as overlay), `docs/troubleshooting.md` (overlay-aware). Move `docs/deployment-matrix.md` matrix into `README.md` Profile Matrix and delete the file. Archive `docs/audit/findings.md` → `docs/archive/` and delete `docs/DEPENDENCY_LICENSES.md` if SBOM generation was removed. Run a final `rg -n "Vercel|Supabase.*pooler|OSS.*release|owner-first|pnpm update" --glob '*.md'` and clean hits.
* **Verify:** `rg -n "Vercel|Supabase|OSS|public preview|owner-first" --glob '*.md' --glob '!node_modules'` returns 0; doc links in `README.md` all resolve.

### Slice 9 — Final polish & safety rails

* **Files:** `turbo.json` (already trimmed), `docker-compose.yml` + `docker-compose.observability.yml` comments, `.gitignore`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `apps/web/docker-entrypoint.sh`, `packages/db/drizzle.config.ts`, `packages/ai/src/mastra-v2/storage.ts`, `packages/ai/src/db.ts`, `packages/data/cache/*`.
* **Do:**
  1. Finish **D5** of the prior plan — sweep remaining `HAMAFX_*` aliases noted as carryover (`packages/db/scripts/*.mjs`, `packages/db/drizzle.config.ts`, `apps/web/docker-entrypoint.sh`, `packages/ai/src/mastra-v2/storage.ts`, `packages/ai/src/db.ts`, `packages/data/cache/*`) — delete or replace with canonical `KESTREL_*`.
  2. Delete `NEXTAUTH_SECRET` grace alias (0.3.0 boundary) since this plan is the 0.3.0 release — keep single `AUTH_SECRET` (align with `packages/shared/src/env.ts:486` + `apps/web/src/lib/env.ts`).
  3. Delete `LEGACY_DEV_SECRETS_PATH` read — keep `.kestrel/dev-secrets.json` only; note one-time migration in `CHANGELOG.md`.
  4. Keep `hamafx_*` volume/container names (`hamafx_pgdata`, `hamafx`) per Q11=A with explicit comment; do not churn data.
  5. Ensure `turbo.json:globalEnv` and `.env.example` are now in sync (no `VERCEL/SUPABASE` drift).
* **Verify:** full gate — `pnpm lint && pnpm turbo run typecheck && pnpm turbo run test && pnpm turbo run build && docker compose config --quiet && docker compose -f docker-compose.yml -f docker-compose.observability.yml --profile observability config --quiet && pnpm check:env-contract && pnpm check:route-security`.

---

## 5. What to keep untouched

* `packages/db/drizzle/*.sql` migrations (append-only, already shipped to existing volumes).
* `packages/db/src/client.ts` RLS scope helpers (`withTenantDb`, `isRlsEnabled`, `assertTenantIsolationConfig`) — already private-only truth.
* `apps/web/src/proxy.ts` CSP/CSRF/signed-header logic — after deleting legacy branch, only the real-auth path remains (Q12=A).
* `packages/indicators/` — no bloat; leave as-is.
* Billing schema/routes/queries — kept per Q1=B; migrations remain append-only.

---

## 6. Risks & guardrails

* **Data loss on volume rename** — never rename `hamafx_pgdata` without a staged `docker volume create + pg_dump` migration (Q11=A avoids this entirely).
* **Observability overlay** — operators with existing ClickHouse data must export traces before `docker compose --profile observability down -v`; warn in `CHANGELOG.md` with overlay caveat.
* **Billing kept** — no data risk; ensure `BILLING_ENABLED` defaults to `0` so private hosts are not silently billed.
* **Vertex removal** — follow-up data: none (no Vertex rows persisted); pure code/env deletion. Keep `google/` direct-Gemini tests to prove Google still works.
* **Sentry removal** — drops error phoning home; ensure `apps/web/src/instrumentation.ts` doesn't import deleted `@sentry/*`.

---

## 7. Rollback per slice

Each slice is **one commit directly on `main`**. If a post-merge Postgres boot fails, `git revert <slice-commit>` + `docker compose down && docker compose up -d --build` restores prior behavior. No migration was rewritten. Tag the pre-plan commit `pre-debloat-$(date +%Y%m%d)` before Slice 1 for a one-command rollback anchor.

---

## 8. Handoff checklist for the implementing agent (all on `main`)

1. Confirm `git status` is clean on `main@757812a9`; pull before starting.
2. **Work directly on `main`** — no feature branch. Tag anchor: `git tag pre-debloat-20261010 && git push origin pre-debloat-20261010`.
3. Implement slices in order on `main`; each commit message: `chore(scope): <slice title> (slice N/9) — private self-host debloat` + `Co-Authored-By: Claude <noreply@anthropic.com>`. Push after each slice so `main` stays green.
4. Update this plan's status table below as slices land (commit the status bump in the same slice commit).
5. Per-slice verifier: `pnpm check:env-contract && pnpm turbo run typecheck && pnpm turbo run lint && docker compose config --quiet`.
6. Final verifier (Slice 9): full gate from §4 Slice 9.

**Slice status (update as you go):**

| # | Slice | Status | Notes |
|---|-------|--------|-------|
| 0 | Lock decisions & baseline | ✅ done | Commit `5f12fc11` — §0 answered 2026-10-10, preflight committed, tag `pre-debloat-20261010` |
| 1 | OSS/public machinery | ✅ done | Commit `5445d1c1` — Q5=A + Q10=A — deleted 18 public supply-chain/release scripts & workflows, updated README & contributor docs |
| 2 | Env contract SSoT | ✅ done | Commit `d1856f97` — `turbo.json` + `env.ts` + `.env.example` SSoT; deleted BYOK flag, legacy auth & `__system__` bypasses across app/proxy/tests |
| 3 | Docker Compose minimal + overlay | ✅ done | Q2=B overlay + Q3=A Sentry removal |
| 4 | Billing polish (keep) | ✅ done | Q1=B — defaults/docs tightened; billing code preserved |
| 5 | AI providers — Vertex delete + registry improve | ✅ done | Q7 — delete Vertex, keep 9 others, polish registry |
| 6 | CI + scripts declutter | ✅ done | Q8=A + Q10=A + Q12=A — retained ci-fast + codeql, deleted 6 obsolete workflows, cleaned scripts and loadtest |
| 7 | Frontend (keep landing) | ☐ | Q9=A — no-op + arch note |
| 8 | Docs & repo hygiene | ☐ | Q5=A private |
| 9 | Final polish & safety rails | ☐ | D5 + compat removal + `hamafx` comment |

---

## 9. Audit raw notes (for the implementor's reference)

* `.env.example` = 169 lines, **~45 optional provider vars** that could be `unset` group rather than validated per-route. `BIQUOTE_BASE_URL` defaults are fine; FRED/BRAVE/EXA/TAVILY are truly optional — keep but document as "add when needed" not as "configure before boot".
* `docker-compose.yml` app env block pins `MULTI_USER_ENABLED=1 / REGISTRATION_MODE=open / KESTREL_ENABLE_RLS=1` correctly — no revert was needed; the bug was `OSS_SINGLE_USER_MODE` removal (already fixed).
* `turbo.json:globalEnv` is the stealth invalidator — removing `VERCEL/SUPABASE` entries alone cuts 6 inputs and prevents cache thrash from stale host vars.
* Biggest win/cheap ratio: Slice 2 (env SSoT) + Slice 3 (overlay 5 observability services out of default) + Slice 6 (cut CI from 10 workflows to 2). Together they remove ~3000 lines of ops/docs without touching business logic.
* This plan supersedes the prior §0 "you must answer" gate — decisions are now locked; slices are no longer blocked.
