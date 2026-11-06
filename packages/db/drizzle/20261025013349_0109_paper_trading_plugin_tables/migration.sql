-- 0109: Paper Trading plugin tables.
--
-- Dual-mode virtual broker:
--   * accounts   — Personal Demo (mode 'confirm') + AI Agent Sandbox
--                  (mode 'autonomous_sandbox'), seeded in onUserInstall
--   * positions  — open/closed positions with SL/TP/trailing/breakeven
--   * orders     — resting limit/stop entries and their lifecycle
--   * fills      — immutable execution ledger (open/close/partials)
--
-- Security contract (identical to 0107/0108):
--   * tenant_id defaults from the request GUC `app.current_tenant`
--   * RLS is ENABLED and FORCED
--   * kestrel_app receives table privileges
--   * every query helper additionally filters by user_id

CREATE TABLE IF NOT EXISTS "plg_paper_trading_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" text NOT NULL DEFAULT current_setting('app.current_tenant', true)
    REFERENCES "organization"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "name" text NOT NULL,
  "mode" text NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD',
  "initial_balance" double precision NOT NULL,
  "balance" double precision NOT NULL,
  "leverage" double precision NOT NULL DEFAULT 30,
  "risk_per_trade_pct" double precision NOT NULL DEFAULT 1,
  "status" text NOT NULL DEFAULT 'active',
  "seeded" boolean NOT NULL DEFAULT false,
  CONSTRAINT "plg_paper_trading_accounts_mode_check"
    CHECK ("mode" IN ('confirm', 'autonomous_sandbox')),
  CONSTRAINT "plg_paper_trading_accounts_status_check"
    CHECK ("status" IN ('active', 'archived')),
  CONSTRAINT "plg_paper_trading_accounts_initial_balance_check" CHECK ("initial_balance" > 0)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "plg_paper_trading_accounts_tenant_user_idx"
  ON "plg_paper_trading_accounts" ("tenant_id", "user_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "plg_paper_trading_accounts_user_mode_idx"
  ON "plg_paper_trading_accounts" ("user_id", "mode");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "plg_paper_trading_accounts_user_mode_key"
  ON "plg_paper_trading_accounts" ("user_id", "mode");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "plg_paper_trading_positions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" text NOT NULL DEFAULT current_setting('app.current_tenant', true)
    REFERENCES "organization"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "account_id" uuid NOT NULL
    REFERENCES "plg_paper_trading_accounts"("id") ON DELETE CASCADE,
  "symbol" text NOT NULL,
  "side" text NOT NULL,
  "status" text NOT NULL DEFAULT 'open',
  "quantity" double precision NOT NULL,
  "initial_quantity" double precision NOT NULL,
  "entry_price" double precision NOT NULL,
  "entry_time" timestamptz NOT NULL,
  "stop_loss" double precision,
  "take_profit" double precision,
  "trailing_stop_distance" double precision,
  "trailing_stop_price" double precision,
  "break_even_at_r" double precision,
  "initial_risk_amount" double precision NOT NULL DEFAULT 0,
  "unrealized_pnl" double precision NOT NULL DEFAULT 0,
  "realized_pnl" double precision NOT NULL DEFAULT 0,
  "entry_fee" double precision NOT NULL DEFAULT 0,
  "exit_fee" double precision NOT NULL DEFAULT 0,
  "close_price" double precision,
  "close_time" timestamptz,
  "close_reason" text,
  "source" text NOT NULL DEFAULT 'agent',
  "notes" text,
  "journal_entry_id" uuid,
  CONSTRAINT "plg_paper_trading_positions_side_check"
    CHECK ("side" IN ('long', 'short')),
  CONSTRAINT "plg_paper_trading_positions_status_check"
    CHECK ("status" IN ('open', 'closed')),
  CONSTRAINT "plg_paper_trading_positions_close_reason_check"
    CHECK ("close_reason" IS NULL OR "close_reason" IN
      ('manual', 'stop_loss', 'take_profit', 'trailing_stop', 'account_reset')),
  CONSTRAINT "plg_paper_trading_positions_quantity_check" CHECK ("quantity" >= 0)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "plg_paper_trading_positions_tenant_user_idx"
  ON "plg_paper_trading_positions" ("tenant_id", "user_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "plg_paper_trading_positions_account_status_idx"
  ON "plg_paper_trading_positions" ("account_id", "status");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "plg_paper_trading_positions_user_symbol_idx"
  ON "plg_paper_trading_positions" ("user_id", "symbol", "status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "plg_paper_trading_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" text NOT NULL DEFAULT current_setting('app.current_tenant', true)
    REFERENCES "organization"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "account_id" uuid NOT NULL
    REFERENCES "plg_paper_trading_accounts"("id") ON DELETE CASCADE,
  "symbol" text NOT NULL,
  "side" text NOT NULL,
  "type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "quantity" double precision NOT NULL,
  "risk_pct" double precision,
  "limit_price" double precision,
  "stop_price" double precision,
  "stop_loss" double precision,
  "take_profit" double precision,
  "trailing_stop_distance" double precision,
  "break_even_at_r" double precision,
  "time_in_force" text NOT NULL DEFAULT 'gtc',
  "filled_price" double precision,
  "filled_at" timestamptz,
  "position_id" uuid,
  "reason" text,
  "notes" text,
  "expires_at" timestamptz,
  CONSTRAINT "plg_paper_trading_orders_side_check"
    CHECK ("side" IN ('buy', 'sell')),
  CONSTRAINT "plg_paper_trading_orders_type_check"
    CHECK ("type" IN ('market', 'limit', 'stop')),
  CONSTRAINT "plg_paper_trading_orders_status_check"
    CHECK ("status" IN ('pending', 'filled', 'cancelled', 'rejected', 'expired')),
  CONSTRAINT "plg_paper_trading_orders_time_in_force_check"
    CHECK ("time_in_force" IN ('gtc', 'day')),
  CONSTRAINT "plg_paper_trading_orders_trigger_check"
    CHECK (("type" = 'market') OR ("limit_price" IS NOT NULL) OR ("stop_price" IS NOT NULL))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "plg_paper_trading_orders_tenant_user_idx"
  ON "plg_paper_trading_orders" ("tenant_id", "user_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "plg_paper_trading_orders_account_status_idx"
  ON "plg_paper_trading_orders" ("account_id", "status");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "plg_paper_trading_orders_symbol_status_idx"
  ON "plg_paper_trading_orders" ("symbol", "status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "plg_paper_trading_fills" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" text NOT NULL DEFAULT current_setting('app.current_tenant', true)
    REFERENCES "organization"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "account_id" uuid NOT NULL
    REFERENCES "plg_paper_trading_accounts"("id") ON DELETE CASCADE,
  "position_id" uuid,
  "order_id" uuid,
  "kind" text NOT NULL,
  "price" double precision NOT NULL,
  "quantity" double precision NOT NULL,
  "pnl" double precision NOT NULL DEFAULT 0,
  "fees" double precision NOT NULL DEFAULT 0,
  "meta" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "ts" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "plg_paper_trading_fills_tenant_user_idx"
  ON "plg_paper_trading_fills" ("tenant_id", "user_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "plg_paper_trading_fills_account_ts_idx"
  ON "plg_paper_trading_fills" ("account_id", "ts" DESC);
--> statement-breakpoint

-- ── Row-level security ────────────────────────────────────────────────────

DO $$
DECLARE
  table_name text;
  tenant_tables text[] := ARRAY[
    'plg_paper_trading_accounts',
    'plg_paper_trading_positions',
    'plg_paper_trading_orders',
    'plg_paper_trading_fills'
  ];
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
      ON "plg_paper_trading_accounts",
         "plg_paper_trading_positions",
         "plg_paper_trading_orders",
         "plg_paper_trading_fills"
      TO kestrel_app;
  END IF;
END $$;
