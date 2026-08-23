-- Phase 2: database-owned Full-analysis queue and lease ledger.
-- Mastra workflow snapshots remain an observability projection; this table
-- owns idempotency, claims, leases, retries, and stale-worker protection.

CREATE TABLE IF NOT EXISTS "full_analysis_queue" (
  "run_id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "tenant_id" text NOT NULL DEFAULT current_setting('app.current_tenant', true) REFERENCES "organization"("id") ON DELETE CASCADE,
  "thread_id" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "payload" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "attempt_count" integer NOT NULL DEFAULT 0,
  "worker_run_id" text,
  "lease_expires_at" timestamptz,
  "result" jsonb,
  "error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "full_analysis_queue_user_idempotency_uk"
  ON "full_analysis_queue" ("user_id", "idempotency_key");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "full_analysis_queue_pending_idx"
  ON "full_analysis_queue" ("status", "created_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "full_analysis_queue_lease_idx"
  ON "full_analysis_queue" ("status", "lease_expires_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "full_analysis_queue_tenant_idx"
  ON "full_analysis_queue" ("tenant_id", "status", "created_at");
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'hamafx_full_analysis_queue_tenant_id'
      AND tgrelid = 'full_analysis_queue'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER hamafx_full_analysis_queue_tenant_id
      BEFORE INSERT OR UPDATE ON "full_analysis_queue"
      FOR EACH ROW EXECUTE FUNCTION hamafx_set_tenant_id_from_user();
  END IF;
END $$;
