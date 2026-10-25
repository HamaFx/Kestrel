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

// Postgres connection-string resolvers. Runtime traffic prefers DATABASE_URL;
// migrations must use a session-bound (non-pooler) URL.

import type { ServerEnv } from '../env';

/**
 * Resolve the active Postgres connection string for app traffic, preferring DATABASE_URL.
 */
export function resolveDatabaseUrl(env: Pick<ServerEnv, 'DATABASE_URL' | 'POSTGRES_URL'>): string {
  const url = env.DATABASE_URL || env.POSTGRES_URL;
  if (!url) throw new Error('Neither DATABASE_URL nor POSTGRES_URL is set');
  return url;
}

/**
 * Resolve the direct/session-mode Postgres connection string for migrations,
 * backups, and other session-bound operations.
 */
export function resolveDirectDatabaseUrl(
  env: Pick<ServerEnv, 'DIRECT_URL' | 'POSTGRES_URL_NON_POOLING' | 'DATABASE_URL' | 'POSTGRES_URL'>,
): string {
  const url =
    env.DIRECT_URL || env.POSTGRES_URL_NON_POOLING || env.DATABASE_URL || env.POSTGRES_URL;
  if (!url) {
    throw new Error(
      'Neither DIRECT_URL, POSTGRES_URL_NON_POOLING, DATABASE_URL, nor POSTGRES_URL is set',
    );
  }
  return url;
}

/** Return true for Supabase/PgBouncer transaction-pooler URLs. */
export function isTransactionPoolerUrl(value: string): boolean {
  const parsed = new URL(value);
  // Supabase's session pooler uses the same `*.pooler.supabase.com` host
  // family on port 5432 and supports session-bound operations. Only the
  // transaction-mode endpoint (6543) is unsafe for migrations.
  return parsed.port === '6543';
}

/**
 * Resolve the URL allowed for migrations and other session-bound operations.
 * A runtime pooler URL is never accepted because PgBouncer transaction mode
 * can silently discard session-bound DDL.
 */
export function resolveMigrationDatabaseUrl(
  env: Pick<ServerEnv, 'DIRECT_URL' | 'POSTGRES_URL_NON_POOLING'>,
): string {
  const url = env.DIRECT_URL || env.POSTGRES_URL_NON_POOLING;
  if (!url) {
    throw new Error(
      'DIRECT_URL or POSTGRES_URL_NON_POOLING is required for migrations; runtime pooler URLs are not accepted',
    );
  }
  if (isTransactionPoolerUrl(url)) {
    throw new Error(
      'Migration database URL points to a transaction pooler. Use the Supabase direct/session URL on port 5432.',
    );
  }
  return url;
}
