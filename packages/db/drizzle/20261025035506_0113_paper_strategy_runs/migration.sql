-- 0113: Paper Trading deployed strategy runs.
--
-- A deployed strategy is a durable, per-user loop:
--   * evaluate the saved getSignal(ctx) source on each new closed bar
--   * size and place a virtual order in the autonomous sandbox
--   * pause / resume / stop / delete without touching the strategy source
--
-- The source is snapshotted at deploy time so editing the Backtesting library
-- cannot silently change a live paper deployment.

CREATE TABLE IF NOT EXISTS "plg_paper_trading_strategy_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" text NOT NULL DEFAULT current_setting('app.current_tenant', true)
    REFERENCES "organization"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "account_id" uuid NOT NULL REFERENCES "plg_paper_trading_accounts"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "strategy_id" text,
  "symbol" text NOT NULL,
  "timeframe" text NOT NULL,
  "source" text NOT NULL,
  "params" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "risk_pct" double precision NOT NULL DEFAULT 1,
  "status" text NOT NULL DEFAULT 'active',
  "last_bar_time" timestamptz,
  "last_signal" text,
  "last_signal_at" timestamptz,
  "position_id" uuid,
  "signal_count" integer NOT NULL DEFAULT 0,
  "order_count" integer NOT NULL DEFAULT 0,
  "last_error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "plg_paper_trading_strategy_runs_status_check"
    CHECK ("status" IN ('active', 'paused', 'stopped', 'error')),
  CONSTRAINT "plg_paper_trading_strategy_runs_signal_check"
    CHECK ("last_signal" IS NULL OR "last_signal" IN ('long', 'short')),
  CONSTRAINT "plg_paper_trading_strategy_runs_risk_check"
    CHECK ("risk_pct" > 0 AND "risk_pct" <= 20)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "plg_paper_trading_strategy_runs_tenant_user_idx"
  ON "plg_paper_trading_strategy_runs" ("tenant_id", "user_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "plg_paper_trading_strategy_runs_status_idx"
  ON "plg_paper_trading_strategy_runs" ("status", "updated_at");
--> statement-breakpoint

ALTER TABLE "plg_paper_trading_strategy_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "plg_paper_trading_strategy_runs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'plg_paper_trading_strategy_runs'
      AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON "plg_paper_trading_strategy_runs"
      FOR ALL
      USING (tenant_id = current_setting('app.current_tenant', true))
      WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kestrel_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "plg_paper_trading_strategy_runs" TO kestrel_app;
  END IF;
END $$;
