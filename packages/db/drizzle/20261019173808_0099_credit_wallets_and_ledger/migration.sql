-- 0099: Subscription + credit billing data model.
--
-- Additive and backward-compatible. Creates the durable balance, append-only
-- ledger, pre-authorisation ledger, top-up catalogue, provider customer map,
-- and the provider-agnostic webhook event registry.
--
-- Every tenant-scoped table copies the RLS pattern established by
-- `chat_threads` / migration 0090. `billing_events` is a global webhook
-- registry (no tenant_id) and is written only by the BYPASSRLS admin/worker
-- connection.

-- ── Credit wallets ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "credit_wallets" (
  "user_id" text PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  "tenant_id" text NOT NULL DEFAULT current_setting('app.current_tenant', true)
    REFERENCES "organization"("id") ON DELETE CASCADE,
  "available_credits" bigint NOT NULL DEFAULT 0,
  "lifetime_granted" bigint NOT NULL DEFAULT 0,
  "lifetime_consumed" bigint NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "credit_wallets_available_non_negative" CHECK ("available_credits" >= 0)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "credit_wallets_tenant_idx" ON "credit_wallets" ("tenant_id");
--> statement-breakpoint

-- ── Credit ledger (append-only) ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "credit_ledger" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" text NOT NULL DEFAULT current_setting('app.current_tenant', true)
    REFERENCES "organization"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "amount_credits" bigint NOT NULL,
  "balance_after" bigint,
  "idempotency_key" text NOT NULL,
  "reference_type" text,
  "reference_id" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "credit_ledger_kind_check" CHECK ("kind" IN (
    'subscription_grant','topup_grant','promo_grant','admin_adjustment',
    'consumption','refund','expiration','reservation','release','reconcile'
  ))
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "credit_ledger_idempotency_uk"
  ON "credit_ledger" ("tenant_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_ledger_user_created_idx"
  ON "credit_ledger" ("user_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_ledger_kind_idx" ON "credit_ledger" ("kind");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_ledger_tenant_created_idx"
  ON "credit_ledger" ("tenant_id", "created_at" DESC);
--> statement-breakpoint

-- ── Credit reservations ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "credit_reservations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" text NOT NULL DEFAULT current_setting('app.current_tenant', true)
    REFERENCES "organization"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "thread_id" uuid,
  "trace_id" text,
  "run_id" text,
  "job_id" text,
  "reserved_credits" bigint NOT NULL,
  "actual_credits" bigint,
  "status" text NOT NULL DEFAULT 'reserved',
  "idempotency_key" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "resolved_at" timestamptz,
  "last_error" text,
  CONSTRAINT "credit_reservations_status_check"
    CHECK ("status" IN ('reserved','reconciled','released')),
  CONSTRAINT "credit_reservations_reserved_non_negative" CHECK ("reserved_credits" >= 0)
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "credit_reservations_idempotency_uk"
  ON "credit_reservations" ("tenant_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_reservations_user_idx"
  ON "credit_reservations" ("user_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_reservations_status_idx"
  ON "credit_reservations" ("status", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_reservations_run_idx" ON "credit_reservations" ("run_id");
--> statement-breakpoint

-- ── Top-up catalogue ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "credit_topup_products" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "credits" bigint NOT NULL,
  "price_usd_cents" integer NOT NULL,
  "stripe_price_id" text,
  "nowpayments_currency" text DEFAULT 'usdt',
  "is_active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "credit_topup_products_credits_positive" CHECK ("credits" > 0),
  CONSTRAINT "credit_topup_products_price_positive" CHECK ("price_usd_cents" > 0)
);
--> statement-breakpoint

-- ── Billing customers ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "billing_customers" (
  "tenant_id" text PRIMARY KEY DEFAULT current_setting('app.current_tenant', true)
    REFERENCES "organization"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "stripe_customer_id" text,
  "nowpayments_email" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "billing_customers_stripe_customer_uk"
  ON "billing_customers" ("stripe_customer_id")
  WHERE "stripe_customer_id" IS NOT NULL;
--> statement-breakpoint

-- ── Provider webhook event registry (global) ───────────────────────────────

CREATE TABLE IF NOT EXISTS "billing_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "provider" text NOT NULL,
  "event_id" text NOT NULL,
  "event_type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'processing',
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "error" text,
  "attempts" integer NOT NULL DEFAULT 1,
  "processing" boolean NOT NULL DEFAULT true,
  "received_at" timestamptz NOT NULL DEFAULT now(),
  "processed_at" timestamptz,
  CONSTRAINT "billing_events_status_check"
    CHECK ("status" IN ('processing','processed','failed'))
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "billing_events_provider_event_uk"
  ON "billing_events" ("provider", "event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_events_status_idx"
  ON "billing_events" ("status", "received_at");
--> statement-breakpoint

-- ── Tenant inference triggers (post-Phase-3 tables) ────────────────────────

DO $$
DECLARE
  table_name text;
  trigger_name text;
  tenant_tables text[] := ARRAY[
    'credit_wallets',
    'credit_ledger',
    'credit_reservations',
    'billing_customers'
  ];
BEGIN
  FOREACH table_name IN ARRAY tenant_tables LOOP
    trigger_name := 'hamafx_' || table_name || '_tenant_id';
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = trigger_name
        AND tgrelid = format('public.%I', table_name)::regclass
        AND NOT tgisinternal
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION hamafx_set_tenant_id_from_user()',
        trigger_name, table_name
      );
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint

-- ── RLS policies ──────────────────────────────────────────────────────────

DO $$
DECLARE
  table_name text;
  tenant_tables text[] := ARRAY[
    'credit_wallets',
    'credit_ledger',
    'credit_reservations',
    'billing_customers'
  ];
BEGIN
  FOREACH table_name IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
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

-- ── Non-bypass application role grants ────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kestrel_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON "credit_wallets", "credit_ledger", "credit_reservations",
         "credit_topup_products", "billing_customers", "billing_events"
      TO kestrel_app;
    GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO kestrel_app;
  END IF;
END $$;
