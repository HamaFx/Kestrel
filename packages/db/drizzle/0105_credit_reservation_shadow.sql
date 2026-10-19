-- 0105: Shadow metering flag on credit reservations.
--
-- Phase 3 requires reservations/ledger rows for burn analysis without
-- debiting the wallet. Fresh installs get the column from 0099; this
-- idempotent ALTER covers databases that already applied 0099.

ALTER TABLE "credit_reservations"
  ADD COLUMN IF NOT EXISTS "shadow" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "credit_ledger"
  ADD COLUMN IF NOT EXISTS "shadow" boolean NOT NULL DEFAULT false;
