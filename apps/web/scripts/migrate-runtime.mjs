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

const databaseUrl =
  process.env.MIGRATION_DATABASE_URL ||
  process.env.DIRECT_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  ((process.env.KESTREL_LOCAL_DOCKER ?? process.env.HAMAFX_LOCAL_DOCKER) === 'true'
    ? process.env.DATABASE_URL || process.env.POSTGRES_URL
    : undefined);

if (!databaseUrl) {
  console.error(
    '[runtime-migrate] No database URL configured. Set DIRECT_URL or POSTGRES_URL_NON_POOLING for production migrations.',
  );
  process.exit(1);
}

// The OSS release is single-user only. Do this preflight before opening a
// connection or applying migrations so an unsupported deployment cannot
// mutate its database and fail only after the migration chain completes.
const multiUserEnabled = ['1', 'true'].includes((process.env.MULTI_USER_ENABLED ?? '').toLowerCase());
const rlsEnabled = ['1', 'true'].includes(
  (process.env.KESTREL_ENABLE_RLS ?? process.env.HAMAFX_ENABLE_RLS ?? '').toLowerCase(),
);
const registrationMode = (process.env.REGISTRATION_MODE ?? 'owner-first').toLowerCase();
if (registrationMode === 'open' && !multiUserEnabled) {
  console.error(
    '[runtime-migrate] registrationMode === \'open\' requires MULTI_USER_ENABLED=true; refusing an unsafe single-user configuration.',
  );
  process.exit(1);
}
if (multiUserEnabled !== rlsEnabled) {
  console.error(
    '[runtime-migrate] MULTI_USER_ENABLED and KESTREL_ENABLE_RLS must be enabled together; refusing an unsafe partial configuration.',
  );
  process.exit(1);
}

function resolveSslOptions() {
  if (process.env.DB_DISABLE_SSL === 'true') {
    if (
      process.env.NODE_ENV !== 'production' ||
      (process.env.KESTREL_LOCAL_DOCKER ?? process.env.HAMAFX_LOCAL_DOCKER) === 'true'
    ) {
      return false;
    }
    throw new Error(
      '[runtime-migrate] DB_DISABLE_SSL=true is only permitted with KESTREL_LOCAL_DOCKER=true.',
    );
  }
  const ca = process.env.SUPABASE_CA_CERT?.replace(/\\n/g, '\n').trim();
  if (ca) return { ca, rejectUnauthorized: true };
  return process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: true }
    : { rejectUnauthorized: false };
}

const redactUrl = (url) => url.replace(/:[^/@]+@/, ':***@');
console.log(`[runtime-migrate] Applying migrations using ${redactUrl(databaseUrl)}`);

const sql = postgres(databaseUrl, {
  // Prevent concurrent app replicas/processes from applying migrations or
  // changing the single-user RLS state at the same time. PostgreSQL advisory
  // locks are connection-scoped and released automatically if this process
  // exits unexpectedly.
  onnotice: () => {},

  prepare: false,
  max: 1,
  connect_timeout: 10,
  idle_timeout: 10,
  max_lifetime: 60,
  ssl: resolveSslOptions(),
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

  const db = drizzle(sql);
  await migrate(db, {
    migrationsFolder: '/app/packages/db/drizzle',
    migrationsSchema: 'drizzle',
    migrationsTable: '__drizzle_migrations',
  });

  // Migration 0038 creates RLS policies unconditionally because Drizzle
  // migrations are deployment-wide. Only legacy single-user deployments
  // disable them. Shared mode must leave RLS enabled and forced.
  if (!rlsEnabled) {
    const tenantTables = [
    'agent_opinions', 'alerts', 'audit_logs', 'bot_links', 'briefings_emitted',
    'chat_telemetry', 'chat_threads', 'chat_tool_telemetry', 'daily_ai_spend',
    'decision_signal_feedback', 'decision_signal_outcomes', 'decision_signals',
    'journal_entries', 'memory_embeddings', 'notification_noise_state',
    'portfolio_positions', 'portfolio_settings', 'provider_tests',
    'push_subscriptions', 'rate_limits', 'shared_snapshots', 'user_sessions',
    'user_settings', 'user_symbols', 'chat_messages',
  ];
    for (const table of tenantTables) {
      // The list mirrors migration 0038's RLS cutover, but later migrations
      // may drop tables (0052 removed the decision_signals feature set, and
      // 0084 removed analysis_jobs is not listed; future drops are possible).
      // Skip tables that no longer exist so a stale list entry cannot block
      // the app from starting.
      const [exists] = await sql`
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = ${table} AND n.nspname = 'public' AND c.relkind = 'r'
      `;
      if (!exists) continue;
      await sql.unsafe(`ALTER TABLE "${table}" NO FORCE ROW LEVEL SECURITY`);
      await sql.unsafe(`ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY`);
    }
    console.log('[runtime-migrate] Single-user mode: tenant RLS disabled.');
  } else {
    console.log('[runtime-migrate] Shared mode: tenant RLS remains enabled and forced.');
  }

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
