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

// drizzle-kit reads this when generating / applying migrations.
// Run from the package root: pnpm --filter @kestrel/db migrate:gen | migrate:apply

import type { ConnectionOptions } from 'node:tls';

import { defineConfig } from 'drizzle-kit';

import { resolvePostgresSslOptions, type PostgresSslOptions } from './src/connection/supabase-ca';

const databaseUrl =
  process.env.DIRECT_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.MIGRATION_DATABASE_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;
const invokedByDrizzleKit = process.argv.some((arg) => arg.includes('drizzle-kit'));
if (!databaseUrl && invokedByDrizzleKit) {
  // eslint-disable-next-line no-console
  console.warn(
    '[drizzle-kit] None of DIRECT_URL, POSTGRES_URL_NON_POOLING, MIGRATION_DATABASE_URL, DATABASE_URL, or POSTGRES_URL is set. Generate-only commands will work, but migrate/studio will fail.',
  );
}

const resolvedUrl = databaseUrl ?? 'postgres://placeholder@localhost:5432/placeholder';
const ssl = resolvePostgresSslOptions(resolvedUrl, process.env);

/**
 * Drizzle Kit v1 does not accept `ssl` alongside `url`; TLS options are only
 * part of the host/port credentials form. Parse the URL into its parts when
 * TLS is active so the pinned Supabase CA keeps working.
 */
function credentials(url: string, sslOptions: PostgresSslOptions) {
  if (sslOptions === false) return { url };
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : undefined,
    user: decodeURIComponent(parsed.username) || undefined,
    password: decodeURIComponent(parsed.password) || undefined,
    database: parsed.pathname.replace(/^\//, ''),
    ssl: sslOptions as ConnectionOptions,
  };
}

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  // v1 push/pull manage every schema by default. Kestrel's instance also
  // hosts `pgboss`, `mastra`, and `drizzle`; never touch them.
  schemaFilter: ['public'],
  migrations: {
    table: '__drizzle_migrations',
    schema: 'drizzle',
  },
  // The app roles are provisioned by migrations 0037/0094, not by Kit.
  entities: {
    roles: {
      provider: 'supabase',
      exclude: ['kestrel_app', 'hamafx_admin', 'hamafx'],
    },
  },
  dbCredentials: credentials(resolvedUrl, ssl),
  verbose: true,
});
