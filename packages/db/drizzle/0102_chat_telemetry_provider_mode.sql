-- 0102: Telemetry records who paid for the turn and how many credits burned.

ALTER TABLE "chat_telemetry"
  ADD COLUMN IF NOT EXISTS "provider_mode" text,
  ADD COLUMN IF NOT EXISTS "credits_charged" bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "wallet_balance_after" bigint;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'chat_telemetry'::regclass
      AND conname = 'chat_telemetry_provider_mode_check'
  ) THEN
    ALTER TABLE "chat_telemetry"
      ADD CONSTRAINT "chat_telemetry_provider_mode_check"
      CHECK ("provider_mode" IN ('byok','managed'));
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "chat_telemetry_provider_mode_idx"
  ON "chat_telemetry" ("provider_mode", "created_at");
