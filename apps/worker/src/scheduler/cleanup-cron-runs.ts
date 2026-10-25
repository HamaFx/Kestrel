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

// WK-2 startup cleanup: mark stale cron_runs rows left behind by a crash
// as 'error' before the first timer fires.

import { getDb } from '@kestrel/ai';
import { sql } from 'drizzle-orm';

import type { Logger } from '../log.js';

/**
 * WK-2: Mark stale cron_runs rows as 'error' on startup.
 *
 * After a crash or forced restart, rows left in 'started' status are
 * cleaned up so the health endpoint (/api/health) stops reporting them
 * as stuck and the idempotency lock releases for the next scheduled run.
 * Rows older than 5 minutes are considered stale.
 */
export async function cleanupStaleCronRuns(log: Logger): Promise<void> {
  try {
    const db = getDb();
    if (!db || typeof db.execute !== 'function') {
      log.warn('Skipping stale cron cleanup because the database is unavailable');
      return;
    }
    const result = await db.execute(sql`
      UPDATE cron_runs
      SET status = 'error',
          finished_at = now(),
          note = COALESCE(note, 'marked stale on scheduler startup')
      WHERE status = 'started'
        AND started_at < now() - INTERVAL '5 minutes'
    `);

    // In drizzle-orm, execute() returns RowList which may have .length
    // as an array-like property. Cast to access count of affected rows.
    const count = Array.isArray(result)
      ? result.length
      : Number(
          (result as { count?: number; length?: number }).count ??
            (result as { length?: number }).length ??
            0,
        );
    if (count > 0) {
      log.warn(`Cleaned up ${count} stale cron_runs row(s) from previous run`);
    }
  } catch (err) {
    log.warn('Failed to clean up stale cron_runs rows (non-fatal)', { err: String(err) });
  }
}
