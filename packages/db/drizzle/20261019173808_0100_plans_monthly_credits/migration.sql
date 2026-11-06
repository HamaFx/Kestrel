-- 0100: Plans become the data-driven credit catalogue.
--
-- `monthly_credits` is the grant per billing cycle (1 credit = $0.001).
-- `monthly_token_cap` remains for backward compatibility but is derived from
-- credits by the query layer.

ALTER TABLE "plans"
  ADD COLUMN IF NOT EXISTS "monthly_credits" bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "overage_credits" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "seats_included" integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "stripe_price_id" text,
  ADD COLUMN IF NOT EXISTS "stripe_price_id_yearly" text,
  ADD COLUMN IF NOT EXISTS "visible" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "sort_order" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "trial_days" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "stripe_tax_behavior" text DEFAULT 'exclusive';
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "plans_visible_sort_idx" ON "plans" ("visible", "sort_order");
--> statement-breakpoint

-- Backfill a sensible token cap for legacy plans so old readers keep working.
UPDATE "plans"
SET "monthly_token_cap" = GREATEST(0, ("monthly_credits" * 167)::integer)
WHERE "monthly_credits" > 0
  AND ("monthly_token_cap" IS NULL OR "monthly_token_cap" = 0);
