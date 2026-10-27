-- 0117 — Treat an empty-string `app.current_tenant` as unset, and guarantee the
-- platform tenant that the pre-auth rate limiter keys on.
--
-- Incident (2026-10-27): POST /login returned HTTP 500 — the user saw the root
-- error boundary ("A stop-loss kicked in", React #441, digest 1876515799) with:
--
--   insert or update on table "rate_limits" violates foreign key constraint
--   "rate_limits_tenant_id_fkey"
--   DETAIL: Key (tenant_id)=() is not present in table "organization"
--
-- Root cause: every tenant_id column on the user-scoped tables defaults to
-- `current_setting('app.current_tenant', true)`, and the tenant triggers only
-- replace the value when it IS NULL. On any connection where the GUC exists but
-- is empty (role/database-level default, pooled-session state, or an empty
-- tenant scope) the default produced `''`, the triggers skipped their fallback,
-- and the row violated the organization FK. Login died in the rate limiter
-- before credentials were even checked.
--
-- Fix: make `''` behave exactly like an unset GUC in the tenant resolution
-- helpers and in all three tenant trigger functions, so the existing
-- user-scoped fallbacks (personal organization / chat thread tenant) apply
-- again for rate_limits, user_sessions, alerts, agent_opinions,
-- journal_entries, chat_messages, …
CREATE OR REPLACE FUNCTION hamafx_resolve_tenant_id(p_user_id text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN COALESCE(NULLIF(current_setting('app.current_tenant', true), ''), p_user_id);
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION hamafx_set_tenant_id_from_user()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."tenant_id" IS NULL OR NEW."tenant_id" = '' THEN
    NEW."tenant_id" := hamafx_resolve_tenant_id(NEW."user_id");
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION hamafx_set_chat_message_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."tenant_id" IS NULL OR NEW."tenant_id" = '' THEN
    NEW."tenant_id" := COALESCE(
      NULLIF(current_setting('app.current_tenant', true), ''),
      (SELECT ct."tenant_id" FROM "chat_threads" ct WHERE ct."id" = NEW."thread_id")
    );
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION hamafx_set_decision_signal_outcome_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."tenant_id" IS NULL OR NEW."tenant_id" = '' THEN
    NEW."tenant_id" := COALESCE(
      NULLIF(current_setting('app.current_tenant', true), ''),
      (SELECT ds."tenant_id" FROM "decision_signals" ds WHERE ds."id" = NEW."signal_id")
    );
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

-- Belt & braces: the pre-auth rate limiter keys on the platform user/tenant
-- (`__system__`, seeded by migrations 0009/0035). Recreate them if a deployment
-- ever lost the rows — login must not depend on manual data repair.
INSERT INTO "user" ("id", "email", "name", "role")
SELECT '__system__', 'system@localhost', 'System', 'user'
WHERE NOT EXISTS (SELECT 1 FROM "user" WHERE "id" = '__system__');
--> statement-breakpoint

INSERT INTO "organization" ("id", "name")
SELECT '__system__', 'System'
WHERE NOT EXISTS (SELECT 1 FROM "organization" WHERE "id" = '__system__');
--> statement-breakpoint

INSERT INTO "organization_member" ("org_id", "user_id", "role")
SELECT '__system__', '__system__', 'owner'
WHERE NOT EXISTS (
  SELECT 1 FROM "organization_member"
  WHERE "org_id" = '__system__' AND "user_id" = '__system__'
);
