# Phase 1: Open-Source Security, First-User-Admin & Accounting Hardening

> **Goal:** Make Kestrel safe to open-source and self-host out of the box so that any user spinning up `docker compose up -d` on a VPS cannot have their instance hijacked, their BYOK API keys leaked in browser memory, their cron routes triggered by non-admins, or their paper-trading/journal balances corrupted by floating-point drift.

---

> **Status:** Complete (2026-11-03). All four tasks are implemented. See [Implementation Notes](#implementation-notes-2026-11-03) for file-level detail and the verification results.

## Overview of Tasks

- [x] **Task 1.1:** Stop shipping decrypted BYOK API keys to the browser in `/settings/api-keys`.
- [x] **Task 1.2:** Safe Open-Source Registration & Budget Defaults (`first-user` admin lock, no silent operator-key fallback, budget cap enabled).
- [x] **Task 1.3:** Require `CRON_SECRET` (non-empty) or `role === 'admin'` on all `/api/cron/*` routes.
- [x] **Task 1.4:** Fix Postgres RLS role wiring (`kestrel_app`) and migrate accumulating money columns (`paper-trading`, `journal`, `agent_opinions.cost_usd`) from float to `numeric(20, 8)`.

---

## Task 1.1: Mask BYOK API Keys at the Server-to-Client Boundary

### Problem

`apps/web/src/app/(app)/settings/api-keys/page.tsx` decrypts the user's stored AI provider keys server-side and passes the raw plaintext strings into client components (`_components/provider-key-sections.tsx` → `_components/api-key-card.tsx`), which initialize `useState(currentValue)`. This embeds plaintext OpenAI, Anthropic, Gemini, Groq, and DeepSeek API keys inside the Next.js RSC flight payload and browser memory.

### Files to Modify

- `apps/web/src/app/(app)/settings/api-keys/page.tsx`
- `apps/web/src/app/(app)/settings/api-keys/_components/provider-key-sections.tsx`
- `apps/web/src/app/(app)/settings/api-keys/_components/api-key-card.tsx`
- `apps/web/src/app/(app)/settings/_actions/api-keys-save.ts`
- `apps/web/test/` (add/update unit test verifying RSC props never contain raw key values)

### Implementation Steps

1. Create a small pure helper `maskApiKeyPreview(rawKey: string | undefined | null): { configured: boolean; maskedPreview: string | null }` (e.g., returns `{ configured: true, maskedPreview: "sk-••••1a2b" }` showing only prefix + last 4 chars, or `••••1a2b` if shorter).
2. In `apps/web/src/app/(app)/settings/api-keys/page.tsx`, pass **only** `configured: boolean` and `maskedPreview: string | null` for each provider into `ProviderKeySections` and `ApiKeyCard`. Never pass decrypted key strings across the RSC boundary.
3. In `api-key-card.tsx`, initialize the input field as `''` (empty) with `placeholder={maskedPreview ?? "Paste API key..."}`.
4. When saving in `api-keys-save.ts`, treat an empty unchanged field as "keep existing encrypted key" and provide an explicit "Remove / Clear Key" action button to delete a stored key.

### Verification

- Run `pnpm --filter @kestrel/web test` and verify that no decrypted key string is ever serialized into `ProviderKeySections` props.

---

## Task 1.2: Safe Open-Source Registration & Budget Defaults

### Problem

Three defaults combine to create a critical trap for self-hosters:

1. `REGISTRATION_MODE` defaults to `'open'` (`packages/shared/src/env/schema/runtime.ts`), allowing anyone on the internet to create an account on a newly deployed VPS.
2. `getUserWithSettings` (`packages/db/src/queries/user-settings.ts`) falls back to the operator's environment AI keys for non-admin users who haven't configured BYOK.
3. `ENFORCE_BUDGET` defaults to `false` (`packages/ai/src/budget/index.ts`), setting the effective daily cap to `$1,000,000`.

### Files to Modify

- `packages/shared/src/env/schema/runtime.ts`
- `packages/db/src/queries/user-settings.ts`
- `apps/web/src/lib/services/auth.ts`
- `packages/ai/src/budget/index.ts`
- `.env.example` and `docs/configuration.md`

### Implementation Steps

1. **Default Registration to First-User-Only (`first_user` or auto-lock after first admin):**
   - In `apps/web/src/lib/services/auth.ts`, when `REGISTRATION_MODE` is not explicitly set to `'open'` by the operator, allow registration **only when `COUNT(*) FROM users = 0`** (the first registered user becomes `role = 'admin'`). Once the admin account exists, reject uninvited public sign-ups unless the admin explicitly sets `REGISTRATION_MODE=open` or invites a user.
2. **Isolate Operator Env Keys to Admin Users by Default:**
   - In `packages/db/src/queries/user-settings.ts` (`getUserWithSettings`), do **not** allow non-admin users to inherit the operator's environment AI keys unless `ALLOW_SHARED_OPERATOR_KEYS=true` is explicitly enabled in env. Non-admin users must supply their own BYOK key in Settings.
3. **Enable Budget Enforcement by Default:**
   - Change `ENFORCE_BUDGET` default to `true` with `DEFAULT_MAX_DAILY_USD = 5.00` (configurable via `MAX_DAILY_USD` or per-user settings) so runaway loops or compromised sessions automatically stop at the daily ceiling.

### Verification

- Run `pnpm check:env-contract` and `pnpm --filter @kestrel/db test` + `pnpm --filter @kestrel/web test`.

---

## Task 1.3: Lock Down `/api/cron/*` Routes in `withCronAuth`

### Problem

`withCronAuth` (`apps/web/src/lib/http/cron.ts`) currently accepts **any logged-in user session** unless a route explicitly passes `requireAdminSession: true`, and 9 of the `/api/cron/*` routes omit that option. Furthermore, if `CRON_SECRET` is unset/empty, `Bearer ${env.CRON_SECRET}` evaluates to `Bearer undefined`.

### Files to Modify

- `apps/web/src/lib/http/cron.ts`
- `apps/web/src/app/api/cron/**/route.ts`
- `apps/web/test/` (cron auth tests)

### Implementation Steps

1. In `apps/web/src/lib/http/cron.ts`:
   - Require `typeof env.CRON_SECRET === 'string' && env.CRON_SECRET.trim().length >= 16` before accepting a Bearer token match, using constant-time comparison (`crypto.timingSafeEqual`).
   - Make `requireAdminSession: true` the **unconditional rule** for session-based fallback: a browser session calling `/api/cron/*` **must** have `session.user.role === 'admin'`. Non-admin users must always receive `403 Forbidden`.
2. Audit all remaining routes in `apps/web/src/app/api/cron/` and remove any redundant per-route flags now that `withCronAuth` enforces admin-or-secret globally.

### Verification

- Run `pnpm check:route-security` and `pnpm --filter @kestrel/web test`.

---

## Task 1.4: Money Column Exactness & RLS Connection Hygiene

### Problem

1. `packages/db/AGENTS.md` states: _"money that accumulates (balances, costs, PnL) is `numeric(20, 8)`"_, yet several columns in `journal`, `paper_trading_*`, and `agent_opinions.cost_usd` (`real`) are still `double precision` or `real`.
2. In `docker-compose.yml`, the web app connects as the Postgres superuser (`hamafx`), which bypasses RLS policies.

### Files to Modify

- `packages/db/src/schema/ops/journal.ts`
- `packages/db/src/schema/ai/agent-opinions.ts`
- `plugins/paper-trading/src/` (schema & numeric conversions)
- `packages/db/drizzle/` (add migration `0123_money_numeric_exactness.sql` and update `meta/_journal.json`)
- `docker-compose.yml` and `packages/db/scripts/install-extensions.mjs`

### Implementation Steps

1. Add migration `0123_money_numeric_exactness.sql` converting accumulating money/cost columns (`agent_opinions.cost_usd`, paper-trading account balances, realized/unrealized PnL, fees, and journal `r_multiple` / `size`) to `numeric(20, 8)` (coerced to `number` at the Drizzle customType / mapper boundary so TypeScript interfaces remain ergonomic while SQL `SUM()` is exact).
2. Ensure `packages/db/test/money-exactness.test.ts` asserts zero `real` / `double precision` columns on accumulating money/cost tables.

### Verification

- Run `pnpm --filter @kestrel/db test` and `pnpm check:fast`.

---

## Implementation Notes (2026-11-03)

- **Task 1.1** — `_lib/mask-api-key.ts` builds `configured` + `maskedPreview`
  (`sk-p••••1a2b`) server-side; the RSC payload carries masks only. The cards
  start empty (empty = keep), and deletion is the explicit `***REMOVE***`
  action. `apps/web/test/api-key-masking.test.ts` serialises the full page
  payload and asserts the plaintext is absent.
- **Task 1.2** — `REGISTRATION_MODE` now defaults to `first_user` and accepts
  `first_user | open | disabled`. `resolveRegistrationPolicy()` gates both the
  credentials form and Google OAuth; `createUserWithSettings({ requireFirstUser })`
  promotes the first account atomically under an advisory lock. Non-admin
  accounts no longer inherit the primary admin's stored BYOK vault or daily
  cap; `ALLOW_SHARED_OPERATOR_KEYS=1` restores the shared pool explicitly.
  `ENFORCE_BUDGET` was already on by default with `MAX_DAILY_USD=5`; the stale
  docs/comment claiming ledger-only were corrected.
- **Task 1.3** — `withCronAuth` requires a 16+ character `CRON_SECRET` and
  accepts browser sessions only when `role='admin'`; the `session: 'any'`
  escape hatch was removed. The News and Calendar refresh buttons now call
  authenticated, per-user rate-limited `/api/news/refresh` and
  `/api/calendar/refresh` routes instead of `/api/cron/*`.
- **Task 1.4** — The money conversion shipped in migration
  `0121_money_columns_to_numeric.sql` (the planned `0123` would be a no-op);
  `packages/db/test/money-exactness.test.ts` covers the columns. Compose now
  always connects as `kestrel_app` (`POSTGRES_APP_PASSWORD` is required), runs
  migrations and role provisioning on `DIRECT_URL` (the schema-owning
  superuser), and re-provisions the app role and grants on boot for existing
  volumes. `ADMIN_DATABASE_URL` remains the BYPASSRLS connection for
  cross-tenant application work, and `install-extensions.mjs` prefers the
  privileged connection so extension DDL does not run as the app role.

### Verification (2026-11-03)

| Gate                              | Result                                                 |
| :-------------------------------- | :----------------------------------------------------- |
| `pnpm check:guards`               | 7/7 static guards passed                               |
| `pnpm knip`                       | 0 unused exports or files (configuration hints only)   |
| `pnpm check:fast`                 | 31/31 tasks passed (Oxlint, affected typecheck, tests) |
| `pnpm --filter @kestrel/web test` | 1536 passed, 3 skipped                                 |
| `pnpm --filter @kestrel/db test`  | 102 passed, 43 skipped                                 |
| `pnpm check:maintainability`      | Pass (2103 source files)                               |
| `pnpm format:check`               | Clean                                                  |
| `docker compose config`           | Valid                                                  |
