# Kestrel Subscription & Credit Billing Plan — Full Audit, Costing & Phased Implementation Guide

> **For:** Implementation agent(s) building the production billing system.
> **Status:** Design spec — no code changes. Read this whole file before writing any code.
> **Audience assumptions:** The implementer has access to the repo at `Kestrel/`, knows Drizzle, Next.js 16, Mastra, and Postgres RLS. No external knowledge of pricing is required beyond this doc.
> **Last audited:** 2026-10-19 against `main` @ `2f554c5e`.

---

## Table of Contents

1. [Executive Summary & Decisions to Make Before Day 1](#1-executive-summary--decisions)
2. [Current-State Audit — Every Corner That Touches Billing](#2-current-state-audit)
3. [Costing System & LLM Economics Deep-Dive](#3-costing-system--llm-economics)
4. [Architecture Principles & Invariants](#4-architecture-principles--invariants)
5. [Target Data Model — DDL Spec](#5-target-data-model--ddl-spec)
6. [Credit Engine — The Hard Part](#6-credit-engine)
7. [Subscription Engine & Plan Lifecycle](#7-subscription-engine--plan-lifecycle)
8. [Payment Provider Layer](#8-payment-provider-layer)
9. [Enforcement, Metering & Fair-Use](#9-enforcement-metering--fair-use)
10. [API Surface & Auth Contracts](#10-api-surface--auth-contracts)
11. [UI / UX Spec](#11-ui--ux-spec)
12. [Webhook, DLQ & Reconciliation Reliability](#12-webhook-dlq--reconciliation-reliability)
13. [Multi-Tenant, Self-Host & SaaS Deployment Matrix](#13-multi-tenant-self-host--saas-matrix)
14. [Observability, Audit & Fraud](#14-observability-audit--fraud)
15. [Migration, Backfill & Rollout Plan](#15-migration-backfill--rollout)
16. [Phased Build Plan with Checklists](#16-phased-build-plan)
17. [Test Plan & Acceptance Criteria](#17-test-plan--acceptance-criteria)
18. [Rate Tables, Math & Seeded Plans (Appendix)](#18-appendix--rate-tables--math--seeded-plans)
19. [Open Risks & Mitigations](#19-open-risks--mitigations)

---

## 1. Executive Summary & Decisions

### 1.1 What you are building

A **subscription + credit** billing system on top of Kestrel's existing `daily_ai_spend` / `ai_budget_reservations` / `chat_telemetry` cost ledger and BYOK provider registry. Two orthogonal concepts:

- **Subscription** — a recurring entitlement (Free / Starter / Pro / Scale / Enterprise). Controls *which features* are available and *how many base credits* the user gets per billing cycle.
- **Credits** — a fungible metered balance (integer cents or milli-cents) consumed by every platform-paid LLM turn, tool call, embedding, and premium feature. Subscriptions *grant* credits; users can also *buy top-up packs* and receive *promotional grants*.

This is **not** a pure seat license and **not** a pure pay-as-you-go. Correct mental model: **Stripe Billing (subscriptions) + Stripe Credits-like ledger (consumption)**, wired into Kestrel's existing `tryReserveBudget` budget guard.

### 1.2 Decisions that MUST be locked before Phase 1 (no code until these are answered)

| # | Decision | Why it blocks work | Recommended default |
|---|----------|--------------------|---------------------|
| D1 | **Who pays the LLM bill?** — Does the platform operate a first-party LLM gateway (e.g. `AI_GATEWAY_API_KEY`, `DPHN_API_KEY`) and resell tokens, or stay BYOK-only? | Determines everything: if BYOK-only, credits are nearly meaningless (user pays provider directly). | **Hybrid**: Credits meter *platform-paid* usage only. BYOK turns still meter for observability but consume **0 credits** (or a tiny flat platform fee). |
| D2 | **Single-currency vs multi-currency** | NOWPayments is crypto-native; SaaS likely needs Stripe fiat. Supporting both doubles webhook surface. | **Stripe for fiat subscriptions/top-ups as primary. Keep NOWPayments as alternative / leave behind feature flag `BILLING_PROVIDER=nowpayments\|stripe\|both`.** |
| D3 | **Credit unit** | Integer math, rounding and display are pervasive. Changing later is a migration. | **Integer `credits` where 1 credit = $0.001 (one tenth of a cent).** Matches smallest DPHN step ($0.01/1M tokens ≈ far below 1¢). Internally store as `bigint`. Display as `$`. Alternative: store USD cents directly but credits are more marketing-friendly. |
| D4 | **Rollover policy** | Affects entitlement queries every request. | Subscription credits **do not roll over** (expire at period end). Top-up packs **roll over** until consumed. Promo grants expire after 30–90d. |
| D5 | **Grace / overage behavior** | Hard-stop vs soft degrade changes enforcement code. | Soft degrade: at 0 credits, allow BYOK-only turns; block managed-model turns with a clear upsell. No negative balances. |
| D6 | **Self-host billing flag semantics** | Repo already has `BILLING_ENABLED=0` default. | `BILLING_ENABLED` stays the kill-switch. Add `BILLING_MODE=selfhost|saas`. Selfhost: only NOWPayments + BYOK, optional billing UI hidden. SaaS: Stripe required, billing UI always visible. |

Until D1–D6 are recorded in `docs/configuration.md` and as env vars, do **not** open a branch.

---

## 2. Current-State Audit

### 2.1 What already exists (do not rebuild)

| Area | Location | What it does | Reuse |
|------|----------|-------------|-------|
| Plans / subscriptions / payments / IPN tables | `packages/db/src/schema/billing.ts` | 6 tables: `plans`, `subscriptions`, `payments`, `ipn_events`, `billing_webhook_dlq`, `billing_checkout_attempts`. `planInterval`, `subscriptionStatus` and `paymentStatus` enums. Partial unique index ensures one active/trialing sub per tenant. | **Keep; extend** (see §5). Migration scripts in `packages/db/drizzle/00xx_*.sql`. |
| Daily spend counter | `packages/db/src/schema/daily-ai-spend.ts` | PK `(user_id, day)`, `total_usd_cents` bigint. Atomic `INSERT ... ON CONFLICT DO UPDATE WHERE total + est <= cap`. Row-level serialisation. | Core of credit pre-authorization. Do **not** replace — layer credits on top. |
| Budget reservation ledger | `packages/db/src/schema/budget-reservations.ts` | `ai_budget_reservations` — recovery source of truth for crashed workers. Statuses `reserved` → `reconciled`/`released`. | Keep. Credits will need a parallel ledger (`credit_reservations` or reuse via `tenantId+userId`). |
| Telemetry | `packages/db/src/schema/telemetry.ts` | `chat_telemetry` — one row per assistant turn (+ kinds for title/plan/specialist breadcrumbs). Keyed by `idempotencyKey`. Composite index `(user_id, created_at)`. | Source of truth for *actual* token counts and true cost post-stream. |
| Chat + full-analysis queue | `packages/db/src/schema/chat.ts`, `full-analysis-queue.ts` | Threads/messages + durable queue for Mastra full jobs. | Billing must meter both `single` and `full` (full is 3–8x more expensive — multi-agent). |
| Usage analytics | `packages/ai/src/usage.ts` | `computeUsage()` aggregates last 30d from telemetry + daily spend. Powers `/settings/usage`. | Add credit-aware view alongside cost. |
| Cost estimation | `packages/ai/src/cost.ts` | `STATIC_RATES` + catalog-derived `RATES` + `FALLBACK_RATE`. `estimateCostUsd`, `estimateKnownCostUsd` (fail-closed), `tryReserveBudget`, `applyBudgetDelta`, `reconcileBudgetReservation`. | Central pricing table. Credit pricing **must** reuse `buildCatalogRateTable()` — never duplicate. |
| Budget facade | `packages/ai/src/budget.ts` | `acquireBudget` / `reserveTurnBudget` — currently **observability-only** (`ENFORCE_BUDGET=0`, `UNCAPPED_DAILY_USD=1_000_000`). | Flip back on, wired to credits. Keep the ledger-only mode for tests. |
| BYOK provider registry | `packages/ai/src/_providers/*`, `packages/shared/src/byok.ts` | 11 providers, typed `ByokPayload`, `BYOK_PROVIDERS` const, per-model `inputPerMTokUsd`/`outputPerMTokUsd`, `buildCatalogRateTable()` canonicalizer. | Pricing SSO. Any new provider must ship with pricing or throw `UnknownModelPricingError`. |
| Fiscal / billing routes | `apps/web/src/app/api/billing/{checkout,portal,webhook}` | `POST /api/billing/checkout` (idempotency-key, creates NOWPayments invoice), `POST /api/billing/webhook` (HMAC-SHA512, DLQ on failure), `GET /api/billing/portal`. | Extend, don't fork. Add Stripe parallels at same path prefix. |
| NOWPayments client | `apps/web/src/lib/nowpayments.ts` | `createInvoice`, `getPaymentStatus`, `verifyIpnSignature` (sorted JSON + HMAC). | Keep. Add `apps/web/src/lib/stripe.ts` alongside. |
| Tenant scoping & RLS | `packages/db/src/tenant.ts`, `packages/db/src/schema/auth.ts`, `packages/db/src/with-user-scope.ts` | `organization` / `organizationMember`, `app.current_tenant` GUC, `requireTenantIdForUser()`, `withTenantDb`, `withTenantDbFresh`, `getDiagnosticContext`. | Every billing query **must** go through `requireTenantIdForUser` or `withTenantDbFresh`. |
| Rate limiting | `packages/db/src/schema/rate-limits.ts` | Postgres minute-window. PK `(user_id, endpoint_group, window_start)`. | Add `endpoint_group` values like `billing_checkout`, `billing_portal`. |
| Retention + observability | `packages/db/src/retention.ts`, `packages/ai/src/telemetry.ts`, `packages/ai/src/instrumentation.ts` | Bounded batch deletes, Langfuse optional tracing. | Add credit ledger retention (e.g. 365–730d; legal hold?). |
| Entitlement helpers | `packages/db/src/queries/billing.ts` | `getSubscription`, `isSubscriptionActive`, `getEffectiveFeatures`, `getEffectiveTokenCap`, `countActiveAlerts`, `countJournalEntriesThisMonth`. | Expand to credit-aware: `getCreditBalance`, `assertCreditGate`. |
| Billing extras | `packages/db/src/queries/billing-extras.ts` | `listActivePlans`, `getPlan`, `getUserSubscription`, `getUserPayments`, `upsertSubscription` (atomic ON CONFLICT — race fix already done), `claimCheckoutAttempt` + lease handling, `createPayment`. | Pattern to replicate for Stripe idempotency + credit grants. |

### 2.2 Gaps and landmines (read before drawing any diagram)

1. **Budget currently does not block.** `ENFORCE_BUDGET=0` + `UNCAPPED_DAILY_USD=1M` means no 429 today. Turning this on without a credit guard will hard-block legitimate users. The credit gate must *replace* the static `$5/day` check, not sit beside it.

2. **BYOK bypasses platform cost.** A Google-keyed `gemini-3.5-flash-lite` turn costs the user directly; Kestrel records telemetry but does **not** incur a provider bill. If credits meter BYOK turns, users will be double-charged (BYOK + credits). Resolution in §4/#2.

3. **`chat_telemetry.est_cost_usd` is `double precision`** (float). Billing must be `bigint` cents / credits (exact). Floats are OK for observability; **never** for the ledger.

4. **NOWPayments sandbox vs production** — `NOWPAYMENTS_API_BASE` defaults to sandbox; prod guard logs but does not block. SaaS deploy needs `BILLING_PROVIDER=stripe` to avoid accidental sandbox charges.

5. **Checkout idempotency is already leased** (`billing_checkout_attempts` with `processingToken` / `processingAt` 10-min lease). Stripe implementation must mirror this — Stripe's own `Idempotency-Key` is not enough because Kestrel also creates local rows (`subscriptions`, `payments`) after provider invoice success.

6. **Subscription single-active invariant** is partial index–enforced. Any credit grant tied to subscription must use `FOR UPDATE` or `ON CONFLICT` against that same invariant to avoid double-grant on concurrent webhooks.

7. **Worker vs Web contention** — Budget and credit writes happen from both Next.js route handlers and `apps/worker` Mastra jobs. All credit SQL must be safe under concurrent `BEGIN; ... COMMIT;` from two processes. Use `SELECT ... FOR UPDATE` on the balance row or `UPDATE ... WHERE balance >= needed`.

8. **Public webhook is truly public** — `POST /api/billing/webhook` is unauthenticated, HMAC-only. Stripe webhook must verify via Stripe's `constructEvent` with its own signing secret, never the NOWPayments one.

9. **Free-tier caps are hard-coded** in `getEffectiveTokenCap` (100K tokens/mo) and not in DB. Move to `plans.monthly_credits` so caps are data-driven.

10. **Retention windows differ** — `chat_telemetry` retained 90d, but tax / chargeback audit needs 12–24mo of billing rows. `billing_*` tables must be **excluded** from the 90d sweep.

---

## 3. Costing System & LLM Economics

### 3.1 How cost is modeled today

```
BYOK provider registry (_providers/*.ts)
  └─ inputPerMTokUsd / outputPerMTokUsd per model
       └─ buildCatalogRateTable() → RATES map
            └─ cost.ts: estimateCostUsd(model, inTok, outTok) / estimateKnownCostUsd (fail-closed)
                 └─ budget.ts: tryReserveBudget(userId, est, cap, correlation)
                      └─ daily_ai_spend.total_usd_cents (atomic SQL)
                           └─ ai_budget_reservations (durable ledger)
                 └─ chat_telemetry.est_cost_usd (post-stream true cost)
                 └─ usage.ts: computeUsage() aggregates both for /settings/usage
```

Key constants:

- `DEFAULT_TURN_ESTIMATE_USD = $0.01` — reservation placeholder before actual usage known.
- `DEFAULT_MAX_DAILY_USD = $5` — fallback cap (currently disabled).
- `FALLBACK_RATE = { inputPerM: 5, outputPerM: 15 }` — unknown model pricing (must throw in ledger path; OK for pre-flight estimates).
- `UNCAPPED_DAILY_USD = 1_000_000` — effective cap while enforcement off.

### 3.2 Real LLM prices (catalog as of 2026-10, USD / 1M tokens)

| Provider | Representative model | Input | Output | Notes |
|----------|---------------------|-------|--------|-------|
| Anthropic | `claude-fable-5` / `claude-opus-4-8` | $5.00 | $25.00 | Flagship reasoning, 1M ctx |
| Anthropic | `claude-sonnet-5` | $3.00 | $15.00 | Workhorse balancer |
| Anthropic | `claude-haiku-4-5` | $1.00 | $5.00 | Cheap supplement |
| OpenAI | `gpt-5.6-sol` (flagship) | $5.00 | $30.00 | Highest output cost |
| OpenAI | `gpt-5.6-terra` | $2.50 | $15.00 | Balanced |
| OpenAI | `gpt-5.6-luna` | $1.00 | $6.00 | High-volume |
| Google | `gemini-3.5-flash` | $1.50 | $9.00 | Post-2.5; 2.5 retired for new keys |
| Google | `gemini-3.5-flash-lite` | $0.30 | $2.50 | High-throughput agentic |
| Google | `gemini-3.6-flash` | $0.75 | $3.75 | Current recommended |
| Google embeddings | `gemini-embedding-001` | $0.025 | — | Per 1M input only |
| Dolphin (Dphn) | `deepseek-ai/DeepSeek-V4.1-Flash` | $0.01 | $0.07 | 100× cheaper than Claude; cheapest reasoning |
| Groq | `llama-3.3-70b-versatile` | $0.59 | $0.79 | Ultra-low latency |
| Groq | `llama-3.1-8b-instant` | $0.05 | $0.08 | Near-free fast model |
| OpenRouter | mixed | variable | variable | Aggregator; pass-through pricing |
| xAI | `grok-4.5` | $2.00 | $6.00 | |
| DeepSeek native | (if not via Dphn) | $0.14–0.435 | $0.28–0.87 | |

**Cheapest vs most expensive output:** DPHN DeepSeek Flash at **$0.07/1M out** vs GPT-5.6 Sol at **$30/1M out** — a **428× spread**. Any fixed "cost per turn" assumption is wrong; metering must be per-model.

### 3.3 Turn-cost anatomy (what actually bills per chat turn)

A typical **single** turn (~2–5k input, 0.8–2k output + tools):

- Using `gemini-3.5-flash-lite`: `(4k × $0.3 + 1.5k × $2.5)/1M ≈ $0.00495`.
- Using `claude-sonnet-5`: `(4k × $3 + 1.5k × $15)/1M ≈ $0.0345`.
- Using `claude-opus-4-8`: `(4k × $5 + 1.5k × $25)/1M ≈ $0.0575`.
- Using DPHN DeepSeek Flash: `(4k × $0.01 + 1.5k × $0.07)/1M ≈ $0.000145`.

A **full committee** turn fans out to 4 specialists + fusion + verifier + optional critique/debate (often 5–8 model calls). Empirical multiplier: **3–8× single** depending on `ENABLE_COMMITTEE_CRITIQUE` / `ENABLE_COMMITTEE_DEBATE`.

- Full via Sonnet/Opus: **$0.10–$0.40** per user message.
- Full via DPHN: **$0.001–$0.004**.
- Title generation (`AI_TITLE_MODEL`) adds ~$0.001–$0.005.
- Embeddings (memory/RAG) add <$0.001.

**Takeaway:** Subscription credit budgets must be set against the *platform's default model mix*, not a single price. If SaaS defaults to `gemini-3.5-flash`/`sonnet-5`, median managed-turn cost is ~$0.01–$0.05 (single) / $0.10–$0.40 (full).

### 3.4 Non-LLM billables (often forgotten)

| Cost centre | Variable cost to Kestrel | Meter or not? |
|-------------|--------------------------|---------------|
| BYOK provider calls | **$0 to Kestrel** | Observe; charge 0 credits (or a tiny `platform_fee_per_turn` flat). |
| Platform gateway calls (AI_GATEWAY_API_KEY / DPHN_API_KEY) | True marginal cost — pass through | **Primary credit burn** |
| Embeddings (OpenAI `text-embedding-3-small`, Gemini embedding) | Cheap but non-zero | Bucket with chat or separate embedding credits |
| Web search (Exa/Tavily/Brave) | Per-query fee ($0.005–0.02/search) | Optional premium counter (or rate-limit, no charge) |
| Market data overages (Biquote/FINNHUB/MarketaUX/FRED) | Usually bundled; Binance ws free | Don't meter unless you renegotiate limits |
| Storage (Supabase object for chat images) | GB-seconds | Usually not worth metering at Kestrel scale |
| Worker compute / Postgres | Fixed infra | Include in margin, don't per-user meter |

### 3.5 Margin / markup design

Credits decouple *user-facing price* from *provider cost*, giving you a margin knob.

- **Cost-plus example:** User pays $20/mo for 500k output tokens of Sonnet-grade usage. Raw provider cost ~$7.50 + infra `$2` → ~52% gross margin.
- **Recommended:** Set credit price at **1.6–2.0× blended provider cost** for the default model mix, with cheaper models (DPHN, Haiku) implicitly giving power users better value without changing credit burn.

Never recalibrate `inputPerMTokUsd` in the BYOK catalog without also auditing credit burn — they share the same rate table.

---

## 4. Architecture Principles & Invariants

1. **Single rate-catalog source of truth.** `buildCatalogRateTable()` is the only place model prices live. Credit pricing imports it. No second table.

2. **BYOK vs Managed split is structural, not cosmetic.** The DB must record per-turn `providerMode: 'byok' | 'managed'` so the credit ledger knows whether to consume. BYOK turns must still emit telemetry + reservation rows (for usage visibility) but with `credits_charged = 0`.

3. **Credits are exact integers.** `bigint` credits/cents everywhere. Float `double precision` is observability-only.

4. **No negative balances.** Every charge path does `UPDATE balance SET available = available - X WHERE available >= X RETURNING`. Zero is the floor. Debt is an operational concept (grace queue), not a DB negative.

5. **Idempotent money.** Every money movement (grant, consumption, refund, adjustment, top-up) has a stable external idempotency key and a `credit_ledger` row. Replaying a Stripe webhook or a retried chat turn must never double-spend/double-grant.

6. **Ledger over cache.** The durable balance is `available_credits` on a per-user/tenant row plus an append-only `credit_ledger` and `credit_reservations`. Any cache (Redis, in-memory) is a read optimisation, never the write path.

7. **Period boundaries are UTC midnight, like `daily_ai_spend`.** Monthly cycles are anchor-date–aligned (Stripe billing cycles or fixed calendar month — pick one and keep it; recommend Stripe anchor). Daily counters already use `toISOString().slice(0,10)`.

8. **One active subscription per tenant** (already enforced). Credit grants tied to subscriptions are `UPSERT ... ON CONFLICT` against the same partial unique index.

9. **Retention split:** `chat_telemetry` 90d, `credit_ledger` ≥ 730d, `billing_*` ≥ 730d, `ai_budget_reservations` 90d (already). The retention sweeper must skip ledger tables.

10. **Feature gating and credit gating compose.** `assertEntitlement(userId, feature)` checks plan features; `assertCredits(userId, estimated)` checks balance. The chat path calls **both**: first entitlement (is `full` allowed on Free?), then credits (is there enough for the estimated burn?).

---

## 5. Target Data Model — DDL Spec

> Add these tables/columns via new `packages/db/drizzle/0xxx_*.sql` migrations. All FKs cascade as shown. Add RLS policies mirroring existing tables (`USING (tenant_id = current_setting('app.current_tenant')::text)`).

### 5.1 Extend `plans`

Add columns to the existing `plans` table (idempotent `ALTER TABLE`) rather than a new table:

```sql
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS monthly_credits     bigint  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overage_credits     boolean NOT NULL DEFAULT false,  -- allow pay-as-you-go beyond cap?
  ADD COLUMN IF NOT EXISTS seats_included      integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS stripe_price_id    text,     -- Stripe Price.id (null for Free / NOWPayments-only)
  ADD COLUMN IF NOT EXISTS stripe_price_id_yearly text, -- optional
  ADD COLUMN IF NOT EXISTS visible            boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order         integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trial_days         integer NOT NULL DEFAULT 0;
-- monthly_credits is the grant per billing cycle (0 for Free).
-- monthlyTokenCap stays for backward-compat but becomes derived: monthly_credits → effective cap.
```

Existing `price_usd_cents`, `pay_currency`, `nowpayments_plan_id` remain. `price_usd_cents` should ultimately match the Stripe price, but keep it as the display price source of truth.

### 5.2 New: `credit_wallets` (the balance)

```sql
CREATE TABLE credit_wallets (
  tenant_id          text        NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id            text        PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  available_credits  bigint      NOT NULL DEFAULT 0 CHECK (available_credits >= 0),
  lifetime_granted   bigint      NOT NULL DEFAULT 0,
  lifetime_consumed  bigint      NOT NULL DEFAULT 0,
  updated_at         timestamptz NOT NULL DEFAULT now()
);
-- RLS: tenant_id = current_setting('app.current_tenant')
-- Index: tenant_id
-- No FK on available_credits sign — enforced by CHECK + atomic WHERE guard.
```

One row per user (not per organization) — aligns with `daily_ai_spend` PK `(user_id, day)`.

### 5.3 New: `credit_ledger` (append-only)

```sql
CREATE TABLE credit_ledger (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          text        NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id            text        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  kind               text        NOT NULL
    CHECK (kind IN (
      'subscription_grant','topup_grant','promo_grant','admin_adjustment',
      'consumption','refund','expiration','reservation','release','reconcile'
    )),
  amount_credits     bigint      NOT NULL, -- positive = grant, negative = consumption/expiration
  balance_after      bigint,              -- denormalised for queries (nullable for failed claims)
  idempotency_key    text        NOT NULL,
  reference_type     text,        -- 'subscription'|'payment'|'reservation'|'chat_turn'|'manual'
  reference_id       text,
  metadata           jsonb        NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX credit_ledger_idempotency_uk ON credit_ledger (tenant_id, idempotency_key);
CREATE INDEX credit_ledger_user_created_idx ON credit_ledger (user_id, created_at DESC);
CREATE INDEX credit_ledger_kind_idx ON credit_ledger (kind);
```

Every grant/consumption writes one row. Replaying the same `idempotency_key` → `ON CONFLICT DO NOTHING` and return existing.

### 5.4 New: `credit_reservations` (parallels `ai_budget_reservations`)

```sql
CREATE TABLE credit_reservations (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          text        NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id            text        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  thread_id          uuid,
  trace_id           text,
  run_id             text,
  job_id             text,
  reserved_credits   bigint      NOT NULL CHECK (reserved_credits >= 0),
  actual_credits     bigint,     -- filled on reconcile
  status             text        NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved','reconciled','released')),
  idempotency_key    text,       -- chat turn key; nullable for manual reservations
  created_at         timestamptz NOT NULL DEFAULT now(),
  resolved_at        timestamptz
);
CREATE UNIQUE INDEX credit_reservations_idempotency_uk
  ON credit_reservations (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX credit_reservations_user_idx ON credit_reservations (user_id, status);
CREATE INDEX credit_reservations_status_idx ON credit_reservations (status, created_at);
```

Alternatively, **reuse** `ai_budget_reservations` by adding a `reserved_credits` column there. Recommendation: **new table** — credits and USD budget have different lifecycles (billing ledger ≠ budget observability).

### 5.5 New: `credit_topup_products`

```sql
CREATE TABLE credit_topup_products (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text        NOT NULL,                   -- "100k Credits"
  credits            bigint      NOT NULL CHECK (credits > 0),
  price_usd_cents    integer     NOT NULL CHECK (price_usd_cents > 0),
  stripe_price_id    text,
  nowpayments_currency text      DEFAULT 'usdt',
  is_active          boolean     NOT NULL DEFAULT true,
  sort_order         integer     NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now()
);
```

Top-up packs roll over, never expire (or expire after 12mo — pick one; recommend **no expiration** for simplicity).

### 5.6 New: `billing_customers` (Stripe mapping)

```sql
CREATE TABLE billing_customers (
  tenant_id          text        PRIMARY KEY REFERENCES organization(id) ON DELETE CASCADE,
  user_id            text        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  stripe_customer_id text        UNIQUE,
  nowpayments_email  text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
```

### 5.7 Alter existing billing tables (additive, non-breaking)

```sql
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_price_id       text,
  ADD COLUMN IF NOT EXISTS current_period_start  timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_end_prev        timestamptz; -- for audit on trial→active fallback

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS provider              text NOT NULL DEFAULT 'nowpayments'
    CHECK (provider IN ('nowpayments','stripe','manual','promo')),
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS stripe_invoice_id     text,
  ADD COLUMN IF NOT EXISTS credits_granted       bigint, -- how many credits this payment created
  ADD COLUMN IF NOT EXISTS billing_reason        text;   -- Stripe billing_reason

-- Extend DLQ provider enum string check; or just keep provider='stripe' there too.
ALTER TABLE billing_webhook_dlq
  ALTER COLUMN provider SET DEFAULT 'stripe';

ALTER TABLE chat_telemetry
  ADD COLUMN IF NOT EXISTS provider_mode  text CHECK (provider_mode IN ('byok','managed')),
  ADD COLUMN IF NOT EXISTS credits_charged bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wallet_balance_after bigint;
-- Backfill provider_mode for existing rows in a separate migration transaction.

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS stripe_tax_behavior text DEFAULT 'exclusive';
```

### 5.8 Drizzle schema files to create/extend

- `packages/db/src/schema/credit-wallets.ts`
- `packages/db/src/schema/credit-ledger.ts`
- `packages/db/src/schema/credit-reservations.ts`
- `packages/db/src/schema/credit-topup-products.ts`
- `packages/db/src/schema/billing-customers.ts`
- Extend `packages/db/src/schema/billing.ts` + `telemetry.ts` + `auth.ts` barrel in `schema/index.ts`.

All tenant-scoped tables need:

```ts
tenantId: text('tenant_id')
  .notNull()
  .default(sql`current_setting('app.current_tenant', true)`)
  .references(() => organization.id, { onDelete: 'cascade' }),
```

and the standard RLS `ENABLE ROW LEVEL SECURITY` + policies (mirror `chat_threads`).

---

## 6. Credit Engine

### 6.1 Unit & conversion

- **Internal unit:** `credits` as `bigint`. **1 credit = 0.1¢ = $0.001**. So $1 = 1000 credits. Example: `claude-sonnet-5` turn at $0.03 ≈ 30 credits.
- **Provider cost → credits:** `credits = ceil(usdCents / 0.1)` equivalently `ceil(estCostUsd * 1000)`. Use `Math.ceil` to avoid giving away fractions. Reconcile with actual cost using same formula.
- Display: `dollars = credits / 1000`. Format as `$4.20` with two decimals.

Why not store USD cents directly? Credits let you run **promotions / bonus multipliers** without touching price math (grant 2000 bonus credits regardless of USD price).

### 6.2 Credit lifecycle (state machine)

```
[grant] subscription_grant / topup_grant / promo_grant / admin_adjustment
        │
        ├──→ credit_wallets.available_credits += amount
        └──→ credit_ledger row (+amount) idempotent

[reserve] before model call (chat turn / full job)
        │
        ├── 1) estimateCredits(model, ~tokens) — from catalog + DEFAULT_TURN estimate
        ├── 2) BEGIN; SELECT available_credits FROM credit_wallets WHERE user_id=? FOR UPDATE;
        ├── 3) if available < estimated → return insufficient (no row changed)
        ├── 4) UPDATE credit_wallets SET available = available - estimated
        │                RETURNING available;
        ├── 5) INSERT credit_reservations (reserved=estimated, status='reserved')
        └──→ 6) INSERT credit_ledger (kind='reservation', amount=-estimated)

[reconcile] after stream finishes with real tokens
        │
        ├── 1) actualCredits = ceil(actualCostUsd * 1000)  (estimateKnownCostUsd, fail-closed)
        ├── 2) delta = actual - reserved
        ├── 3) if delta > 0: need to charge extra (if balance suffices)
        │                    else short-charge and log deficit (soft overshoot allowance)
        ├── 4) if delta < 0: refund |delta| to wallet + ledger 'reconcile'
        └── 5) UPDATE credit_reservations SET status='reconciled', actual=actual

[release] on error / cancellation / budget-reject
        └── UPDATE wallet available += reserved ; ledger 'release' ; reservation 'released'

[expiration] monthly grants that weren't consumed
        └── ledger 'expiration' (−remaining monthly grant portion) — only if no-rollover policy
```

Reuse the **exact** lease/recovery pattern from `ai_budget_reservations`: `reclaimStaleCreditReservations()` cron must exist.

### 6.3 Reservation estimate strategy

- **Before streaming:** you don't know output tokens. Use per-mode estimates:
  - `single` ≈ `DEFAULT_TURN_ESTIMATE_USD = $0.01` → 10 credits (existing constant). But make it **model-aware**: scale by the model's blended rate.
  - `full` ≈ `FULL_COMMITTEE_USD_ESTIMATE = $0.25` → 250 credits (≈ Sonnet full at $0.25). Make configurable via env `FULL_MODE_CREDIT_ESTIMATE`.
- **Better:** derive from provider catalog:

  ```ts
  estimate = ceil(DEFAULT_INPUT_TOKENS * inputPerM / 1e6 + EXPECTED_OUTPUT_TOKENS * outputPerM / 1e6) * 1000;
  ```

  With `DEFAULT_INPUT_TOKENS=5000`, `EXPECTED_OUTPUT_TOKENS=1500`.

- **Conservative:** round up 15–20% so reconciliations are usually refunds.

### 6.4 BYOK-aware credit burn

```ts
function creditsForTurn(opts: { providerMode: 'byok'|'managed'; modelId: string; input: number; output: number }): number {
  if (opts.providerMode === 'byok') {
    return 0; // Option A: free beyond tiny platform fee
    // Alternative Option B: return PLATFORM_FEE_CREDITS (e.g. 1 credit = $0.001) per turn
  }
  return ceil(estimateKnownCostUsd(opts.modelId, opts.input, opts.output) * 1000);
}
```

Implement **`PLATFORM_FEE_CREDITS = 0`** for v1 (simplest; no double-charge). If abuse appears, flip to 1 credit per BYOK turn via env.

Detection of `providerMode`:

- Resolve via `resolveChatModel` / `resolveMastraModel` result: if the resolved `providerId` matches a user-owned `aiApiKeys[providerId]` and the deployment is not forcing gateway, it's `byok`. Otherwise `managed`.
- Persist `provider_mode` on `chat_telemetry` so cost vs credit analysis can be audited.

### 6.5 Estimating top-up vs subscription economics

Managed `full` at $0.25 × 30 full turns/mo = **$7.50** raw LLM. Add 30 single turns at $0.03 → **$8.40**. With 60% margin → user sees **~$16–$20**. So **Pro at $20–$29 offering 15k–20k credits** is defensible.

---

## 7. Subscription Engine & Plan Lifecycle

### 7.1 Plan catalog (seeded, data-driven)

> Seeded via migration SQL + admin UI. Prices are starting points; adjust before launch and re-seed.

| Plan | Monthly price | Credits / cycle | Features (gated) | Interval | Stripe price | Target user |
|------|--------------|----------------|-------------------|----------|-------------|------------|
| **Free** | $0 | 1,000 (≈ $1) | `chat_basic`, `chart_basic`, `journal_basic` | monthly | — | Trial / BYOK users |
| **Starter** | $9 | 8,000 (≈ $8 effective) | Free + `chat_single`, `alerts_5`, `journal_unlimited`, `api_read` | monthly | `price_starter_m` | Casual trader |
| **Pro** | $29 | 30,000 (≈ $30) | Starter + `chat_full` (10/day), `alerts_20`, `web_search`, `telegram_bot` | monthly/quarterly/yearly | `price_pro_m/y` | Active researcher |
| **Scale** | $79 | 100,000 (≈ $100) | Pro + `chat_full_unlimited`, `alerts_100`, `backtesting`, `priority` | monthly/yearly | `price_scale_m/y` | Power user / small desk |
| **Enterprise** | Custom | Unlimited / pooled | All + seats, SSO, SLA, dedicated worker | yearly | manual | Team |

Notes:

- Free credits **do not renew** until next calendar month (or 30-day rolling — choose one; monthly aligned to UTC 1st is simpler).
- `monthly_credits` on `plans` drives entitlement. `monthlyTokenCap` becomes `Math.floor(monthly_credits * avgTokenPerCredit)` for backward-compat.
- Store `features: jsonb string[]` per plan (already exists). Gate `chat_full`, `web_search_enabled`, `alert_limit`, `journal_limit`.

### 7.2 Subscription state machine (extends existing enum)

Existing: `trialing | active | past_due | canceled | expired`.
Add Stripe semantics:

- `incomplete` — Stripe Checkout started, not yet confirmed.
- `unpaid` (Stripe) maps to `past_due` locally.
- `cancel_at_period_end` is a boolean flag, not a status; keep `status=active` + `cancel_at_period_end=true` until period end.

Transitions:

```
trialing ──(charge succeeds)──► active ──(period renew + credits granted)──► active (new period)
   │                              │  ▲
   │ (trial expires, no pay)      │  │ (payment retry succeeds)
   ▼                              │  │
 expired                       past_due ──(retry exhausted)──► canceled/expired
                                  │
                          (user cancels)
                                  ▼
                          canceled (until period_end, then expired)
```

**Period renewal** is idempotent and keyed by `(stripe_subscription_id, current_period_start)`. Webhook `invoice.paid` → grant `monthly_credits` (ledger `subscription_grant`, idempotency `sub:<subId>:<periodStartISO>`).

### 7.3 Period-boundary credit grant

On `customer.subscription.updated` (new period) or `invoice.paid` (recommended trigger), in one transaction:

```sql
BEGIN;
SELECT * FROM subscriptions WHERE stripe_subscription_id = $1 FOR UPDATE;
-- check period not already granted by querying credit_ledger idempotency
INSERT INTO credit_ledger (tenant_id,user_id,kind,amount_credits,idempotency_key,reference_type,reference_id,metadata)
VALUES (...) ON CONFLICT (tenant_id,idempotency_key) DO NOTHING RETURNING id;
-- if inserted:
UPDATE credit_wallets SET available_credits = available_credits + $credits, lifetime_granted = lifetime_granted + $credits
WHERE user_id = $1;
COMMIT;
```

### 7.4 Checkout & portal routes

Extend existing:

- `POST /api/billing/checkout` — add `provider: 'stripe'|'nowpayments'` body field. For Stripe, call `stripe.checkout.sessions.create({ customer, price, ... })` and return `url`. Reuse `billing_checkout_attempts` idempotency (same table, new `stripe_session_id` column or store in `checkoutUrl` + JSON meta).
- `POST /api/billing/portal` — **new** (separate from GET/portal). Redirects to `stripe.billingPortal.sessions.create`.
- `POST /api/billing/webhook` — route by header: Stripe webhooks carry `Stripe-Signature`; NOWPayments carries `x-nowpayments-sig`. Dispatch accordingly.
- `POST /api/billing/topup` — **new** checkout for `credit_topup_products`.
- Keep `GET /api/billing/portal` as the subscription fetch; extend response with wallet balance + ledger preview.

---

## 8. Payment Provider Layer

### 8.1 Stripe (primary)

**Setup:**

- Create products + `price_*` in Stripe dashboard (recurring `interval=month|year`). Store IDs in `plans.stripe_price_id` and `credit_topup_products.stripe_price_id`.
- Create a webhook endpoint `POST /api/billing/webhook` (or `/api/billing/webhook/stripe` alias) listening for: `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`, `payment_intent.succeeded`.
- Secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` env vars (or store fully in DB).
- SDK: `stripe` npm package (latest; uses `stripe-node` with `apiVersion: '2024-11-20.ac320...'` pin).

**Client wrapper** (`apps/web/src/lib/stripe.ts`, peer to `nowpayments.ts`):

```ts
export async function createStripeCheckoutSession(params: { userId, priceId, successUrl, cancelUrl, idempotencyKey }): Promise<{ id, url }>
export async function createStripeBillingPortalSession(customerId): Promise<{ url }>
export async function verifyStripeWebhookSignature(rawBody, signature, secret): Promise<Stripe.Event>
```

**Idempotency:** Stripe client should be instantiated with `idempotencyKey` forwarded on *create* calls (Stripe respects it for 24h). Also keep Kestrel's `billing_checkout_attempts` lease so a crashed Kestrel after Stripe session create but before local persistence can be reclaimed.

### 8.2 NOWPayments (existing, keep)

- Keep `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, `NOWPAYMENTS_API_BASE`.
- No new code unless you add top-up packs with crypto — then `POST /api/billing/topup` also supports `provider: 'nowpayments'` with `pay_currency` like the plan flow.

### 8.3 Provider switch

```ts
type BillingProvider = 'stripe' | 'nowpayments';
const BILLING_PROVIDER = process.env.BILLING_PROVIDER ?? 'stripe'; // or 'both'
```

The checkout handler branches on `BILLING_PROVIDER` and on request body `provider`.

### 8.4 Reconciliation vs webhook-only

NOWPayments today does not have a polling reconciliation outside IPN. Add a **cron** `GET /api/cron/billing-sync` (or worker job) that, for any `subscriptions` with `stripe_subscription_id`, fetches Stripe's current status every 6h and reconciles drift (missed webhook). Similarly for NOWPayments: `GET /v1/payment/:id` polling for `status='waiting'` older than 15m.

---

## 9. Enforcement, Metering & Fair-Use

### 9.1 Gate points (every path that can burn credits)

| Path | Where to gate | What to check |
|------|---------------|---------------|
| `POST /api/chat` (single/full) | Immediately after `withAuth`, before `tryReserveBudget` | `assertEntitlement(feature) && assertCredits(estimate)` |
| Worker Mastra full-job enqueue | In `enqueueFullAnalysis` / `acquireBudget` (already durable) | Same — but the worker must also reserve credits atomically with the job insert (reuse reservation ID) |
| Alert evaluation cron | Before fan-out per tenant | Rate-limit alerts by plan (`alertLimit`) |
| Journal import (CSV burst) | In `POST /api/journal/import` | `countJournalEntriesThisMonth` vs plan limit |
| Web search tool | In search tool adapter (`WEB_SEARCH_MAX_CALLS_PER_TURN`) | Gate by `web_search_enabled` feature |
| Embedding backfill | Worker cron | No gate needed if free; else batch-limit by plan |

### 9.2 Credit gate implementation

```ts
// packages/db/src/queries/credit-gate.ts (new)
export async function assertCredits(userId: string, estimateCredits: number)
  : Promise<{ ok: true; balance: number } | { ok: false; balance: number; required: number }>

export async function reserveCredits(userId: string, estimateCredits: number, idempotencyKey: string)
  : Promise<{ reservationId: string; balanceAfter: number }>

// packages/db/src/queries/entitlement.ts (new / extend billing.ts)
export async function assertEntitlement(userId: string, feature: string)
  : Promise<{ ok: true } | { ok: false; reason: 'plan_required', requiredPlan?: string }>
```

Chat handler pattern:

```ts
const ent = await assertEntitlement(user.userId, mode === 'full' ? 'chat_full' : 'chat_single');
if (!ent.ok) return Response.json({ error: { code: 'UPGRADE_REQUIRED', feature: 'chat_full' } }, { status: 402 });

const est = estimateCreditsForMode(mode, resolvedModel); // ceil(USD*1000)
const gate = await assertCredits(user.userId, est);
if (!gate.ok) return Response.json(
  { error: { code: 'INSUFFICIENT_CREDITS', balance: gate.balance, required: est } },
  { status: 402 }
);
const { reservationId } = await reserveCredits(user.userId, est, idempotencyKey);
// ... run model ... then reconcile
```

Use **HTTP 402 Payment Required** for *all* billing blocks (entitlement + credits). Front-end handles uniformly.

### 9.3 Budget + credit interaction

The old `daily_ai_spend` guard stays for latency reasons (fast `bigint` row). The *authoritative* gate is **credits**. Wire them as:

1. Try credit reservation. If insufficient → 402.
2. Then try `tryReserveBudget` with `capUsd = creditsToUsd(available) ` (or the uncapped value) — keep ledger for observability.
3. On success, both reservations track the same turn. On reconcile, delta is applied to **both** ledgers.

Alternative (simpler): retire `tryReserveBudget`'s cap check for paid users (leave it as `UNCAPPED`) and rely solely on credits for admission control; keep the daily counter as an analytics rollup via the same SQL.

### 9.4 Rate limits to add

- `billing_checkout: 10 / minute / user`
- `billing_portal: 30 / minute / user`
- `ai_chat` already limited (30/min). Reduce `full` mode count separately (e.g. 10/min Free, 30/min Pro) via a per-plan override map.

---

## 10. API Surface & Auth Contracts

### 10.1 New / modified routes

| Method & Path | Auth | Body / Query | Response | Notes |
|---------------|------|-------------|----------|-------|
| `POST /api/billing/checkout` | user | `{ planId, provider, idempotencyKey }` + `Idempotency-Key` header | `{ checkoutUrl, invoiceId \| sessionId, idempotent }` | Extend existing |
| `POST /api/billing/topup` | user | `{ productId, provider, idempotencyKey }` | same | New |
| `POST /api/billing/portal` (create session) | user | — | `{ url }` redirect to Stripe portal | New (POST) |
| `GET /api/billing/portal` | user | — | `{ plans, subscription, payments, wallet, entitlements }` | Extend GET with wallets |
| `POST /api/billing/webhook` | HMAC (public) | raw body + `Stripe-Signature` OR `x-nowpayments-sig` | `200 OK` idempotent | Extend to dual-provider dispatch |
| `GET /api/billing/wallet` | user | — | `{ available, lifetimeGranted, lifetimeConsumed, ledger }` | New |
| `GET /api/billing/ledger` | user | `?cursor&limit` | paginated `credit_ledger` rows | New |
| `GET /api/admin/billing/wallet/:userId` | admin | — | same as wallet + adjustments UI | New admin |
| `POST /api/admin/billing/adjustment` | admin | `{ userId, amountCredits, reason }` | `{ ledgerId, balanceAfter }` | Manual grant/deduction |
| `POST /api/admin/billing/dlq/:id/replay` | admin | — |  — | Already exists; keep but add Stripe DLQ path |

### 10.2 Query helpers to add (`packages/db/src/queries/*`)

- `credit-wallet.ts`: `getWallet(userId)`, `ensureWallet(userId)` (insert-on-read), `grantCredits({ userId, amount, kind, idempotencyKey, referenceType, referenceId })`, `consumeCredits`, `expireCredits`.
- `credit-ledger.ts`: `listLedger(userId, cursor, limit)`, `getLedgerByIdempotency(tenantId, key)`.
- `credit-topups.ts`: `listActiveTopupProducts()`, `getTopupProduct(id)`.
- `entitlement.ts`: `getEntitlementSnapshot(userId)` — joined `subscription + plan + wallet + features` cached for middleware.
- `billing-customers.ts`: `ensureBillingCustomer(userId)` — lazy-create Stripe customer on first checkout.

### 10.3 Middleware shape

A tiny `requireEntitlement(feature)` / `requireCredits(estimate)` wrapper parallel to existing `requireTenantIdForUser` + `withTenantDb`. Do **not** add global Next.js middleware bloat — keep checks in the route handlers where `mode`/`provider` are known.

---

## 11. UI / UX Spec

### 11.1 Settings → Billing overhaul

Current: `apps/web/src/app/(app)/settings/billing/` has `_components/{billing-plans, subscription-status, payment-history}`. Keep, extend:

```
settings/billing/
  _components/
    billing-plans.tsx         ← add top-up pack cards alongside plans
    subscription-status.tsx   ← show period end, cancel-at-period-end toggle, Stripe portal link
    wallet-card.tsx           ← NEW: available / granted / consumed gauges + renewal countdown
    credit-usage-chart.tsx    ← NEW: daily credit burn (7d sparkline)
    payment-history.tsx       ← extend to show provider + credits_granted per payment
    topup-packs.tsx           ← NEW: grid of credit_topup_products + buy button
    ledger-table.tsx          ← NEW: paginated credit_ledger (filter by kind)
    plan-comparison-table.tsx ← NEW: full feature matrix
```

### 11.2 Global credit affordances

- **Header credit chip**: tiny `Available credits: 12,340` next to the user menu (visible everywhere; click → `/settings/billing`).
- **Insufficient-credits modal** (402): shows `You need ~250 credits for Full analysis — you have 42. [View Plans] [Buy 5k Credits $4.99]`. Include `X-Request-Id` for support.
- **Cost preview on send**: beneath the chat composer, ephemeral `Estimated: ~30 credits (BYOK — free)` / `~250 credits (managed)` before the user hits send. Compute client-side from `estimatedCreditForModel`.
- **Usage page** (`settings/usage`): add two toggles — USD vs Credits, Daily budget vs Monthly credits.

### 11.3 Admin billing view

- Extend `apps/web/src/app/(app)/admin/` with a `billing` tab: plans CRUD, top-up products CRUD, wallet lookups, ledger audit, DLQ replay, coupon/promo issuance.
- Critical: admin plan editing must not silently change a live user's entitlement without an audit log row (`admin_audit` already exists — use `logAdminAction`).

---

## 12. Webhook, DLQ & Reconciliation Reliability

### 12.1 Shared guarantees

- **Idempotency first**: every webhook `POST` handler must `claimEvent(idempotencyKey)` before any mutation. Stripe uses `event.id` + type; NOWPayments uses `(payment_id, payment_status)`.
- **Signature verification before body parse**: read `req.text()` raw, verify, then `JSON.parse`.
- **200 on DLQ write**: if the event is authenticated but local processing failed, persist to `billing_webhook_dlq` and return `200` so the provider doesn't retry forever. Replay via admin endpoint.
- **Lease + `withTenantDbFresh`**: billing mutations use **fresh tenant transactions** (as today's checkout already does) — never the request-scoped `withAuth` transaction, so an aborted request tx doesn't roll back the webhook's work.

### 12.2 Stripe events to handle

| Event | Kestrel action | Ledger |
|-------|---------------|--------|
| `checkout.session.completed` (subscription mode) | `upsertSubscription` + create `billing_customers` link | no credits yet |
| `customer.subscription.created` | `upsertSubscription` with period | grant if eligible |
| `customer.subscription.updated` | update `planId`, `currentPeriodStart/End`, `cancel_at_period_end` | grant on period advance |
| `invoice.paid` (primary credit grant trigger) | grant `monthly_credits` for that period | `subscription_grant` |
| `invoice.payment_failed` | set `status=past_due`, don't revoke credits for current period | — |
| `customer.subscription.deleted` | set `status=canceled` / `expired` | — |
| `payment_intent.succeeded` (top-up mode) | `grantCredits` for that product's `credits` | `topup_grant` |
| `charge.refunded` | `grantCredits(-original)` or `refundCredits` | `refund` |

### 12.3 DLQ + cron

- Add `cron/billing-reconcile` (or extend existing `cron/billing-dlq`): every 6h, for each subscription past its `currentPeriodEnd + 24h` without a grant, poll Stripe `GET /v1/subscriptions/:id` and repair.
- Add `cron/credit-expire` (if implementing expirations) + `cron/credit-reclaim` (for `credit_reservations` stuck `reserved` > 30m — mirrors `reclaimStaleBudgetReservations`).

### 12.4 Retry policy

Stripe retries webhooks for 72h with exponential backoff; returning non-2xx triggers retry. NOWPayments retries similarly. Our DLQ replay must be manual/admin (no auto-retry storm). Log every replay via `admin_audit`.

---

## 13. Multi-Tenant, Self-Host & SaaS Matrix

### 13.1 Tenant model

- `organization` = tenant. Billing is per-tenant (`tenant_id`). Most deployments have one user per tenant (`organizationMember`), but keep tenant as the billing owner so team seats (Enterprise) map cleanly later.

### 13.2 Deployment profiles

| Deployment | `BILLING_ENABLED` | `BILLING_MODE` | Expected billing stack | What to hide |
|------------|-------------------|-----------------|-----------------------|-------------|
| Self-host Docker (this repo's default) | `0` or `1` | `selfhost` | NOWPayments (optional), BYOK-only turns, no Stripe, no credit UI unless enabled | `settings/billing` upsells |
| SaaS (managed cloud) | `1` | `saas` | Stripe + NOWPayments (optional), managed gateway bills credits, BYOK allowed as supplement | — |
| Self-host with billing elective | `1` | `selfhost` | Same as SaaS but operator provides own `STRIPE_SECRET_KEY`; still works | — |

Do **not** branch code on `NODE_ENV=production` for billing enablement — use `BILLING_ENABLED` + `BILLING_MODE` env vars. The existing sandbox guard (`NOWPAYMENTS_API_BASE` includes `sandbox` in production) should gain a Stripe counterpart: log `warn` if `STRIPE_SECRET_KEY` begins `sk_test_` in production.

### 13.3 RLS invariants

Every new billing table must have:

```sql
ALTER TABLE credit_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON credit_wallets
  USING (tenant_id::text = current_setting('app.current_tenant', true));
-- plus WITH CHECK variant for INSERT/UPDATE per existing pattern
```

`ADMIN_DATABASE_URL` bypasses RLS for migrations and worker jobs that operate on any tenant. No billing write should use `getDb()` without scoping via `requireTenantIdForUser` or `withTenantDbFresh`.

### 13.4 Worker considerations

- Worker and web **both** write credits. Use `FOR UPDATE` / `RETURNING` to serialise balance updates.
- Embedding backfill cron should **not** burn credits for observability rows; if it does, rate-limit it to daily quota.

---

## 14. Observability, Audit & Fraud

- **Audit log**: every `credit_ledger` row is the audit trail. `admin_audit` table logs manual adjustments. Never log raw API keys or full Stripe payloads (PII) — redact like `diagnostics/redact.ts` does.
- **Langfuse**: the existing `telemetryConfig()` already threads `traceId`/`runId`. Include `walletBalanceAfter` as metadata on reconciled turns so traces can be correlated to spend.
- **Metrics** (`@kestrel/shared metrics`): add counters
  - `credits_granted_total{kind,plan}`,
  - `credits_consumed_total{model,provider_mode}`,
  - `credits_rejected_insufficient_total`,
  - `checkout_completed_total{provider,plan}`,
  - `webhook_processed_total{provider,event_type}`,
  - `dlq_size` gauge.
- **Chargeback / refund abuse**: cap refundable window (e.g. 30d post-grant, only if the credited period not consumed >50%). Require admin approval for refunds that exceed consumed proportion.
- **Promo abuse**: per-user one-time promo grants enforced by idempotency key (`promo:<code>:<userId>`) + `ipnEvents`-style dedup.
- **Alerting**: if `paymentStatus='finished'` count diverges from `subscription_grant` count by > N per hour, page oncall — a missed grant bug is revenue-critical.

---

## 15. Migration, Backfill & Rollout

### 15.1 Migrations order

1. `01xx_credit_wallets_and_ledger.sql` — create `credit_wallets`, `credit_ledger`, `credit_reservations`, `credit_topup_products`, `billing_customers`; add indexes + RLS; **no** data migration.
2. `01xx_plans_monthly_credits.sql` — add `monthly_credits`, `stripe_*` to `plans`.
3. `01xx_extend_subscriptions_and_payments.sql` — add `stripe_*` to `subscriptions`/`payments`, alter `billing.ts` enums if needed.
4. `01xx_chat_telemetry_provider_mode.sql` — add `provider_mode`, `credits_charged`.
5. `01xx_seed_plans_and_topups.sql` — idempotent `INSERT ... ON CONFLICT DO NOTHING` for Free/Starter/Pro/Scale + top-up packs.

All five must be additive + backward-compatible so a canary deploy doesn't break old code reading the tables.

### 15.2 Backfill

- Run `ensureWallet(userId)` for every existing user (idempotent).
- Free-tier users get `monthly_credits` for current calendar month on first access (lazy grant with idempotency key `free:<userId>:<YYYY-MM>` — no subscription row required).
- Backfill `chat_telemetry.provider_mode` for existing rows: heuristic via `model` prefix lookup; `NULL → 'byok'` if user had any `aiApiKeys` at `created_at`, else `'managed'`. This is a best-effort one-shot; future rows are authoritative.

### 15.3 Rollout flags

Add to `feature_flags` or env:

- `BILLING_STRIPE_ENABLED` (default 0 until launch; Stripe webhooks 404 while off).
- `CREDITS_ENFORCEMENT_ENABLED` (default 0; when 0, credit gate logs but doesn't 402 — dry-run / shadow mode).
- `CREDITS_SHADOW_LOG` (emit ledger rows without debiting balance — validates burn estimation).
- `BILLING_TOPUPS_ENABLED`.

Ship credit writes in **shadow 1–2 weeks** before enforcement (no risk). Telemetry dashboard must show shadow burn vs actual.

---

## 16. Phased Build Plan

> Legends: `D` = dependency, `Effort` = implementer days (spec overhead excluded).
> Each phase ends with a **gate**: a check that, if skipped, invalidates the later phase.

---

### Phase 0 — Freeze decisions & spec sign-off (Gate: D1–D6 recorded)

- [ ] Record D1–D6 in `docs/configuration.md` + `.env.example` + `infra/production.env.example`.
- [ ] Add `BILLING_MODE`, `CREDITS_PER_DOLLAR`, `FULL_MODE_CREDIT_ESTIMATE`, `PLATFORM_FEE_CREDITS`, `BILLING_PROVIDER` to env schema (`apps/web/src/lib/env.ts`).
- [ ] Update `docs/architecture.md` with the hybrid BYOK/managed section and the subscription→credits diagram.
- [ ] **Gate check:** `pnpm check:env-contract` passes; `turbo build` passes; docs PR approved.

### Phase 1 — Data model & seeding (Gate: migrations run on fresh + existing DB)

- [ ] Create Drizzle schema files: `credit-wallets.ts`, `credit-ledger.ts`, `credit-reservations.ts`, `credit-topup-products.ts`, `billing-customers.ts`.
- [ ] Generate + hand-audit 5 migrations listed in §15.1. Confirm RLS policies mirror `chat_threads`.
- [ ] Add to `packages/db/src/schema/index.ts` + `retention.ts` exclusion for ledger tables.
- [ ] Seed plans + top-up packs. Add `scripts/seed-billing.ts` for local dev reset.
- [ ] **Tests:** `vitest` on Drizzle insert/select for each new table; RLS tests (like `test:postgres-rls` existing harness) to prove tenant isolation.

### Phase 2 — Credit engine (Gate: unit-tested ledger, no negatives under concurrency)

- [ ] Implement `packages/db/src/queries/credit-wallet.ts` + `credit-ledger.ts` + `credit-reservations.ts`
  - `ensureWallet`, `getWallet`, `grantCredits`, `reserveCredits`, `reconcileReservation`, `releaseReservation`, `expireCredits`, `reclaimStaleCreditReservations`.
- [ ] Implement `creditsForModel(model, inTok, outTok)` in `packages/ai/src/credits.ts` — imports `buildCatalogRateTable()` + `estimateKnownCostUsd`, single function, single file. Keep USD→credits conversion in one place.
- [ ] Concurrency tests: 20 concurrent `reserveCredits` against a wallet with 100 credits; prove exactly `floor(100/est)` succeed and balance never <0 (use `pg` Testcontainers or existing postgres test harness).
- [ ] Idempotency tests: double `grantCredits` with same key → one ledger row.

### Phase 3 — Instrumented (shadow) metering (Gate: production shadow burn visible on dashboard)

- [ ] Add `provider_mode` detection helper (`resolveProviderMode(resolvedModel, hasUserKeyForProvider)`).
- [ ] In `POST /api/chat` + worker Mastra path, compute estimated credits and write `credit_reservations` + `chat_telemetry.provider_mode` but **do not gate** (`CREDITS_ENFORCEMENT_ENABLED=0`). Log `credits_estimated` on route span.
- [ ] Add `/api/billing/wallet` + `/api/billing/ledger` (read-only) for spot checks.
- [ ] Deploy and monitor shadow metrics for ≥1 week; reconcile shadow burn against `estimateKnownCostUsd` variance. Tune `DEFAULT_TURN_CREDIT_ESTIMATE` so refunds dominate over under-reserves.

### Phase 4 — Stripe integration (Gate: real \$1 checkout round-trips through Stripe test mode)

- [ ] Implement `apps/web/src/lib/stripe.ts` + extend `POST /api/billing/checkout` + new `POST /api/billing/topup` + `POST /api/billing/portal`.
- [ ] Extend `POST /api/billing/webhook` with Stripe dispatch + idempotency (`stripe event id`). Verify signature via `stripe.webhooks.constructEvent`.
- [ ] Create Stripe products/prices in dashboard (Starter/Pro/Scale monthly + yearly) + bind `stripe_price_id` on `plans` + `credit_topup_products`.
- [ ] Worker/cron `billing-reconcile` for missed webhooks.
- [ ] End-to-end test: Stripe CLI `stripe listen --forward-to localhost:3002/api/billing/webhook` + `stripe trigger invoice.paid` → wallet credited.

### Phase 5 — Enforcement & entitlement (Gate: 402 blocks work as spec, BYOK exempt)

- [ ] Implement `assertEntitlement` + `assertCredits` gates; wire into `POST /api/chat` (single vs full) + worker queue admission.
- [ ] Wire reconcile/release into chat stream `onFinish` / error paths (reuse existing `BudgetHandle.reconcile` shape — add `CreditHandle` alongside).
- [ ] Add `billing_checkout` rate limit.
- [ ] Feature-gate tool paths (web search, alert limits) via `assertEntitlement`.
- [ ] Flip `CREDITS_ENFORCEMENT_ENABLED=1` in staging and verify 402 payload contract.

### Phase 6 — UI & self-service (Gate: design review + a11y check)

- [ ] Build/replace `settings/billing` components (§11.1): wallet card, usage chart, top-up grid, ledger table, plan comparison + Stripe portal link.
- [ ] Global header chip + 402 upgrade modal + composer cost preview.
- [ ] Extend `settings/usage` with credit vs USD toggle.
- [ ] Admin billing tab: plans/topup CRUD, wallet lookup, manual adjustment flow.
- [ ] Empty-state handling for free users ("You're on the Free plan — 1,000 credits this month, BYOK free forever").

### Phase 7 — NOWPayments parity (if D2 = both) (Gate: crypto top-up path tested on sandbox)

- [ ] Extend `POST /api/billing/topup` to handle `provider: 'nowpayments'`.
- [ ] Duplicate Stripe grant logic for NOWPayments `invoice.paid` → `topup_grant`.
- [ ] Keep NOWPayments webhook path unchanged except for top-up ledger entries.

### Phase 8 — Hardening & compliance (Gate: compliance checklist + load test)

- [ ] Retention exclusion for ledger tables; set ledger retention to 730d.
- [ ] Admin refund flow with threshold checks.
- [ ] Tax behaviour (`stripe_tax_behavior`) + invoice copies + email receipts.
- [ ] Load test (extend `loadtest/`) with 200 concurrent credit reservations; verify no deadlocks and `FOR UPDATE` timeout handling.
- [ ] Security review: check every billing table for RLS, every money path for idempotency, every webhook for signature failure handling.
- [ ] Backfill + production seed cut-over (schedule low-traffic window).

### Phase 9 — Launch & monitor (Gate: ≥7 days post-launch with burn/margin dashboards green)

- [ ] Dashboard: credit burn per model, per tenant, per feature; margin (credits_sold vs provider_cost) rollup.
- [ ] Alerts: DLQ depth, grant vs payment divergence, 402 spike, Stripe error rate.
- [ ] Documentation: `DEPLOY.md` billing section, `SECURITY.md` webhook/trust boundary note, changelog entry.
- [ ] Post-launch tuning: weekly review of credit estimates vs actuals; adjust model mix assumptions and re-seed plan `monthly_credits` if needed (non-breaking plan edits).

---

## 17. Test Plan & Acceptance Criteria

### 17.1 Required automated tests (no phase gates pass without them)

| Suite | What it proves | Where |
|-------|---------------|-------|
| RLS isolation | Tenant A cannot read Tenant B `credit_wallets` / ledger / reservations | `packages/db/test/rust-style` + `test:postgres-rls` harness |
| Concurrency charges | 50 concurrent reservations on a 1000-credit wallet → exact debits, balance ≥0, no double ledger rows | `credit-wallet.test.ts` with Testcontainers postgres |
| Idempotency grants | Same `(tenant, idempotency_key)` → `ON CONFLICT DO NOTHING`; second call returns original | ledger + reservation + checkout attempt tests |
| Stripe webhook replay | Same `event.id` delivered twice → second is no-op (200, no new credits) | `apps/web/test/api/billing/webhook.test.ts` (mock `stripe.webhooks.constructEvent`) |
| NOWPayments replay | Same `(payment_id, payment_status)` → dedup | existing `billing webhook` suite + new cases |
| Credit estimate fidelity | `creditsForModel` matches `estimateKnownCostUsd * 1000` ceil for every model in catalog | `packages/ai/src/credits.test.ts` parametric over `BYOK_PROVIDERS_LIST` |
| 402 contract | Insufficient credits → 402 with `{ code: 'INSUFFICIENT_CREDITS', balance, required }`; entitlement miss → `UPGRADE_REQUIRED` with feature | API route tests |
| Free plan grant | First chat in a calendar month grants Free 1000 credits iff not already granted this month | integration test with mocked time |
| Period renewal grant | Simulated Stripe `invoice.paid` for `price_pro_m` grants 30k credits idempotently | Stripe webhook integration test with fixtures |
| Top-up grant | `payment_intent.succeeded` with `metadata.productId` grants that pack's `credits` | fixture test |
| Reconcile refunds | Reserve 250, actual 120 → wallet refunded 130 + ledger `reconcile` row | budget/handle test |

### 17.2 Manual / E2E acceptance (Playwright)

- Full checkout happy path through Stripe **test** mode: register → `/settings/billing` → choose Starter monthly → complete `4242 4242 4242 4242` → webhook → wallet shows `8,000` + ledger row → chat burns credits → balance decrements.
- Downgrade: portal cancel-at-period-end → status shows `cancel_at_period_end: true`, credits remain until period end.
- Top-up: buy pack → ledger `topup_grant` → burn beyond subscription period → balance stays non-negative.
- BYOK path: add user API key for `openai` → same chat (resolved to `openai/gpt-4o`) consumes **0 credits** while usage telemetry still increments.

### 17.3 Load / chaos

- 100 RPS of `POST /api/chat` (single) against one user near zero balance → correct 402 rate, no deadlock (all DB writes `FOR UPDATE` with statement timeout).
- Webhook burst: 5 duplicates of same event within 500ms → idempotent.

---

## 18. Appendix — Rate Tables, Math & Seeded Plans

### 18.1 How to derive plan `monthly_credits` from real costs

Pick a **blended cost per turn** assumption, e.g. `blendedManagedTurnUsd = $0.03` (single) / $0.25 (full) with 60% full ratio:

```
expectedTurnsPerMonth(pro) = 200 single + 80 full
expectedProviderCost  = 200*0.03 + 80*0.25 = $6 + $20 = $26
targetPrice           = $29 (list price)
impliedCreditsNeeded  = 29 * 1000 = 29000  (user buys $29 of credits)
marginCheck           = (29 - 26 - $2 infra) / 29 ≈ 3%  too thin
=> either shrink full waitlist to 40 fulls, or raise to 30000 credits (still rounds to 30k)
=> iterate until margin >= 20%
```

Publish this math in PR description for every price change.

### 18.2 Credit price sheet (1 credit = $0.001)

| Tokens (representative) | Cost at Sonnet ($3/15) | Credits |
|-------------------------|------------------------|---------|
| 1k in, 0.5k out | $0.0105 | 11 |
| 4k in, 1.5k out | $0.0345 | 35 |
| 8k in, 3k out (full specialist) | $0.069 | 69 |
| 20k in, 5k out (large full) | $0.135 | 135 |
| Full job 5× of last row | $0.675 | 675 |

### 18.3 Env vars added (append to `.env.example`)

```dotenv
# Billing
BILLING_ENABLED=0
BILLING_MODE=selfhost            # selfhost | saas
BILLING_PROVIDER=stripe          # stripe | nowpayments | both
# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_BILLING_PORTAL_RETURN_URL=http://localhost:3002/settings/billing
# Credits
CREDITS_PER_DOLLAR=1000
FULL_MODE_CREDIT_ESTIMATE=250    # reserved credits for a full committee turn
PLATFORM_FEE_CREDITS=0           # per BYOK turn
CREDITS_ENFORCEMENT_ENABLED=0
CREDITS_SHADOW_LOG=1
```

### 18.4 File map the implementer should target

```
packages/db/
  src/schema/credit-wallets.ts           # NEW
  src/schema/credit-ledger.ts            # NEW
  src/schema/credit-reservations.ts      # NEW
  src/schema/credit-topup-products.ts    # NEW
  src/schema/billing-customers.ts        # NEW
  src/schema/billing.ts                  # EXTEND (monthly_credits, stripe ids)
  src/schema/telemetry.ts                # EXTEND (provider_mode, credits_charged)
  src/queries/credit-wallet.ts           # NEW
  src/queries/credit-ledger.ts           # NEW
  src/queries/entitlement.ts             # NEW
  src/queries/billing.ts                 # EXTEND
  src/queries/billing-extras.ts          # EXTEND
  src/retention.ts                       # EXTEND (exclude ledgers)
packages/ai/
  src/credits.ts                         # NEW (canonical USD→credits)
  src/budget.ts                          # EXTEND (add CreditHandle alongside BudgetHandle)
  src/usage.ts                           # EXTEND (credit breakdowns)
  src/cost.ts                            # EXTEND (export blended estimates)
apps/web/
  src/lib/stripe.ts                      # NEW
  src/lib/nowpayments.ts                 # keep
  src/lib/env.ts                        # EXTEND (Stripe env zod)
  src/lib/services/api-boundary.ts       # EXTEND (re-export credit helpers)
  src/app/api/billing/checkout/route.ts  # EXTEND (stripe branch)
  src/app/api/billing/topup/route.ts     # NEW
  src/app/api/billing/portal/route.ts    # NEW POST portal session
  src/app/api/billing/webhook/route.ts   # EXTEND (dual dispatch)
  src/app/api/billing/wallet/route.ts    # NEW
  src/app/api/billing/ledger/route.ts    # NEW
  src/app/api/cron/billing-reconcile/route.ts # NEW
  src/app/(app)/settings/billing/**/*    # OVERHAUL
  src/app/(app)/admin/billing/**/*       # NEW admin tab
  src/components/billing/**/*             # NEW shared billing components
```

---

## 19. Open Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Users bypass managed and stay BYOK → credits revenue near zero | Medium | BYOK is a feature, not a bug: Free tier *requires* BYOK; paid tiers sell convenience + full mode quality, not raw tokens. Offer "Managed DPHN cheap mode" as the credit-efficient default. |
| Provider prices shift (Anthropic/OpenAI) quarterly | Medium | Catalog is code. Add a CI check that diffs `buildCatalogRateTable()` vs a committed snapshot and forces a PR review when prices drift. |
| Full-mode burst costs (8 specialists) vaporise a Free user's 1k credits in 2 turns | High | Enforce `chat_full` entitlement only on Starter+; Free `full` attempts → 402 with upsell. Reserve 250 credits up front so Free `full` is never partially executed. |
| Postgres contention on `credit_wallets` hot row | Low/Med | Updates are `UPDATE ... WHERE available >= X RETURNING` (single statement, no separate SELECT). `FOR UPDATE` only where grant + update must be atomic. Add statement timeout 5s; on timeout throw `RETRYABLE`. Load test will catch gaps. |
| Tax nexus / EU VAT on Stripe | High | Never collect `price_amount` yourself — let Stripe handle tax via `automatic_tax`. Set `stripe_tax_behavior='exclusive'` and enable Stripe Tax in dashboard. |
| Crypto volatility (NOWPayments) | Low | Record `usdAmountCents` snapshot from NOWPayments invoice at payment creation time; never re-convert later. |
| Negative-balance bug from refund/consume race | High | All wallet writes are `SET available = available ± X WHERE ... RETURNING`; CHECK ≥0 is backup. Refunds that would over-grant are clamped to `lifetimeConsumed - lifetimeGranted` gap. |
| Ledger growth (1 row/turn/user, multi-year) | Low | Ledger is append-only but narrow; 1M turns/mo ≈ 12M rows/yr. Add yearly partition or range index; TTL is 730d. Daily materialised aggregates for dashboards. |
| Admin abuse (manual adjustments) | Medium | Every adjustment requires `admin_audit` + 2-person approve if `amount >= 50k credits`. Display-adjustments endpoint rate-limited to 5/min. |
| Stripe webhook secret rotation | Low | Store secret in `ADMIN_DATABASE_URL`-writable `billing_provider_secrets` (or env only) with graceful fallback to prior secret for 24h. |

---

## How to use this plan

1. **Do not start coding until §1.2 is signed off.** Paste the chosen values into the top of the first PR.
2. Follow **§16 phases in order.** Skipping Phase 3 (shadow) is how you ship an outage.
3. Every PR must include the **test rows from §17** before review.
4. When anything in this plan contradicts the live repo during implementation, **the live repo wins and this file is patched** — file a follow-up PR updating this document so the next agent inherits the correction.
