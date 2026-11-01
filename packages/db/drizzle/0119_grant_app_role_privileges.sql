-- 0119 — Make the non-bypass application role usable.
--
-- Audit 2026-10-31 (R1/R19). `kestrel_app` (created NOLOGIN by 0094) is the
-- role the web app is meant to connect as so that row level security actually
-- applies — a superuser, which is what the Docker stack and the Supabase
-- default both connect as, bypasses every policy regardless of FORCE.
--
-- Running the application as that role against a freshly migrated database
-- exposed two privilege gaps:
--
--   1. `provider_circuit_state` (created by 0097, after 0094's blanket
--      `GRANT ... ON ALL TABLES`) had no privileges at all, so the AI circuit
--      breaker's write-through failed with "permission denied for table
--      provider_circuit_state".
--   2. Default privileges were declared only `FOR ROLE postgres`, so objects
--      created by any other migrator role inherited no grants. The Docker
--      stack migrates as the `hamafx` superuser, which means every table a
--      future migration adds would be invisible to the app role.
--
-- This grants the current objects explicitly and re-arms the defaults for
-- whichever role executes migrations, so a later migration cannot silently
-- leave the app role behind again. Passing a password is deliberately NOT part
-- of this file: role credentials belong to deployment provisioning, never to
-- migration history.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kestrel_app') THEN
    RAISE NOTICE '0119: kestrel_app role not present; skipping application grants';
    RETURN;
  END IF;

  -- Objects that exist now.
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kestrel_app';
  EXECUTE 'GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO kestrel_app';

  -- Default privileges are advisory: they only matter for objects created
  -- later, and `ALTER DEFAULT PRIVILEGES FOR ROLE <other-role>` is permitted
  -- only for a member of that role or a superuser. A managed database's deploy
  -- role is commonly neither, so every block below tolerates insufficient
  -- privilege with a notice instead of failing the migration. The plain GRANTs
  -- above stay strict: those are the point of this migration.
  --
  -- This is what broke the first deploy of this migration: the guard found
  -- `hamafx_admin` (created by migration 0037 on the very first deploy) and the
  -- ALTER was denied - SQLSTATE 42501, "permission denied to change default
  -- privileges" - which stopped the build. Only the defaults were affected;
  -- they exist to cover objects a future migration creates, so skipping them
  -- costs nothing today.
  BEGIN
    -- Objects created later by the role running this migration. `current_user`
    -- covers the Docker migrator (hamafx) and self-hosted operator roles.
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kestrel_app',
      current_user
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO kestrel_app',
      current_user
    );
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '0119: not permitted to set default privileges for % (skipped; the grants to kestrel_app were still applied)', current_user;
  END;

  -- Supabase-style deployments migrate as `postgres`; keep that path armed
  -- whether or not it is the current role.
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
      EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kestrel_app';
      EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO kestrel_app';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '0119: not permitted to set default privileges for postgres (skipped)';
  END;

  -- The bundled Docker database owns objects with `hamafx`, and the worker's
  -- BYPASSRLS role is `hamafx_admin`. Arm both when they exist so neither the
  -- app role nor a future worker role is left without grants.
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hamafx') THEN
      EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE hamafx IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kestrel_app';
      EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE hamafx IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO kestrel_app';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '0119: not permitted to set default privileges for hamafx (skipped)';
  END;

  BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hamafx_admin') THEN
      EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE hamafx_admin IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kestrel_app';
      EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE hamafx_admin IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO kestrel_app';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '0119: not permitted to set default privileges for hamafx_admin (skipped)';
  END;
END
$$;
