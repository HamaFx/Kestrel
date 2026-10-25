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

// Connectivity probe used by health-check endpoints and pre-flight checks.

import { sql } from 'drizzle-orm';

import { getDb } from './scope';

/**
 * Check database connectivity with a lightweight query.
 * Returns `true` if the database is reachable and responding.
 *
 * Useful for health-check endpoints and pre-flight checks before
 * critical operations. Does NOT throw — returns false on any error.
 */
export async function checkDbHealth(): Promise<boolean> {
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}
