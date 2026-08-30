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
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { resolveMigrationDatabaseUrl } from '@kestrel/shared';
import { buildMigrationPlan, assertMigrationPlanIsConsistent } from '../dist/migration-plan.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = resolve(__dirname, '..', 'drizzle');

let databaseUrl;
try {
  databaseUrl = resolveMigrationDatabaseUrl(process.env);
} catch (error) {
  console.error(`[migrate:apply] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

function resolveSslOption() {
  const ca = process.env.SUPABASE_CA_CERT?.replace(/\\n/g, '\n').trim();
  if (ca) return { ca, rejectUnauthorized: true };

  if (process.env.DB_DISABLE_SSL === 'true') {
    if (
      process.env.NODE_ENV !== 'production' ||
      (process.env.KESTREL_LOCAL_DOCKER ?? process.env.HAMAFX_LOCAL_DOCKER) === 'true'
    ) {
      return false;
    }
    throw new Error(
      '[migrate:apply] DB_DISABLE_SSL=true is only permitted with KESTREL_LOCAL_DOCKER=true; ' +
        'configure verified TLS for production databases.',
    );
  }

  // Migration connections are privileged and must not silently downgrade
  // certificate verification. Node's system CA store handles Supabase and
  // other publicly trusted Postgres endpoints when no explicit CA is set.
  const productionTls =
    process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  return productionTls ? { rejectUnauthorized: true } : { rejectUnauthorized: false };
}

const plan = buildMigrationPlan(DRIZZLE_DIR);
assertMigrationPlanIsConsistent(plan);
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

try {
  const db = drizzle(sql);
  const startedAt = Date.now();
  console.log('[migrate:apply] Applying migrations using postgres.js...');
  console.log('[migrate:apply] PostgreSQL migration lock is managed by Drizzle; lock waits will be reported by the driver.');
  await migrate(db, { migrationsFolder: DRIZZLE_DIR });
  console.log(`[migrate:apply] OK — migrations applied successfully in ${Date.now() - startedAt}ms.`);
} catch (err) {
  console.error('[migrate:apply] Migration failed:', err);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
