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

// SPDX-License-Identifier: Apache-2.0

// Database health probes for the public and authenticated health routes.
//
// The routes stay controllers: they own HTTP status and response shape, while
// every query and migration-file read lives here in the service layer.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getDb, type DbClient } from '@kestrel/db';
import { sql } from 'drizzle-orm';

export interface HealthCheckResult {
  ok: boolean;
  latencyMs?: number;
  message?: string;
}

export interface DatabaseHealthResult {
  ok: boolean;
  connectivity: HealthCheckResult;
  migrations: {
    ok: boolean;
    expected: number;
    actual?: number;
    message?: string;
  };
}

export interface CronRunsHealthResult extends HealthCheckResult {
  recentRuns?: number;
  stuckRuns?: number;
}

/**
 * Resolve the Drizzle migration journal shipped with `@kestrel/db`.
 * A missing journal is a deployment-integrity failure: never fall back to a
 * stale count.
 */
function getExpectedMigrationCount(): number | null {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const journalPath = join(
      here,
      '..',
      '..',
      '..',
      '..',
      '..',
      '..',
      'packages',
      'db',
      'drizzle',
      'meta',
      '_journal.json',
    );
    const journal = JSON.parse(readFileSync(journalPath, 'utf-8')) as { entries: unknown[] };
    return journal.entries.length;
  } catch {
    return null;
  }
}

/** Drizzle migrations tracking table count. */
async function countAppliedMigrations(db: DbClient): Promise<number> {
  try {
    const rows = await db.execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM drizzle."__drizzle_migrations"
    `);
    return Number((rows[0] as { count: string } | undefined)?.count ?? 0);
  } catch {
    const rows = await db.execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM public."__drizzle_migrations"
    `);
    return Number((rows[0] as { count: string } | undefined)?.count ?? 0);
  }
}

/** `SELECT 1` connectivity probe with latency. */
export async function checkDatabaseConnectivity(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    await getDb().execute(sql`SELECT 1`);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : 'db check failed',
    };
  }
}

/** Minimal boolean connectivity probe for the unauthenticated health route. */
export async function pingDatabase(): Promise<boolean> {
  try {
    await getDb().execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

/** Verify the pgvector extension is installed. */
export async function checkPgvectorExtension(): Promise<HealthCheckResult> {
  try {
    const rows = await getDb().execute<{ extname: string }>(sql`
      SELECT extname FROM pg_extension WHERE extname = 'vector'
    `);
    if (rows.length === 0) {
      return { ok: false, message: 'pgvector extension not installed' };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'pgvector check failed' };
  }
}

/** Recent cron runs plus runs stuck in `started` for more than five minutes. */
export async function checkCronRunsHealth(): Promise<CronRunsHealthResult> {
  try {
    // postgres.js `unsafe()` bindings accept strings, not Date instances —
    // passing a Date throws ERR_INVALID_ARG_TYPE inside the driver.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [row] = await getDb().execute<{ recent: string; stuck: string }>(sql`
      SELECT
        COUNT(*)::text AS recent,
        COUNT(*) FILTER (
          WHERE status = 'started'
          AND started_at < now() - INTERVAL '5 minutes'
        )::text AS stuck
      FROM cron_runs
      WHERE started_at >= ${since}::timestamptz
    `);
    return {
      ok: true,
      recentRuns: Number((row as { recent: string; stuck: string }).recent ?? 0),
      stuckRuns: Number((row as { recent: string; stuck: string }).stuck ?? 0),
    };
  } catch {
    // cron_runs table may not exist yet (pre-migration). Non-fatal.
    return { ok: true, message: 'cron_runs unavailable (may need migration)' };
  }
}

/** Connectivity plus migration-count parity for `/api/health/db`. */
export async function getDatabaseHealth(): Promise<DatabaseHealthResult> {
  const expectedMigrations = getExpectedMigrationCount();
  const connectivity = await checkDatabaseConnectivity();

  let migrations: DatabaseHealthResult['migrations'];
  try {
    const actual = await countAppliedMigrations(getDb());
    if (expectedMigrations !== null) {
      migrations = {
        ok: actual >= expectedMigrations,
        expected: expectedMigrations,
        actual,
        ...(actual < expectedMigrations
          ? { message: `missing ${expectedMigrations - actual} migrations` }
          : {}),
      };
    } else {
      migrations = {
        ok: false,
        expected: 0,
        actual,
        message: 'migration journal unavailable in deployment',
      };
    }
  } catch (err) {
    migrations = {
      ok: false,
      expected: expectedMigrations ?? 0,
      message: err instanceof Error ? err.message : 'migration count check failed',
    };
  }

  return {
    ok: connectivity.ok && migrations.ok,
    connectivity,
    migrations,
  };
}
