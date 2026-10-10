# Plan — Remove Single-User Mode, Keep Multi-User

**Status:** COMPLETE — all eight slices implemented and verified; ready for review  
**Note:** `pnpm-lock.yaml` may retain `@electric-sql/pglite` as Drizzle ORM’s unused optional peer resolution. It is not a project dependency and `pnpm why @electric-sql/pglite` reports no dependent packages.
**Repo:** `HamaFx/Kestrel` (`/home/ubuntu/Kestrel`)  
**Goal:** delete the single-user / `owner-first` / PGlite deployment path and ship only a private, self-hosted **multi-user + Postgres + RLS** platform (`MULTI_USER_ENABLED=1`, `KESTREL_ENABLE_RLS=1`, `REGISTRATION_MODE=open` by default, explicit `role='admin'`).

**Context shift (from your latest messages):** This is no longer an open-source release. It is a private self-hosted app for your own use. There is no "OSS vs private" split to maintain anymore. All references to "public preview", "OSS boundary", "OSS_SINGLE_USER_MODE" checks, and `AGENTS.private.md` separation are to be removed and unified into a single private multi-user truth.  
**Audience:** an implementation agent with repo write access (no extra infra permissions required).  
**Delivery:** one PR, broken into small phased tasks (slices). Each slice is independently reviewable and independently verifiable. No real deploy is required for the code PR; the Postgres RLS suite needs a live DB and is noted separately.  
**Verification gates assumed:** `pnpm typecheck`, `pnpm check:*`, `pnpm turbo run test`, `pnpm turbo run build`, `docker compose config`.

---

## Progress

_Last updated: 2026-10-10 — implementation and verification completed on `codex/private-multi-user`._

| # | Slice | Status | Notes |
| --- | ----- | ------ | ----- |
| 1 | Env contract | ✅ complete | Defaults `MULTI_USER_ENABLED=1` / `KESTREL_ENABLE_RLS=1` / `REGISTRATION_MODE=open`; `OSS_SINGLE_USER_MODE` field + refinement deleted; enum shrunk to `open\|disabled`; `HAMAFX_*` aliases removed (`NEXTAUTH_SECRET` kept one release); `.env.example`, README callout + env block, `docs/configuration.md` updated; `packages/shared/test/env.test.ts` rewritten. |
| 2 | Database isolation truth | ✅ complete | `isRlsEnabled()` + `assertTenantIsolationConfig()` no longer know about OSS/HAMAFX; `client.ts` HAMAFX_RUNTIME/LOCAL_DOCKER fallbacks removed; `initialUserOnly` advisory-lock + `INITIAL_USER_ALREADY_EXISTS` deleted; role schema comment updated; `packages/db/test/client.test.ts` rewritten. |
| 3 | Auth, registration & admin gate | ✅ complete | owner-first provisioning deleted from `provision-user.ts` + `actions.ts`; `getAdminUser()` requires explicit `role='admin'`; `withAuth()` always runs `requireTenantIdForUser` + `withTenantDbFresh`; `apps/web/src/lib/env.ts` HAMAFX normalization removed; legacy-auth comments annotated loadtest/dev-only. |
| 4 | Runtime migration entrypoint | ✅ complete | `HAMAFX_*` aliases removed (D5); `DISABLE RLS` loop replaced with hard fail; `REGISTRATION_MODE` default → `open`; comments updated to private multi-user framing; Prettier clean. |
| 5 | Compose, Dockerfile, setup | ✅ complete | `docker-compose.yml` app+worker: `MULTI_USER_ENABLED=1`/`KESTREL_ENABLE_RLS=1`/`REGISTRATION_MODE=open`, `OSS_SINGLE_USER_MODE` deleted; `secret-template.json` updated; `generate-env.mjs` HAMAFX alias + OSS key removed; `mode.mjs` rewritten (Simple/PGlite mode removed, Docker+External choices); `config.mjs` comments updated; `Dockerfile` comments updated. |
| 6 | Delete PGlite runtime path | ✅ complete | `pglite-client.ts`, `local-db.ts`, `pglite-fixture.ts`, `local-db.test.ts` deleted; `@electric-sql/pglite` removed from `db` + `test-utils` package.json; `./pglite` + `./local-db` exports removed; `scripts/dev.ts` requires DATABASE_URL (hard fail); e2e global-setup requires DATABASE_URL; PGlite comments cleaned from `client.ts`, `rate-limit.ts`, `provider-quota.ts`; `test-utils/mocks/db.ts` PGlite mocks removed; `telemetry-persistence.ts` `__system__` fallback removed; 20 test files have TODO comments for Postgres harness migration. |
| 7 | Scripts, CI & old-boundary tests | ✅ complete | Single-user release gate deleted; env/compose contracts updated; CI PostgreSQL jobs added; obsolete PGlite migration harnesses removed; durable AI queue tests now use disposable PostgreSQL. |
| 8 | Documentation unification | ✅ complete | All supported docs now describe the private self-hosted multi-user contract; the audit findings document was retained as a security/RLS readiness record. |

### Verification snapshot (completed)

- `pnpm install --frozen-lockfile` ✅.
- Static contracts: env contract, Compose reproducibility, release/security, route security, release archive, and dependency report ✅.
- Typecheck: shared, data, test-utils, web, worker, db, and ai via direct package `tsc --noEmit` ✅.
- Tests: shared 392 ✅; data 135 passed / 1 skipped ✅; db 84 passed / 1 skipped ✅; ai 1,365 passed / 22 intentional skips ✅; web 1,208 ✅.
- Disposable PostgreSQL: `pnpm test:ai-postgres-queue` — 33 passed ✅.
- Lint/build: shared, db, and ai direct package commands ✅.
- Compose: `docker compose config --quiet` with generated-style temporary secrets ✅; app/worker render `ADMIN_DATABASE_URL`, multi-user, RLS, and open registration.
- Root `pnpm typecheck`, `pnpm build`, and `pnpm turbo run lint` remain blocked in this sandbox by Turbo's environment-level `Exec format error`; direct package equivalents above pass.

### Deviations & discovered follow-ups

- Slice 1: the §2.2 owner-first `.refine()` was dropped — once the enum shrinks, Zod never runs outer refinements after an inner parse failure, so it would be unreachable dead code. Stale `owner-first` pins fail with the enum error naming `REGISTRATION_MODE` (explicitly allowed by the plan).
- Slice 3: `apps/web/src/lib/env.ts` also drops the `HAMAFX_*` normalization (D5), beyond the plan's “comment only” note.
- `HAMAFX_*` reads remain in files outside the file census (`packages/db/scripts/*.mjs`, `packages/db/drizzle.config.ts`, `apps/web/docker-entrypoint.sh`, `packages/ai/src/mastra-v2/storage.ts`, `packages/ai/src/db.ts`, `packages/data` cache/throttle) — finish D5 in a later slice or a follow-up.
- `packages/db/test/ownership-isolation.test.ts` leaks `/tmp/kestrel-*` PGlite dirs (~3.0 GB accumulated during this session); worth fixing when slice 6 removes the PGlite harnesses.
- 8 web test files now stub the `@kestrel/db` tenant helpers (`getAdminDb`, `requireTenantIdForUser`, `withTenantDbFresh`) because `withAuth` is always tenant-scoped.

---

## 0. Resolved decisions (D1–D7)

| # | Decision | You chose | Interpretation | What the plan now assumes |
|---|----------|-----------|----------------|---------------------------|
| **D1** | **Registration default** | `open` | Anyone who can reach the instance can register; you can flip to `disabled` at any time for invite-only. | `REGISTRATION_MODE` defaults to `open` in `packages/shared/src/env.ts`, `docker-compose.yml`, `.env.example`, and `secret-template.json`. A `.refine()` rejects `owner-first` ("removed"). `disabled` stays valid. |
| **D2** | **Self-host scope** | Private only — not open-source | No OSS release language, no "public preview" copy, no split between "OSS" and "maintainer/private" topologies. | All docs collapse to one truth: "private self-hosted multi-user". The deployment profiles are now just *infrastructure choices* (Docker bundled Postgres vs external Postgres), not product modes. |
| **D3** | **PGlite** | Drop | Remove the embedded PGlite path entirely. Postgres is required for every env (dev, test, prod). | `packages/db/src/pglite-client.ts` and `packages/db/src/local-db.ts` are deleted, `scripts/dev.ts` fails instead of falling back to `.kestrel/data/`, PGlite is removed from `package.json` deps, and tests either switch to a Postgres harness or are removed (see slice 6). |
| **D4** | **`__system__` identity** | Explain + pick best | See §0a immediately below. | **Keep `__system__` as the *global catalog tenant id* for shared rows (`symbol_catalog`, `cron_runs` defaults). Delete its role as an auth/registration bypass user.** No data migration, no rename. Cheapest, safest, honest. |
| **D5** | **Legacy alias cadence** | Pick best | `HAMAFX_*` and `NEXTAUTH_SECRET` aliases. | **Drop all `HAMAFX_*` aliases now (0.2.0). Keep `NEXTAUTH_SECRET → AUTH_SECRET` for exactly one release with a deprecation warning, drop at 0.3.0.** Private instance with a pinned `.env` might still have `NEXTAUTH_SECRET`; one grace release avoids a silent auth break. `HAMAFX_*` has no private users — it is pure dead weight. |
| **D6** | **Release shape** | One PR, phased slices + small tasks | One branch (`feat!: … BREAKING`), but implementation is sliced into small tasks so reviews are easy. | 8 slices in dependency order (§3). Each slice has its own file list, edits, and verification gate. The PR only merges when every gate is green. No two-phase rollout. |
| **D7** | **Docs split** | Not open-source; unify | Change whatever is needed. | `AGENTS.private.md` separation is dissolved. All docs (`README.md`, `docs/*`, `SECURITY.md`, `CONTRIBUTING.md`, `SUPPORT.md`, `docs/audit/*`) are rewritten to the private multi-user truth. No lingering "OSS boundary" prose. |

No further questions are needed. An implementor can start immediately.

---

### 0a. What `__system__` actually is (D4 explainer)

In one paragraph: `__system__` is a **fake tenant id + fake user id** that the codebase invented to hold *global* rows that do not belong to any real user. The two places it shows up:

1. **`symbol_catalog.tenant_id = '__system__'`** — the symbol catalog (XAUUSD, EURUSD, …) is seeded once and shared by every tenant. Instead of copying it per-tenant, the migration seeds it under `__system__` and the app's onboarding/query helpers filter `WHERE tenant_id='__system__'`. This is a data-sharing trick, not a user.
2. **A synthetic `users.id='__system__'` row** seeded in `drizzle/0009_news_articles.sql` — exists so foreign keys from old single-user code always have something to point at, and so `AUTH_MODE=legacy` (dev-only) could inject `x-user-id: __system__` and pretend to be a user without authenticating.

In multi-user mode, only case 1 is wanted. Case 2 (using `__system__` as a login/auth bypass, or as a `tenant_id` fallback in `telemetry-persistence.ts: userId ?? '__system__'`) is the single-user shortcut. The right move is:

- **Keep** `__system__` as the literal string `'__system__'` in `symbol_catalog` (and `cron_runs` defaults where it is a `DEFAULT`). No migration, no rename — renaming would require updating every row and every migration that mentions it.
- **Delete** the *auth* meaning: the `if (registrationMode==='owner-first')` check that filters `ne(users.id, '__system__')`, the `getAdminUser()` counting trick that uses `__system__` as a sentinel, and the `telemetry-persistence` `__system__` fallback. After this plan, `__system__` appears only in catalog/cron defaults and in a guarded constant at the edge of the delete-tenant script.

If you ever later want a cleaner name (`__global__`) that is a follow-up data migration. Not part of this PR.

---

## 1. What exists today (audit summary)

### 1.1 Two deployment modes in one binary

| Aspect | Single-user (to be deleted) | Multi-user (keeper, becomes the only mode) |
|--------|-----------------------------|---------------------------------------------|
| Env flag | `OSS_SINGLE_USER_MODE=1` | removed; `OSS_SINGLE_USER_MODE` deleted |
| RLS | `KESTREL_ENABLE_RLS=0` | `KESTREL_ENABLE_RLS=1` (always) |
| Auth fan-out | `MULTI_USER_ENABLED=0` | `MULTI_USER_ENABLED=1` (always) |
| Registration | `REGISTRATION_MODE=owner-first` (first real account wins; second blocked via `pg_advisory_xact_lock` + `INITIAL_USER_ALREADY_EXISTS`) | `REGISTRATION_MODE=open` (default) or `disabled` (admin-invite) |
| Admin gate | `getAdminUser()` grants implicit admin to the sole non-`__system__` user when no `role=admin` row exists | `getAdminUser()` requires `users.role='admin'` |
| RLS enforcement | `migrate-runtime.mjs` disables RLS (`ALTER TABLE ... DISABLE ROW LEVEL SECURITY`) when `rlsEnabled=false`; `packages/db/src/client.ts:isRlsEnabled()` gates all `withTenantDb*` GUC paths | RLS policies + `authenticated` role + `app.current_tenant` GUC on every request |
| DB runtime | PGlite fallback when `DATABASE_URL` is empty (`.kestrel/data/`); Postgres optional | Postgres required; PGlite deleted |
| BYOK | `BYOK_ENABLED=1` (unchanged in both modes; not in scope) | same |
| Dev legacy auth | `AUTH_MODE=legacy` → every request is `__system__` (dev only, forbidden in production via `assertProductionSecurity`) | unchanged but narrower (see §3.3) |

All of the above is enforced in four places: Zod refinements in `packages/shared/src/env.ts`, the `packages/db/src/client.ts:assertTenantIsolationConfig` guard, `apps/web/scripts/migrate-runtime.mjs`'s preflight + RLS toggle, and `apps/web/src/lib/admin-auth.ts:getAdminUser`'s implicit-admin branch. CI re-checks the same via `scripts/check-single-user-release.mjs` and `scripts/check-env-contract.mjs`. Every one of those must be updated to the multi-user truth.

### 1.2 Full surface of single-user + PGlite code to touch

Exhaustive list gathered by ripgrep over the working tree (`--glob '!node_modules' --glob '!.next' --glob '!.git'`). Grouped by kind; each entry is a **delete / rewrite**, not "leave as-is".

**Env & config (authoritative):**

- `packages/shared/src/env.ts` — `RuntimeEnv.REGISTRATION_MODE` default, `KESTREL_ENABLE_RLS`/`MULTI_USER_ENABLED`/`REGISTRATION_MODE` defaults, `OSS_SINGLE_USER_MODE` field + three `.refine()` blocks, `DEPRECATED_ENV_ALIASES` (D5: drop HAMAFX entries, keep NEXTAUTH→AUTH for one release).
- `apps/web/src/lib/env.ts` — constants `DEV_SECRETS_PATH`, `LEGACY_DEV_SECRETS_PATH`, `normalizeRawSecrets` legacy mapping, `AUTH_MODE=legacy` warnings, preview-secret fallback (leave fallback plumbing intact, only change comment).
- `apps/worker/src/env.ts` — no single-user field; inherits `KESTREL_ENABLE_RLS` / `MULTI_USER_ENABLED` from shared via `docker-compose.yml` interpolation — verify it does not add its own default that contradicts shared (it does not today).

**Database — single-user logic:**

- `packages/db/src/client.ts` — `isRlsEnabled()`, `assertTenantIsolationConfig()`, `withTenantDbFresh/RO` branching on `isRlsEnabled()`, plus the `HAMAFX_ENABLE_RLS` fallback.
- `packages/db/src/tenant.ts` — comment "one personal org whose id equals userId — self-host single-user shape" → update to "one org per tenant".
- `packages/db/src/queries/auth.ts` — `CreateUserInput.initialUserOnly`, advisory-lock + `INITIAL_USER_ALREADY_EXISTS` branch.
- `packages/db/src/schema/auth.ts` — `__system__` user row / `tenant_id DEFAULT '__system__'` comments in various schema files.
- `packages/db/drizzle/0009_news_articles.sql` — seeds `__system__`; keep row, update comment to "global catalog tenant, not a login user".
- `packages/db/drizzle/0037_phase3_bypassrls_admin_role.sql` through `0038_phase3_rls_cutover.sql`, `0046/0047/0055/0064/0077/0083/0085` — migrations are append-only; none are rewritten (see §7.3). Only runtime behavior in `migrate-runtime.mjs` changes.
- `packages/db/test/client.test.ts` — stubs `OSS_SINGLE_USER_MODE=1`.
- `packages/db/test/pglite-fixture.ts`, `packages/ai/test/helpers/full-analysis-queue-db.ts`, `packages/ai/test/full-analysis-properties.test.ts`, `packages/ai/test/idor-persistence.test.ts` — PGlite single-tenant harness comments.

**Database — PGlite runtime (new with D3):**

- `packages/db/src/pglite-client.ts` — **delete file** (403 lines; the PGlite in-process Pg driver + `applyPGliteMigrations`).
- `packages/db/src/local-db.ts` — **delete file** (`getLocalDb()` / `getLocalDbMode()` / `ensureMigrations()` / `closeLocalDb()` — the PGlite↔Postgres chooser). Callers switch to `getDb()` from `./client`.
- `packages/db/package.json` — `dependencies/@electric-sql/pglite`, `exports: "./pglite"`, any `pglite` script.
- `packages/test-utils/package.json` — `dependencies/@electric-sql/pglite` if present.
- `packages/db/src/index.ts` — barrel re-exports of `pglite-client` / `local-db`.
- `packages/ai/src/memory/memory-index.ts` comment `Phase 3 §3.11 — require a real userId; no __system__ fallback` (no-op but verify).
- `packages/ai/src/persistence/telemetry-persistence.ts` — `const userId = t.userId ?? '__system__'` fallback (delete, require real id or skip).

**Auth & registration:**

- `apps/web/src/lib/auth/provision-user.ts` — `registrationMode==='owner-first'` advisory-lock branch; `SYSTEM_USER_ID='__system__'` constant is used only inside that branch's `ne(id, SYSTEM_USER_ID)` filter, so it collapses with the branch.
- `apps/web/src/app/(auth)/actions.ts` — `registerAction`'s `initialUserOnly: registrationMode==='owner-first'` argument and its `INITIAL_USER_ALREADY_EXISTS` catch.
- `apps/web/src/lib/admin-auth.ts` — the entire post-`role==='admin'` fallback (`getServerEnv().OSS_SINGLE_USER_MODE` check + the `NOT EXISTS ... AND count(*)=1` query) is single-user implicit-admin logic.
- `apps/web/src/lib/admin-check.ts` — thin wrapper; if `admin-auth.ts` changes, this follows automatically (only comment).
- `apps/web/src/lib/security-invariants.ts` — no single-user refinement; `AUTH_MODE=legacy` guard stays.
- `apps/web/src/auth.config.ts` + `apps/web/src/proxy.ts` — `AUTH_MODE=legacy` fast path stays for local dev/worker only in principle but after PGlite removal it is effectively Postgres-dev-only; contract note added (see §3.3).
- `apps/web/src/lib/api.ts` — `withAuth`'s `MULTI_USER_ENABLED` threading in `withTenantDbFresh` — after the cut always-tenant.
- `apps/web/src/app/(app)/layout.tsx`, `apps/web/src/app/(app)/journal/page.tsx`, `apps/web/src/app/(app)/chat/page.tsx`, `apps/web/src/app/(app)/chat/[threadId]/page.tsx` — `AUTH_MODE==='legacy'` conditional rendering branches (no-ops in prod; comment update only).

**Dev entrypoint & PGlite bootstrap:**

- `scripts/dev.ts` — the `hasDbUrl ? postgres : pglite` branch and PGlite banner.
- `apps/web/scripts/migrate-runtime.mjs` — preflight checks + RLS disable/enable loop + `REGISTRATION_MODE=open` guard + `KESTREL_LOCAL_DOCKER === 'true' ? use DATABASE_URL for migrations` fallback (delete legacy alias path if D5).
- `apps/web/tests/e2e/global-setup.ts` — `if (!databaseUrl) PGlite skip` branch (convert to hard error: "DATABASE_URL required").

**Scripts & contracts:**

- `scripts/check-single-user-release.mjs` — **delete entire file** (its job was to assert the OSS boundary). Remove its `pnpm check:single-user-release` wiring in `package.json` and CI.
- `scripts/check-env-contract.mjs` — delete the four `Compose must force MULTI_USER_ENABLED=0 / KESTREL_ENABLE_RLS=0 / REGISTRATION_MODE=owner-first / OSS_SINGLE_USER_MODE=1` assertions; replace with `1/1/open/…` (no OSS flag).
- `scripts/check-compose-reproducibility.mjs` — flip `REGISTRATION_MODE` assertion from `owner-first` to `open`.
- `scripts/setup/lib/generate-env.mjs` — `SECTIONS` last group, `LEGACY_ENV_ALIASES`, `renderFreshContent`.
- `scripts/setup/secret-template.json` — `BYOK_ENABLED / MULTI_USER_ENABLED / REGISTRATION_MODE / KESTREL_ENABLE_RLS / OSS_SINGLE_USER_MODE` defaults.
- `scripts/setup/steps/*.mjs` — `mode.mjs` / `config.mjs` / `market-data.mjs` reference single-user / PGlite copy.
- `scripts/verify-local-env.mjs` — `ALLOW_LEGACY_LOCAL` gate remains; only doc sentence changes.

**CI & infra:**

- `.github/workflows/ci-fast.yml` — `pnpm check:single-user-release` step.
- `.github/workflows/ci-slow.yml`, `docker-publish.yml`, `release.yml` — verify no single-user assertions remain.
- `docker-compose.yml` — `app.environment` + `worker.environment` four flags.
- `Dockerfile` — `AUTH_MODE` neutralization line stays; only comment changes.
- `loadtest/docker-compose.loadtest.yml` + `loadtest/lib/auth.ts` + `loadtest/config/environments.ts` — `AUTH_MODE=legacy` for k6; keep explicitly as "loadtest uses legacy to bypass auth; not a deployment profile".
- `infra/cron-vm/units/kestrel-tenant-export.service` / `kestrel-tenant-delete.service` / `infra/cron-vm/scripts/delete-tenant.sh` — reference `__system__` tenant; retain but update guard comment to "global catalog tenant".
- `vitest.config.ts` / `vitest.workspace.ts` — PGlite aliases if any.

**Docs (user-facing — now unified private contract, per D2+D7):**

- `README.md` — title tagline, `IMPORTANT` callout, env block, deployment profiles section, `package.json:description` quote, quickstart `dev:local` PGlite note.
- `docs/configuration.md` — `Required OSS boundary` → `Required deployment environment` code block, deployment-profiles table (remove Simple/PGlite row), secrets table note.
- `docs/architecture.md` — header sentence, `Data and ownership boundary` block, `Deployment profiles` table, dependency-direction note if it mentions Simple.
- `docs/deployment-matrix.md` — entire header + `Security boundary` + `Profile validation` sections; delete Simple/PGlite rows, keep Docker + External Postgres.
- `docs/troubleshooting.md` — copy that mentions `owner-first` / `OSS_SINGLE_USER_MODE` / PGlite `.kestrel/data/`.
- `docs/release.md` — `Release classification` paragraph, `Local pre-release checks` code block, `Release validation` paragraph, `Rollback` paragraph.
- `docs/audit/findings.md` — "independent security review gate" gate referenced by `check-single-user-release` → rewrite to "RLS isolation gate" or remove if the audit doc is being sunset.
- `docs/README.md`, `docs/design-system.md` — if any single-user mention.
- `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md` — one sentence each referencing single-user / OSS boundary → private multi-user.
- `AGENTS.md` / `.claude/settings.json` — workflow hints that say "single-user self-hosted preview".
- `CHANGELOG.md` — not edited by hand; `0.2.0` entry added via changesets.

**Tests (must be updated or deleted):**

- `apps/web/test/oss-boundary.test.ts` — **delete file** (asserts the old refinements; replace with `multi-user-boundary.test.ts` — see §3.7).
- `packages/shared/test/env.test.ts` — `defaults registration to owner-first` + the three `OSS_SINGLE_USER_MODE` cases.
- `apps/web/test/provision-user.test.ts` — mocks `REGISTRATION_MODE='owner-first'`; update to `open` / `disabled`.
- `apps/web/test/admin/admin-auth.test.ts` — "treats single user as admin in single-user deployment" case (relies on `OSS_SINGLE_USER_MODE`).
- `packages/db/test/client.test.ts` — `vi.stubEnv('OSS_SINGLE_USER_MODE','1')`.
- `packages/db/test/pglite-fixture.ts` — **delete file** (or rewrite to Postgres test harness if needed).
- `packages/db/test/training-dataset.test.ts`, `packages/ai/test/idor-persistence.test.ts`, `packages/ai/test/full-analysis-properties.test.ts`, `packages/ai/test/helpers/full-analysis-queue-db.ts` — all import `getPgliteDb/pglite-fixture`; switch to Postgres harness or remove PGlite imports.
- `apps/web/tests/e2e/global-setup.ts` — PGlite skip path.

**Legacy-auth / `__system__` as an auth user (dev-only but referenced widely):**

- Keep `AUTH_MODE=legacy` for loadtest (`withTenantDbFresh` in `packages/db/src/client.ts` + `proxy.ts` fast path) but after PGlite removal its only remaining consumer is loadtest/k6. Do not remove the constant; gate it explicitly as "loadtest + non-prod dev only" with a loud boot warning.

---

## 2. Target state (after)

### 2.1 Env contract

```dotenv
# Defaults (in packages/shared/src/env.ts RuntimeEnv)
MULTI_USER_ENABLED=1
KESTREL_ENABLE_RLS=1
REGISTRATION_MODE=open        # or 'disabled' for invite-only; never 'owner-first'
BYOK_ENABLED=1                # unchanged
# OSS_SINGLE_USER_MODE — deleted (see §2.2 Option A)
# DATABASE_URL / POSTGRES_URL — required (no PGlite fallback)
```

**`OSS_SINGLE_USER_MODE` removal — Option A (chosen).** Delete the field entirely: remove `OSS_SINGLE_USER_MODE` from `RuntimeEnv`, its `z.enum` default, its `.refine()`, from `packages/db/src/client.ts:assertTenantIsolationConfig`, from `docker-compose.yml`, `.env.example`, and `secret-template.json`. With Zod's default `strip` behavior an old `.env` that still pins `OSS_SINGLE_USER_MODE=1` is silently ignored (no break). Release notes still say "remove it from your `.env` if pinned".

### 2.2 Zod refinements (the new invariants)

Replace the four `ServerEnvSchema.refine(...)` blocks with exactly these:

```ts
// 1. MULTI_USER_ENABLED requires RLS (unchanged)
.refine(env => !env.MULTI_USER_ENABLED || env.KESTREL_ENABLE_RLS, {
  message: 'MULTI_USER_ENABLED requires KESTREL_ENABLE_RLS=true.',
  path: ['KESTREL_ENABLE_RLS'],
})
// 2. Open registration requires multi-user+RLS (unchanged)
.refine(env => env.REGISTRATION_MODE !== 'open' || (env.MULTI_USER_ENABLED && env.KESTREL_ENABLE_RLS), {
  message: 'REGISTRATION_MODE=open requires MULTI_USER_ENABLED=1 and KESTREL_ENABLE_RLS=1.',
  path: ['REGISTRATION_MODE'],
})
// 3. Forbid the deleted owner-first mode — catch stale .env pins.
.refine(env => env.REGISTRATION_MODE !== 'owner-first', {
  message: 'REGISTRATION_MODE=owner-first is removed. Use open or disabled.',
  path: ['REGISTRATION_MODE'],
})
// 4. OSS_SINGLE_USER_MODE refinement — deleted (Option A).
```

`REGISTRATION_MODE`'s Zod enum also shrinks from `z.enum(['owner-first','open','disabled'])` to `z.enum(['open','disabled'])` with `.default('open')`. The refinement in (3) is technically redundant once the enum shrinks — keep it for a clearer error message on stale env files, or drop it and let Zod's `invalid_enum_value` fire (either is fine; the plan keeps refinement for a friendlier message).

### 2.3 RLS & tenancy

- `packages/db/src/client.ts:isRlsEnabled()` returns `KESTREL_ENABLE_RLS==='1'|'true'` — always true after the cut (but check is kept so tests can stub). No logic change, only the default flips.
- `assertTenantIsolationConfig()` keeps the `MULTI_USER_ENABLED→RLS` check and drops the `OSS_SINGLE_USER_MODE && RLS` check. Also drops the `HAMAFX_ENABLE_RLS` fallback per D5.
- `apps/web/scripts/migrate-runtime.mjs` keeps the `REGISTRATION_MODE=open requires MULTI_USER` preflight, drops the `owner-first` special case, and replaces the `if (!rlsEnabled) { for (table) DISABLE RLS }` loop with:

  ```ts
  if (!rlsEnabled) {
    console.error('[runtime-migrate] KESTREL_ENABLE_RLS must be 1; refusing to start.');
    process.exit(1);
  }
  console.log('[runtime-migrate] Multi-user mode: tenant RLS remains enabled and forced.');
  ```

  The `DISABLE RLS` path is gone — no dead code.
- DB migrations themselves are append-only; no migration is rewritten. The runtime entrypoint is the only place that toggles `FORCE/DISABLE RLS`.

### 2.4 Registration & auth

- `CreateUserInput.initialUserOnly` and its advisory-lock branch are deleted. `createUserWithSettings` becomes an unconditional insert (still transactional).
- `apps/web/src/app/(auth)/actions.ts:registerAction` passes no `initialUserOnly` arg; `INITIAL_USER_ALREADY_EXISTS` catch deleted; honest `users.email` unique-violation (`23505`) handling stays via `userExistsByEmail` pre-check.
- `provision-user.ts:provisionUserOnSignIn`'s `registrationMode==='owner-first'` advisory-lock block is deleted (the rest — `disabled` + `open` — stays). `SYSTEM_USER_ID` constant is either deleted or retained only for the `telemetry-persistence` global fallback cleanup (see below).
- `admin-auth.ts:getAdminUser`'s `getServerEnv().OSS_SINGLE_USER_MODE` fallback + `NOT EXISTS ... count(*)=1` query are deleted. Admin is now solely `role==='admin'`:

  ```ts
  if (user.role === 'admin') return { admin: { userId: user.id, … }, reason:'authenticated' };
  return { admin: null, reason:'forbidden' };
  ```

  Remove unused `getServerEnv` / `sql` imports; header comment becomes "Requires explicit role='admin'."
- `apps/web/src/lib/api.ts:withAuth` always calls `requireTenantIdForUser` + `withTenantDbFresh`; delete the `if (MULTI_USER_ENABLED==='1'|'true')` conditional.
- Global fallbacks deleted: `packages/ai/src/persistence/telemetry-persistence.ts`'s `userId ?? '__system__'` → require real `userId` or early-return.

### 2.5 Database — Postgres required, PGlite gone

- `packages/db/src/pglite-client.ts` and `packages/db/src/local-db.ts` — deleted.
- `packages/db/src/index.ts` — remove `export * from './pglite-client'` / `export * from './local-db'`.
- `packages/db/package.json` / `packages/test-utils/package.json` — remove `@electric-sql/pglite` dep, `exports["./pglite"]`.
- `scripts/dev.ts` — replace the `hasDbUrl ? postgres : pglite` branch with a hard requirement: if `!DATABASE_URL && !POSTGRES_URL` → print error "DATABASE_URL is required — start Postgres (`docker compose up -d db`) or set DATABASE_URL" and exit 1. Next.js boot proceeds only with Postgres.
- `apps/web/tests/e2e/global-setup.ts` — delete the `if (!databaseUrl) skip (PGlite)` path; instead throw "DATABASE_URL required".
- Any file that imports `getLocalDb` / `getPGliteDb` / `useMigratedPGliteFixture` is updated to import `getDb` / Postgres harness, or the file is deleted.

**Testing note (important):** dropping PGlite as a *deployment* profile does not force dropping it as a *test* harness. The cheapest path is to delete the runtime files (`pglite-client.ts`, `local-db.ts`) but keep `@electric-sql/pglite` in `packages/test-utils` for fast isolated unit tests that do not need real Postgres RLS proofs. If you want a full removal (your D3 says "drop pglite" without qualification), the plan deletes it everywhere and tests must use Docker Postgres — the plan defaults to **full deletion** per your literal instruction, but flags the cheaper hybrid as an easy rollback if CI gets painful.

### 2.6 Docker & setup

- `docker-compose.yml`: `app.environment` and `worker.environment` → `MULTI_USER_ENABLED: "1"`, `KESTREL_ENABLE_RLS: "1"`, `REGISTRATION_MODE: open`, delete `OSS_SINGLE_USER_MODE`. Update the `OSS release boundary` comment to `Deployment environment: multi-user + RLS required`.
- `scripts/setup/secret-template.json:defaults` → same four values flipped, `OSS_SINGLE_USER_MODE` deleted.
- `scripts/setup/lib/generate-env.mjs` → `SECTIONS` last section label `"Safe self-hosted defaults"` → `"Deployment defaults"`, keys list same four with new values, `LEGACY_ENV_ALIASES: delete HAMAFX_ENABLE_RLS` per D5.
- `scripts/setup/steps/mode.mjs` / `config.mjs` — remove question text that says "single-user" as a deployment choice; keep "How do you want to run Kestrel?" with choices "Docker (bundled Postgres)" / "External Postgres".
- `Dockerfile` — line 53 comment "Neutralize legacy-auth" stays; surrounding prose updated to "legacy AUTH_MODE is dev/loadtest-only; production is multi-user".
- `loadtest/*` — no functional change. Add a one-line comment above `AUTH_MODE: legacy` → "Used to bypass auth for k6; not a deployment profile."

### 2.7 Documentation — unified private multi-user contract

Every user-facing doc converges on:

> **Kestrel is a private self-hosted multi-user platform.** All deployments use Postgres with RLS; every authenticated request runs inside `withTenantDb*` with `app.current_tenant = <orgId>`. There is no single-user mode, no implicit admin, and no `owner-first` registration. Operators choose `REGISTRATION_MODE=open` (default) or `disabled` (invite-only) and require an explicit `role='admin'` for administration. Postgres is required — the PGlite embedded path is removed.

The `IMPORTANT: Open-Source Single-User Boundary` callout in `README.md` is deleted. The deployment matrix drops the Simple/PGlite row; only Docker and External Postgres remain. The troubleshooting backup note that says "In Simple Mode: your database lives in `.kestrel/data`" is deleted. The `AGENTS.private.md` separation is dissolved — private topology terms (if any) live in the unified docs.

---

## 3. Phased implementation (one PR, 8 ordered slices — small tasks)

Slices are ordered by dependency; each is internally atomic and independently reviewable. Small-tasks style means each slice should ideally be its own commit(s) on the same branch so reviews can proceed in parallel and reverts are surgical. The PR lands with review comments per slice.

### Slice 1 — Env contract (the root of everything)

**Files:** `packages/shared/src/env.ts`, `.env.example`, `README.md` (env block), `docs/configuration.md`, `docs/audit/findings.md` (if retained).

**Edits:**

1. `packages/shared/src/env.ts`:
   - In `RuntimeEnv`: change defaults — `MULTI_USER_ENABLED` `'0'→'1'`, `KESTREL_ENABLE_RLS` `'0'→'1'`, `REGISTRATION_MODE` `'owner-first'→'open'` and shrink enum to `z.enum(['open','disabled'])`.
   - Delete `OSS_SINGLE_USER_MODE` field.
   - Replace refinements per §2.2 (delete OSS refinement, keep MULTI→RLS + open→multi+RLS, add owner-first-forbid refinement with friendly message).
   - Per D5: delete `HAMAFX_ENABLE_RLS` / `HAMAFX_RUNTIME` / `HAMAFX_LOCAL_DOCKER` from `DEPRECATED_ENV_ALIASES` and from the `parseServerEnv` normalization pre-pass. Keep `NEXTAUTH_SECRET→AUTH_SECRET` with deprecation warning for one release.
   - Update inline doc comments (`/** Public account creation policy. owner-first allows ... */` → `/** open = anyone can register; disabled = admin-invite only. */`).
2. `.env.example`: same defaults flipped + `OSS_SINGLE_USER_MODE` line removed. Ensure `DATABASE_URL` is no longer commented as "may omit and use PGlite" — it is required.
3. `README.md`: env block (lines ~310–315) updated to `MULTI_USER_ENABLED=1 / KESTREL_ENABLE_RLS=1 / REGISTRATION_MODE=open` (delete `OSS_SINGLE_USER_MODE`), `IMPORTANT` single-user callout deleted, `description` in `package.json` updated (see slice 8 but flip can start here).
4. `docs/configuration.md`: `Required OSS boundary` → `Required deployment environment` block flipped + deployment-profiles table: delete Simple/PGlite row.

**Verification:** `pnpm turbo run test -- --filter=@kestrel/shared` + `pnpm typecheck --filter=@kestrel/shared`. Note `pnpm check:env-contract` will fail until slice 7 updates it — that is expected until then; a temporary skip annotation is fine but slice 7 must fix it before merge.

---

### Slice 2 — Database isolation truth

**Files:** `packages/db/src/client.ts`, `packages/db/src/tenant.ts` (comment), `packages/db/src/queries/auth.ts`, `packages/db/src/schema/auth.ts` (comment), `packages/db/test/client.test.ts`.

**Edits:**

1. `packages/db/src/client.ts`:
   - `isRlsEnabled()`: drop `HAMAFX_ENABLE_RLS` fallback per D5.
   - `assertTenantIsolationConfig()`: delete the `ossSingleUserMode && isRlsEnabled()` branch; keep the `multiUserEnabled && !isRlsEnabled()` branch.
   - `withTenantDbFresh / withTenantDbRO`: comment update: "RLS disabled only for … PGlite dev — not a supported deployment" → "RLS is always enabled; PGlite path removed".
2. `packages/db/src/tenant.ts`: comment "One personal org whose id equals userId — self-host single-user shape" → "One org per tenant; lookup is authoritative for multi-user."
3. `packages/db/src/queries/auth.ts`: delete `initialUserOnly?: boolean` from `CreateUserInput`, delete the `if (input.initialUserOnly)` advisory-lock + `INITIAL_USER_ALREADY_EXISTS` block. `createUserWithSettings` becomes a straight insert.
4. `packages/db/test/client.test.ts`: replace `vi.stubEnv('OSS_SINGLE_USER_MODE','1')` with stubs for `KESTREL_ENABLE_RLS='1'` / `MULTI_USER_ENABLED='1'` / `REGISTRATION_MODE='open'`.

**Verification:** `pnpm turbo run test -- --filter=@kestrel/db` (PGlite suite will still pass until slice 6 deletes it — that is okay) + `pnpm turbo run typecheck`.

---

### Slice 3 — Auth, registration & admin gate

**Files:** `apps/web/src/lib/auth/provision-user.ts`, `apps/web/src/app/(auth)/actions.ts`, `apps/web/src/lib/admin-auth.ts`, `apps/web/src/lib/admin-check.ts`, `apps/web/src/lib/api.ts`, `apps/web/src/lib/env.ts` (comment), `apps/web/src/auth.config.ts` (no logic change, comment only), `apps/web/src/proxy.ts` (no logic change, comment only).

**Edits:**

1. `provision-user.ts`:
   - Delete `const SYSTEM_USER_ID='__system__'` and the `if (registrationMode==='owner-first') { advisory lock; check; throw INITIAL_USER_ALREADY_EXISTS }` block.
   - Keep `if (registrationMode==='disabled') throw` and the insert sequence.
   - Remove the `catch (INITIAL_USER_ALREADY_EXISTS)` branch.
   - Delete now-unused `import { ne, sql } from 'drizzle-orm'` symbols if only used by the deleted branch.
2. `apps/web/src/app/(auth)/actions.ts:registerAction`:
   - Call `createUserWithSettings({ id:newUserId, email:normalizedEmail, name, hashedPassword })` with no `initialUserOnly` arg.
   - Delete the `catch (INITIAL_USER_ALREADY_EXISTS)` branch.
   - Keep `REGISTRATION_MODE==='disabled'` guard.
3. `apps/web/src/lib/admin-auth.ts`:
   - Delete the `if (!getServerEnv().OSS_SINGLE_USER_MODE) return forbidden` guard and the 20-line `SELECT ... NOT EXISTS ... count(*)=1 ORDER BY createdAt LIMIT 1` query.
   - After `if (user.role==='admin') return authenticated`, return `{ admin:null, reason:'forbidden' }`.
   - Remove unused `import { getServerEnv }` and `sql` if only used by the deleted query.
   - Header comment: "In single-user deployments…" → "Requires explicit role='admin'."
4. `apps/web/src/lib/admin-check.ts`: update comment delegation note.
5. `apps/web/src/lib/api.ts:withAuth`: delete the `if (MULTI_USER_ENABLED==='1'|'true')` conditional — always call `requireTenantIdForUser` + `withTenantDbFresh`:

   ```ts
   const tenantId = await requireTenantIdForUser(user.userId, getAdminDb());
   return await withTenantDbFresh(tenantId, () => handler(req, { params: ctx.params, user }));
   ```

   If a dev PGlite bypass must remain temporarily, gate on `isRlsEnabled()` instead — but with D3 this branch is gone entirely.
6. `apps/web/src/lib/env.ts`: keep `AUTH_MODE=legacy` warnings as-is (they are dev-only and already guarded by `assertProductionSecurity`). Only note in comment that `owner-first` is no longer a valid `REGISTRATION_MODE`.

**Verification:** `pnpm turbo run test -- --filter=@kestrel/web` (covers `provision-user.test.ts` + `admin-auth.test.ts` — those must be updated in slice 7), `pnpm typecheck`.

---

### Slice 4 — Runtime migration entrypoint

**File:** `apps/web/scripts/migrate-runtime.mjs`.

**Edits:**

1. Delete the `HAMAFX_*` alias reads per D5.
2. Replace the RLS preflight block per §2.3 — `if (!rlsEnabled) { process.exit(1) }` with no `DISABLE RLS` loop. The disable loop is gone.
3. Update the comment block: "The OSS release is single-user only. Do this preflight before …" → "Private deployment: multi-user + RLS required; fail closed otherwise."

**Verification:** manual review of the staged diff + dry check `node --check apps/web/scripts/migrate-runtime.mjs` (syntax check). The real migration check is part of `docker compose up`.

---

### Slice 5 — Compose, Dockerfile, setup

**Files:** `docker-compose.yml`, `scripts/setup/secret-template.json`, `scripts/setup/lib/generate-env.mjs`, `scripts/setup/steps/*.mjs`, `Dockerfile`.

**Edits:**

1. `docker-compose.yml` (two services):
   - `app.environment` + `worker.environment`: `MULTI_USER_ENABLED: "1"`, `KESTREL_ENABLE_RLS: "1"`, `REGISTRATION_MODE: open`, delete `OSS_SINGLE_USER_MODE`.
   - Update the `OSS release boundary` comment to `Deployment environment: multi-user + RLS required`.
2. `scripts/setup/secret-template.json:defaults`: `MULTI_USER_ENABLED "1"`, `KESTREL_ENABLE_RLS "1"`, `REGISTRATION_MODE "open"`, delete `OSS_SINGLE_USER_MODE`.
3. `scripts/setup/lib/generate-env.mjs`:
   - `SECTIONS` last tuple label `"Safe self-hosted defaults"` → `"Deployment defaults"`.
   - Keys list: same four with new values.
   - `LEGACY_ENV_ALIASES`: delete `HAMAFX_ENABLE_RLS` entry per D5.
4. `scripts/setup/steps/mode.mjs` / `config.mjs`: remove question text that says "single-user" as a choice. Keep "How do you want to run Kestrel?" with "Docker (bundled Postgres)" / "External Postgres".
5. `Dockerfile`: line 53 legacy-auth comment prose update.

**Verification:** `docker compose config --quiet` (no `OSS_SINGLE_USER_MODE` in output), `node scripts/setup/lib/generate-env.mjs --help`, `pnpm check:compose-reproducibility` (after slice 7).

---

### Slice 6 — Delete the PGlite runtime path (new, D3)

**Files (delete / edit):**

- **Delete** `packages/db/src/pglite-client.ts` (403 lines).
- **Delete** `packages/db/src/local-db.ts`.
- **Delete** `packages/db/test/pglite-fixture.ts`.
- **Edit** `packages/db/src/index.ts` — remove `export * from './pglite-client'` / `export * from './local-db'`.
- **Edit** `packages/db/package.json` — remove `dependencies["@electric-sql/pglite"]`, `exports["./pglite"]`, any `pglite` script/build target.
- **Edit** `packages/test-utils/package.json` — remove `@electric-sql/pglite` if full deletion is chosen (if keeping PGlite for tests, leave this dep — note the choice in the PR description).
- **Edit** `scripts/dev.ts` — delete the `hasDbUrl ? postgres : pglite` branch; replace with hard requirement:

  ```ts
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    console.error('[dev] DATABASE_URL is required — start Postgres (docker compose up -d db) or set DATABASE_URL');
    process.exit(1);
  }
  ```

  Drop the PGlite banner lines. Keep `KESTREL_LOCAL_DEV` if still used else remove.
- **Edit** `apps/web/tests/e2e/global-setup.ts` — delete the `if (!databaseUrl) skip (PGlite)` path; throw instead.
- **Edit** `packages/db/src/queries/auth.ts` (already touched in slice 2) — ensure no remaining `getLocalDb` imports.
- **Edit** any file discovered by `rg -l "getLocalDb|getPGliteDb|pglite|PGlite" --glob '!node_modules'` — either switch to `getDb()` or delete the file.
- **Edit** `vitest.workspace.ts` / `vitest.config.ts` — remove PGlite-specific config if any.
- **Edit** `apps/web/src/persistence/telemetry-persistence.ts` — delete `userId ?? '__system__'` fallback.

**Verification:** `rg -l "pglite|PGlite|getLocalDb" --glob '!node_modules' --glob '!.next' --glob '!.git'` → `No matches` (full deletion) or only `packages/test-utils/**` (hybrid). `pnpm typecheck` must have zero `Cannot find module '@electric-sql/pglite'` errors. `pnpm turbo run build` must not reference `pglite-client`.

**Cost note (call out in PR):** after full deletion, `pnpm test` requires a live Postgres. CI must spin one up (the existing `docker-compose.yml:db` service works). Local devs run `docker compose up -d db` before tests. If this regresses DX too much, the cheapest revert is to restore `@electric-sql/pglite` only in `packages/test-utils` as a test harness — no runtime change required.

---

### Slice 7 — Scripts, CI & tests that assert the old boundary

**Files (delete / rewrite):**

- **Delete** `scripts/check-single-user-release.mjs`.
- **Edit** `scripts/check-env-contract.mjs`: assertions at lines 68–71 flipped to `MULTI_USER_ENABLED="1"`, `KESTREL_ENABLE_RLS="1"`, `REGISTRATION_MODE=open`, and the `OSS_SINGLE_USER_MODE` assertion changed to `if (compose.includes('OSS_SINGLE_USER_MODE')) failures.push('stale single-user flag')`.
- **Edit** `scripts/check-compose-reproducibility.mjs`: `REGISTRATION_MODE` assertion from `owner-first` → `open`.
- **Edit** `package.json:scripts`: delete `"check:single-user-release": "node scripts/check-single-user-release.mjs"`. Update `"description"` to `"The Self-Hosted Multi-User BYOK AI Trading Platform"` (or your preferred phrasing).
- **Edit** `.github/workflows/ci-fast.yml`: delete the `run: pnpm check:single-user-release` step (keep the adjacent `check:*` steps). Add PGlite-free postgres service to `unit-tests` job if slice 6 made tests Postgres-dependent:

  ```yaml
  services:
    postgres:
      image: pgvector/pgvector:pg16
      env:
        POSTGRES_DB: hamafx
        POSTGRES_USER: hamafx
        POSTGRES_PASSWORD: test
      ports: ["5432:5432"]
      options: --health-cmd "pg_isready -U hamafx -d hamafx" --health-interval 5s --health-timeout 5s --health-retries 5
  ```

  (Keep Supabase headers if needed; simplest is the pgvector image already used in `docker-compose.yml`.)
- **Delete** `apps/web/test/oss-boundary.test.ts`; **add** `apps/web/test/multi-user-boundary.test.ts`:

  ```ts
  import { parseServerEnv } from '@kestrel/shared';
  import { describe, expect, it } from 'vitest';

  const base = {
    NODE_ENV: 'development' as const,
    DATABASE_URL: 'postgres://user:password@localhost:5432/kestrel',
    AUTH_SECRET: 'a'.repeat(32),
    CRON_SECRET: 'c'.repeat(16),
    ENCRYPTION_SECRET: 'e'.repeat(32),
  };

  describe('multi-user boundary', () => {
    it('accepts the default multi-user configuration', () => {
      const env = parseServerEnv(base);
      expect(env.MULTI_USER_ENABLED).toBe(true);
      expect(env.KESTREL_ENABLE_RLS).toBe(true);
      expect(env.REGISTRATION_MODE).toBe('open');
    });

    it('rejects RLS disabled when multi-user is on', () => {
      expect(() => parseServerEnv({ ...base, MULTI_USER_ENABLED:'1', KESTREL_ENABLE_RLS:'0' }))
        .toThrow(/MULTI_USER_ENABLED.*KESTREL_ENABLE_RLS/);
    });

    it('rejects owner-first (removed mode)', () => {
      expect(() => parseServerEnv({ ...base, REGISTRATION_MODE:'owner-first' as never }))
        .toThrow(/owner-first is removed|REGISTRATION_MODE/);
    });

    it('accepts disabled registration in multi-user mode', () => {
      const env = parseServerEnv({ ...base, REGISTRATION_MODE:'disabled' });
      expect(env.REGISTRATION_MODE).toBe('disabled');
    });
  });
  ```

- **Edit** `packages/shared/test/env.test.ts`: `defaults registration to owner-first` → `defaults registration to open`; rewrite the three `OSS_SINGLE_USER_MODE` cases to assert `MULTI_USER_ENABLED && KESTREL_ENABLE_RLS` with the new defaults; add a case asserting `REGISTRATION_MODE='owner-first'` rejects.
- **Edit** `apps/web/test/provision-user.test.ts`: mock `REGISTRATION_MODE` as `'open'` / `'disabled'`; delete the `owner-first` advisory-lock reliance.
- **Edit** `apps/web/test/admin/admin-auth.test.ts`: delete the `treats single user as admin in single-user deployment` and `second regular account exists without explicit admin` cases that rely on `OSS_SINGLE_USER_MODE`.
- **Edit** `packages/db/test/client.test.ts`: stubs noted in slice 2 (if not already).
- **Edit / delete** PGlite-harness tests: `packages/db/test/training-dataset.test.ts`, `packages/ai/test/idor-persistence.test.ts`, `packages/ai/test/full-analysis-properties.test.ts`, `packages/ai/test/helpers/full-analysis-queue-db.ts` — either delete (if full PGlite removal) or rewrite to use the Postgres harness that `docker compose up -d db` provides. The hybrid option is to keep `@electric-sql/pglite` only for these tests (no runtime import), which leaves them untouched — call out which path was taken in the PR.

**Verification:** `pnpm check:env-contract`, `pnpm check:compose-reproducibility`, `pnpm check:oss-release` (now without single-user assertions), `pnpm turbo run test`, `pnpm turbo run build`.

---

### Slice 8 — Documentation — unified private multi-user contract

**Files:** `README.md`, `docs/configuration.md`, `docs/architecture.md`, `docs/deployment-matrix.md`, `docs/release.md`, `docs/troubleshooting.md`, `docs/README.md`, `docs/design-system.md` (if any single-user mention), `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`, `package.json:description`, `docs/audit/findings.md` / `docs/audit/*` (if sunset/unify), `AGENTS.md`.

This slice is pure prose but is intentionally last so every code truth is already correct and docs can quote it.

Patterns to replace (use ripgrep to verify completeness after):

- `Open-Source, Single-User BYOK AI Trading Platform` → `Private Self-Hosted Multi-User BYOK Trading Platform` (or your preferred tagline — pick one and keep consistent).
- `single-user, self-hosted preview` / `single-user self-hosted beta` → `private self-hosted multi-user platform`.
- Code blocks showing `OSS_SINGLE_USER_MODE=1 / MULTI_USER_ENABLED=0 / KESTREL_ENABLE_RLS=0 / REGISTRATION_MODE=owner-first` → `MULTI_USER_ENABLED=1 / KESTREL_ENABLE_RLS=1 / REGISTRATION_MODE=open` (delete `OSS_SINGLE_USER_MODE`).
- `Owner-First Registration` section → `Open or admin-disabled registration — every tenant requires requireTenantIdForUser + withTenantDb* scoping`.
- `Do not change these values for a shared public instance. Enabling flags does not complete tenant isolation.` → deleted; replaced with `Tenant isolation is enforced via Postgres RLS on every user-data table.`
- `Simple (PGlite · no Docker)` / `Simple mode may omit DATABASE_URL and use embedded PGlite` → deleted; replaced with `Postgres is required; start it with docker compose up -d db or set DATABASE_URL`.
- `pnpm check:single-user-release` from doc code blocks → delete line.
- `pnpm dev:local` PGlite 60-second quickstart → `docker compose up -d db && pnpm dev`.
- `IMPORTANT: Open-Source Single-User Boundary` callout → deleted or replaced with `NOTE: Multi-user + RLS is always enabled; AUTH_MODE=legacy is loadtest/dev only`.
- `docs/deployment-matrix.md` Simple row, `docs/architecture.md` Simple diagram → delete; keep Docker + External Postgres topologies.
- `docs/troubleshooting.md` `In Simple Mode: your database lives in .kestrel/data` → `Your database lives in the pgdata Docker volume or your external Postgres.`
- `AGENTS.md` / `.claude/settings.json` single-user workflow hints → private multi-user.
- `docs/audit/findings.md` "independent security review gate" referenced by `check-single-user-release` → either rewrite to "RLS isolation gate" or delete the doc if auditing is no longer tracked separately (since not OSS).
- `CONTRIBUTING.md` / `SECURITY.md` single-user boundary paragraph → private multi-user boundary.

**Verification:** `rg -n "single.?user|OSS_SINGLE|owner.?first|\.kestrel/data" --glob '!node_modules' --glob '!.next' --glob '!.git' | grep -v "docs/plans/remove-single-user"` → **no user-facing hits** outside of `loadtest/*`'s explicitly-commented `AUTH_MODE=legacy` and package `CHANGELOG` history. `rg -n "PGlite|pglite" --glob '!node_modules'` → `No matches` (full deletion) or only `packages/test-utils/**` (hybrid).

---

## 4. Dependency & ordering graph

```
Slice 1 (env) ─────────┬─→ Slice 2 (db client) ─→ Slice 3 (auth/admin)
                       │                        ↓
                       └─→ Slice 4 (migrate-runtime) ─→ Slice 5 (compose/setup)
                                                        ↓
                                              Slice 6 (PGlite runtime deletion)
                                                        ↓
                                              Slice 7 (scripts/CI/tests)
                                                        ↓
                                              Slice 8 (docs — unifies private contract)  [can run parallel with 7]
```

The only true serialization is **Slice 1 before Slices 2–5** (Zod defaults are imported everywhere). **Slice 6 must run before Slice 7** (because Slice 7 deletes/rewrites tests that import PGlite). Slice 8 can run parallel with 7 once Slice 6 is done (docs quote the new truth).

For the **one PR + small tasks** workflow (D6): push slices as incremental commits on a single branch `feat/multi-user-private` off `main`. Each commit is `feat(scope): …`. Reviewers can step through commit-by-commit. Squash only at merge if you want a clean revert point; otherwise keep slice commits for bisectability. No two-phase rollout — one PR, one `0.2.0` tag.

---

## 5. Rollout, sequencing, and back-compat

- **Single PR, base=`main`, title** `feat!: private multi-user — remove single-user mode and PGlite (BREAKING)` — mark as `feat!` so changesets bumps `0.1.0 → 0.2.0`.
- **No DB migration in this PR** beyond the runtime entrypoint toggle. The migration chain is append-only; the RLS disable loop is runtime-only. A follow-up migration that renames or deletes `__system__` data is intentionally deferred (see §7.3) to keep the code PR revert-safe.
- **PGlite removal is a hard requirement after merge:** every developer and CI runner must have Postgres. The fastest path is `docker compose up -d db` (the existing `db` service is already pgvector). No other infra is required.
- **Stale `.env` handling.** Operators (you, or any private host) who pinned `OSS_SINGLE_USER_MODE=1 / MULTI_USER_ENABLED=0 / KESTREL_ENABLE_RLS=0 / REGISTRATION_MODE=owner-first` will see:
  - `pnpm check:env-contract` (CI) fail on the stale defaults.
  - `parseServerEnv` (startup) throw `REGISTRATION_MODE=owner-first is removed` (if refinement kept) or `invalid_enum_value` from Zod. Either is fixed by editing `.env` → `REGISTRATION_MODE=open`.
- **Data already in `.kestrel/data/` (PGlite).** Before merging, dump if you want to keep it: `node -e "import('@kestrel/db/pglite-client').then(m=>m.getPGliteDb().then(db=>db.dump()))"` is not a real API — use `pg_dump` via the pglite fixture or just start Postgres fresh if the PGlite data was ephemeral dev data (release notes call this out).
- **Docker volume compat.** `docker-compose.yml`'s `volumes: hamafx_pgdata / hamafx_backup-data` names are intentionally retained (compat identifiers, per `docker-compose.yml` comment) — do not rename them in this PR.
- **No semver-major until `1.0.0`.** Pre-1.0, `0.2.0` is a breaking change per `CHANGELOG.md` convention but does not imply a major.

---

## 6. Verification checklist (what the agent must run)

Every slice claims to be done only after its slice's checks pass; the PR is done only after **all** of these pass on a clean checkout.

### 6.1 Automated gates (must pass in CI)

| Gate | Command | What it proves |
|------|---------|---------------|
| Env contract | `pnpm check:env-contract` | `.env.example` + `secret-template.json` + `docker-compose.yml` agree on `MULTI_USER_ENABLED=1 / KESTREL_ENABLE_RLS=1 / REGISTRATION_MODE=open` and no `OSS_SINGLE_USER_MODE` |
| Compose reproducibility | `pnpm check:compose-reproducibility` | Compose `app`/`worker` envs match the env schema |
| OSS/secret scan | `pnpm check:oss-release` | No tracked secrets leaked (now without single-user assertions) |
| P0 / P3 release gates | `pnpm check:p0-release && pnpm check:p3-release` | Security baseline |
| Route security | `pnpm check:route-security` | No unauthenticated admin/csrf regressions |
| Release archive | `pnpm check:release-archive` | Archive shape |
| Dependency report | `pnpm check:dependency-report` | Licenses/SBOM baseline |
| Single-user gate **deleted** | `pnpm check:single-user-release` must **fail as "script not found"** | Prove the single-user check is gone |
| PGlite **deleted** | `rg -l "pglite\|PGlite" --glob '!node_modules' --glob '!.next' --glob '!.git'` → no matches (or only test-utils if hybrid) | Prove runtime PGlite path is gone |
| Typecheck | `pnpm typecheck` (`turbo run typecheck`) | No stray `OSS_SINGLE_USER_MODE` refs, no `initialUserOnly` / `getLocalDb` type errors |
| Lint | `pnpm turbo run lint` | No dead imports after deletions |
| Unit (+ postgres) | `docker compose up -d db && pnpm turbo run test -- --coverage` | `env.test` + `provision-user.test` + `admin-auth.test` + db suite pass with Postgres |
| Build | `pnpm turbo run build` | `apps/web` builds; `apps/worker` builds |
| Compose config | `docker compose config --quiet` | Renders without unknown var interpolation; `DATABASE_URL` required |
| Dead-code | `pnpm knip --no-progress` (report-only) | No new orphan after removals |
| Text scan | `rg -n "single.?user\|OSS_SINGLE\|owner.?first\|Simple.*PGlite\|\\.kestrel/data" --glob '!node_modules' --glob '!.next' --glob '!.git' \| grep -v "docs/plans/remove-single-user"` → empty | No single-user / PGlite residue |

### 6.2 Manual gates (before tagging 0.2.0)

| Gate | How | When |
|------|-----|------|
| Fresh `docker compose up` on an empty volume | `docker compose down -v && ./docker/init-secrets.sh && docker compose up -d --build` then `curl http://localhost:3000/api/health/public` + register two distinct emails (`open`) then promote one to `role=admin` and login as both | Before tagging |
| `REGISTRATION_MODE=disabled` path | Set `REGISTRATION_MODE=disabled` in `.env`, restart, verify `/register` returns closed and an existing account can still sign in | Same |
| `AUTH_MODE=legacy` forbidden in production | `NODE_ENV=production AUTH_MODE=legacy pnpm turbo run build` must throw `assertProductionSecurity` | Same |
| Postgres RLS suite (needs real Postgres) | `pnpm test:postgres-rls` against a disposable DB | Pre-tag, not PR gate (documented) |
| Backup/restore smoke | `docker/backup-restore-smoke.sh` (disposable) | Pre-tag |
| `DATABASE_URL` required | `unset DATABASE_URL; unset POSTGRES_URL; pnpm dev` → exits 1 with "DATABASE_URL is required" | Local check after slice 6 |

---

## 7. Risks & mitigations

### 7.1 Implicit admin loss

**Risk:** Any account that relied on the sole-account implicit admin (single-user) will lose admin access because `getAdminUser` now requires `role='admin'`.  
**Mitigation:** Document a one-time manual promotion: `psql $DATABASE_URL -c "UPDATE \"user\" SET role='admin' WHERE email='you@example.com'"`. Mention in `docs/troubleshooting.md` + `0.2.0` migration notes. Both `admin` and `user` are plain `text` roles so this is a safe direct update.

### 7.2 Second-account bypass no longer applies

**Risk:** None — removing the `NOT EXISTS ... count(*)=1` query *tightens* security, not loosens. Reviewers who ask "did we open a second-account bypass?" get the answer: the boundary now requires explicit admin roles, strictly stronger.

### 7.3 `__system__` global tenant — do not rename in this PR

**Risk:** A reviewer proposes "also rename `__system__` to `__global__`" or "remove `__system__` entirely."  
**Mitigation:** Decline; defer to a follow-up that adds an explicit data migration (update every `tenant_id DEFAULT '__system__'` + every row) + code migration in one atomic release. Doing it inside the same PR doubles the blast radius for no user-visible gain. The `__system__` string remains exactly where it is today for `symbol_catalog` and `cron_runs`; its *auth bypass* meaning is removed (this PR already deletes the admin-auth / lock consumption).

### 7.4 Worker + cron jobs that assume a single tenant

**Risk:** Worker jobs that enumerate tenants or use `requireTenantIdForUser` in a loop may have been tested only with one tenant.  
**Mitigation:** No enumeration logic changes in this PR — the worker already runs `withTenantDbFresh(tenantId, ...)` per-tenant. The only invariant flip is that `tenantId` is always real; there is no `tenantId='__system__'` synthetic fallback. The `apps/web/src/app/api/cron/weekly-review` note `hardcoded '__system__' fallback` is updated to `enumerate tenants` (the fallback branch is deleted). `telemetry-persistence`'s `__system__` fallback is likewise deleted.

### 7.5 Secret-template drift

**Risk:** Editing `secret-template.json` but not `generate-env.mjs:SECTIONS` (or vice versa) leaves `pnpm check:env-contract` passing but `generate-env.mjs` failing to render.  
**Mitigation:** Both are in Slice 5; the render check `node scripts/setup/lib/generate-env.mjs --help` + `pnpm check:env-contract` covers it.

### 7.6 PGlite-test fallout (new, D3)

**Risk:** Full PGlite deletion makes `pnpm test` fail without Docker Postgres, breaking CI and contributor DX.  
**Mitigation:** CI's `unit-tests` job gains a `services.postgres` (pgvector image, already in `docker-compose.yml`). Locally, the prerequisite is `docker compose up -d db` before tests — document in `CONTRIBUTING.md` and the PR description. Cheapest rollback if this hurts is to restore `@electric-sql/pglite` **only** in `packages/test-utils` as a test harness (no runtime import) — no production change.

### 7.7 Backport pressure (moot, but noted)

Kiosk / single-tenant ask is now moot (private host). If it ever recurs, the answer is: run the multi-user stack with one member and `REGISTRATION_MODE=disabled` — no feature flag needed.

---

## 8. Out-of-scope (explicitly not in this PR)

- Renaming Docker volumes `hamafx_*` → `kestrel_*` (compat identifiers, per `docker-compose.yml` comment).
- Changing BYOK defaults or encryption at rest.
- Changing billing, observability (Sentry/Langfuse), or provider failover wiring.
- Rewriting Drizzle migration history — migrations are append-only.
- Removing `AUTH_MODE=legacy` entirely (keep for loadtest; behind `assertProductionSecurity`).
- Adding a `__system__ → __global__` data migration (deferred; see §7.3).
- Any PGlite re-introduction as a deployment profile (deleted; test-harness-only restoration is an allowed rollback per §7.6).

---

## 9. Definition of done

- [x] All eight slices applied on a single `feat!:` branch off `main`.
- [x] Automated checks green in this workspace. Clean-checkout CI still needs to run; root Turbo build/typecheck is blocked locally by the sandbox `Exec format error`.
- [x] `rg` scan for user-facing `single.?user|OSS_SINGLE|owner.?first|Simple.*PGlite` is empty outside `loadtest` legacy comment and this plan file.
- [x] `rg` scan for `pglite|PGlite|getLocalDb` matches plan's chosen deletion level (full or hybrid — stated in PR description).
- [x] `docker compose config` renders `MULTI_USER_ENABLED=1 / KESTREL_ENABLE_RLS=1 / REGISTRATION_MODE=open` with no `OSS_SINGLE_USER_MODE`.
- [x] `DATABASE_URL` unset → `pnpm dev` / `pnpm test` fail fast with "DATABASE_URL is required".
- [ ] Fresh-volume `docker compose up` registration/admin manual rehearsal remains for a deployable host.
- [x] This plan file referenced from the PR description and the `0.2.0` changelog entry.
- [x] No tracked secret or private infra URL introduced (passes `check:oss-release` + manual `rg` of `.env.example` diff).

---

## 10. Suggested PR/commit outline (for the implementation agent)

```
feat!: private multi-user — remove single-user mode and PGlite (BREAKING)

D1=open, D2=private, D3=drop PGlite, D4=keep __system__ as global catalog,
D5=drop HAMAFX_* now / NEXTAUTH alias one release, D6=one PR eight slices,
D7=unify docs (no OSS/private split).

Covers:
  env:   flip defaults to MULTI_USER_ENABLED=1/KESTREL_ENABLE_RLS=1/REGISTRATION_MODE=open;
         delete OSS_SINGLE_USER_MODE; shrink REGISTRATION_MODE enum; drop HAMAFX aliases
  db:    drop owner-first advisory lock + implicit admin query; require Postgres
  pglite: delete pglite-client.ts + local-db.ts + pglite-fixture.ts; remove dep; dev now requires DATABASE_URL
  auth:  remove initialUserOnly + INITIAL_USER_ALREADY_EXISTS path
  admin: require explicit role=admin
  migrate-runtime: refuse to DISABLE RLS; fail closed on stale env
  compose/setup: multi-user defaults in docker-compose + secret-template + wizard
  scripts/ci/tests: delete check:single-user-release; add multi-user-boundary; pgvector service in CI
  docs:  unify to private multi-user; drop OSS boundary callout, Simple/PGlite rows

Refs: docs/plans/remove-single-user-mode-keep-multi-user.md

Co-Authored-By: Claude <noreply@anthropic.com>
```

Break into **eight slice commits** on the branch (one per §3 slice) so reviewers can step through commit-by-commit; squash only at merge if you prefer a single revert point. Cherry-picking slice commits should never leave the tree in a state where `pnpm typecheck` is red — if it does, reorder the slices per §4.

---

## Appendix A. File census (every path the agent will touch)

> Parenthesized tags: **D** delete, **E** edit, **C** comment-only, **N** new.

```
package.json                                  E  (description + check: script + pglite dep removed)
pnpm-workspace.yaml                           ·  (no change)
turbo.json                                    ·  (no change)
docker-compose.yml                            E  (4 flags × 2 services + comment)
Dockerfile                                    C  (legacy-auth comment)
.env.example                                  E  (flip defaults, delete OSS flag, mark DATABASE_URL required)
packages/shared/src/env.ts                   E  (defaults + enum + refinements + aliases)
packages/shared/test/env.test.ts             E
apps/web/src/lib/env.ts                      C  (AUTH_MODE warning comment)
apps/worker/src/env.ts                       ·  (verify wiring; no change)
packages/db/src/client.ts                     E
packages/db/src/tenant.ts                     C
packages/db/src/queries/auth.ts               E
packages/db/src/schema/auth.ts                C  (comment: __system__ is global catalog only)
packages/db/src/pglite-client.ts              D
packages/db/src/local-db.ts                   D
packages/db/src/index.ts                      E  (remove pglite/local-db re-exports)
packages/db/package.json                      E  (remove @electric-sql/pglite + ./pglite export)
packages/test-utils/package.json              E  (remove pglite if full deletion; keep if hybrid — note choice)
packages/db/test/client.test.ts               E
packages/db/test/pglite-fixture.ts            D
packages/db/test/training-dataset.test.ts     E  (or D — switch harness)
packages/ai/test/helpers/full-analysis-queue-db.ts  E  (or D)
packages/ai/test/full-analysis-properties.test.ts   E  (or D)
packages/ai/test/idor-persistence.test.ts     E  (or D)
packages/ai/src/persistence/telemetry-persistence.ts  E  (delete __system__ fallback)
apps/web/src/lib/auth/provision-user.ts       E
apps/web/src/app/(auth)/actions.ts           E
apps/web/src/lib/admin-auth.ts                E
apps/web/src/lib/admin-check.ts               C
apps/web/src/lib/api.ts                       E
apps/web/src/auth.config.ts                   C
apps/web/src/proxy.ts                         C
apps/web/src/app/(app)/layout.tsx             C
apps/web/src/app/(app)/journal/page.tsx       C
apps/web/src/app/(app)/chat/page.tsx          C
apps/web/src/app/(app)/chat/[threadId]/page.tsx  C
scripts/dev.ts                                E  (require DATABASE_URL)
apps/web/tests/e2e/global-setup.ts            E  (fail if no DATABASE_URL)
apps/web/scripts/migrate-runtime.mjs          E
scripts/setup/secret-template.json            E
scripts/setup/lib/generate-env.mjs            E
scripts/setup/steps/mode.mjs                  E
scripts/setup/steps/config.mjs                E  (if it mentions single-user/PGlite)
scripts/check-single-user-release.mjs         D
scripts/check-env-contract.mjs                E
scripts/check-compose-reproducibility.mjs     E
scripts/check-oss-release.mjs                 ·  (audit, no functional change)
scripts/verify-local-env.mjs                  C
.github/workflows/ci-fast.yml                 E  (delete one step; add postgres service if needed)
vitest.workspace.ts / vitest.config.ts        E  (remove PGlite config if any)
apps/web/test/oss-boundary.test.ts            D
apps/web/test/multi-user-boundary.test.ts     N
apps/web/test/provision-user.test.ts          E
apps/web/test/admin/admin-auth.test.ts        E
loadtest/docker-compose.loadtest.yml          C
loadtest/lib/auth.ts                          C
loadtest/config/environments.ts               C
infra/cron-vm/scripts/delete-tenant.sh        C
README.md                                     E
docs/configuration.md                         E
docs/architecture.md                          E
docs/deployment-matrix.md                     E
docs/release.md                               E
docs/troubleshooting.md                       E
docs/README.md                                E
docs/audit/findings.md                        E  (or D if sunsetting)
CONTRIBUTING.md                               E
SECURITY.md                                   E
SUPPORT.md                                    E
AGENTS.md                                     E
CHANGELOG.md                                  ·  (via changeset, 0.2.0 entry)
```

Any file not in this census must not be edited without updating the census — this keeps the PR bounded and reviewable.

---

## Appendix B. Ripgrep probes for the review

Run before requesting review to prove completeness:

```bash
# No user-facing single-user / PGlite residue (excluding this plan + loadtest's commented legacy):
rg -n "single.?user|OSS_SINGLE|owner.?first|Simple.*PGlite|\.kestrel/data" \
  --glob '!node_modules' --glob '!.next' --glob '!.git' \
  | grep -v "docs/plans/remove-single-user" \
  | grep -v "^loadtest/" \
  | grep -v "Binary file" \
  || echo "ok: no single-user/PGlite residue"

# No runtime PGlite import (full deletion):
rg -l "getLocalDb|getPGliteDb|pglite|PGlite" \
  --glob '!node_modules' --glob '!.next' --glob '!.git' | cat
# Expected: No matches (full) or only packages/test-utils/** (hybrid — state choice in PR)

# No leftover admin implicit path:
rg -n "NOT EXISTS.*admin|count\(\*\).*1.*implicit" --glob '!node_modules' | cat

# The new invariant is visible:
rg -n "REGISTRATION_MODE=.*open|MULTI_USER_ENABLED.*1|KESTREL_ENABLE_RLS.*1" \
  --glob '!node_modules' | head -n 20

# DATABASE_URL is required (no PGlite fallback):
rg -n "DATABASE_URL is required" --glob '!node_modules' | head
```

---

## Appendix C. 0.2.0 release-note sketch (private)

> **BREAKING: single-user mode and PGlite removed — all deployments are now private multi-user + Postgres.**
>
> `0.1.x` shipped as a single-user preview (`OSS_SINGLE_USER_MODE=1`, `owner-first` registration, PGlite fallback when `DATABASE_URL` was empty). `0.2.0` deletes that path.
>
> - Every deployment requires `MULTI_USER_ENABLED=1`, `KESTREL_ENABLE_RLS=1`, and `REGISTRATION_MODE=open|disabled` with an explicit `role='admin'` for administration. `OSS_SINGLE_USER_MODE` is removed (stale pins are ignored). `REGISTRATION_MODE=owner-first` is rejected at startup.
> - Postgres is required. The `.kestrel/data/` PGlite file is no longer read. If you kept dev data there that you want to keep, dump it before upgrading (`docker compose up -d db` + migrate; or restore from a SQL dump if you have one). Fresh volumes start empty.
> - `HAMAFX_*` env aliases are removed; `NEXTAUTH_SECRET` → `AUTH_SECRET` alias is kept with a warning for one release.
>
> **Action on upgrade from 0.1.x:**
> 1. `docker compose down` (keep your volumes; `pgdata`/`backup-data` are retained).
> 2. Edit `.env` — remove `OSS_SINGLE_USER_MODE`, set `MULTI_USER_ENABLED=1`, `KESTREL_ENABLE_RLS=1`, `REGISTRATION_MODE=open`. Ensure `DATABASE_URL` points at your Postgres (`docker compose` already sets it to `postgres://hamafx:…@db:5432/hamafx` if you use the bundled db).
> 3. Promote your account to admin: `docker compose exec db psql -U hamafx -c "UPDATE \"user\" SET role='admin' WHERE email='you@example.com'"`.
> 4. Rebuild: `docker compose up -d --build`.
> 5. Verify: `docker compose exec app sh -c "pnpm check:env-contract && docker compose config --quiet"` and register a second test account (second registration is no longer blocked).
