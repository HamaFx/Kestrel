# Qi Payment Gateway × Kestrel — Setup & Integration Plan

> **Status:** Design + verified sandbox analysis — no production code changes.
> **Date:** 2026-10-20
> **Analysed against:** `Kestrel` @ `32a4ce26`
> **Provider:** QiCard Payment Gateway v2.0.4 (International Smart Card, Iraq)
> **Docs:** <https://developers-gate.qi.iq>
> **Scope:** One-time/prepaid plan access for Kestrel users in Iraq, with worldwide card acceptance and no auto-renewal requirement.

---

## 1. Decision summary

Qi is a **good fit** for Kestrel if the product is sold as a **prepaid pass**, not an auto-renewing subscription.

| Requirement                         | Qi fit                                                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Register a merchant account in Iraq | **Yes** — Qi is an Iraqi acquirer; merchant terminal required                                                    |
| Accept cards from outside Iraq      | **Likely yes** — Qi states worldwide Visa/Mastercard acceptance; confirm in writing                              |
| One-time payment for a 30-day pass  | **Excellent** — hosted checkout, 3DS, webhook, status API, refund API                                            |
| Auto-renewing subscription          | **Not documented** — token/recurrent fields exist in signature docs, but no subscription API. Do not rely on it. |
| Self-service cancel                 | **Not needed** — prepaid pass simply expires                                                                     |
| Reconciliation                      | **Excellent** — `GET /payment/{id}/status` and status-by-request                                                 |
| Refunds                             | **Good** — `POST /payment/{id}/refund`, full or partial                                                          |
| Test environment                    | **Excellent** — public sandbox credentials + test card                                                           |
| IQD-only currency                   | **Constraint** — Kestrel must convert USD plan prices to IQD                                                     |
| Fees                                | **Unknown** — not published; must be negotiated                                                                  |
| Individual vs company onboarding    | **Unknown** — ask Qi; likely trade licence/bank account required                                                 |

**Recommended model:** sell **30-day prepaid passes** (and optionally credit top-ups). On payment success, activate the plan for 30 days and grant the plan's monthly credits. At expiry, mark the subscription `expired` and expire unused subscription credits. The user buys again when they want another pass. No renewal, no stored card, no cancellation flow.

This removes Qi's only major product gap (subscription lifecycle) while keeping its strong payment API.

---

## 2. Verified sandbox results

I exercised the public Qi sandbox end-to-end on 2026-10-20. These are observed results, not just documentation claims.

### 2.1 Create payment

```http
POST https://uat-sandbox-3ds-api.qi.iq/api/v1/payment
Authorization: Basic <base64(username:password)>
X-Terminal-Id: 237984
Content-Type: application/json
```

Request:

```json
{
  "requestId": "4781e8d3-c26e-4fa2-bfb6-702580724f7c",
  "amount": 1000.0,
  "currency": "IQD",
  "locale": "en_US",
  "finishPaymentUrl": "https://merchant.example/finish",
  "notificationUrl": "https://merchant.example/webhook",
  "customerInfo": {
    "firstName": "Test",
    "lastName": "User",
    "email": "test@example.com",
    "phone": "009647700000000"
  },
  "additionalInfo": {
    "orderRef": "KS-TEST-2",
    "userId": "user-123",
    "kind": "pass"
  }
}
```

Response `200`:

```json
{
  "requestId": "4781e8d3-c26e-4fa2-bfb6-702580724f7c",
  "paymentId": "e411024f-317b-41ee-addc-c85db742b20c",
  "status": "CREATED",
  "canceled": false,
  "amount": 1000.0,
  "currency": "IQD",
  "creationDate": "2026-10-21T00:37:50",
  "formUrl": "https://uat-sandbox-3ds-api.qi.iq/api/v1/payment/e411024f-317b-41ee-addc-c85db742b20c",
  "withoutAuthenticate": false
}
```

### 2.2 Hosted payment form

- Loads at `formUrl`.
- Shows amount, merchant name, cardholder name, card number, CVC, expiry.
- Languages: English, Arabic, Kurdish; RTL supported.
- Test card: `5213720304238582`, CVV `642`, expiry `01/32`.
- Test 3DS OTP (if challenged): `123123`.
- Successful payment shows a receipt with masked PAN, transaction ID, date/time.

### 2.3 Return URL

Qi appends its own query parameters to `finishPaymentUrl`, preserving existing ones:

```
https://merchant.example/finish?order=KS-TEST-2
  &requestId=619a55df-2a8e-4c2b-9302-70aeaf7dd9f8
  &paymentId=bdefa497-f787-48bb-9b03-42e374f4a43f
  &paymentType=CARD
  &status=SUCCESS
```

**Do not grant access from this redirect.** Use it only to trigger a server-side status check and show UI. The webhook/status API is authoritative.

### 2.4 Webhook

Observed request:

```http
POST /webhook
X-Signature: <base64 RSA signature>
X-Terminal-Id: 237984
Content-Type: application/json
User-Agent: RightPayments/MerchantNotificationClient
```

```json
{
  "requestId": "619a55df-2a8e-4c2b-9302-70aeaf7dd9f8",
  "paymentId": "bdefa497-f787-48bb-9b03-42e374f4a43f",
  "status": "SUCCESS",
  "canceled": false,
  "amount": 1000.0,
  "confirmedAmount": 1000.0,
  "currency": "IQD",
  "paymentType": "CARD",
  "creationDate": "2026-10-20T21:41:00",
  "details": {
    "resultCode": "00",
    "rrn": "629400057543",
    "authId": "123456",
    "authDate": "2026-10-21T00:41:09",
    "maskedPan": "521372******8582",
    "paymentSystem": "MASTER_CARD"
  },
  "withoutAuthenticate": false,
  "additionalInfo": {
    "orderRef": "KS-TEST-2",
    "kind": "pass",
    "userId": "user-123"
  }
}
```

Observed facts:

- Webhook arrived ~5–20 seconds after payment.
- `additionalInfo` is echoed back intact.
- `X-Signature` and `X-Terminal-Id` are present.
- `amount` is formatted with three decimals in the webhook (`1000.000`).
- `creationDate` in the webhook is UTC; the create response is GMT+3. Use the **exact string from the webhook payload** when verifying the signature; do not normalise time zones.
- The signature covers only `paymentId|amount.000|currency|creationDate|status`. It does **not** cover `requestId`, `additionalInfo`, `details`, or `confirmedAmount`.
- Qi retries until it receives HTTP `200`.

### 2.5 Status, refund, cancel

| Operation                                    | Result                                                            |
| -------------------------------------------- | ----------------------------------------------------------------- |
| `GET /payment/{paymentId}/status`            | `200`, full payment object, includes `refunds` array after refund |
| `GET /payment/status/by/request/{requestId}` | `200`, same object; useful if `paymentId` was lost                |
| `POST /payment/{paymentId}/refund`           | `200`, `{ refundId, status: "SUCCESS", amount, ... }`             |
| `POST /payment/{paymentId}/cancel`           | `200`, `canceled: true` for unpaid payment                        |
| Refund webhook                               | **Not observed**; poll status or rely on the refund API response  |
| Cancel webhook                               | Not observed                                                      |

### 2.6 Sandbox constraints

| Test                       | Result                                                                    |
| -------------------------- | ------------------------------------------------------------------------- |
| `currency: "IQD"`          | Accepted                                                                  |
| `currency: "USD"`          | `403` — `Operation for USD currency is not allowed on terminal` (code 21) |
| `currency: "EUR"`          | `403` — same                                                              |
| Duplicate `requestId`      | `403` — `RequestId ... was already used` (code 5)                         |
| Missing public webhook key | Cannot verify `X-Signature`; request key from Qi support                  |

**Conclusion:** the sandbox terminal is IQD-only. Qi's public docs use IQD in every create-payment example. Treat IQD as the settlement/charge currency until Qi confirms otherwise in writing.

---

## 3. Product model: prepaid passes

### 3.1 Why not recurring subscriptions?

Qi documents payment, status, refund, and cancellation. It does **not** document:

- Subscription creation/retrieval/cancel
- A customer billing portal
- Proration or plan changes
- A subscription lifecycle webhook

The signature-based auth docs mention `recurrent` and `paymentToken` fields, and the OpenAPI has `PaymentTokenType` (`AUTH`, `NON_RECUR`, `UNAUTH`) and `PaymentData`. That suggests Qi's gateway can support token/recurrent charges, but the public v2 docs do not expose a tokenization/subscription API. Do not design around undocumented behaviour.

Since renewal is not necessary, the clean model is:

### 3.2 Pass rules

- A pass is a one-time purchase that grants plan features and credits for a fixed period.
- Default duration: **30 days** for `monthly`, **90 days** for `quarterly`, **365 days** for `yearly`.
- `cancelAtPeriodEnd = true` (semantically: no auto-renew).
- No stored card, no recurring charge, no cancellation.
- At expiry: `status = expired`, unused subscription credits expire.
- User can buy another pass after expiry.
- Do **not** allow buying a second pass while one is active (v1). This avoids double grants and proration. Show “Your pass is active until …”.
- Do not allow plan changes while active (v1). Upgrade after expiry.
- Top-up credit packs can remain separate and roll over.

### 3.3 What the user sees

- Plan card: `$29 ≈ 38,000 IQD · 30-day pass`.
- “One-time payment. No auto-renew.”
- After purchase: “Pro pass active until 20 Nov 2026.”
- After expiry: “Your pass ended. Buy another 30-day pass.”
- No “Manage billing” portal button for Qi passes.

---

## 4. Qi merchant onboarding in Iraq

### 4.1 Contact Qi

From Qi's merchant pages:

- Online payment gateway: <https://qi.iq/en/merchants/online-payment-gateway>
- Merchant contact: `qicard@qi.iq`
- Phone (outside Iraq): `009647716404444`
- Address: Karrada Street, Baghdad, Iraq

Ask for the **Online Payment Gateway / e-commerce merchant terminal**, not a POS terminal.

### 4.2 What to request in writing

Copy/paste this list into your first email:

1. Can an **individual developer** register, or is a registered Iraqi company/trade licence required?
2. What documents are required for onboarding (company registration, trade licence, bank account, authorised signatory, KYC)?
3. Production API base URL, terminal ID, Basic Auth username/password, and whether signature-based auth is recommended.
4. The **webhook RSA public key** (PEM) for `X-Signature` verification.
5. Full fee schedule: setup, monthly, percentage per transaction, fixed fee, refund fee, chargeback fee, settlement fee.
6. Settlement currency and cycle: IQD only? T+1? Which bank/account?
7. International card acceptance: which card schemes and issuing countries are supported? Any blocks on foreign-issued Visa/Mastercard? Are 3DS/SCA challenges mandatory?
8. Minimum/maximum payment amount and any per-terminal limits.
9. Refund policy and chargeback process, including timeframes and whether refund/chargeback webhooks exist.
10. Whether tokenization / merchant-initiated recurring charges (`recurrent`, `paymentToken`) are available to this terminal. (Future option only.)
11. Tax/VAT invoicing: does Qi issue a compliant invoice, or does Kestrel need to?
12. Sandbox vs production differences (currency, 3DS behaviour, webhook keys, limits).

### 4.3 Onboarding sequence

1. Submit merchant application / email Qi.
2. Provide company and bank documents.
3. Receive terminal ID + API credentials + production base URL.
4. Receive webhook public key.
5. Run a small live payment and refund.
6. Confirm settlement in the merchant account.
7. Enable Qi in Kestrel.

Do not build production checkout before steps 3–4 are confirmed. The sandbox is public, but production credentials are issued by Qi.

### 4.4 Individual vs company

This is the biggest non-technical risk. Qi is an Iraqi acquirer; merchant onboarding commonly requires a registered business and a bank account. A Reddit thread from Iraqi developers specifically asks whether an individual can register or a company is required; the public docs do not answer it. **Ask Qi before designing the business around it.** If you are a sole developer, consider registering a company or using a partner merchant.

---

## 5. Kestrel integration map

### 5.1 Qi objects → Kestrel

| Qi                                   | Kestrel                                                     |
| ------------------------------------ | ----------------------------------------------------------- |
| `requestId`                          | `payments.qi_request_id` (use the local payment UUID)       |
| `paymentId`                          | `payments.qi_payment_id` (unique)                           |
| `formUrl`                            | `billing_checkout_attempts.checkout_url` / return to client |
| `status`                             | `payments.status` + `payments.qi_status`                    |
| `amount` / `currency`                | `payments.qi_amount_iqd` / `currency='IQD'`                 |
| `details.maskedPan`, `rrn`, `authId` | `payments.ipn_payload` (audit only)                         |
| `refundId`                           | `payments.qi_refund_id`                                     |
| Paid pass                            | `subscriptions` row with `provider='qi'`                    |
| Credits                              | `credit_ledger` `subscription_grant`                        |
| Webhook retries                      | `billing_events` + `billing_webhook_dlq`                    |
| Reconciliation                       | `GET /payment/{id}/status` in `billing-reconcile` cron      |

### 5.2 Files to add/change

| File                                                         | Change                                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------ |
| `packages/db/drizzle/0106_qi_billing.sql`                    | Provider check, Qi columns, indexes, subscription provider         |
| `packages/db/src/schema/billing.ts`                          | Drizzle columns/indexes                                            |
| `packages/shared/src/env.ts`                                 | Qi env vars                                                        |
| `apps/web/src/lib/qi.ts`                                     | Qi REST client + webhook signature verification                    |
| `apps/web/src/lib/services/qi-billing.ts`                    | Activation, expiry, refund, reconciliation                         |
| `apps/web/src/app/api/billing/checkout/route.ts`             | `provider: 'qi'` branch for passes                                 |
| `apps/web/src/app/api/billing/topup/route.ts`                | Optional Qi top-up branch                                          |
| `apps/web/src/app/api/billing/webhook/route.ts`              | Qi dispatch + verification + DLQ                                   |
| `apps/web/src/app/(app)/settings/billing/qi/return/page.tsx` | Return page; triggers sync, never grants directly                  |
| `apps/web/src/app/(app)/settings/billing/*`                  | Pass copy, IQD price, disable active repurchase                    |
| `apps/web/src/app/api/cron/billing-reconcile/route.ts`       | Poll pending Qi payments + expire passes                           |
| `apps/web/src/app/api/admin/billing/qi/refund/route.ts`      | Admin refund endpoint                                              |
| `.env.example`, `docs/configuration.md`                      | Configuration documentation                                        |
| Tests                                                        | Client, signature, activation, expiry, refund, webhook, reconciler |

### 5.3 Schema migration

```sql
-- 0106_qi_billing.sql

-- 1. Allow provider = 'qi'
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_provider_check;
ALTER TABLE payments
  ADD CONSTRAINT payments_provider_check
  CHECK (provider IN ('nowpayments','stripe','manual','promo','gammal','qi'));

-- 2. Qi identifiers and amounts
ALTER TABLE payments ADD COLUMN IF NOT EXISTS qi_payment_id text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS qi_request_id text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS qi_refund_id text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS qi_status text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS qi_amount_iqd bigint;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS qi_fx_rate numeric(18,6);

CREATE UNIQUE INDEX IF NOT EXISTS payments_qi_payment_id_uk
  ON payments (qi_payment_id) WHERE qi_payment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_qi_request_id_uk
  ON payments (qi_request_id) WHERE qi_request_id IS NOT NULL;

-- 3. Subscription provider (backfill existing rows)
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider text;
UPDATE subscriptions SET provider = CASE
  WHEN stripe_subscription_id IS NOT NULL THEN 'stripe'
  WHEN nowpayments_recurring_id IS NOT NULL THEN 'nowpayments'
  ELSE 'manual'
END WHERE provider IS NULL;

-- 4. Optional: product id for top-up checkout attempts
ALTER TABLE billing_checkout_attempts
  ADD COLUMN IF NOT EXISTS product_id uuid
  REFERENCES credit_topup_products(id) ON DELETE RESTRICT;
```

Notes:

- `qi_amount_iqd` is a whole-dinar bigint. Charge integer IQD only. This avoids the signature/formatting ambiguity around fractional dinars.
- `qi_fx_rate` records the USD→IQD rate used at checkout for accounting.
- `payments.status` already has `waiting`, `finished`, `failed`, `expired`, `refunded`; map Qi statuses into those. Add `partially_refunded` later if needed.
- `billing_events` and `billing_webhook_dlq` are provider-agnostic; no schema change beyond using `provider='qi'`.

### 5.4 Environment

```bash
BILLING_QI_ENABLED=0
QI_API_BASE=https://uat-sandbox-3ds-api.qi.iq/api/v1
QI_TERMINAL_ID=
QI_USERNAME=
QI_PASSWORD=
QI_WEBHOOK_PUBLIC_KEY_PEM=
QI_IQD_PER_USD=1310
QI_IQD_ROUNDING=250
QI_PASS_DAYS=30
QI_REQUEST_TIMEOUT_MS=20000
```

- Sandbox values are public; production values are issued by Qi.
- `QI_PASSWORD` is a secret. Never expose it to the browser.
- `QI_WEBHOOK_PUBLIC_KEY_PEM` can be a multiline env value; if your env loader dislikes newlines, base64-encode it and decode at startup.
- `QI_API_BASE` must not default to sandbox in production. Add a startup guard: if `NODE_ENV=production` and `QI_API_BASE` contains `uat-sandbox`, refuse to start or log a fatal error.

---

## 6. Currency and FX

### 6.1 Conversion

Kestrel prices plans in USD cents. Qi charges IQD. Use an operator-configured rate:

```ts
const rate = env.QI_IQD_PER_USD; // e.g. 1310
const rawIqd = (plan.priceUsdCents / 100) * rate;
const rounding = env.QI_IQD_ROUNDING; // e.g. 250
const amountIqd = Math.max(rounding, Math.round(rawIqd / rounding) * rounding);
```

Example at `1310`:

| Plan    | USD | IQD (rounded to 250) |
| ------- | --: | -------------------: |
| Starter |  $9 |               11,750 |
| Pro     | $29 |               38,000 |
| Scale   | $79 |              103,500 |

- Store `qi_amount_iqd`, `qi_fx_rate`, and `usd_amount_cents` on the payment.
- Display `$29 ≈ 38,000 IQD` on the plan card before checkout.
- If the rate changes, update the env and redeploy; existing passes are unaffected.
- Review the rate at least monthly, or fetch the CBI rate daily and cache it. A fixed env is simpler and auditable.
- Do not use a market FX API without a fallback; checkout must not fail because an FX provider is down.

### 6.2 Fees

Qi's fees are not published. Once you have the contract, add:

```bash
QI_FEE_PERCENT=0
QI_FEE_FIXED_IQD=0
```

Use these only for **reporting/net revenue**, not for charging the customer. The create-payment `amount` is the total the customer pays; Qi's merchant fee is presumably deducted at settlement. Confirm this in writing.

### 6.3 Refunds

- Refund the full `qi_amount_iqd` via Qi's refund API.
- Mark Kestrel payment `refunded`, revoke the pass and unused credits.
- Qi's status API returns a `refunds` array; use it for reconciliation.
- Do not promise instant refunds; card refunds can take days depending on the issuer.
- Partial refunds: Qi supports them, but v1 should expose **full refunds only** in the admin UI. Partial refunds complicate pass/credit revocation.

---

## 7. Qi REST client design

Create `apps/web/src/lib/qi.ts`.

### 7.1 Types

```ts
export interface QiPayment {
  requestId: string;
  paymentId: string;
  status:
    | 'CREATED'
    | 'FORM_SHOWED'
    | 'AUTHENTICATION_REQUIRED'
    | 'SUCCESS'
    | 'FAILED'
    | 'ERROR'
    | 'EXPIRED'
    | string;
  canceled: boolean;
  amount: number;
  confirmedAmount?: number;
  currency: string;
  paymentType?: string;
  creationDate: string;
  formUrl?: string;
  details?: {
    resultCode?: string;
    rrn?: string;
    authId?: string;
    authDate?: string;
    maskedPan?: string;
    paymentSystem?: string;
  };
  refunds?: QiRefund[];
  additionalInfo?: Record<string, string>;
}

export interface QiRefund {
  refundId: string;
  requestId: string;
  status: 'SUCCESS' | 'FAILED' | 'PROCESSING' | string;
  paymentId: string;
  amount: number;
  currency: string;
  creationDate: string;
}
```

### 7.2 Client

```ts
const auth = `Basic ${Buffer.from(`${env.QI_USERNAME}:${env.QI_PASSWORD}`).toString('base64')}`;

async function qiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${env.QI_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: auth,
      'X-Terminal-Id': env.QI_TERMINAL_ID,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(env.QI_REQUEST_TIMEOUT_MS),
  });
  return res;
}

export async function createQiPayment(input: {
  requestId: string;
  amountIqd: number;
  locale?: string;
  finishPaymentUrl: string;
  notificationUrl: string;
  customerInfo?: Record<string, string>;
  additionalInfo?: Record<string, string>;
}): Promise<QiPayment> {
  const res = await qiFetch('/payment', {
    method: 'POST',
    body: JSON.stringify({
      requestId: input.requestId,
      amount: input.amountIqd, // integer IQD
      currency: 'IQD',
      locale: input.locale ?? 'en_US',
      finishPaymentUrl: input.finishPaymentUrl,
      notificationUrl: input.notificationUrl,
      ...(input.customerInfo ? { customerInfo: input.customerInfo } : {}),
      ...(input.additionalInfo ? { additionalInfo: input.additionalInfo } : {}),
    }),
  });
  if (!res.ok) throw new QiApiError(res.status, await res.text());
  return res.json();
}

export async function getQiPayment(paymentId: string): Promise<QiPayment> {
  const res = await qiFetch(`/payment/${paymentId}/status`);
  if (!res.ok) throw new QiApiError(res.status, await res.text());
  return res.json();
}

export async function getQiPaymentByRequest(requestId: string): Promise<QiPayment> {
  const res = await qiFetch(`/payment/status/by/request/${requestId}`);
  if (!res.ok) throw new QiApiError(res.status, await res.text());
  return res.json();
}

export async function refundQiPayment(input: {
  paymentId: string;
  requestId: string;
  amountIqd: number;
  message?: string;
}): Promise<QiRefund> {
  const res = await qiFetch(`/payment/${input.paymentId}/refund`, {
    method: 'POST',
    body: JSON.stringify({
      requestId: input.requestId,
      amount: input.amountIqd,
      ...(input.message ? { message: input.message } : {}),
    }),
  });
  if (!res.ok) throw new QiApiError(res.status, await res.text());
  return res.json();
}

export async function cancelQiPayment(input: {
  paymentId: string;
  requestId: string;
  amountIqd?: number;
}): Promise<QiPayment> {
  const res = await qiFetch(`/payment/${input.paymentId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({
      requestId: input.requestId,
      ...(input.amountIqd ? { amount: input.amountIqd } : {}),
    }),
  });
  if (!res.ok) throw new QiApiError(res.status, await res.text());
  return res.json();
}
```

### 7.3 Retry / recovery rules

- `GET` status: safe to retry.
- `POST /payment`: never retry blindly with a new `requestId`. If the network times out:
  1. Call `GET /payment/status/by/request/{requestId}`.
  2. If found, persist the `paymentId`/`formUrl`.
  3. If not found (`404`/`PAYMENT_NOT_FOUND`), retry create with the **same** `requestId` only if Qi confirms it was not accepted. Otherwise, generate a new requestId and a new local payment row.
- `POST /refund`: unique `requestId`; if timeout, call status and inspect the `refunds` array before retrying.
- `POST /cancel`: same pattern.

### 7.4 Error mapping

| Qi HTTP | Qi code                                           | Kestrel action                                                |
| ------- | ------------------------------------------------- | ------------------------------------------------------------- |
| 401/403 | 27 `BAD_CREDENTIALS`                              | Fail checkout; alert operator; do not retry                   |
| 403     | 21 `VALIDATION_ERROR`                             | Usually currency/amount not allowed; show configuration error |
| 403     | 5 `CAN_NOT_PROCESS_REQUEST` (duplicate requestId) | Recover via status-by-request                                 |
| 403     | 18 `REFUNDS_NOT_ALLOWED`                          | Mark refund failed; show reason                               |
| 404     | 12 `PAYMENT_NOT_FOUND`                            | Treat as not created; retry with same ID or new               |
| 5xx     | 23/24                                             | Retry GET; for POST recover via status                        |

Do not expose raw Qi error bodies to users; log them with the local payment ID.

---

## 8. Checkout flow (pass)

```
User clicks "Buy 30-day Pro pass"
  │
  ├─ POST /api/billing/checkout { planId, provider: 'qi' }
  │    ├─ validate BILLING_QI_ENABLED, plan, no active Qi pass
  │    ├─ insert payments row:
  │    │    provider='qi', status='waiting',
  │    │    qi_request_id=<local payment UUID>,
  │    │    qi_amount_iqd=<converted>, qi_fx_rate=<rate>,
  │    │    usd_amount_cents=<plan price>,
  │    │    ipn_payload={kind:'pass', planId, userId, tenantId}
  │    ├─ create Qi payment with requestId=<local payment UUID>
  │    ├─ update payment: qi_payment_id, qi_status='CREATED'
  │    └─ return { checkoutUrl: formUrl, paymentId }
  │
  ├─ browser redirects to Qi hosted form
  │    └─ card + 3DS
  │
  ├─ Qi redirects to /settings/billing/qi/return?payment=<local id>&status=SUCCESS
  │    └─ server calls syncQiPayment(localPaymentId) (status API)
  │         └─ if SUCCESS, activate pass (idempotent)
  │
  └─ Qi webhook POST /api/billing/webhook
       └─ verify signature, sync payment, activate pass (idempotent)
```

### 8.1 Local payment row

Reuse `payments`:

```ts
{
  tenantId,
  subscriptionId: null, // set on activation
  provider: 'qi',
  status: 'waiting',
  qiRequestId: paymentId,       // local UUID, also Qi requestId
  qiAmountIqd: amountIqd,
  qiFxRate: rate,
  usdAmountCents: plan.priceUsdCents,
  ipnPayload: { kind: 'pass', planId, userId, tenantId, fxRate: rate },
}
```

Why use the local payment UUID as `requestId`: it is unique per terminal, <= 36 chars, and lets the webhook/status lookup bind directly to the local row without parsing `description` or trusting `additionalInfo`.

### 8.2 Idempotency claim

Use `billing_checkout_attempts`:

- `tenantId`
- `idempotencyKey` from the client header
- `planId`
- `status='pending'` → `provider_created`
- `invoiceId = requestId`
- `checkoutUrl = formUrl`
- `processingToken` / `processingAt` lease

This prevents duplicate Qi payments if the user double-clicks or retries. For top-ups, add `productId` to the attempt row or use a separate `qi_checkout_attempts` table; v1 pass-only is simpler.

### 8.3 No active pass

Before creating a payment:

```ts
const sub = await getUserSubscription(userId);
if (sub && sub.status === 'active' && sub.provider === 'qi' && sub.currentPeriodEnd > now) {
  return 409 { code: 'PASS_ACTIVE', message: `Your pass is active until ${date}.` }
}
```

Allow purchase if the previous pass is `expired`, `canceled`, or `currentPeriodEnd <= now` (and let the expiry cron catch up).

---

## 9. Return page

Route: `apps/web/src/app/(app)/settings/billing/qi/return/page.tsx`

Server component:

1. Read `payment` (local payment ID) and `status` from the query.
2. If `status !== 'SUCCESS'` or missing: show “Payment was not completed. You can try again.” Do not activate.
3. Load the local payment; verify tenant ownership.
4. Call `syncQiPayment(localPaymentId)`:
   - If `qi_payment_id` exists → `GET /payment/{id}/status`.
   - Else → `GET /payment/status/by/request/{qi_request_id}`.
5. If verified `SUCCESS`, call the same `activateQiPass()` used by the webhook (idempotent).
6. Show success or “Payment received, activation is pending” with a link to billing.

**Never** activate from `?status=SUCCESS`. The query string is user-controlled. The status API response is authoritative.

The return page gives immediate UX; the webhook guarantees delivery if the user closes the tab.

---

## 10. Webhook handler

### 10.1 Dispatch

`POST /api/billing/webhook` currently dispatches on:

1. `Stripe-Signature`
2. `x-nowpayments-sig`

Add Qi **before** the NOWPayments fallback, or after Stripe:

```ts
const qiSignature = req.headers.get('x-signature');
const qiTerminal = req.headers.get('x-terminal-id');
if (qiSignature && qiTerminal) {
  return handleQiWebhook(req, rawBody, qiSignature, qiTerminal);
}
```

Why this order: Qi uses `x-signature` + `x-terminal-id`; Stripe uses `stripe-signature`; NOWPayments uses `x-nowpayments-sig`. No collision.

### 10.2 Verification

```ts
import { createVerify } from 'node:crypto';

export function verifyQiWebhook(input: {
  rawBody: string;
  signature: string;
  publicKeyPem: string;
  terminalId: string;
  expectedTerminalId: string;
}): QiPayment {
  if (input.terminalId !== input.expectedTerminalId) {
    throw new Error('Qi terminal mismatch');
  }
  const payload = JSON.parse(input.rawBody) as QiPayment;
  const data = [
    payload.paymentId,
    Number(payload.amount).toFixed(3),
    payload.currency,
    payload.creationDate,
    payload.status,
  ].join('|');

  const verifier = createVerify('sha256');
  verifier.update(data);
  verifier.end();
  const ok = verifier.verify(input.publicKeyPem, Buffer.from(input.signature, 'base64'));
  if (!ok) throw new Error('Invalid Qi webhook signature');
  return payload;
}
```

Important:

- Use the **raw** amount/creationDate/status values from the webhook. Do not re-format `creationDate` to a Date.
- `Number(amount).toFixed(3)` works for whole IQD and 3-decimal values. For `2500` → `2500.000`.
- The signature does **not** cover `requestId`, `additionalInfo`, `details`, or `confirmedAmount`. Use them only as hints; look up the local payment by `paymentId`/`requestId` and validate `amount`/`currency` against the DB.
- If the public key is missing, return `500` (misconfigured) and alert; do not process unverified payloads.

### 10.3 Processing

```ts
const claim = await claimBillingEvent({
  provider: 'qi',
  eventId: `${payload.paymentId}:${payload.status}`,
  eventType: payload.status,
  payload,
});
if (claim.kind === 'processed' || claim.kind === 'in_progress') return 200;

try {
  await syncQiPaymentByPayload(payload); // find local payment, validate, activate/refund
  await markBillingEventProcessed(claim.id);
} catch (err) {
  await markBillingEventFailed(claim.id, String(err));
  await recordBillingWebhookFailure({
    provider: 'qi',
    eventType: payload.status,
    eventId: payload.paymentId,
    payload,
    error: String(err),
  });
}
return 200; // Qi retries until 200; status API is the safety net
```

Why `eventId = paymentId:status`: Qi may send multiple lifecycle statuses; each status is a distinct event. The ledger idempotency (`qi:pass:<paymentId>`) prevents double grants even if two events race.

### 10.4 Validation rules

- `X-Terminal-Id` must equal `QI_TERMINAL_ID`.
- `currency` must be `IQD`.
- `amount` must equal `payments.qi_amount_iqd`.
- `requestId` must equal `payments.qi_request_id`.
- If `payments.qi_payment_id` is already set, it must equal the payload `paymentId`.
- `status` must be one of `SUCCESS`, `FAILED`, `ERROR`, `EXPIRED`.
- Reject `canceled: true` with `SUCCESS` (should not happen) and log.

---

## 11. Activation, expiry, refunds

### 11.1 Activate pass

`activateQiPass(localPaymentId)`:

1. Load payment `FOR UPDATE` (or use a serializable transaction) with tenant scope.
2. If `payment.status === 'finished'`, return idempotently.
3. Validate Qi status = `SUCCESS`, amount/currency match.
4. `withTenantDbFresh(tenantId)`:
   - If no active subscription: insert `subscriptions` row:
     - `tenantId`, `planId`, `status='active'`, `provider='qi'`
     - `currentPeriodStart = now`
     - `currentPeriodEnd = addDays(now, QI_PASS_DAYS)` (or plan-specific)
     - `cancelAtPeriodEnd = true`
     - `trialEnd = null`
   - If an existing active pass exists (race), extend from `max(now, currentPeriodEnd)` by the pass duration.
   - Grant credits:
     - `kind='subscription_grant'`
     - `amountCredits = plan.monthlyCredits`
     - `idempotencyKey = sub:${subscription.id}:${periodStart.toISOString().slice(0,10)}`
     - `referenceType='subscription'`, `referenceId=subscription.id`
     - `metadata={ plan, periodStart, provider:'qi', paymentId }`
   - Update payment:
     - `subscriptionId`, `status='finished'`, `qiStatus='SUCCESS'`, `creditsGranted`, `ipnPayload=verified payload`
5. Commit.
6. Optional: send receipt email (Kestrel's own email, not Qi's).

`ensureMonthlyGrant` uses the same `sub:<id>:<YYYY-MM-DD>` key. If activation already granted, the lazy path no-ops. If activation fails after the Qi payment succeeded, the webhook retry or reconciler can complete it.

### 11.2 Expire pass

Cron `billing-reconcile` (or a new `qi-pass-expiry` job), every 15–60 minutes:

```ts
const expired = await db.select(...).from(subscriptions).where(and(
  eq(subscriptions.provider, 'qi'),
  eq(subscriptions.status, 'active'),
  lt(subscriptions.currentPeriodEnd, now),
));
for (const sub of expired) {
  await withTenantDbFresh(sub.tenantId, async () => {
    // Expire unused subscription credits (D4: no rollover).
    await expireUnusedSubscriptionGrant({
      userId,
      tenantId: sub.tenantId,
      subscriptionId: sub.id,
      newPeriodStart: sub.currentPeriodEnd!, // expires the current grant
    });
    await db.update(subscriptions).set({
      status: 'expired',
      cancelAtPeriodEnd: false,
      updatedAt: new Date(),
    }).where(eq(subscriptions.id, sub.id));
  });
}
```

Why this is required: `getEntitlementSnapshot` treats any `active`/`trialing` subscription as entitled, regardless of `currentPeriodEnd`. Without the cron, a Qi pass would never expire and the user would keep plan features forever. `ensureMonthlyGrant` also treats `status='active'` as entitled. The cron is the source of expiry.

Also add a defensive check in `getEntitlementSnapshot`/`isSubscriptionActive`: if `currentPeriodEnd < now`, treat as expired. This is a global improvement but may affect Stripe if its webhook is late; keep the cron as the primary mechanism and consider the guard separately.

### 11.3 Refund

Admin endpoint `POST /api/admin/billing/qi/refund`:

```json
{ "paymentId": "<local uuid>", "reason": "customer request" }
```

Flow:

1. Admin auth + audit log.
2. Load payment; require `provider='qi'`, `status='finished'`, `qi_payment_id`.
3. Call `refundQiPayment({ paymentId: qiPaymentId, requestId: randomUUID(), amountIqd: qiAmountIqd, message: reason })`.
4. On `SUCCESS`:
   - `withTenantDbFresh(tenantId)`:
     - Grant negative credits: `kind='refund'`, `amountCredits=-payment.creditsGranted`, `idempotencyKey='qi:refund:<refundId>'`.
     - Update payment: `status='refunded'`, `qi_refund_id`, `qi_status='REFUNDED'`.
     - If subscription: `status='canceled'`, `canceledAt=now`, `cancelAtPeriodEnd=false`.
     - Expire unused subscription credits (optional; negative grant may already zero the wallet).
   - Record admin audit.
5. On `FAILED`/timeout: mark refund failed; reconcile via status API; do not grant negative credits.

Wallet balance is non-negative; if the user consumed credits, the refund may only zero the wallet. That is consistent with Kestrel's D5 invariant. Publish a refund policy: unused credits refundable, consumed credits not.

### 11.4 Cancel unpaid checkout

If the user abandons the Qi form:

- Do not cancel immediately; Qi payments can be `CREATED`/`FORM_SHOWED`.
- After 30–60 minutes, the reconciler may call `cancelQiPayment` and mark local `expired`.
- Or leave it; Qi expires unpaid payments eventually. Confirm Qi's expiry window.

---

## 12. Reconciliation cron

Qi has a status API, so Kestrel can repair missed webhooks — unlike Gammal.

Extend `GET /api/cron/billing-reconcile`:

```ts
// 1. Sync pending Qi payments older than 5 minutes
const pending = await db
  .select()
  .from(payments)
  .where(
    and(
      eq(payments.provider, 'qi'),
      inArray(payments.status, ['waiting']),
      lt(payments.createdAt, new Date(Date.now() - 5 * 60_000)),
    ),
  )
  .limit(100);

for (const p of pending) {
  const remote = p.qiPaymentId
    ? await getQiPayment(p.qiPaymentId)
    : await getQiPaymentByRequest(p.qiRequestId!);
  await syncQiPaymentByPayload(remote);
}

// 2. Expire Qi passes past currentPeriodEnd
// 3. Optionally reconcile refunds by reading `refunds` from status
```

Run every 5–10 minutes for pending payments, hourly for expiry. Store the last sync error in `payments.ipn_payload` or a dedicated `qi_last_sync_error` column if needed.

### 12.1 What can go wrong

| Failure                                         | Recovery                                                    |
| ----------------------------------------------- | ----------------------------------------------------------- |
| Webhook lost                                    | Cron status poll                                            |
| Webhook arrives before local payment row commit | Retry via status; local row lookup by `requestId`           |
| Create payment timeout                          | Status-by-request                                           |
| Activation crashes after Qi success             | Webhook retry / cron sees `SUCCESS`, activates idempotently |
| Refund response lost                            | Status API `refunds` array                                  |
| Qi outage                                       | Checkout fails gracefully; pending payments reconcile later |
| Public key rotated                              | Update env; alert on signature failures                     |

---

## 13. UI changes

### 13.1 Plan cards

- Show USD and IQD: `$29 ≈ 38,000 IQD`.
- Label: `30-day pass`.
- Subtext: `One-time payment. No auto-renew.`
- Disable purchase if an active Qi pass exists; show `Active until <date>`.
- If Qi is the only provider, hide Stripe-specific “Manage billing” and “Stripe price not configured” messages.

### 13.2 Subscription status

- Replace “Next billing date” with “Pass ends”.
- Replace “Subscription cancels at the end of this period” with “This is a prepaid pass. It will not renew.”
- Hide the “Manage billing” button for `provider='qi'`.
- Show “Buy another pass” after expiry.

### 13.3 Wallet card

- Replace “renews” with “pass ends” for Qi.
- Keep credit balance and expiry separate.

### 13.4 Payment history

- Provider label `qi`.
- Amount: `38,000 IQD` and `$29.00`.
- Reference: `paymentId` (shortened).
- Status: `finished`, `refunded`, `expired`.

### 13.5 Checkout errors

- Qi unavailable: “Card payment is temporarily unavailable. Try again or contact support.”
- Currency/config error: “Payment is not configured for this plan. Contact support.”
- Duplicate/pending: “You already have a payment in progress. Complete it or wait a few minutes.”

---

## 14. Security and compliance

- **PCI:** card data is entered on Qi's hosted page; Kestrel never sees PAN/CVV. Keep it that way. Do not build a custom card form.
- **Secrets:** `QI_USERNAME`/`QI_PASSWORD` are server-only. Never include them in client bundles or logs.
- **Webhook:** verify RSA signature and terminal ID; validate amount/currency/requestId against the DB; return 200 only after persisting the event.
- **Return URL:** never trust `status`; use status API.
- **Replay:** `billing_events` unique `(provider,eventId)`; ledger idempotency keys.
- **SSRF:** only call the configured `QI_API_BASE`; do not accept URLs from users.
- **Logging:** log `paymentId`, `requestId`, status, and error codes; never log Basic auth or full card data (Qi never sends PAN).
- **Data minimisation:** `customerInfo` is optional; send only what is needed (name/email) or omit it.
- **Tax/invoicing:** confirm whether Qi provides a compliant receipt/invoice. If not, Kestrel must issue its own.
- **Consumer terms:** prepaid pass, no auto-renew, clear expiry, refund policy.
- **Chargebacks:** confirm Qi's process and fees. Kestrel needs an admin runbook and evidence export.

---

## 15. Testing plan

### 15.1 Unit

- FX conversion and rounding.
- Qi status mapping.
- Webhook signature: valid, invalid, wrong terminal, tampered amount, wrong creationDate.
- Amount formatting: integer IQD, `.000` string.
- Checkout idempotency: same requestId returns existing form; duplicate requestId recovery.
- Activation: grants once, replay no-op, race between webhook and return.
- Expiry: unused credits expired, status expired, free tier restored.
- Refund: negative ledger, pass canceled, replay no-op.
- Reconciler: pending → success; pending → failed; no duplicate grant.

### 15.2 Sandbox E2E (verified)

Use the public sandbox credentials and test card:

```bash
# Create payment
curl -X POST "$QI_API_BASE/payment" \
  -H "Authorization: Basic $QI_BASIC" \
  -H "X-Terminal-Id: $QI_TERMINAL" \
  -H "Content-Type: application/json" \
  -d '{"requestId":"<uuid>","amount":1000.00,"currency":"IQD","finishPaymentUrl":"https://example.com/finish","notificationUrl":"https://example.com/webhook"}'
```

Then open `formUrl`, pay with `5213720304238582` / `642` / `01/32`, and verify:

- Return URL has `status=SUCCESS`.
- Webhook POST arrives; `X-Signature` present.
- Status API returns `SUCCESS`.
- Refund API returns `SUCCESS`; status API includes `refunds`.
- Cancel API works on an unpaid payment.

### 15.3 Production smoke

- Create the smallest allowed live payment (e.g. 1,000 IQD).
- Pay with a real card; verify webhook signature.
- Verify pass activation and credits.
- Refund it; verify status and ledger.
- Confirm settlement in the Qi merchant account.
- Only then enable for all users.

### 15.4 What cannot be tested in CI

- Real card/3DS flows (sandbox test card is public, but CI should not depend on Qi uptime).
- Production webhook key.
- Settlement and chargebacks.
  Use recorded fixtures and a mock Qi server for CI.

---

## 16. Rollout plan

| Phase | Work                                                            | Exit criteria                                       |
| ----- | --------------------------------------------------------------- | --------------------------------------------------- |
| 0     | Qi merchant application, documents, fee/settlement confirmation | Terminal + production creds + public key            |
| 1     | Migration, env, Qi client, signature verifier, tests            | Sandbox create/status/webhook/refund pass           |
| 2     | Pass activation, expiry cron, UI, return page                   | Sandbox E2E; pass expires correctly                 |
| 3     | Production small payment + refund                               | Webhook verified; credits/pass correct              |
| 4     | Enable one plan; monitor 1 week                                 | No pending payments > 10 min; no signature failures |
| 5     | Enable all plans; optional top-ups                              | Stable                                              |

**Rollback:** set `BILLING_QI_ENABLED=0`. Existing passes continue until expiry; new checkouts are disabled. Do not delete Qi payments; they are audit records.

---

## 17. Effort estimate

| Work                                     |         Estimate |
| ---------------------------------------- | ---------------: |
| Migration + env + Qi client + signature  |         1–2 days |
| Checkout + return + webhook + activation |         1–2 days |
| Expiry cron + reconciler + refund admin  |            1 day |
| UI copy + IQD pricing + pass state       |            1 day |
| Tests + sandbox E2E + docs               |         1–2 days |
| **Total**                                | **5–8 dev days** |

External onboarding (Qi) is the long pole: allow 1–3 weeks for merchant approval, credentials, and public key.

---

## 18. Open questions for Qi

1. Can an individual register, or is a registered company/trade licence required?
2. What documents and bank account are required?
3. Production base URL, terminal ID, Basic Auth credentials, and signature-auth option?
4. Webhook RSA public key (PEM)?
5. Full fee schedule (setup, monthly, %, fixed, refund, chargeback, settlement).
6. Settlement currency/cycle: IQD only? T+1? Which bank?
7. International cards: which schemes/countries? Any restrictions on foreign-issued Visa/Mastercard?
8. Are 3DS/SCA challenges mandatory for all cards? Any exemptions?
9. Minimum/maximum amount and per-terminal limits?
10. Refund and chargeback process/timeframes; are there refund/chargeback webhooks?
11. Is tokenization/merchant-initiated recurring (`recurrent`, `paymentToken`) available? If yes, document the flow.
12. Tax/VAT invoice: who issues it?
13. Sandbox vs production differences.
14. Does Qi support SuperQi wallet on the **web hosted form**, or only mobile SDK? (Docs show SDK only.)

---

## 19. Bottom line

- **Qi is the right provider for Iraq + one-time card payments.** The sandbox is real, the API is clean, and the status/refund/reconciliation surface is far better than Gammal.
- **Sell prepaid 30-day passes**, not auto-renewing subscriptions. This matches your “renewal not necessary” requirement and avoids Qi's undocumented subscription lifecycle.
- **Convert USD plan prices to IQD** with an operator-configured rate; charge whole dinars.
- **Require Qi's public key** and verify every webhook; never trust the return URL.
- **Add an expiry cron** — without it, an `active` pass never expires in Kestrel's entitlement model.
- **Confirm merchant eligibility, fees, settlement, international card support, and invoice/tax** with Qi before writing production code.

---

## 20. References

- Qi developer portal: <https://developers-gate.qi.iq>
- Qi introduction: <https://developers-gate.qi.iq/docs/getting-started/payment-gateway-intro>
- Qi create payment: <https://developers-gate.qi.iq/docs/api-endpoints/create-payment>
- Qi status: <https://developers-gate.qi.iq/docs/api-endpoints/get-payment-status>
- Qi refund: <https://developers-gate.qi.iq/docs/api-endpoints/refund-payment>
- Qi cancel: <https://developers-gate.qi.iq/docs/api-endpoints/cancel-payment>
- Qi webhooks: <https://developers-gate.qi.iq/docs/webhook-guide/webhook-setup>
- Qi webhook verification: <https://developers-gate.qi.iq/docs/webhook-guide/message-verification>
- Qi sandbox: <https://developers-gate.qi.iq/docs/api-auth/sandbox-test>
- Qi signature auth: <https://developers-gate.qi.iq/docs/api-auth/signature-based>
- Qi merchant page: <https://qi.iq/en/merchants/online-payment-gateway>
- Kestrel billing plan: `docs/plans/kestrel-subscription-credit-billing-plan.md`
- Kestrel billing configuration: `docs/configuration.md` §Billing
- Kestrel architecture: `docs/architecture.md` §Subscription and credit billing
