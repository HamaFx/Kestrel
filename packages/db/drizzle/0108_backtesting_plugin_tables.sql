-- 0108: Backtesting plugin tables.
--
-- The Backtesting Lab persists agent-authored strategy runs (scorecard,
-- equity curve, trades) and a per-user strategy library. Both tables are
-- created through `createPluginTable()` at runtime, which prefixes the
-- physical name with `plg_backtesting_` and injects the tenant isolation
-- columns. This migration is the hand-written mirror of that helper.
--
-- Security contract (identical to 0107):
--   * tenant_id defaults from the request GUC `app.current_tenant`
--   * RLS is ENABLED and FORCED
--   * the non-bypass `kestrel_app` role receives table privileges
--   * every query helper additionally filters by user_id

CREATE TABLE IF NOT EXISTS "plg_backtesting_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" text NOT NULL DEFAULT current_setting('app.current_tenant', true)
    REFERENCES "organization"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "name" text NOT NULL,
  "symbol" text NOT NULL,
  "timeframe" text NOT NULL,
  "source" text NOT NULL,
  "params" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'completed',
  "engine_version" text NOT NULL,
  "bars" integer NOT NULL DEFAULT 0,
  "from_ts" timestamptz,
  "to_ts" timestamptz,
  "initial_balance" double precision NOT NULL,
  "final_equity" double precision NOT NULL,
  "metrics" jsonb NOT NULL,
  "equity_curve" jsonb NOT NULL,
  "trades" jsonb NOT NULL,
  "rejected_signals" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "warnings" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "logs" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "duration_ms" integer NOT NULL DEFAULT 0,
  "error" text,
  CONSTRAINT "plg_backtesting_runs_status_check"
    CHECK ("status" IN ('completed', 'failed'))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "plg_backtesting_runs_tenant_user_idx"
  ON "plg_backtesting_runs" ("tenant_id", "user_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "plg_backtesting_runs_user_created_idx"
  ON "plg_backtesting_runs" ("user_id", "created_at" DESC);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "plg_backtesting_strategies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" text NOT NULL DEFAULT current_setting('app.current_tenant', true)
    REFERENCES "organization"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "source" text NOT NULL,
  "params" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "favorite" boolean NOT NULL DEFAULT false,
  CONSTRAINT "plg_backtesting_strategies_user_slug_key" UNIQUE ("user_id", "slug")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "plg_backtesting_strategies_tenant_user_idx"
  ON "plg_backtesting_strategies" ("tenant_id", "user_id");
--> statement-breakpoint

-- ── Row-level security ────────────────────────────────────────────────────

DO $$
DECLARE
  table_name text;
  tenant_tables text[] := ARRAY['plg_backtesting_runs', 'plg_backtesting_strategies'];
BEGIN
  FOREACH table_name IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND policyname = 'tenant_isolation'
    ) THEN
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON %I
         FOR ALL
         USING (tenant_id = current_setting(''app.current_tenant'', true))
         WITH CHECK (tenant_id = current_setting(''app.current_tenant'', true))',
        table_name
      );
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint

-- ── Non-bypass application role grants ───────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kestrel_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON "plg_backtesting_runs", "plg_backtesting_strategies"
      TO kestrel_app;
  END IF;
END $$;
