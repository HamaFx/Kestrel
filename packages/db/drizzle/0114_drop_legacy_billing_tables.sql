-- 0114 — Retire external payment gateways and credit wallets (DEC-01).
--
-- Kestrel is BYOK-only: model spend is tracked in USD by the local daily
-- budget ledger (`daily_ai_spend`, `ai_budget_reservations`). Subscription,
-- credit-wallet, checkout, and webhook-DLQ tables are no longer read or
-- written by the application.
--
-- CASCADE covers dependent FKs and RLS policies. Tables are dropped
-- children-first so the migration also works on databases where CASCADE is
-- unavailable.

DROP TABLE IF EXISTS "credit_reservations" CASCADE;
DROP TABLE IF EXISTS "credit_ledger" CASCADE;
DROP TABLE IF EXISTS "credit_wallets" CASCADE;
DROP TABLE IF EXISTS "credit_topup_products" CASCADE;
DROP TABLE IF EXISTS "billing_events" CASCADE;
DROP TABLE IF EXISTS "billing_customers" CASCADE;
DROP TABLE IF EXISTS "billing_webhook_dlq" CASCADE;
DROP TABLE IF EXISTS "billing_checkout_attempts" CASCADE;
DROP TABLE IF EXISTS "ipn_events" CASCADE;
DROP TABLE IF EXISTS "payments" CASCADE;
DROP TABLE IF EXISTS "subscriptions" CASCADE;
DROP TABLE IF EXISTS "plans" CASCADE;
