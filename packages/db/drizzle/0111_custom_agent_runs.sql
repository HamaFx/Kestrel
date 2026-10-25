-- 0111: Custom Agents run history.
--
-- One row per standalone-agent turn. The agent row keeps a cheap counter and
-- last-used timestamp for cards; this table keeps the detailed, bounded
-- history the Studio can inspect (status, model, latency, cost, tool calls,
-- character counts and error text).

CREATE TABLE IF NOT EXISTS "plg_custom_agents_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" text NOT NULL DEFAULT current_setting('app.current_tenant', true)
    REFERENCES "organization"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "agent_id" uuid NOT NULL REFERENCES "plg_custom_agents"("id") ON DELETE CASCADE,
  "run_id" text NOT NULL,
  "thread_id" text,
  "status" text NOT NULL,
  "model" text,
  "latency_ms" integer NOT NULL DEFAULT 0,
  "cost_usd" double precision NOT NULL DEFAULT 0,
  "tool_calls" integer NOT NULL DEFAULT 0,
  "input_chars" integer NOT NULL DEFAULT 0,
  "output_chars" integer NOT NULL DEFAULT 0,
  "error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "plg_custom_agents_runs_status_check"
    CHECK ("status" IN ('succeeded', 'failed', 'cancelled')),
  CONSTRAINT "plg_custom_agents_runs_latency_check" CHECK ("latency_ms" >= 0),
  CONSTRAINT "plg_custom_agents_runs_tool_calls_check" CHECK ("tool_calls" >= 0)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "plg_custom_agents_runs_tenant_user_idx"
  ON "plg_custom_agents_runs" ("tenant_id", "user_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "plg_custom_agents_runs_agent_created_idx"
  ON "plg_custom_agents_runs" ("agent_id", "created_at" DESC);
--> statement-breakpoint

ALTER TABLE "plg_custom_agents_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "plg_custom_agents_runs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'plg_custom_agents_runs'
      AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON "plg_custom_agents_runs"
      FOR ALL
      USING (tenant_id = current_setting('app.current_tenant', true))
      WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kestrel_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "plg_custom_agents_runs" TO kestrel_app;
  END IF;
END $$;
