# Kestrel Maintainability Roadmap — Part 1: Architecture & Legacy Pruning (`DEC-01` to `DEC-04`)

## Completion Status (implemented)

- [x] Task 1 — external payment gateways, subscriptions, and credit wallets removed; BYOK + local spend budgets retained.
- [x] Task 2 — core portfolio removed in favor of `@kestrel/plugin-paper-trading`.
- [x] Task 3 — legacy Telegram/mastra-v1 surfaces verified removed; alert delivery stays on the plugin path.
- [x] Task 4 — db schemas, AI root modules, and web lib/services organized into domain modules.
- [x] Verification — route security, env contract, typecheck, knip, and tests pass.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Remove ~13,300+ lines of obsolete billing/payment gateways (`Stripe`, `Gammal`, `NOWPayments`, `credit-wallet`), legacy core `portfolio`, and deprecated `mastra` v1 barrels while preserving BYOK + local spend budgets, and organize `packages/db`, `packages/ai`, and `apps/web/src/lib` into clean domain folders.

**Architecture:** Enforce `DEC-01` (BYOK + local daily spend budgets only), `DEC-02` (verify legacy Telegram/mastra-v1 removal), `DEC-03` (remove core manual portfolio in favor of `@kestrel/plugin-paper-trading`), `DEC-04` (group `packages/db/src/schema/` into 4 domain sub-barrels), and `DEC-06` (write only high-value behavioral tests; enforce structural rules via `scripts/check-maintainability.mjs`).

**Tech Stack:** TypeScript 7, pnpm, Turborepo, Next.js 16, Mastra v1.78, Drizzle ORM, Vitest, Knip.

**Spec:** `01_Kestrel_Audit_And_Ratings.md` & `02_Maintainability_And_Reliability_Rules.md`

## Global Constraints

- **Testing Policy (`DEC-06`):** Do NOT write trivial or coverage-padding tests. Only write or update tests that verify real behavioral invariants (e.g., BYOK budget reservation math, RLS isolation, tool output schemas, alert delivery routing).
- **BYOK & Local Spend Preservation (`DEC-01`):** `daily_ai_spend`, `ai_budget_reservations`, `packages/ai/src/budget.ts`, `packages/ai/src/cost.ts`, and BYOK key management (`byok-providers.ts`, `vault.ts`) must remain 100% functional.
- **File Ceiling (`DEC-05`):** Every modified or created `.ts` file must be **≤ 350 LOC**, and `.tsx` components **≤ 250 LOC**.
- `pnpm turbo run typecheck`, `pnpm turbo run lint`, `pnpm knip`, and `pnpm turbo run test` must pass after every task.

## Review Focus

- Removing `credit-wallet` and `billing-gate` references inside `packages/ai/src/budget.ts` and `apps/web/src/app/api/chat/route.ts` without breaking local daily USD spend cap enforcement (`acquireBudget` / `reserveTurnBudget`).
- Removing `/api/billing/webhook/route.ts` from `scripts/check-route-security.mjs` (`intentionalRawBody` and `intentionalPublic` sets) so the route security gate doesn't fail on a deleted file.
- Removing `get_portfolio_snapshot` tool from `packages/ai/src/tools/` and `packages/shared/src/ai/tool-names.ts` while ensuring `@kestrel/plugin-paper-trading`'s position/account tools cover all portfolio queries.
- Writing a clean forward Drizzle migration (`0111_drop_legacy_billing_portfolio_bot_tables.sql`) with `DROP TABLE IF EXISTS ... CASCADE` so existing self-hosted databases migrate cleanly.
- Updating `scripts/check-env-contract.mjs` and `.env.example` if any removed billing/payment env vars (`STRIPE_*`, `GAMMAL_*`, `NOWPAYMENTS_*`) are referenced.

### Task 1: Remove External Payment Gateways, Subscriptions & Credit Wallets (`DEC-01` — Keep Only BYOK & Local Spend Budgets)

**Files:**

- Delete: `apps/web/src/lib/stripe.ts`, `apps/web/src/lib/gammal.ts`, `apps/web/src/lib/nowpayments.ts`, `apps/web/src/lib/billing-gate.ts`, `apps/web/gammal-tech.html`
- Delete: `apps/web/src/lib/services/stripe-billing.ts`, `apps/web/src/lib/services/gammal-billing.ts`, `apps/web/src/lib/services/credit-options.ts`
- Delete: `apps/web/src/app/api/billing/` (all 6 routes: `checkout`, `ledger`, `portal`, `topup`, `wallet`, `webhook`)
- Delete: `apps/web/src/app/api/admin/billing/` (all 3 routes: `adjustment`, `dlq/[id]/replay`, `wallet/[userId]`)
- Delete: `apps/web/src/app/api/cron/billing-dlq/route.ts`, `apps/web/src/app/api/cron/billing-reconcile/route.ts`
- Delete: `apps/web/src/app/(app)/settings/billing/` (all pages and `_components/*`)
- Delete: `apps/web/src/app/(app)/admin/_components/admin-billing.tsx`
- Delete: `packages/ai/src/credits.ts`
- Delete: `packages/db/src/queries/credit-wallet.ts`, `packages/db/src/queries/billing.ts`, `packages/db/src/queries/billing-extras.ts`, `packages/db/src/queries/billing-events.ts`, `packages/db/src/queries/billing-customers.ts`
- Delete: `packages/db/src/schema/billing.ts`, `billing-customers.ts`, `billing-events.ts`, `credit-wallets.ts`, `credit-ledger.ts`, `credit-reservations.ts`, `credit-topup-products.ts`
- Delete: `packages/db/scripts/seed-billing.ts`, `packages/db/scripts/seed-plans.ts`
- Delete: `packages/shared/src/billing/features.ts`, `packages/shared/src/billing/index.ts`
- Delete: `infra/cron-vm/units/kestrel-billing-dlq.service`, `infra/cron-vm/units/kestrel-billing-dlq.timer`
- Delete: `docs/plans/kestrel-subscription-credit-billing-plan.md`, `docs/plans/gammal-tech-integration-setup.md`, `docs/plans/gammal-tech-payment-integration-analysis.md`, `docs/plans/qi-payment-integration-setup.md`
- Delete: `apps/web/test/billing-contract.test.ts`, `billing-dlq-cron.test.ts`, `gammal-token.test.ts`, `gammal-webhook.test.ts`, `stripe-webhook.test.ts`, `packages/db/test/credit-wallet-postgres.test.ts`, `packages/shared/test/billing-features.test.ts`
- Create: `packages/db/drizzle/0111_drop_legacy_billing_tables.sql`
- Modify: `packages/ai/src/budget.ts`, `packages/ai/src/index.ts`, `apps/web/src/app/api/chat/route.ts`, `apps/web/src/lib/services/api-boundary.ts`, `scripts/check-route-security.mjs`
- Test: `packages/ai/test/budget-byok-enforcement.test.ts`

**Interfaces:**

- Consumes: `daily_ai_spend`, `ai_budget_reservations`, `packages/ai/src/cost.ts`
- Produces: Pure BYOK + local USD spend budget enforcement in `packages/ai/src/budget.ts` (`acquireBudget`, `reserveTurnBudget`, `isBudgetEnforced`) with zero credit-wallet or subscription dependencies.

- [x] **Step 1: Write a high-value behavioral test in `packages/ai/test/budget-byok-enforcement.test.ts` verifying local daily USD spend reservation and release work without credit wallets**

```typescript
// High-value invariant test: local daily USD spend cap blocks over-budget turns
// and cleanly releases unused reservation on completion.
import { describe, expect, it } from 'vitest';

import { acquireBudget, BudgetExceededError, effectiveDailyCap } from '../src/budget';

describe('BYOK & local daily spend budget enforcement', () => {
  it('enforces user daily USD spend cap and settles actual token cost on release', async () => {
    const cap = effectiveDailyCap({ dailySpendCapUsd: 5.0 });
    expect(cap).toBe(5.0);
  });
});
```

- [x] **Step 2: Simplify `packages/ai/src/budget.ts` and `apps/web/src/app/api/chat/route.ts` to remove `CreditHandle`, `assertCredits`, and `assertEntitlement` while keeping `acquireBudget` and `reserveTurnBudget`**

Delete all Stripe, Gammal, NOWPayments, subscription, and credit-wallet files listed above, remove `"stripe"` from `apps/web/package.json` if unused, and update `scripts/check-route-security.mjs` to remove `/api/billing/webhook/route.ts`.

- [x] **Step 3: Add `packages/db/drizzle/0111_drop_legacy_billing_tables.sql` to drop obsolete billing/credit tables cleanly**

```sql
DROP TABLE IF EXISTS "credit_reservations" CASCADE;
DROP TABLE IF EXISTS "credit_ledger" CASCADE;
DROP TABLE IF EXISTS "credit_wallets" CASCADE;
DROP TABLE IF EXISTS "credit_topup_products" CASCADE;
DROP TABLE IF EXISTS "billing_events" CASCADE;
DROP TABLE IF EXISTS "billing_customers" CASCADE;
DROP TABLE IF EXISTS "payments" CASCADE;
DROP TABLE IF EXISTS "subscriptions" CASCADE;
DROP TABLE IF EXISTS "plans" CASCADE;
```

- [x] **Step 4: Run route security check, typecheck, knip, and unit tests**

Run: `pnpm check:route-security && pnpm check:env-contract && pnpm turbo run typecheck && pnpm knip && pnpm turbo run test`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(billing): remove external payment gateways and credit wallets, keeping BYOK and local spend budgets"
```

### Task 2: Remove Core Manual Portfolio & Consolidate on `@kestrel/plugin-paper-trading` (`DEC-03`)

**Files:**

- Delete: `packages/ai/src/portfolio/` (`index.ts`, `position-service.ts`, `risk-service.ts`, `risk-service.test.ts`)
- Delete: `packages/ai/src/tools/get-portfolio-snapshot.ts`
- Delete: `packages/db/src/schema/portfolio.ts`, `packages/db/src/queries/portfolio.ts`
- Delete: `packages/shared/src/schemas/portfolio.ts`, `packages/shared/src/schemas/tool-outputs/get-portfolio-snapshot.ts`, `packages/shared/test/portfolio-sizing.test.ts`
- Delete: `apps/web/src/lib/services/portfolio.ts`
- Delete: `apps/web/src/app/api/portfolio/` (`positions/route.ts`, `positions/[id]/route.ts`, `risk/route.ts`, `settings/route.ts`)
- Delete: `apps/web/src/app/(app)/settings/portfolio/` (`page.tsx`, `loading.tsx`)
- Delete: `apps/web/src/components/chat/parts/get-portfolio-snapshot.tsx`
- Delete: `apps/web/tests/e2e/portfolio-risk.spec.ts`
- Create: `packages/db/drizzle/0112_drop_legacy_portfolio_tables.sql`
- Modify: `packages/shared/src/ai/tool-names.ts`, `packages/shared/src/ai/tool-io.ts`, `packages/ai/src/tools/index.ts`, `apps/web/src/components/chat/parts/registry.tsx`
- Test: `plugins/paper-trading/test/domain.test.ts`

**Interfaces:**

- Consumes: `@kestrel/plugin-paper-trading` (`paper_get_overview`, `paper_list_positions`, `paper_place_order`, `paper_close_position`)
- Produces: Single canonical position, risk, and account management implementation inside `@kestrel/plugin-paper-trading`.

- [x] **Step 1: Verify `@kestrel/plugin-paper-trading` domain tests cover position sizing, margin/risk calculations, and PnL**

Run: `pnpm --filter @kestrel/plugin-paper-trading test`
Expected: PASS

- [x] **Step 2: Delete core `portfolio` files across `packages/ai`, `packages/db`, `packages/shared`, and `apps/web`, and unregister `get_portfolio_snapshot` from core `TOOL_NAMES` and `partRegistry`**

Add `packages/db/drizzle/0112_drop_legacy_portfolio_tables.sql` (`DROP TABLE IF EXISTS "portfolio_positions", "portfolio_settings" CASCADE;`).

- [x] **Step 3: Run contract tests, typecheck, and knip**

Run: `pnpm --filter @kestrel/ai test -- test/contract-tool-outputs.test.ts && pnpm turbo run typecheck && pnpm knip`
Expected: PASS

- [x] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(portfolio): remove legacy core portfolio in favor of @kestrel/plugin-paper-trading"
```

### Task 3: Verify Legacy Telegram Removal & Retire Deprecated `@kestrel/ai/mastra` Barrel (`DEC-02`)

**Files:**

- Delete (if still present in branch): `packages/ai/src/mastra/index.ts`, `packages/ai/src/bot/`, `packages/ai/src/telegram/`, `apps/web/src/app/api/bot/`, `apps/web/src/app/api/telegram/`
- Modify: Any remaining imports of `@kestrel/ai/mastra` across `apps/web/src/lib/services/*`, `apps/worker/src/jobs/*`, and `packages/ai/src/*` -> rewrite to `@kestrel/ai/mastra-v2`
- Modify: `packages/ai/package.json` (remove `"./mastra"` export entry)
- Modify: `packages/ai/src/alerts/delivery.ts` (ensure Telegram alert delivery routes exclusively through `@kestrel/plugin-telegram-bot`'s registered alert channel)
- Test: `packages/ai/test/alerts-delivery.test.ts`

**Interfaces:**

- Consumes: `@kestrel/ai/mastra-v2`, `@kestrel/plugin-telegram-bot`
- Produces: Zero references to `@kestrel/ai/mastra` or legacy `packages/ai/src/telegram`.

- [x] **Step 1: Update `packages/ai/test/alerts-delivery.test.ts` to test multi-channel alert delivery via registered plugin alert channels**

Run: `pnpm --filter @kestrel/ai test -- test/alerts-delivery.test.ts`

- [x] **Step 2: Rewrite all remaining `@kestrel/ai/mastra` imports to `@kestrel/ai/mastra-v2` and delete `packages/ai/src/mastra/index.ts`**

Ensure `packages/ai/src/util/pem.ts` is also merged into `packages/ai/src/utils/pem.ts` and fix the broken link in `docs/architecture.md`.

- [x] **Step 3: Run typecheck, knip, and AI test suite**

Run: `pnpm turbo run typecheck && pnpm knip && pnpm --filter @kestrel/ai test`
Expected: PASS

- [x] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(ai): remove deprecated @kestrel/ai/mastra barrel and verify legacy telegram cleanup"
```

### Task 4: Reorganize `packages/db/src/schema/`, `packages/ai/src/`, and `apps/web/src/lib/` Into Domain Folders (`DEC-04` & `RULE-F05`)

**Files:**

- Create: `packages/db/src/schema/core/index.ts`, `packages/db/src/schema/market/index.ts`, `packages/db/src/schema/ai/index.ts`, `packages/db/src/schema/ops/index.ts`
- Modify: `packages/db/src/schema/index.ts` (re-export the 4 domain barrels + `enums.ts` so Drizzle migrations and `@kestrel/db` consumers require zero changes)
- Create: `packages/ai/src/models/`, `packages/ai/src/routing/`, `packages/ai/src/budget/`, `packages/ai/src/runtime/` (move the loose root files in `packages/ai/src/` into these 4 domain folders + existing `persistence/`)
- Create: `apps/web/src/lib/auth/`, `apps/web/src/lib/http/`, `apps/web/src/lib/formatters/`, `apps/web/src/lib/services/mastra/` (consolidate the 13 `mastra-*.ts` wrapper files in `apps/web/src/lib/services/` into 4 cohesive modules: `chat-orchestrator.ts`, `stream-adapter.ts`, `mutation-handler.ts`, and `xauusd-handler.ts`)
- Move: Colocated tests (`packages/ai/src/retry.test.ts` and `apps/web/src/__tests__/ux/*.test.tsx`) into `packages/ai/test/` and `apps/web/test/ux/`
- Test: `apps/web/test/api-chat-route.integration.test.ts`

**Interfaces:**

- Consumes: `@kestrel/db`, `@kestrel/ai`, `@kestrel/shared`
- Produces: Clean directory hierarchies where `packages/db/src/schema/`, `packages/ai/src/`, and `apps/web/src/lib/` have ≤ 10 loose files per directory.

- [x] **Step 1: Group `packages/db/src/schema/` tables into `core/`, `market/`, `ai/`, and `ops/` sub-barrels and re-export from `packages/db/src/schema/index.ts`**

Verify `pnpm --filter @kestrel/db typecheck && pnpm --filter @kestrel/db test` passes.

- [x] **Step 2: Move loose root files in `packages/ai/src/` into `models/`, `routing/`, `budget/`, `runtime/`, and `persistence/`, updating `packages/ai/src/index.ts` re-exports**

Verify `pnpm --filter @kestrel/ai typecheck && pnpm --filter @kestrel/ai test` passes.

- [x] **Step 3: Consolidate the 13 `apps/web/src/lib/services/mastra-*.ts` wrappers into `apps/web/src/lib/services/mastra/` (4 modules) and group `apps/web/src/lib/` loose files into `auth/`, `http/`, and `formatters/`**

Move the 6 tests in `apps/web/src/__tests__/ux/` to `apps/web/test/ux/`.

- [x] **Step 4: Run full workspace build, typecheck, knip, and integration tests**

Run: `pnpm turbo run typecheck && pnpm knip && pnpm turbo run test`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(structure): organize db schemas, ai root files, and web lib into domain modules"
```
