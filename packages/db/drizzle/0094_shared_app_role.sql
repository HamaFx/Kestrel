-- 0094: Create the non-bypass application role for shared runtime mode.
--
-- Web requests must connect as a role that cannot bypass RLS. The role is
-- intentionally NOLOGIN here; its password/login credential is provisioned
-- out-of-band and stored only in deployment secret managers. This keeps
-- credentials out of migration history while making grants reproducible.
--
-- The application still uses explicit tenant transactions and
-- app.current_tenant. Grants provide table access; RLS policies provide row
-- isolation. Admin/worker jobs continue to use hamafx_admin via
-- ADMIN_DATABASE_URL.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kestrel_app') THEN
    CREATE ROLE kestrel_app
      WITH NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO kestrel_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public
  TO kestrel_app;
--> statement-breakpoint

GRANT USAGE, SELECT, UPDATE
  ON ALL SEQUENCES IN SCHEMA public
  TO kestrel_app;
--> statement-breakpoint

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kestrel_app;
--> statement-breakpoint

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO kestrel_app;
