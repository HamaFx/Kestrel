# Gammal Tech — Kestrel Setup Guide

> **Status:** Implemented behind `BILLING_GAMMAL_ENABLED=0`.
> **Model:** one-time prepaid plan passes. No auto-renew, no stored card.
> **Provider docs:** <https://api.gammal.tech/llms.txt>

---

## 1. What is implemented

- Gammal hosted payment link for a paid plan.
- Local payment row (`provider='gammal'`) with a UUID order reference.
- Browser return page at `/settings/billing/gammal/return`.
- Webhook receiver at `POST /api/billing/webhook` (`X-Gammal-Event`).
- Local RS256 `payment_token` verification (no API key).
- Idempotent pass activation + `subscription_grant` credits.
- Refund/dispute notices revoke the pass and unused credits.
- `dispute_reversed` / `refund_failed` restore credits.
- Pass expiry cron via `/api/cron/billing-reconcile`.
- UI: plan cards show “Pay with Gammal”, prepaid-pass copy, and the 8% card fee note.

Not implemented yet:

- Gammal credit top-up packs (the existing Stripe/NOWPayments top-up flow is unchanged).
- Auto-renewing Gammal subscriptions.
- Admin refund button that calls Gammal (Gammal refunds are dashboard/PIN or email support).
- Gammal payment-status polling (Gammal has no lookup API; webhook + return page are the confirmation paths).

---

## 2. Gammal dashboard prerequisites

Before enabling the flag:

1. Register/verify the Gammal account with your National ID.
2. Create a project and note the **project ID (`pid`)**.
3. Add the Kestrel domain(s) under project settings.
   - HTTPS only.
   - `example.com` and `www.example.com` are separate domains.
   - Up to 4 domains.
4. Set the **Payment Callback URL** to:
   ```
   https://YOUR_DOMAIN/settings/billing/gammal/return
   ```
5. Set the **Webhook URL** to:
   ```
   https://YOUR_DOMAIN/api/billing/webhook
   ```
6. Turn **payments on** for the project.
7. Confirm the account is approved for card payments and note the payout bank details.

The Kestrel deployment must be publicly reachable over HTTPS. `localhost` does not work for login, payments, or webhooks.

---

## 3. Kestrel configuration

Add to `.env`:

```bash
BILLING_ENABLED=1
BILLING_GAMMAL_ENABLED=1
GAMMAL_PROJECT_ID=47
GAMMAL_API_BASE=https://api.gammal.tech
GAMMAL_CURRENCY=USD
GAMMAL_PASS_DAYS=30
# Optional: pin the public key to avoid runtime fetch.
GAMMAL_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
```

Notes:

- There is **no API key**. Do not add `GAMMAL_SECRET_KEY`.
- `GAMMAL_PROJECT_ID` is public; it is used in the payment link and checked against the token's `project_id`.
- `GAMMAL_CURRENCY` must stay `USD` for Kestrel plan pricing. Do not use EGP cards: they are not refundable through Gammal.
- `GAMMAL_PUBLIC_KEY_PEM` is optional. It accepts PEM with `\n` escapes or a single-line base64-encoded PEM. If omitted, Kestrel fetches `https://api.gammal.tech/token/public-key.php` and caches it for 24 hours.
- `GAMMAL_PASS_DAYS` is only a fallback; plan intervals map to 30/90/365 days.

Apply the migration:

```bash
pnpm --filter @kestrel/db migrate:apply
# or apply packages/db/drizzle/0106_gammal_billing.sql with your normal runner
```

Restart the web app and worker.

---

## 4. Pricing and fees

Gammal adds an **8% service fee on top** of the plan price for international cards:

| Plan | Customer pays | Kestrel receives (85%) |
| ---: | ------------: | ---------------------: |
|   $9 |         $9.72 |                  $7.65 |
|  $29 |        $31.32 |                 $24.65 |
|  $79 |        $85.32 |                 $67.15 |

Effective cost: **21.3%** of the customer's payment. Refunds cost more than the sale earned; EGP card payments are not refundable through Gammal. Keep the 8% note visible on plan cards.

---

## 5. Test on the sandbox

Gammal has **no test mode**; every payment is real money. Do not use a real card until the flow is verified.

Recommended free tests:

1. Open a Gammal payment link from Kestrel.
2. Close the hosted checkout without paying.
3. Confirm Kestrel returns `?status=cancelled` and shows “Payment cancelled”.
4. Confirm no pass/credits were granted.

For a real card test, use the smallest amount you can and treat it as spent. A refund on an international card costs the full price + processing + $1 handling.

Webhook test without money:

- Send a signed test token to `/api/billing/webhook` with `X-Gammal-Event: payment.success`.
- The token must be signed by Gammal's private key, so use a unit/integration fixture with a local test key, not a hand-written production token.

---

## 6. Expected pass lifecycle

1. User clicks **Pay with Gammal** on a plan.
2. Kestrel creates a local `payments` row (`status='waiting'`) with a UUID order ref.
3. Kestrel redirects to Gammal's hosted checkout.
4. User pays with a USD card.
5. Gammal redirects to `/settings/billing/gammal/return?payment=<uuid>&...&payment_token=...`.
6. Kestrel verifies the JWT, compares project/amount/currency, and activates the pass.
7. Gammal also POSTs the same payment token to `/api/billing/webhook`; the second path is a no-op.
8. Pass is active for 30/90/365 days; `currentPeriodEnd` is shown in billing.
9. Cron expires the pass after `currentPeriodEnd` and expires unused subscription credits.
10. User can buy another pass after expiry.

If the user closes the tab before returning, the webhook still activates the pass.

---

## 7. Refunds and disputes

Gammal refunds are **not** initiated from Kestrel. Use the Gammal Revenue Dashboard:

- Full refund: Payments → the payment → **Refund in full** → account PIN.
- Partial refund: email `support@gammal.tech` with the `txn` and amount.

When Gammal sends a refund notice:

- `payment.refunded` / `payment.disputed`: Kestrel marks the payment refunded, cancels the pass, and deducts granted credits (wallet clamps at zero).
- `payment.dispute_reversed` / `payment.refund_failed`: Kestrel restores the credits and reactivates the pass if its period has not ended.

The webhook is signed by Gammal; Kestrel verifies the token before acting. There is no separate refund webhook signature.

---

## 8. Monitoring

Watch:

- `billing_events` rows with `provider='gammal'`, `status='failed'`.
- `billing_webhook_dlq` rows with `provider='gammal'`.
- `payments` rows with `provider='gammal'`, `status='waiting'` older than a few minutes.
- Gammal Revenue Dashboard for paid `txn`s that never reached Kestrel.
- Pass expiry cron output at `/api/cron/billing-reconcile`.

Because Gammal has no payment lookup API, a missed webhook + missed return page requires manual reconciliation in the Gammal dashboard. The admin can grant credits via **Admin → Billing → Credit adjustment** or mark the pass active manually if needed.

---

## 9. Rollout checklist

- [ ] Gammal project created, domain/callback/webhook set, payments on.
- [ ] `BILLING_ENABLED=1`, `BILLING_GAMMAL_ENABLED=1`, `GAMMAL_PROJECT_ID` set.
- [ ] Migration `0106_gammal_billing.sql` applied.
- [ ] Public key available (env or fetched).
- [ ] Plan cards show “Pay with Gammal” and the 8% note.
- [ ] Cancelled checkout test passes.
- [ ] Small real payment activates the pass and grants credits.
- [ ] Pass appears in billing with the correct end date.
- [ ] Refund notice (or manual status check) revokes the pass.
- [ ] Expiry cron marks the pass `expired` after its end date.
- [ ] Operator knows refunds are manual and EGP cards are not refundable.

---

## 10. Troubleshooting

| Symptom                                      | Likely cause                                            | Fix                                               |
| -------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------- |
| “Gammal billing is not configured”           | `BILLING_GAMMAL_ENABLED` or `GAMMAL_PROJECT_ID` missing | Set both, restart                                 |
| Payment link says payments are unavailable   | Gammal payments off or callback URL missing             | Set callback URL + turn payments on               |
| Return page says “Could not confirm payment” | Token expired/invalid, or local payment ID mismatch     | Check webhook/DLQ, use Gammal dashboard `txn`     |
| Webhook returns 401                          | Invalid token signature/expiry                          | Check public key and clock; fetch key again       |
| Pass not active after payment                | Webhook/return processing failed                        | Check `billing_events`/DLQ; verify amount/project |
| Pass never expires                           | Cron not running or `cancelAtPeriodEnd` false           | Run `/api/cron/billing-reconcile`, check logs     |
| Credits not granted                          | Plan `monthlyCredits=0` or activation failed            | Check plan seed and `credit_ledger`               |
| User charged but no pass                     | Webhook missed and tab closed                           | Manually reconcile with Gammal dashboard          |

---

## 11. Files

| File                                                             | Purpose                                                                     |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `packages/db/drizzle/0106_gammal_billing.sql`                    | Provider constraint, Gammal columns/indexes, subscription provider backfill |
| `packages/db/src/schema/billing.ts`                              | Drizzle columns/indexes                                                     |
| `packages/shared/src/env.ts`                                     | Gammal env contract                                                         |
| `apps/web/src/lib/gammal.ts`                                     | Link builder, JWT verifier, public key cache                                |
| `apps/web/src/lib/services/gammal-billing.ts`                    | Checkout, activation, refunds, expiry                                       |
| `apps/web/src/app/api/billing/checkout/route.ts`                 | `provider: 'gammal'` branch                                                 |
| `apps/web/src/app/api/billing/webhook/route.ts`                  | Gammal dispatch + DLQ                                                       |
| `apps/web/src/app/(app)/settings/billing/gammal/return/page.tsx` | Return page                                                                 |
| `apps/web/src/app/(app)/settings/billing/_components/*`          | Pass UI                                                                     |
| `apps/web/src/app/api/cron/billing-reconcile/route.ts`           | Pass expiry                                                                 |
| `apps/web/test/gammal-token.test.ts`                             | Token/link tests                                                            |
| `apps/web/test/gammal-webhook.test.ts`                           | Webhook dispatch tests                                                      |
