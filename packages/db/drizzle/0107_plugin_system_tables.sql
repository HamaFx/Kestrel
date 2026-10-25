-- 0107: Plugin platform foundation.
--
-- Adds the per-user install ledger (D-01: no plan/subscription gating) and a
-- zero-migration JSON store for plugin documents. Both tables carry the
-- standard tenant isolation contract:
--   * tenant_id defaults from the request GUC `app.current_tenant`
--   * RLS is ENABLED and FORCED
--   * the non-bypass `kestrel_app` role receives table privileges
--
-- Tenant isolation is the second line of defence: every query helper also
-- filters by user_id + tenant_id.

CREATE TABLE IF NOT EXISTS "user_installed_plugins" (
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "tenant_id" text NOT NULL DEFAULT current_setting('app.current_tenant', true)
    REFERENCES "organization"("id") ON DELETE CASCADE,
  "plugin_id" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "onboarding_completed" boolean NOT NULL DEFAULT false,
  "installed_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "user_installed_plugins_pkey" PRIMARY KEY ("user_id", "plugin_id"),
  CONSTRAINT "user_installed_plugins_plugin_id_format"
    CHECK ("plugin_id" ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$')
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "user_installed_plugins_tenant_idx"
  ON "user_installed_plugins" ("tenant_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "user_installed_plugins_plugin_enabled_idx"
  ON "user_installed_plugins" ("plugin_id", "enabled");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "plugin_storage" (
  "tenant_id" text NOT NULL DEFAULT current_setting('app.current_tenant', true)
    REFERENCES "organization"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "plugin_id" text NOT NULL,
  "collection" text NOT NULL,
  "key" text NOT NULL,
  "value" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "plugin_storage_pkey"
    PRIMARY KEY ("tenant_id", "user_id", "plugin_id", "collection", "key"),
  CONSTRAINT "plugin_storage_plugin_id_format"
    CHECK ("plugin_id" ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'),
  CONSTRAINT "plugin_storage_collection_length"
    CHECK (char_length("collection") BETWEEN 1 AND 64),
  CONSTRAINT "plugin_storage_key_length"
    CHECK (char_length("key") BETWEEN 1 AND 128)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "plugin_storage_lookup_idx"
  ON "plugin_storage" ("plugin_id", "user_id", "collection");
--> statement-breakpoint

-- ── Row-level security ────────────────────────────────────────────────────

DO $$
DECLARE
  table_name text;
  tenant_tables text[] := ARRAY['user_installed_plugins', 'plugin_storage'];
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
      ON "user_installed_plugins", "plugin_storage"
      TO kestrel_app;
  END IF;
END $$;
