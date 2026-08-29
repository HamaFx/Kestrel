-- 0089: Store AI budget amounts as exact integer cents.
--
-- The application already rounds reservations and reconciliations to integer
-- cents. The previous double-precision columns could retain fractional cents
-- and make accounting reconstruction dependent on floating-point arithmetic.
-- Legacy fractional values are rounded during the one-time conversion.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'daily_ai_spend'
      AND column_name = 'total_usd_cents'
      AND data_type = 'double precision'
  ) THEN
    ALTER TABLE "daily_ai_spend"
      ALTER COLUMN "total_usd_cents" TYPE bigint
      USING round("total_usd_cents")::bigint;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ai_budget_reservations'
      AND column_name = 'reserved_usd_cents'
      AND data_type = 'double precision'
  ) THEN
    ALTER TABLE "ai_budget_reservations"
      ALTER COLUMN "reserved_usd_cents" TYPE bigint
      USING round("reserved_usd_cents")::bigint;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ai_budget_reservations'
      AND column_name = 'actual_usd_cents'
      AND data_type = 'double precision'
  ) THEN
    ALTER TABLE "ai_budget_reservations"
      ALTER COLUMN "actual_usd_cents" TYPE bigint
      USING round("actual_usd_cents")::bigint;
  END IF;
END $$;
