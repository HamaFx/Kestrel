-- Phase 1: durable mutation confirmation idempotency ledger.
-- The run id is the single-use execution boundary. The business write,
-- audit row, and ledger row are committed in one transaction by the route.

CREATE TABLE IF NOT EXISTS "mutation_executions" (
  "run_id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "tenant_id" text NOT NULL DEFAULT current_setting('app.current_tenant', true) REFERENCES "organization"("id") ON DELETE CASCADE,
  "thread_id" text NOT NULL,
  "mutation" text NOT NULL,
  "input_digest" text NOT NULL,
  "status" text NOT NULL DEFAULT 'executing',
  "result_id" text,
  "result_url" text,
  "result" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "executed_at" timestamptz
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "mutation_executions_user_idx"
  ON "mutation_executions" ("user_id", "created_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "mutation_executions_tenant_idx"
  ON "mutation_executions" ("tenant_id", "created_at");
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'hamafx_mutation_executions_tenant_id'
      AND tgrelid = 'mutation_executions'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER hamafx_mutation_executions_tenant_id
      BEFORE INSERT OR UPDATE ON "mutation_executions"
      FOR EACH ROW EXECUTE FUNCTION hamafx_set_tenant_id_from_user();
  END IF;
END $$;
