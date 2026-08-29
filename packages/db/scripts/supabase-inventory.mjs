#!/usr/bin/env node

/**
 * Read-only Supabase/PostgreSQL inventory.
 *
 * This command never selects application payloads and never performs DDL/DML.
 * It reports schema/security/size metadata and bounded health counts so the
 * production baseline can be repeated without exposing credentials or user
 * content.
 *
 * Usage:
 *   pnpm --filter @kestrel/db inventory:live
 *   pnpm --filter @kestrel/db inventory:live -- --json
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

function loadDotEnv(path) {
  if (!existsSync(path)) return {};
  const result = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2] ?? '';
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[match[1]] = value;
  }
  return result;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const fileEnv = {
  ...loadDotEnv(resolve(root, '.env.production.local')),
  ...loadDotEnv(resolve(root, '.env.local')),
};
for (const [key, value] of Object.entries(fileEnv)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

function resolveDatabaseUrl() {
  return (
    process.env.SUPABASE_INVENTORY_DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DIRECT_URL ||
    null
  );
}

function resolveSslOptions() {
  if (process.env.DB_DISABLE_SSL === 'true') {
    if (
      process.env.NODE_ENV !== 'production' ||
      (process.env.KESTREL_LOCAL_DOCKER ?? process.env.HAMAFX_LOCAL_DOCKER) === 'true'
    ) {
      return false;
    }
    throw new Error('DB_DISABLE_SSL=true is only permitted with KESTREL_LOCAL_DOCKER=true.');
  }
  const ca = process.env.SUPABASE_CA_CERT?.replace(/\\n/g, '\n').trim();
  return ca
    ? { ca, rejectUnauthorized: true }
    : process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production'
      ? { rejectUnauthorized: true }
      : { rejectUnauthorized: false };
}

function number(value) {
  return Number(value ?? 0);
}

function printHuman(report) {
  console.log('\nKestrel Supabase inventory (READ ONLY)\n');
  console.log(`Connection: ${report.connection}`);
  console.log(`PostgreSQL: ${report.server.postgresVersion}`);
  console.log(`Role: ${report.security.currentRole ?? 'unavailable'}`);
  console.log(`RLS: ${report.security.rlsEnabledTables}/${report.security.publicTables} tables enabled`);
  console.log(`Policies: ${report.security.policyCount}`);
  console.log(`Extensions: ${report.server.extensions.join(', ') || 'none'}`);
  console.log(`Applied Drizzle migrations: ${report.migrations.applied}`);
  console.log(`Database size: ${report.storage.databaseSizeBytes} bytes`);
  console.log('\nLargest tables:');
  for (const table of report.storage.largestTables) {
    console.log(`  ${table.table}: rows~${table.estimatedRows} size=${table.totalBytes} bytes`);
  }
  console.log('\nKnown row estimates:');
  for (const [table, count] of Object.entries(report.data.knownRowCounts)) {
    console.log(`  ${table}: ${count}`);
  }
  console.log('\nIntegrity signals:');
  for (const [name, value] of Object.entries(report.integrity)) {
    console.log(`  ${name}: ${value}`);
  }
  if (report.errors.length > 0) {
    console.log('\nNon-fatal query errors:');
    for (const error of report.errors) console.log(`  ${error}`);
  }
  console.log('\nNo database writes were performed.');
}

const url = resolveDatabaseUrl();
const jsonOutput = process.argv.includes('--json') || process.argv.includes('--json=true');
if (!url) {
  const report = {
    connection: 'unavailable',
    server: { postgresVersion: null, extensions: [] },
    security: {
      currentRole: null,
      roleBypassRls: null,
      publicTables: 0,
      rlsEnabledTables: 0,
      forcedRlsTables: 0,
      policyCount: 0,
    },
    migrations: { applied: null },
    storage: { databaseSizeBytes: null, largestTables: [] },
    data: { knownRowCounts: {} },
    integrity: {},
    errors: [
      'No SUPABASE_INVENTORY_DATABASE_URL, DIRECT_URL, POSTGRES_URL_NON_POOLING, DATABASE_URL, or POSTGRES_URL configured',
    ],
  };
  if (jsonOutput) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
  process.exit(0);
}

const sql = postgres(url, {
  prepare: false,
  max: 1,
  connect_timeout: 10,
  idle_timeout: 10,
  statement_timeout: 10_000,
  ssl: resolveSslOptions(),
});
const errors = [];

async function safe(label, query, fallback) {
  try {
    return await query();
  } catch (error) {
    errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    return fallback;
  }
}

try {
  const versionRows = await safe(
    'server version',
    () => sql`SELECT current_setting('server_version') AS version`,
    [{ version: null }],
  );
  const roleRows = await safe(
    'role',
    () => sql`SELECT current_user AS current_role, r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user`,
    [],
  );
  const extensionRows = await safe(
    'extensions',
    () => sql`SELECT extname FROM pg_extension ORDER BY extname`,
    [],
  );
  const tableRows = await safe(
    'tables',
    () => sql`
      SELECT c.relname AS table_name,
             c.relrowsecurity AS rls_enabled,
             c.relforcerowsecurity AS forced_rls,
             COALESCE(s.n_live_tup, 0)::bigint AS estimated_rows,
             pg_total_relation_size(c.oid)::bigint AS total_bytes
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY pg_total_relation_size(c.oid) DESC
    `,
    [],
  );
  const policyRows = await safe(
    'policies',
    () => sql`SELECT count(*)::int AS count FROM pg_policies WHERE schemaname = 'public'`,
    [{ count: 0 }],
  );
  const sizeRows = await safe(
    'database size',
    () => sql`SELECT pg_database_size(current_database())::bigint AS bytes`,
    [{ bytes: null }],
  );
  const migrationRows = await safe(
    'migration journal',
    () => sql`SELECT count(*)::int AS count FROM drizzle."__drizzle_migrations"`,
    [{ count: null }],
  );

  const knownTables = [
    'user',
    'organization',
    'organization_member',
    'user_settings',
    'chat_threads',
    'chat_messages',
    'chat_telemetry',
    'chat_tool_telemetry',
    'diagnostic_traces',
    'candles_1m',
    'payments',
    'subscriptions',
    'billing_webhook_dlq',
    'persistence_outbox',
    'full_analysis_queue',
  ];
  const knownRowCounts = {};
  for (const table of knownTables) {
    const rows = await safe(
      `row estimate ${table}`,
      () => sql`
        SELECT COALESCE(s.n_live_tup, 0)::bigint AS count
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
        WHERE n.nspname = 'public' AND c.relname = ${table} AND c.relkind = 'r'
      `,
      [],
    );
    knownRowCounts[table] = rows.length === 0 ? null : number(rows[0]?.count);
  }

  const integrityQueries = {
    usersWithoutMembership: () => sql`
      SELECT count(*)::int AS count
      FROM public."user" u
      LEFT JOIN public.organization_member m ON m.user_id = u.id
      WHERE m.user_id IS NULL
    `,
    membershipsWithoutOrganization: () => sql`
      SELECT count(*)::int AS count
      FROM public.organization_member m
      LEFT JOIN public.organization o ON o.id = m.org_id
      WHERE o.id IS NULL
    `,
    tenantNullUserSettings: () => sql`SELECT count(*)::int AS count FROM public.user_settings WHERE tenant_id IS NULL`,
    tenantNullThreads: () => sql`SELECT count(*)::int AS count FROM public.chat_threads WHERE tenant_id IS NULL`,
    tenantNullMessages: () => sql`SELECT count(*)::int AS count FROM public.chat_messages WHERE tenant_id IS NULL`,
    pendingOutbox: () => sql`SELECT count(*)::int AS count FROM public.persistence_outbox WHERE status NOT IN ('completed', 'failed')`,
    pendingBillingDlq: () => sql`SELECT count(*)::int AS count FROM public.billing_webhook_dlq WHERE status = 'pending'`,
  };
  const integrity = {};
  for (const [name, query] of Object.entries(integrityQueries)) {
    const rows = await safe(`integrity ${name}`, query, [{ count: null }]);
    integrity[name] = rows[0]?.count === null ? null : number(rows[0]?.count);
  }

  const role = roleRows[0];
  const report = {
    connection: 'verified',
    server: {
      postgresVersion: versionRows[0]?.version ?? null,
      extensions: extensionRows.map((row) => row.extname),
    },
    security: {
      currentRole: role?.current_role ?? null,
      roleBypassRls: role?.rolbypassrls ?? null,
      publicTables: tableRows.length,
      rlsEnabledTables: tableRows.filter((row) => row.rls_enabled).length,
      forcedRlsTables: tableRows.filter((row) => row.forced_rls).length,
      policyCount: number(policyRows[0]?.count),
    },
    migrations: {
      applied: migrationRows[0]?.count === null ? null : number(migrationRows[0]?.count),
    },
    storage: {
      databaseSizeBytes: sizeRows[0]?.bytes === null ? null : number(sizeRows[0]?.bytes),
      largestTables: tableRows.slice(0, 20).map((row) => ({
        table: row.table_name,
        estimatedRows: number(row.estimated_rows),
        totalBytes: number(row.total_bytes),
      })),
    },
    data: { knownRowCounts },
    integrity,
    errors,
  };

  if (jsonOutput) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
} finally {
  await sql.end({ timeout: 5 });
}
