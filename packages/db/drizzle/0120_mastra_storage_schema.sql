-- 0120 — Give the application role its Mastra storage schema.
--
-- Audit 2026-10-31 (R1). Mastra's PostgresStore keeps agent memory in a
-- dedicated schema (default `mastra`) and creates it lazily on first use,
-- which requires CREATE privilege on the database. The non-bypass application
-- role deliberately has neither, so after the RLS cutover every storage init
-- failed — observed by booting the app as `kestrel_app`:
--
--   permission denied for database "hamafx"
--   Unable to create schema "mastra". This requires CREATE privilege on the
--   database.
--
-- Pre-creating the schema here and granting the app role rights inside it keeps
-- the privilege minimal rather than handing the role database-wide CREATE: it
-- can provision its own storage objects in one schema and nothing else.
--
-- Created by the migration role, so the schema is owned by that role; the
-- explicit GRANT is what lets `kestrel_app` create its tables inside. Operator
-- note: if MASTRA_SCHEMA names a different schema, that one still has to be
-- created and granted the same way.

CREATE SCHEMA IF NOT EXISTS "mastra";
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kestrel_app') THEN
    EXECUTE 'GRANT USAGE, CREATE ON SCHEMA "mastra" TO kestrel_app';
    RAISE NOTICE '0120: kestrel_app may create objects in the mastra schema';
  ELSE
    RAISE NOTICE '0120: kestrel_app role not present; schema created without app grants';
  END IF;
END
$$;
