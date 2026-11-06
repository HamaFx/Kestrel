-- Durable cross-process coordination for Drizzle → Mastra memory backfill.
CREATE TABLE IF NOT EXISTS "memory_backfill_state" (
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "thread_id" text NOT NULL,
  "tenant_id" text NOT NULL DEFAULT current_setting('app.current_tenant', true) REFERENCES "organization"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'pending',
  "copied_through_created_at" timestamptz,
  "copied_count" integer NOT NULL DEFAULT 0,
  "last_error" text,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz,
  CONSTRAINT "memory_backfill_state_pk" PRIMARY KEY ("user_id", "thread_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_backfill_state_tenant_idx"
  ON "memory_backfill_state" ("tenant_id", "updated_at");
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'hamafx_memory_backfill_state_tenant_id'
      AND tgrelid = 'memory_backfill_state'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER hamafx_memory_backfill_state_tenant_id
      BEFORE INSERT OR UPDATE ON "memory_backfill_state"
      FOR EACH ROW EXECUTE FUNCTION hamafx_set_tenant_id_from_user();
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "mutation_executions"
  ADD COLUMN IF NOT EXISTS "approval_id" text,
  ADD COLUMN IF NOT EXISTS "approval_expires_at" timestamptz;
