-- 0098: Phase 2 database audit remediation (additive, idempotent).
--
-- Findings addressed:
--   P1-06 / D2-05 — diagnostic_traces stored user-scoped AI execution traces
--     with no tenant_id and no RLS. Add tenant_id (populated from
--     app.current_tenant like every other tenant table), backfill existing
--     rows, then enable FORCE ROW LEVEL SECURITY.
--   Q4-08 / 4.4 — missing composite indexes on high-frequency
--     (tenant/user, sort) predicates. These are additive; no table locks
--     beyond the brief ACCESS EXCLUSIVE of CREATE INDEX (run during a
--     maintenance window for large tables).
--
-- All statements are guarded/idempotent so verification and recovery reruns
-- are safe.

-- ── diagnostic_traces tenant isolation ────────────────────────────────────
ALTER TABLE "diagnostic_traces"
  ADD COLUMN IF NOT EXISTS "tenant_id" text;
--> statement-breakpoint

-- Backfill from the authoritative membership table. Rows that predate
-- per-user tracing with no user_id cannot be attributed to a tenant; they are
-- operational trace payloads with no owner and are purged below rather than
-- left invisible-but-present under RLS.
UPDATE "diagnostic_traces" dt
SET "tenant_id" = om."org_id"
FROM "organization_member" om
WHERE dt."tenant_id" IS NULL
  AND dt."user_id" IS NOT NULL
  AND om."user_id" = dt."user_id";
--> statement-breakpoint

UPDATE "diagnostic_traces"
SET "tenant_id" = "user_id"
WHERE "tenant_id" IS NULL AND "user_id" IS NOT NULL;
--> statement-breakpoint

DELETE FROM "diagnostic_traces" WHERE "tenant_id" IS NULL;
--> statement-breakpoint

ALTER TABLE "diagnostic_traces"
  ALTER COLUMN "tenant_id" SET DEFAULT current_setting('app.current_tenant', true),
  ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'diagnostic_traces_tenant_id_fk'
  ) THEN
    ALTER TABLE "diagnostic_traces"
      ADD CONSTRAINT "diagnostic_traces_tenant_id_fk"
      FOREIGN KEY ("tenant_id") REFERENCES "organization"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'hamafx_diagnostic_traces_tenant_id'
      AND tgrelid = 'diagnostic_traces'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER hamafx_diagnostic_traces_tenant_id
      BEFORE INSERT OR UPDATE ON "diagnostic_traces"
      FOR EACH ROW EXECUTE FUNCTION hamafx_set_tenant_id_from_user();
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "diagnostic_traces" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "diagnostic_traces" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'diagnostic_traces'
      AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON "diagnostic_traces"
      FOR ALL
      USING (tenant_id = current_setting('app.current_tenant', true))
      WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
  END IF;
END $$;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON "diagnostic_traces" TO kestrel_app;
--> statement-breakpoint

-- ── Composite / partial indexes for high-frequency predicates ─────────────
CREATE INDEX IF NOT EXISTS "chat_threads_user_updated_id_idx"
  ON "chat_threads" ("user_id", "updated_at" DESC, "id" DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "alerts_user_active_created_idx"
  ON "alerts" ("user_id", "active", "created_at" DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "alerts_evaluable_idx"
  ON "alerts" ("created_at" ASC)
  WHERE "active" = true AND "fired_at" IS NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "journal_entries_user_opened_idx"
  ON "journal_entries" ("user_id", "opened_at" DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "portfolio_positions_user_status_opened_idx"
  ON "portfolio_positions" ("user_id", "status", "opened_at" DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "diagnostic_traces_user_started_idx"
  ON "diagnostic_traces" ("user_id", "started_at" DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "tool_telemetry_user_created_idx"
  ON "chat_tool_telemetry" ("user_id", "created_at" DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "memory_embeddings_user_kind_occurred_idx"
  ON "memory_embeddings" ("tenant_id", "user_id", "kind", "occurred_at" DESC);