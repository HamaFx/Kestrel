-- 0106: Gammal Tech one-time payment provider.
--
-- Gammal is used for prepaid plan passes (and later optional top-ups). The
-- provider has no API keys; the payment link is generated server-side and the
-- signed payment_token is verified locally before any credit movement.

ALTER TABLE "payments"
  DROP CONSTRAINT IF EXISTS "payments_provider_check";
--> statement-breakpoint
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_provider_check"
  CHECK ("provider" IN ('nowpayments','stripe','manual','promo','gammal'));
--> statement-breakpoint
ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "gammal_order_ref" text,
  ADD COLUMN IF NOT EXISTS "gammal_txn" text,
  ADD COLUMN IF NOT EXISTS "gammal_refund_txn" text,
  ADD COLUMN IF NOT EXISTS "gammal_amount_cents" integer,
  ADD COLUMN IF NOT EXISTS "gammal_currency" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_gammal_txn_uk"
  ON "payments" ("gammal_txn") WHERE "gammal_txn" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_gammal_order_ref_uk"
  ON "payments" ("gammal_order_ref") WHERE "gammal_order_ref" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "provider" text;
--> statement-breakpoint
UPDATE "subscriptions"
SET "provider" = CASE
  WHEN "stripe_subscription_id" IS NOT NULL THEN 'stripe'
  WHEN "nowpayments_recurring_id" IS NOT NULL THEN 'nowpayments'
  ELSE 'manual'
END
WHERE "provider" IS NULL;
