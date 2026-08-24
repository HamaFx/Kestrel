-- Durable Drizzle -> Mastra memory projection checkpoint.
CREATE TABLE IF NOT EXISTS "memory_projection_state" (
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "thread_id" text NOT NULL,
  "tenant_id" text NOT NULL DEFAULT current_setting('app.current_tenant', true) REFERENCES "organization"("id") ON DELETE CASCADE,
  "last_projected_message_id" text,
  "status" text NOT NULL DEFAULT 'pending',
  "last_error" text,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "projected_at" timestamptz,
  CONSTRAINT "memory_projection_state_pk" PRIMARY KEY ("user_id", "thread_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_projection_state_status_idx"
  ON "memory_projection_state" ("status", "updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_projection_state_tenant_idx"
  ON "memory_projection_state" ("tenant_id", "updated_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_quality_results" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "thread_id" text,
  "tenant_id" text NOT NULL DEFAULT current_setting('app.current_tenant', true) REFERENCES "organization"("id") ON DELETE CASCADE,
  "run_id" text NOT NULL,
  "passed" boolean NOT NULL,
  "mandatory_passed" boolean NOT NULL,
  "advisory_score" double precision,
  "failures" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ai_quality_results_run_uk" UNIQUE ("run_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_quality_results_user_created_idx"
  ON "ai_quality_results" ("user_id", "created_at");
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'hamafx_ai_quality_results_tenant_id'
      AND tgrelid = 'ai_quality_results'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER hamafx_ai_quality_results_tenant_id
      BEFORE INSERT OR UPDATE ON "ai_quality_results"
      FOR EACH ROW EXECUTE FUNCTION hamafx_set_tenant_id_from_user();
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'hamafx_memory_projection_state_tenant_id'
      AND tgrelid = 'memory_projection_state'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER hamafx_memory_projection_state_tenant_id
      BEFORE INSERT OR UPDATE ON "memory_projection_state"
      FOR EACH ROW EXECUTE FUNCTION hamafx_set_tenant_id_from_user();
  END IF;
END $$;
