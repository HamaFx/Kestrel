# Security Policy

## Reporting Vulnerabilities

This is a private repository. Report any suspected security vulnerability via
[GitHub Private Vulnerability Reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability).

Do **not** report vulnerabilities via public channels or issues.

## Response Target

We aim to triage and acknowledge security disclosures promptly and provide fixes directly on `main`.

## Billing webhook trust boundary

`POST /api/billing/webhook` is unauthenticated by session. Stripe deliveries
must verify `Stripe-Signature` over the raw body with `STRIPE_WEBHOOK_SECRET`;
`NOWPAYMENTS_IPN_SECRET`. Never parse or trust the JSON body before signature
verification. Authenticated events are claimed in `billing_events` /
`ipn_events`; failures are persisted to `billing_webhook_dlq` and replayed only
by an admin (audited in `admin_audit_log`).
