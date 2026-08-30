-- Migration 0069: restore public schema API grants
--
-- A clean public-schema rebuild removes table-level grants. Restore the
-- standard Supabase role privileges and default privileges so PostgREST and
-- future tables continue to work with RLS as the row-level boundary.
--
-- The grants below target the Supabase roles anon/authenticated/service_role,
-- which do not exist in the bundled (non-Supabase) Postgres. Create them
-- first so this migration also runs on fresh local installs. This must come
-- BEFORE the grants, so 0095 (local_postgres_roles) is now only a safety net
-- for databases that predate this block.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
  -- The bundled (non-Supabase) Postgres image has no `postgres` role at all:
  -- initdb created POSTGRES_USER as the superuser instead. The
  -- ALTER DEFAULT PRIVILEGES ... FOR ROLE "postgres" statements below (and
  -- in 0070/0094) require the role to exist, so create it as a NOLOGIN
  -- compatibility shim when it is absent. Harmless on Supabase, where the
  -- real postgres role already exists.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    CREATE ROLE postgres NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA "public" TO "anon", "authenticated", "service_role";
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA "public"
  TO "anon", "authenticated";
--> statement-breakpoint

GRANT ALL PRIVILEGES
  ON ALL TABLES IN SCHEMA "public"
  TO "service_role";
--> statement-breakpoint

GRANT USAGE, SELECT, UPDATE
  ON ALL SEQUENCES IN SCHEMA "public"
  TO "anon", "authenticated";
--> statement-breakpoint

GRANT ALL PRIVILEGES
  ON ALL SEQUENCES IN SCHEMA "public"
  TO "service_role";
--> statement-breakpoint

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES
  TO "anon", "authenticated";
--> statement-breakpoint

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
  GRANT ALL PRIVILEGES ON TABLES
  TO "service_role";
--> statement-breakpoint

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES
  TO "anon", "authenticated";
--> statement-breakpoint

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
  GRANT ALL PRIVILEGES ON SEQUENCES
  TO "service_role";
