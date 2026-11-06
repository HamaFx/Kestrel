#!/usr/bin/env node

// Runtime migration entrypoint for the standalone Docker image.
//
// This intentionally uses Drizzle's programmatic migrator instead of
// drizzle-kit: standalone Next.js output does not guarantee that the CLI is
// present. The process exits non-zero on any failure so the application never
// starts against a stale or partial schema.
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import { resolvePostgresSslOptions } from '../../../packages/db/scripts/lib/ssl-standalone.mjs';

const databaseUrl =
  process.env.MIGRATION_DATABASE_URL ||
  process.env.DIRECT_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  (process.env.KESTREL_LOCAL_DOCKER === 'true'
    ? process.env.DATABASE_URL || process.env.POSTGRES_URL
    : undefined);

if (!databaseUrl) {
  console.error(
    '[runtime-migrate] No database URL configured. Set DIRECT_URL or POSTGRES_URL_NON_POOLING for production migrations.',
  );
  process.exit(1);
}

// Private deployment: multi-user + RLS required; fail closed otherwise.
// Run this preflight before opening a connection or applying migrations so an
// unsupported configuration cannot mutate its database.
const multiUserEnabled = ['1', 'true'].includes(
  (process.env.MULTI_USER_ENABLED ?? '').toLowerCase(),
);
const rlsEnabled = ['1', 'true'].includes((process.env.KESTREL_ENABLE_RLS ?? '').toLowerCase());
const registrationMode = (process.env.REGISTRATION_MODE ?? 'first_user').toLowerCase();
if (registrationMode === 'open' && !multiUserEnabled) {
  console.error(
    '[runtime-migrate] REGISTRATION_MODE=open requires MULTI_USER_ENABLED=true; refusing an unsafe configuration.',
  );
  process.exit(1);
}
if (multiUserEnabled !== rlsEnabled) {
  console.error(
    '[runtime-migrate] MULTI_USER_ENABLED and KESTREL_ENABLE_RLS must be enabled together; refusing an unsafe partial configuration.',
  );
  process.exit(1);
}
if (!multiUserEnabled || !rlsEnabled) {
  console.error(
    '[runtime-migrate] MULTI_USER_ENABLED=1 and KESTREL_ENABLE_RLS=1 are required; refusing an unsafe configuration.',
  );
  process.exit(1);
}

const redactUrl = (url) => url.replace(/:[^/@]+@/, ':***@');
console.log(`[runtime-migrate] Applying migrations using ${redactUrl(databaseUrl)}`);

const APP_ROLE = 'kestrel_app';
const MIN_APP_PASSWORD_LENGTH = 16;

/**
 * Create/update the non-bypass application login used by DATABASE_URL.
 * Runs on the privileged migration connection after the schema exists so the
 * grants cover every table the migration chain just created.
 */
async function ensureAppRole(sqlClient) {
  const password = (process.env.POSTGRES_APP_PASSWORD ?? '').trim();
  if (!password) {
    console.error(
      '[runtime-migrate] POSTGRES_APP_PASSWORD is required when KESTREL_LOCAL_DOCKER=true; refusing to start without the non-bypass app role.',
    );
    process.exit(1);
  }
  if (password.length < MIN_APP_PASSWORD_LENGTH) {
    console.error(
      `[runtime-migrate] POSTGRES_APP_PASSWORD must be at least ${MIN_APP_PASSWORD_LENGTH} characters; refusing to install a weak database login.`,
    );
    process.exit(1);
  }

  const [{ present }] = await sqlClient`
    SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = ${APP_ROLE}) AS present
  `;
  const [statements] = await sqlClient`
    SELECT
      format(
        'CREATE ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD %L',
        ${APP_ROLE}::text, ${password}::text
      ) AS create_role,
      format(
        'ALTER ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD %L',
        ${APP_ROLE}::text, ${password}::text
      ) AS alter_role,
      format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I',
        ${APP_ROLE}::text
      ) AS grant_tables,
      format(
        'GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO %I',
        ${APP_ROLE}::text
      ) AS grant_sequences
  `;

  await sqlClient.unsafe(present ? statements.alter_role : statements.create_role);
  await sqlClient.unsafe(statements.grant_tables);
  await sqlClient.unsafe(statements.grant_sequences);

  // Default privileges are advisory: a managed deploy role may not be allowed
  // to alter another role's defaults. Migration 0119 already arms them where
  // possible, and the explicit grants above cover the current schema.
  try {
    const [defaults] = await sqlClient`
      SELECT
        format(
          'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
          current_user, ${APP_ROLE}::text
        ) AS table_privileges,
        format(
          'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO %I',
          current_user, ${APP_ROLE}::text
        ) AS sequence_privileges
    `;
    await sqlClient.unsafe(defaults.table_privileges);
    await sqlClient.unsafe(defaults.sequence_privileges);
  } catch {
    console.warn('[runtime-migrate] Could not arm default privileges for', APP_ROLE);
  }

  console.log(
    `[runtime-migrate] ${APP_ROLE} ${present ? 'updated' : 'created'} with LOGIN, NOBYPASSRLS (RLS applies).`,
  );
}

const sql = postgres(databaseUrl, {
  // Prevent concurrent app replicas/processes from applying migrations at the
  // same time. PostgreSQL advisory locks are connection-scoped and released
  // automatically if this process exits unexpectedly.
  onnotice: () => {},

  prepare: false,
  max: 1,
  connect_timeout: 10,
  idle_timeout: 10,
  max_lifetime: 60,
  ssl: resolvePostgresSslOptions(databaseUrl, process.env),
});

try {
  await sql`SELECT pg_advisory_lock(hashtext('kestrel:runtime-migrations'))`;
  console.log('[runtime-migrate] Acquired migration lock.');

  // The migration chain uses unqualified vector and gen_random_uuid names.
  // Install/repair both extensions before Drizzle opens its migration
  // transaction so fresh PostgreSQL and legacy extensions-schema databases
  // behave the same way.
  const existingExtensions = await sql`
    SELECT e.extname, n.nspname AS schema_name
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname IN ('vector', 'pgcrypto')
  `;
  for (const extension of existingExtensions) {
    if (extension.schema_name !== 'public') {
      await sql.unsafe(`ALTER EXTENSION ${extension.extname} SET SCHEMA public`);
    }
  }
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  const extensions = await sql`
    SELECT e.extname, n.nspname AS schema_name
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname IN ('vector', 'pgcrypto')
  `;
  for (const extension of extensions) {
    if (extension.schema_name !== 'public') {
      await sql.unsafe(`ALTER EXTENSION ${extension.extname} SET SCHEMA public`);
    }
  }

  // Ensure Supabase compatibility roles exist before migrations run so that
  // migrations like 0069 and 0070 succeed on standalone/Docker Postgres instances.
  await sql`
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
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
        CREATE ROLE postgres NOLOGIN;
      END IF;
    END
    $$;
  `;

  const db = drizzle({ client: sql });
  await migrate(db, {
    migrationsFolder: '/app/packages/db/drizzle',
    migrationsSchema: 'drizzle',
    migrationsTable: '__drizzle_migrations',
  });

  // Phase 1 (Task 1.4): the bundled Compose stack connects as the non-bypass
  // kestrel_app role. Fresh volumes get it from init-admin-role.sh, but init
  // scripts never re-run on an existing volume, so (re)provision it here with
  // the privileged migration connection. The password never appears in SQL
  // text or logs: PostgreSQL receives it as a parameter and quote_literal()s it.
  if (process.env.KESTREL_LOCAL_DOCKER === 'true') {
    await ensureAppRole(sql);
  }

  // RLS is required in all deployments. Refuse to start if disabled.
  if (!rlsEnabled) {
    console.error('[runtime-migrate] KESTREL_ENABLE_RLS must be 1; refusing to start.');
    process.exit(1);
  }
  console.log('[runtime-migrate] Multi-user mode: tenant RLS remains enabled and forced.');

  console.log('[runtime-migrate] Migrations completed successfully.');
} catch (error) {
  console.error(
    '[runtime-migrate] Migration failed; refusing to start the application.',
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
} finally {
  try {
    await sql`SELECT pg_advisory_unlock(hashtext('kestrel:runtime-migrations'))`;
  } catch {
    // The connection may already be unavailable; PostgreSQL releases the
    // advisory lock automatically when it closes.
  }
  await sql.end({ timeout: 5 });
}
