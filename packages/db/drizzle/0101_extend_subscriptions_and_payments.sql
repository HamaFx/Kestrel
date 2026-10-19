-- 0101: Stripe subscription + payment mapping.

ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "stripe_subscription_id" text,
  ADD COLUMN IF NOT EXISTS "stripe_price_id" text,
  ADD COLUMN IF NOT EXISTS "current_period_start" timestamptz,
  ADD COLUMN IF NOT EXISTS "cancel_at_period_end" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "trial_end_prev" timestamptz;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_stripe_subscription_uk"
  ON "subscriptions" ("stripe_subscription_id")
  WHERE "stripe_subscription_id" IS NOT NULL;
--> statement-breakpoint

ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "provider" text NOT NULL DEFAULT 'nowpayments',
  ADD COLUMN IF NOT EXISTS "stripe_payment_intent_id" text,
  ADD COLUMN IF NOT EXISTS "stripe_invoice_id" text,
  ADD COLUMN IF NOT EXISTS "credits_granted" bigint,
  ADD COLUMN IF NOT EXISTS "billing_reason" text;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'payments'::regclass
      AND conname = 'payments_provider_check'
  ) THEN
    ALTER TABLE "payments"
      ADD CONSTRAINT "payments_provider_check"
      CHECK ("provider" IN ('nowpayments','stripe','manual','promo'));
  END IF;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "payments_stripe_payment_intent_uk"
  ON "payments" ("stripe_payment_intent_id")
  WHERE "stripe_payment_intent_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_stripe_invoice_uk"
  ON "payments" ("stripe_invoice_id")
  WHERE "stripe_invoice_id" IS NOT NULL;
--> statement-breakpoint

-- The DLQ is now provider-agnostic. Existing NOWPayments rows keep their
-- explicit provider value; only the default changes.
ALTER TABLE "billing_webhook_dlq"
  ALTER COLUMN "provider" SET DEFAULT 'stripe';
