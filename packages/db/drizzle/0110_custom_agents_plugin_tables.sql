-- 0110: Custom Agents plugin table.
--
-- Per-user standalone Mastra agents created in the Agent Studio:
--   * identity       — name, @handle (slug), description
--   * instructions   — system prompt
--   * model          — optional provider:model pin
--   * tools          — allowlisted core/plugin tool ids
--   * skills         — inline Markdown skills
--   * skill_refs     — references to installed plugin playbooks
--   * mcp_servers    — remote MCP endpoints (authorization is enc:v1:)
--   * delegatable    — may the canonical chat delegate to it?
--
-- Security contract (identical to 0107/0108/0109):
--   * tenant_id defaults from the request GUC `app.current_tenant`
--   * RLS is ENABLED and FORCED
--   * kestrel_app receives table privileges
--   * every query helper additionally filters by user_id

CREATE TABLE IF NOT EXISTS "plg_custom_agents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" text NOT NULL DEFAULT current_setting('app.current_tenant', true)
    REFERENCES "organization"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "instructions" text NOT NULL,
  "model" text,
  "tools" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "skills" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "skill_refs" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "mcp_servers" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "delegatable" boolean NOT NULL DEFAULT false,
  "starter_template" text,
  "run_count" integer NOT NULL DEFAULT 0,
  "last_used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "plg_custom_agents_slug_check"
    CHECK ("slug" ~ '^[a-z][a-z0-9-]{1,31}$'),
  CONSTRAINT "plg_custom_agents_name_check"
    CHECK (char_length("name") BETWEEN 1 AND 120),
  CONSTRAINT "plg_custom_agents_instructions_check"
    CHECK (char_length("instructions") BETWEEN 20 AND 24000),
  CONSTRAINT "plg_custom_agents_run_count_check" CHECK ("run_count" >= 0)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "plg_custom_agents_tenant_user_idx"
  ON "plg_custom_agents" ("tenant_id", "user_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "plg_custom_agents_user_slug_key"
  ON "plg_custom_agents" ("user_id", "slug");
--> statement-breakpoint

-- ── Row-level security ────────────────────────────────────────────────────

ALTER TABLE "plg_custom_agents" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "plg_custom_agents" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'plg_custom_agents'
      AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON "plg_custom_agents"
      FOR ALL
      USING (tenant_id = current_setting('app.current_tenant', true))
      WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
  END IF;
END $$;
--> statement-breakpoint

-- ── Non-bypass application role grants ───────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kestrel_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "plg_custom_agents" TO kestrel_app;
  END IF;
END $$;
