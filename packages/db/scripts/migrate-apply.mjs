#!/usr/bin/env node
/* eslint-disable no-console -- CLI status output is its public interface. */
/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveMigrationDatabaseUrl } from '@kestrel/shared';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import { resolveScriptSsl } from './lib/ssl.mjs';
import {
  assertMigrationPlanIsConsistent,
  assertMigrationPlanWillApply,
  buildMigrationPlan,
} from '../dist/migration-plan.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = resolve(__dirname, '..', 'drizzle');

let databaseUrl;
try {
  databaseUrl = resolveMigrationDatabaseUrl(process.env);
} catch (error) {
  console.error(`[migrate:apply] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const resolveSslOption = () => resolveScriptSsl(databaseUrl);

const plan = buildMigrationPlan(DRIZZLE_DIR);
try {
  assertMigrationPlanIsConsistent(plan);
} catch (err) {
  console.error(
    `[migrate:apply] Migration journal is not deployable: ${err instanceof Error ? err.message : err}`,
  );
  process.exit(1);
}
const dryRun = process.argv.includes('--dry-run');
if (dryRun) {
  console.log(`[migrate:apply] Dry run: ${plan.entries.length} migration(s) are valid and ready.`);
  for (const entry of plan.entries) console.log(`  -> ${entry.tag} (${entry.file})`);
  process.exit(0);
}

const sslOption = resolveSslOption();

const sql = postgres(databaseUrl, {
  prepare: false,
  max: 1,
  ssl: sslOption,
});

// R11 preflight — refuse a plan drizzle would silently skip. Drizzle applies
// an entry only when its `when` (folderMillis) is strictly newer than the
// newest `created_at` recorded in drizzle.__drizzle_migrations; it does not
// follow journal order. Running before the migrator means an operator sees
// this failure instead of a deploy that quietly ships a schema change that
// was never applied.
try {
  const tracking = await sql`
    SELECT to_regclass('drizzle.__drizzle_migrations') AS table_name
  `;
  let appliedRows = [];
  if (tracking[0]?.table_name) {
    // v0 databases have no `name` column yet; the migrator adds and backfills
    // it on the first v1 run, so the preflight must tolerate both shapes.
    const columns = await sql`
      SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'
    `;
    const hasName = columns.some((column) => column.column_name === 'name');
    appliedRows = hasName
      ? await sql`SELECT hash, created_at, name FROM drizzle."__drizzle_migrations"`
      : await sql`SELECT hash, created_at FROM drizzle."__drizzle_migrations"`;
  }
  const audit = assertMigrationPlanWillApply(
    plan,
    appliedRows.map((row) => ({
      hash: row.hash,
      createdAt: row.created_at === null ? null : Number(row.created_at),
      name: row.name ?? null,
    })),
  );
  console.log(
    `[migrate:apply] Preflight OK — ${audit.appliedCount} of ${plan.entries.length} migration(s) ` +
      `already applied, ${plan.entries.length - audit.appliedCount} to apply.`,
  );
} catch (err) {
  console.error(
    `[migrate:apply] Preflight failed — refusing to apply migrations: ${err instanceof Error ? err.message : err}`,
  );
  await sql.end({ timeout: 5 });
  process.exit(1);
}

try {
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
  const startedAt = Date.now();
  console.log('[migrate:apply] Applying migrations using postgres.js...');
  console.log(
    '[migrate:apply] PostgreSQL migration lock is managed by Drizzle; lock waits will be reported by the driver.',
  );
  await migrate(db, {
    migrationsFolder: DRIZZLE_DIR,
    migrationsSchema: 'drizzle',
    migrationsTable: '__drizzle_migrations',
  });
  console.log(
    `[migrate:apply] OK — migrations applied successfully in ${Date.now() - startedAt}ms.`,
  );
} catch (err) {
  console.error('[migrate:apply] Migration failed:', err);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
