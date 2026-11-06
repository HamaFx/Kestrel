-- 0128: audit identifiers use the native uuid type.
--
-- Both audit tables generate their primary key with `crypto.randomUUID()` in
-- the application. Moving the type and the default into PostgreSQL removes the
-- client-side default, which silently produced a NULL id whenever a driver
-- path bypassed the Drizzle insert builder.
--
-- Existing rows were written by that same generator, so the cast is lossless.
-- The guard fails closed with an actionable message if a hand-edited row
-- contains something else, instead of aborting halfway through the ALTER.
--
-- The default is dropped before the type change: a text default cannot be
-- cast automatically to uuid. It is recreated as the native function.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "audit_logs"
    WHERE "id" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) THEN
    RAISE EXCEPTION 'audit_logs.id contains non-UUID values; replace them with gen_random_uuid() before applying 0128';
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "audit_logs" ALTER COLUMN "id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "audit_logs" ALTER COLUMN "id" SET DATA TYPE uuid USING "id"::uuid;
--> statement-breakpoint
ALTER TABLE "audit_logs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "admin_audit_log"
    WHERE "id" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) THEN
    RAISE EXCEPTION 'admin_audit_log.id contains non-UUID values; replace them with gen_random_uuid() before applying 0128';
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "admin_audit_log" ALTER COLUMN "id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "admin_audit_log" ALTER COLUMN "id" SET DATA TYPE uuid USING "id"::uuid;
--> statement-breakpoint
ALTER TABLE "admin_audit_log" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
