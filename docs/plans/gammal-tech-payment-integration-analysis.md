# Gammal Tech × Kestrel — Payment Integration Analysis

> **Status:** Feasibility analysis — implementation now lives in `docs/plans/gammal-tech-integration-setup.md`.
> **Date:** 2026-10-20
> **Analysed against:** `Kestrel` @ `32a4ce26` (billing system commit)
> **Provider docs:** <https://api.gammal.tech/llms.txt> (SDK v3.1.1), <https://api.gammal.tech/doc/>
> **Scope:** Can Gammal Tech be integrated into Kestrel's subscription + credit billing system, and under what constraints?

---

## 1. Executive verdict

| Use case                                                  | Feasible?                     | Verdict                                                                                                                                                                   |
| --------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **One-time credit top-ups** (card, USD)                   | **Yes**                       | Clean technical fit. Recommended first phase.                                                                                                                             |
| **Prepaid plan passes** (30-day access, no auto-renew)    | **Yes, with product changes** | Workable if Kestrel is willing to sell non-recurring passes.                                                                                                              |
| **Recurring subscriptions** (auto-renew, cancel, upgrade) | **No, not to Stripe parity**  | Gammal's documented API has no subscription management/cancel endpoint, no subscription ID in webhooks, no proration, no customer portal, and no reconciliation endpoint. |
| **Refunds/disputes automation**                           | **Partial**                   | Kestrel can react to refund/dispute webhooks, but cannot initiate refunds via API. Refunds are dashboard/PIN or email-support only.                                       |
| **Replacing Stripe as the primary billing provider**      | **No**                        | Too many operational gaps for a SaaS billing system.                                                                                                                      |
| **Adding a local/MENA payment option alongside Stripe**   | **Yes**                       | Best fit: optional one-time top-up/pass provider, Stripe remains primary for subscriptions.                                                                               |

**Bottom line:** Gammal is technically integrable and maps surprisingly well onto Kestrel's `payments` + `credit_ledger` + `billing_events` architecture for **one-time card payments in USD**. It is **not** a drop-in replacement for Stripe Billing. The recommended integration is a **feature-flagged, one-time top-up (and optionally prepaid pass) provider**, not recurring subscriptions.

---

## 2. What Gammal Tech is

Gammal Tech is a backend-as-a-service for simple websites. It provides:

- Login (popup, no passwords)
- Per-user data storage
- Payments (hosted card checkout, EGP wallet)
- AI assistant
- Owner notification emails

Kestrel only needs the **payments** slice. Kestrel already has its own auth, Postgres storage, AI/BYOK layer, and notification stack; adopting Gammal's other features would fragment identity and data ownership.

### 2.1 Security model: domain, not API keys

Gammal has **no API keys and no secret keys**. A project is identified by a public `pid` (e.g. `47`). Browser requests are authorised by the page's registered HTTPS domain. This has important consequences:

- No secret to leak or rotate — good.
- Checkout creation is **not authenticated server-to-server**; a payment link is just a URL.
- The only trustworthy server-side artefact is the **signed `payment_token`** (RS256 JWT) delivered to the callback and webhook.
- The deployment domain must be registered in the Gammal dashboard (HTTPS only, up to 4 domains, `www` and apex are separate, `localhost` does not work).
- Every self-hosted Kestrel operator would need their own Gammal account/project/domain.

### 2.2 Payment flows

**Guest payment link (the only flow that fits Kestrel):**

```
https://api.gammal.tech/sdk/pay/link/?pid=47
  &amount=29
  &desc=Kestrel+Pro+30-day+pass+KS-7f3a2c
  &currency=USD
  &callback=https%3A%2F%2Fkestrel.example.com%2Fsettings%2Fbilling%2Fgammal%2Freturn%3Fref%3DKS-7f3a2c
```

- `currency` present → card checkout in that currency.
- `currency` absent → EGP wallet checkout.
- `recurrence=monthly|yearly` → recurring subscription (card, non-EGP only).
- After payment, the customer returns to `callback` with `status=success&txn=...&payment_token=...` (card) or `status=success&txn=...` (wallet, no token).
- `status=cancelled` means the customer backed out; not an error.

**Logged-in SDK flow (`GammalTech.payCard` / `GammalTech.pay`):** requires a Gammal login. Not appropriate for Kestrel users, who already have Kestrel accounts and should not be asked to create Gammal accounts. **Do not use the SDK payment methods.**

### 2.3 Verification and webhooks

- **Verify endpoint:** `POST https://api.gammal.tech/sdk/pay/link/verify.php` with `{ payment_token }`.
- **Payment token:** RS256 JWT, ~5 minute lifetime. Claims include `type`, `txn`, `amount`, `currency`, `description`, `project_id`, `exp`.
- **Refund notice token:** 24 hour lifetime; adds `event`, `sale_txn`, `refunded`, `ratio`, `full`, `reason`.
- **Public key:** `GET https://api.gammal.tech/token/public-key.php` (PEM). Tokens can be verified locally with standard JWT/RS256 verification.
- **Webhook body:** `{ event, timestamp, payment_token }` plus `X-Gammal-Event` and `X-Gammal-Attempt` headers.
- **No webhook signature.** The body is untrusted; the token must be verified. The event header is informational only.
- **Events:** `payment.success`, `payment.refunded`, `payment.disputed`, `payment.dispute_reversed`, `payment.refund_failed`.
- **Verify statuses:** `0` invalid/expired, `1` first valid payment, `2` already verified payment, `3` first valid refund notice, `4` already verified refund notice.
- **Idempotency:** the verify endpoint is stateful; `status: 1` is given only once. If Kestrel verifies and then crashes before persisting, a retry gets `status: 2`, which is why Kestrel must persist verified facts before delivering.

### 2.4 Refunds

- Full refunds: Gammal Revenue Dashboard → Payments → Refund in full → account PIN.
- Partial refunds: email `support@gammal.tech` with `txn` and amount.
- **No documented refund API.**
- Wallet (EGP) refunds: free, full.
- International card refunds: customer gets full amount back; the merchant is debited the full price + card processing cost (~2.9% + 0.30 USD) + 1 USD handling. This is **more than the merchant earned**.
- EGP card payments: **not refundable through Gammal at all**; settle with the customer outside the platform.
- Disputes: same deductions plus a network dispute fee (~15 USD); evidence submitted by email within 5 days.

### 2.5 Subscriptions

- Created only via a payment link with `recurrence=monthly|yearly` and a non-EGP card currency.
- No documented plan/product API, subscription retrieval API, cancel/upgrade/proration API, or customer portal.
- The `subscription` ID is returned **only on the browser callback**, not in the webhook or verify response documented claims.
- Renewals arrive only as `payment.success` webhooks with a fresh token and the same `description`.
- Cancellation is manual: Gammal dashboard → Payments → Stop renewals, or email support with the subscription ID.
- No webhook for subscription cancellation/end; only an email.
- A customer who closes the tab after the first payment may never deliver the subscription ID to Kestrel's server.

### 2.6 Pricing, payouts, and account model

| Customer payment method         | Gammal keeps | Merchant keeps | Customer fee |
| ------------------------------- | -----------: | -------------: | -----------: |
| Card, non-EGP (USD/EUR/GBP/AED) |          15% |        **85%** |   +8% on top |
| Card, EGP                       |          40% |            60% |   +2% on top |
| Wallet, EGP                     |          75% |            25% |         none |

- Card sales are **on hold for 14 days** before withdrawal.
- Minimum withdrawal: **100 USD** (or currency equivalent).
- Withdrawal fee: **5–20 USD** flat.
- Payouts go to a bank account in the verified account holder's exact name.
- One account per person; identity verification via National ID (limited passport/birth-certificate exceptions). This is a **personal merchant model**, not a documented company account model.
- If a client receives the money, the client must own the Gammal account/project; you cannot collect on their behalf through your account.

### 2.7 What does not exist

The following are **not documented** and should not be assumed:

- Payment lookup/list API (for reconciliation)
- Subscription retrieval/cancel/update API
- Refund creation API
- Customer email/phone/name in payment responses
- Test mode, sandbox, test cards, or test keys
- Tax/VAT calculation or VAT invoice API
- Webhook signature (only the token)
- Subscription cancellation webhook
- SLA/status page for payment processing

The shipped SDK (v3.1.1) contains only login and payment methods; it exposes no
subscription lookup, cancellation, refund, or payment-list methods. Treat the
documented API as the complete contract.

---

## 3. What I verified

1. Read the complete authoritative guide at `https://api.gammal.tech/llms.txt` (2,009 lines, SDK v3.1.1).
2. Read the developer docs landing page and the payment/verification/webhook/refund/subscription sections.
3. Fetched the live public key endpoint: HTTP 200, PEM RSA public key, CORS `*`, cache `max-age=604800`.
4. Called the live verify endpoint with an invalid token: HTTP 200 `{"status":0,"reason":"invalid_signature"}`; CORS preflight returns 204 with `access-control-allow-origin: *`.
5. Inspected the shipped `sdk-web.js` v3.1.1: only login + payment methods; no subscription cancel/lookup methods.
6. Audited Kestrel's billing implementation: schema, migrations, checkout/topup/webhook/portal routes, Stripe service, NOWPayments client, credit wallet/ledger, entitlement gates, cron reconciliation, DLQ, UI, env contract, RLS/tenant model, and CSP.
7. Confirmed Kestrel's current provider check constraint only allows `nowpayments | stripe | manual | promo`; `gammal` requires a migration.
8. Confirmed Kestrel's webhook route is a public route with provider dispatch on signature headers; Gammal has no equivalent signature and needs a different verification branch.

---

## 4. Kestrel billing architecture (the integration surface)

Relevant invariants from `docs/architecture.md` and `docs/configuration.md`:

1. `credit_ledger` is append-only and idempotency-keyed; wallet writes never go negative.
2. Webhooks run in **fresh tenant transactions**, never the request transaction.
3. Every grant/refund/adjustment has a stable idempotency key and one ledger row.
4. Billing tables have a multi-year retention window (not the 90-day telemetry sweep).
5. `BILLING_ENABLED` is the kill switch; billing is opt-in for self-host.
6. Stripe is the primary subscription provider; NOWPayments is the crypto alternative.

Key files:

| Concern                     | File                                                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Payment/subscription schema | `packages/db/src/schema/billing.ts`                                                                        |
| Credit wallet/ledger        | `packages/db/src/schema/credit-wallets.ts`, `credit-ledger.ts`, `packages/db/src/queries/credit-wallet.ts` |
| Entitlements                | `packages/db/src/queries/entitlement.ts`, `apps/web/src/lib/billing-gate.ts`                               |
| Checkout                    | `apps/web/src/app/api/billing/checkout/route.ts`                                                           |
| Top-ups                     | `apps/web/src/app/api/billing/topup/route.ts`                                                              |
| Webhook                     | `apps/web/src/app/api/billing/webhook/route.ts`                                                            |
| Stripe projection           | `apps/web/src/lib/services/stripe-billing.ts`, `apps/web/src/lib/stripe.ts`                                |
| NOWPayments client          | `apps/web/src/lib/nowpayments.ts`                                                                          |
| Provider-agnostic event log | `packages/db/src/schema/billing-events.ts`, `billing-webhook-dlq`                                          |
| Reconciliation/DLQ          | `apps/web/src/app/api/cron/billing-reconcile/route.ts`, `billing-dlq/route.ts`                             |
| Billing UI                  | `apps/web/src/app/(app)/settings/billing/*`                                                                |
| Env contract                | `packages/shared/src/env.ts`, `.env.example`, `docs/configuration.md`                                      |

The existing flow is:

```
Provider webhook
  └─ billing_events / ipn_events (idempotent claim)
       └─ subscriptions + payments projection
            └─ credit_ledger (append-only, idempotency-keyed)
                 └─ credit_wallets.available_credits
```

Gammal fits this if we treat the **verified JWT claims** as the provider event payload and use `txn` as the stable external ID.

---

## 5. Capability fit matrix

| Kestrel need                           | Gammal capability                                   | Fit                                  |
| -------------------------------------- | --------------------------------------------------- | ------------------------------------ |
| Create a checkout for a logged-in user | Build a payment-link URL server-side                | **Good**                             |
| One-time credit top-up                 | Payment link + card USD + webhook                   | **Good**                             |
| Prepaid 30-day plan                    | One-time payment link, local expiry                 | **Good, with product change**        |
| Auto-renewing subscription             | `recurrence` link only                              | **Poor**                             |
| Customer self-service cancel           | None (manual dashboard/email)                       | **Blocker**                          |
| Upgrade/downgrade with proration       | None                                                | **Blocker**                          |
| Retrieve subscription state            | None                                                | **Blocker**                          |
| Reconcile missed webhook               | No documented payment lookup API                    | **Blocker for SaaS ops**             |
| Initiate refund from Kestrel           | No API; dashboard/PIN or email                      | **Manual only**                      |
| React to refund/dispute                | Webhook + refund notice token                       | **Good**                             |
| Map payment to tenant/user             | Order ref in `desc` + callback `ref`                | **Good, with care**                  |
| Customer email/receipt                 | Not returned (card page collects for receipt)       | **Kestrel must email its own users** |
| Test in CI/staging                     | No test mode; real money only                       | **Blocker for E2E**                  |
| Tax/VAT invoice                        | Not documented                                      | **Blocker for EU/UK B2B**            |
| Company merchant account               | Personal KYC/payout only documented                 | **Blocker for incorporated SaaS**    |
| Multi-currency                         | Card in supported currencies; earnings per currency | **USD only recommended**             |
| Self-host operator setup               | Account + domain + project per operator             | **Acceptable but friction**          |

---

## 6. Recommended integration design

### 6.1 Scope decision

**Recommended: Phase 1 — one-time credit top-ups only.**

- Keep Stripe for subscriptions.
- Add Gammal as an optional top-up method for USD card payments.
- Do not enable Gammal for plans until the prepaid-pass UX is accepted.
- Do not enable recurring `recurrence` subscriptions.

**Phase 2 (optional): prepaid plan passes.**

- Sell a 30-day/yearly pass as a one-time payment.
- On success, set `subscriptions.currentPeriodEnd = now + interval`, `status='active'`, `cancelAtPeriodEnd=true` (or add a `provider='gammal'` marker).
- Add an expiry cron: `currentPeriodEnd < now()` → `expired`.
- UI copy must say **“30-day pass · no auto-renew”**, not “subscription”.
- This avoids Gammal's missing subscription management entirely.

**Not recommended: recurring subscriptions.**

- No cancel API means a user cannot cancel from Kestrel; the operator must log into Gammal and stop renewals manually.
- No subscription ID in webhooks means renewals can only be mapped by `description` (order ref), and cancellation may be impossible if the callback was never received.
- Upgrades would require creating a new subscription and manually stopping the old one, risking double charges.
- This is an operational and consumer-protection liability, not just a code gap.

### 6.2 Proposed data model

Add a migration `0106_gammal_billing.sql`:

```sql
-- Provider check constraint
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_provider_check;
ALTER TABLE payments
  ADD CONSTRAINT payments_provider_check
  CHECK (provider IN ('nowpayments','stripe','manual','promo','gammal'));

-- Provider-specific external identifiers
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gammal_txn text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gammal_order_ref text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gammal_subscription_id text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gammal_refund_txn text;

CREATE UNIQUE INDEX IF NOT EXISTS payments_gammal_txn_uk
  ON payments (gammal_txn) WHERE gammal_txn IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_gammal_order_ref_uk
  ON payments (gammal_order_ref) WHERE gammal_order_ref IS NOT NULL;

-- Optional, for prepaid passes / reporting
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider text;
UPDATE subscriptions SET provider = CASE
  WHEN stripe_subscription_id IS NOT NULL THEN 'stripe'
  WHEN nowpayments_recurring_id IS NOT NULL THEN 'nowpayments'
  ELSE 'manual'
END WHERE provider IS NULL;
```

Notes:

- `payments.provider` is currently constrained; without this migration any `provider='gammal'` insert fails.
- `payments.status` does not have `partially_refunded` or `disputed`. For Phase 1/2, map both to `refunded` and preserve the exact event/ratio in `ipn_payload`; add enum values later if the UI needs the distinction.
- Reuse `billing_events` (`provider='gammal'`, `eventId=<txn>`) and `billing_webhook_dlq` (`provider='gammal'`); no new event tables are needed.
- Do **not** use `ipn_events` (NOWPayments-specific).

### 6.3 Checkout flow

At checkout, create a **local order first**:

1. Generate an opaque order ref, e.g. `KS-<16 hex>`.
2. Insert a `payments` row:
   - `provider='gammal'`
   - `status='waiting'`
   - `gammal_order_ref=<ref>`
   - `usd_amount_cents=<plan/product price>`
   - `ipn_payload={ kind: 'topup'|'pass', planId/productId, userId, tenantId, intendedCredits }`
3. Build the payment link:
   - `desc` contains a human-readable product name + the ref (max 200 chars), e.g. `Kestrel Pro 30-day pass KS-7f3a2c91d4e8b610`.
   - `callback` = `${NEXT_PUBLIC_APP_URL}/settings/billing/gammal/return?ref=<ref>` (URL-encoded).
4. Return `{ checkoutUrl, provider: 'gammal', orderRef }` to the UI.
5. The UI redirects to the hosted checkout.

Set `payments.credits_granted` only when the payment is verified and credits are
actually granted; do not pre-fill it on the pending row. Add a cleanup job (or
extend the existing billing cron) to mark `waiting` Gammal payments older than
24 hours as `expired` so abandoned checkouts do not clutter payment history.

Why create the row first: Gammal has no invoice ID, no idempotency key, and no server-side checkout creation. The local `gammal_order_ref` is the only way to bind the eventual payment to a user/product and to validate the amount.

**Important:** The payment link is user-modifiable. A user can change `amount`, `desc`, or `currency` before paying. The webhook handler must compare the verified `amount`, `currency`, and `project_id` to the local order, and require the `description` to contain the expected `gammal_order_ref`. Never grant on `project_id` alone.

### 6.4 Return page + webhook (dual confirmation)

Use **both** paths, idempotently:

```
Customer pays
  ├─ Browser returns to /settings/billing/gammal/return?ref=...&status=success&txn=...&payment_token=...
  │    └─ server verifies JWT + processes idempotently
  └─ Gammal POSTs /api/billing/webhook { event, payment_token }
       └─ server verifies JWT + processes idempotently
```

- Both call the same `processGammalToken()` service.
- Idempotency is enforced by `billing_events` + `credit_ledger` unique keys.
- If the webhook is delayed, the return page gives the user immediate confirmation.
- If the user closes the tab, the webhook still delivers.
- Never grant from `status=success` alone; only from a verified token.

**Why local JWT verification is better than calling `verify.php`:**

- The verify endpoint is stateful: `status: 1` is issued once. If Kestrel verifies and then crashes before persisting, a retry gets `status: 2`, and delivery can be lost.
- The JWT contains all claims and can be verified offline with the public key; `txn` in Kestrel's ledger provides replay protection.
- The verify endpoint can still be used as a fallback, but local verification avoids the "verify once" trap.

**Webhook handler sketch:**

```ts
// apps/web/src/app/api/billing/webhook/route.ts
const gammalEvent = req.headers.get('x-gammal-event');
if (gammalEvent) {
  if (!env.BILLING_GAMMAL_ENABLED) return new Response('Not Found', { status: 404 });
  const body = await req.json();
  const claims = await verifyGammalToken(body.payment_token); // RS256 + exp
  assertProject(claims.project_id);
  const claim = await claimBillingEvent({
    provider: 'gammal',
    eventId: claims.txn,
    eventType: claims.event ?? claims.type,
    payload: claims,
  });
  if (claim.kind === 'processed' || claim.kind === 'in_progress') return new Response('OK');
  try {
    await processGammalClaims(claims);
    await markBillingEventProcessed(claim.id);
  } catch (err) {
    await markBillingEventFailed(claim.id, String(err));
    await recordBillingWebhookFailure({ provider: 'gammal', ... });
  }
  return new Response('OK'); // token expires in ~5 min; do not rely on retries
}
```

- Store **verified claims**, not the raw token (the token is a bearer proof).
- Return `200` after persisting the claim, even if post-processing fails; Kestrel's DLQ/admin replay is more reliable than Gammal's short retry window.
- For invalid/expired token, return `401`/`400` and log; do not grant.
- For `type='refund'`, handle `payment.refunded`/`payment.disputed` by revoking; handle `payment.dispute_reversed`/`payment.refund_failed` by restoring.
- Reject a refund notice on the payment path and vice versa.

### 6.5 Mapping Gammal events to Kestrel

| Gammal verified claim                               | Kestrel action                                                                                                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type='payment'`, `event` absent/`payment.success`  | Find `payments` by `gammal_order_ref` in `description`; validate amount/currency/project; set `gammal_txn`; `status='finished'`; grant credits or activate pass.    |
| `type='refund'`, `event='payment.refunded'`         | Find payment by `sale_txn`; set `status='refunded'`; revoke granted credits (`kind='refund'`, key `gammal:refund:<notice_txn>`); if `full`, expire/cancel the pass. |
| `type='refund'`, `event='payment.disputed'`         | Same as refund; store dispute fee separately in metadata; mark `status='refunded'` (or `disputed` if enum added).                                                   |
| `type='refund'`, `event='payment.dispute_reversed'` | Restore access/credits (`kind='topup_grant'` or `admin_adjustment`, key `gammal:restore:<notice_txn>`); set `status='finished'`.                                    |
| `type='refund'`, `event='payment.refund_failed'`    | Restore access/credits; set `status='finished'`.                                                                                                                    |
| `full=false`, `ratio` present                       | For credits: deduct `floor(credits * ratio)` (or treat as full removal if simpler). For passes: keep access if ratio < 1; document the rule.                        |

**Credit refunds and the non-negative wallet:** Kestrel's `grantCredits` clamps at zero. If a user consumed the credits and then refunds, the wallet cannot go negative, so the platform absorbs the difference. This is consistent with Kestrel's D5 invariant but is a real business cost. Refund policy should say credits are non-refundable once consumed, while still handling card-network disputes.

### 6.6 Environment / configuration

Do **not** overload `BILLING_PROVIDER` with a third value unless you also redesign its semantics. It currently means "the one provider for checkout" (`stripe | nowpayments | both`). Gammal is an _additional_ top-up/pass rail while Stripe remains the subscription provider. Recommended:

```bash
BILLING_GAMMAL_ENABLED=0
BILLING_GAMMAL_TOPUPS=1          # show Gammal on top-up packs
BILLING_GAMMAL_PASSES=0          # sell prepaid plan passes
GAMMAL_PROJECT_ID=               # public pid, e.g. 47
GAMMAL_API_BASE=https://api.gammal.tech
GAMMAL_PUBLIC_KEY_PEM=           # optional pin; otherwise fetch/cache
GAMMAL_CURRENCY=USD              # USD only for Phase 1/2
```

- No secret key. `GAMMAL_PROJECT_ID` is public but must match the webhook's `project_id`.
- `GAMMAL_PUBLIC_KEY_PEM` is optional; if unset, fetch `${GAMMAL_API_BASE}/token/public-key.php` and cache it (e.g. 24h, with one refetch on verification failure).
- Add these to `packages/shared/src/env.ts`, `.env.example`, and `docs/configuration.md`.

### 6.7 UI changes

- `BillingPlans` / `TopupPacks`: provider type becomes `'stripe' | 'nowpayments' | 'gammal'`; Gammal buttons should not require `stripePriceId`.
- Show a clear fee note: **“Card checkout adds an 8% provider service fee on top of the price.”** Gammal charges the customer `amount × 1.08`; Kestrel receives 85% of `amount`.
- For passes, replace “Upgrade” with **“Buy 30-day pass”** and show “No auto-renew”.
- Payment history already prints `payment.provider`; add a `gammal` label and show `gammal_txn` as the reference.
- Return page: a small server component at `/settings/billing/gammal/return` that handles `cancelled`, verifies the token, and shows “Payment confirmed — credits are being applied” with a link back. Do not grant from this page without verification.
- CSP: a payment-link redirect does **not** require allowing `api.gammal.tech` in `script-src`/`connect-src`. Only add it if you ever load the SDK (not recommended).

### 6.8 Cron / reconciliation

- **No provider lookup API**, so Kestrel cannot reconcile a missed Gammal webhook by polling. This is the biggest operational gap.
- Add a **pass expiry** job: set `subscriptions.status='expired'` where `provider='gammal'` and `currentPeriodEnd < now()`.
- Existing `billing-dlq` job covers Gammal DLQ entries once `provider='gammal'`.
- For missed webhooks, the only recovery is manual: Gammal Revenue Dashboard shows paid `txn`s; an admin can grant credits via the existing admin adjustment endpoint or replay a stored verified claim.
- Document this in the operator runbook.

### 6.9 Tests

Unit/integration (no real money):

- JWT verify: valid, expired, tampered, wrong alg, wrong key, wrong project, wrong amount, wrong currency, missing `txn`, refund vs payment type.
- Webhook dispatch: `X-Gammal-Event` branch, disabled flag → 404, invalid token → 401, replay → no-op, DLQ on processing failure.
- Service: top-up grant once; replay no-op; refund revokes; dispute revokes; `dispute_reversed`/`refund_failed` restores; partial ratio math; pass activation/expiry.
- DB: unique `gammal_txn`/`gammal_order_ref`; ledger idempotency; RLS tenant isolation.
- UI: return page `cancelled` and success branches with mocked verification.

E2E against Gammal is **not possible in CI**: there is no sandbox/test mode. Manual test options:

1. Smallest real international card payment, treat it as spent (refund costs more than earned).
2. Wallet payment (EGP) then refund — free, but wallet is not the recommended rail and requires a Gammal account.
3. `status=cancelled` path — free.

### 6.10 Effort estimate

| Phase   | Scope                                                                                              |                                                                                                     Estimate |
| ------- | -------------------------------------------------------------------------------------------------- | -----------------------------------------------------------------------------------------------------------: |
| Phase 1 | Top-ups only: migration, env, JWT verifier, link builder, webhook branch, service, UI, tests, docs |                                                                                             **2–3 dev days** |
| Phase 2 | Prepaid passes: pass activation, expiry cron, UI copy, refund/expiry behaviour                     |                                                                                            **+3–5 dev days** |
| Phase 3 | Recurring subscriptions                                                                            | **Not recommended**; 2–3 weeks of work would still leave manual cancellation/reconciliation and no proration |

Add 1–2 days for security review, docs, and a real-payment smoke test.

---

## 7. Economics

Using Kestrel's seeded prices (Starter $9, Pro $29, Scale $79; top-ups $4.99/$12.99/$39.99):

### 7.1 What Kestrel actually receives

| Sale | Customer pays (USD card) | Kestrel receives (85%) | Effective take |
| ---: | -----------------------: | ---------------------: | -------------: |
|   $9 |                    $9.72 |                  $7.65 |          21.3% |
|  $29 |                   $31.32 |                 $24.65 |          21.3% |
|  $79 |                   $85.32 |                 $67.15 |          21.3% |
| $100 |                  $108.00 |                 $85.00 |          21.3% |

Formula: `1 - 0.85 / 1.08 = 21.3%` of the customer's payment. The headline “15%” is not the effective rate because the 8% customer fee is added on top.

### 7.2 Refund cost (international card)

Gammal deducts the **full sale amount** + processing (~2.9% of customer charge + 0.30 USD) + 1 USD handling:

|         Sale | Kestrel received |           Refund deduction | Net after refund |
| -----------: | ---------------: | -------------------------: | ---------------: |
|           $9 |            $7.65 |   $9 + $0.58 + $1 = $10.58 |       **−$2.93** |
|          $29 |           $24.65 |  $29 + $1.21 + $1 = $31.21 |       **−$6.56** |
|          $79 |           $67.15 |  $79 + $2.77 + $1 = $82.77 |      **−$15.62** |
| $4.99 top-up |            $4.24 | $4.99 + $0.46 + $1 = $6.45 |       **−$2.21** |

A chargeback adds ~$15: a $29 sale becomes roughly **−$21.56**.

### 7.3 Withdrawals

- 14-day hold on card sales.
- Minimum $100.
- $5–20 flat fee: withdrawing $100 yields $80–95; withdrawing $200 yields $180–195.
- For a small operator, this is a meaningful friction and cash-flow cost.

### 7.4 Other rails

- **EGP card:** Kestrel keeps 60%; customer pays +2%; effective take **41.2%**. Not refundable through Gammal.
- **EGP wallet:** Kestrel keeps 25%; effective take **75%**. Not viable for a SaaS.
- **USD card is the only economically sensible rail** for Kestrel.

### 7.5 Comparison

Stripe’s standard card pricing is roughly 2.9% + $0.30 (varies by country), with tax tooling, subscriptions, customer portal, refunds, disputes, and reconciliation APIs. Gammal’s 21.3% effective take is **~7×** Stripe’s headline rate, before refund/chargeback costs. Gammal’s value is access to cards/wallets in markets where Stripe is unavailable, not cost.

---

## 8. Risks and blockers

### 8.1 Technical

| Risk                                            | Impact                                | Mitigation                                                                                                         |
| ----------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| No documented payment lookup/reconciliation API | Missed webhook = manual recovery only | Persist verified claims; dual return+webhook; admin runbook; accept manual reconciliation                          |
| 5-minute payment token lifetime                 | Webhook retries expire quickly        | Verify/persist immediately; return 200 after persisting; DLQ replay from stored claims                             |
| No webhook signature                            | Anyone can POST a body                | Verify RS256 JWT locally; validate `project_id`, `amount`, `currency`, `description`; never trust `X-Gammal-Event` |
| User-modifiable payment link                    | Amount/desc tampering                 | Compare verified claims to the local order; require order ref in `description`                                     |
| No test mode                                    | CI/E2E cannot test checkout           | Unit tests with signed fixtures; manual real-money smoke test                                                      |
| Provider-specific IDs                           | Schema/migration work                 | Add `gammal_*` columns + unique indexes; extend provider check                                                     |
| No subscription ID in webhook                   | Renewals hard to map/cancel           | Avoid recurring; use order ref in `description` for passes only                                                    |
| No refund API                                   | Refunds manual                        | Dashboard/PIN; document runbook; do not promise in-app refunds                                                     |
| Public key rotation                             | Verification failures                 | Cache + refetch on failure; optional pinned PEM env                                                                |

### 8.2 Operational

- Each self-host operator needs a Gammal account, identity verification, project, domain registration, payment callback URL, webhook URL, payments enabled, and payout bank details. This is a non-trivial onboarding checklist.
- Domain limits (4) and HTTPS-only mean staging/localhost cannot run real checkout.
- 14-day holds, $100 minimum, and $5–20 withdrawal fees complicate cash flow.
- No SLA/status page documented; support is email-based.
- Refunds/disputes are manual and time-sensitive (5-day dispute evidence window).

### 8.3 Commercial / legal

- **Personal merchant model:** one account per person, National ID verification, payouts to the verified name. A company/incorporated SaaS may not fit; confirm with Gammal.
- **Tax/VAT:** no documented tax calculation or VAT invoice API. For EU/UK B2B sales, this is likely a blocker; confirm merchant-of-record and invoicing obligations.
- **Consumer cancellation:** no self-service cancellation API. For EU/UK consumer subscriptions, manual cancellation is a compliance risk. This is another reason to avoid recurring subscriptions.
- **Refund policy:** international card refunds cost more than earned; EGP card payments are not refundable through Gammal. Publish a clear policy before enabling.
- **Data protection:** Gammal collects customer card/email data; Kestrel receives no PII. A DPA and data-residency review may be required for EU/UK customers.
- **Chargebacks:** $15 network fee can exceed the margin on small top-ups. Consider a minimum Gammal top-up amount (e.g. $19+) or restrict Gammal to higher-ticket packs.

---

## 9. Decision checklist

Before writing code, answer:

1. **Deployment model:** Is this a single operator running Kestrel for their own users, or a multi-operator open-source distribution? (Gammal account/domain per operator.)
2. **Seller identity:** Is the seller an individual who can complete Gammal's personal KYC, or a company? (Personal payout model.)
3. **Subscription requirement:** Do users need auto-renew, self-service cancel, upgrade/downgrade, and proration? If yes, Gammal cannot be the subscription provider.
4. **Market:** Are customers primarily in Egypt/MENA without access to Stripe? If yes, Gammal may be worth the fee; if not, Stripe is cheaper and more capable.
5. **Refund policy:** Can the operator handle manual refunds and disputes, including the “refund costs more than earned” case?
6. **Tax/invoicing:** Does the business need VAT invoices or merchant-of-record handling? If yes, confirm with Gammal before proceeding.
7. **Minimum ticket:** Will Gammal be limited to top-ups/passes above a minimum price to avoid chargeback losses?
8. **Reconciliation:** Can the operator monitor the Gammal dashboard and manually recover missed webhooks?

If the answers are “single operator, individual seller, one-time top-ups/passes, USD card, manual refunds acceptable”, integration is worthwhile. If any of “company seller, auto-renew, self-service cancel, VAT invoices, automated reconciliation” is required, Gammal is not the right primary provider.

---

## 10. Recommended next step

1. **Approve Phase 1 only:** Gammal as an optional one-time top-up provider, behind `BILLING_GAMMAL_ENABLED=0` by default.
2. Implement the migration, env contract, JWT verifier, link builder, webhook branch, service, UI, and tests described above.
3. Run a real-payment smoke test with the smallest acceptable USD card amount (treat it as spent) or a wallet payment + free refund.
4. Decide on Phase 2 (prepaid passes) only after the top-up flow has been operated for a full refund/dispute cycle.
5. Do not implement recurring Gammal subscriptions unless Gammal ships subscription retrieval/cancel APIs and a reconciliation endpoint.

---

## 11. References

- Gammal Tech full integration guide: <https://api.gammal.tech/llms.txt>
- Gammal Tech developer docs: <https://api.gammal.tech/doc/>
- Gammal Tech SDK: <https://api.gammal.tech/sdk-web.js> (v3.1.1)
- Gammal public key: <https://api.gammal.tech/token/public-key.php>
- Gammal verify endpoint: <https://api.gammal.tech/sdk/pay/link/verify.php>
- Kestrel billing plan: `docs/plans/kestrel-subscription-credit-billing-plan.md`
- Kestrel billing configuration: `docs/configuration.md` §Billing
- Kestrel billing architecture: `docs/architecture.md` §Subscription and credit billing
- Kestrel webhook safety notes: `docs/configuration.md` §Provider guardrails
