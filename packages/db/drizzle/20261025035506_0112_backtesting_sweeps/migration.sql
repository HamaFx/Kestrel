-- 0112: Backtesting parameter sweeps.
--
-- A sweep stores the parameter grid, progress and the ranked results so the
-- worker can run it durably and the UI/agent can inspect it later.

CREATE TABLE IF NOT EXISTS "plg_backtesting_sweeps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" text NOT NULL DEFAULT current_setting('app.current_tenant', true)
    REFERENCES "organization"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "strategy_id" text,
  "symbol" text NOT NULL,
  "timeframe" text NOT NULL,
  "source" text NOT NULL,
  "base_params" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "parameter_space" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "objective" text NOT NULL,
  "count" integer NOT NULL DEFAULT 1000,
  "initial_balance" double precision NOT NULL DEFAULT 10000,
  "risk_pct" double precision NOT NULL DEFAULT 1,
  "min_trades" integer NOT NULL DEFAULT 5,
  "persist_runs" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'queued',
  "total" integer NOT NULL DEFAULT 0,
  "completed" integer NOT NULL DEFAULT 0,
  "best_params" jsonb,
  "best_metrics" jsonb,
  "best_score" double precision,
  "results" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "plg_backtesting_sweeps_status_check"
    CHECK ("status" IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  CONSTRAINT "plg_backtesting_sweeps_objective_check"
    CHECK ("objective" IN ('profitFactor', 'netPnl', 'returnPct', 'sharpeRatio', 'expectancyR', 'maxDrawdownPct')),
  CONSTRAINT "plg_backtesting_sweeps_progress_check"
    CHECK ("total" >= 0 AND "completed" >= 0 AND "completed" <= "total")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "plg_backtesting_sweeps_tenant_user_idx"
  ON "plg_backtesting_sweeps" ("tenant_id", "user_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "plg_backtesting_sweeps_user_created_idx"
  ON "plg_backtesting_sweeps" ("user_id", "created_at" DESC);
--> statement-breakpoint

ALTER TABLE "plg_backtesting_sweeps" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "plg_backtesting_sweeps" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'plg_backtesting_sweeps'
      AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON "plg_backtesting_sweeps"
      FOR ALL
      USING (tenant_id = current_setting('app.current_tenant', true))
      WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kestrel_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "plg_backtesting_sweeps" TO kestrel_app;
  END IF;
END $$;
