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

// Phase 3 §3.11 — fetch active user IDs for cron jobs and background
// processing. There is no synthetic background-user fallback.
//
// A user is "active" if:
//   - `deletedAt IS NULL` (not soft-deleted)
//   - They have at least one chat thread (they've used the app at least once)
//
// The second condition prevents briefing/review jobs from running for
// users who signed up but never interacted. A fresh installation may
// legitimately produce an empty list.

import { eq, isNull } from 'drizzle-orm';

import { getDb, schema } from './index';

/**
 * Fetch all active user IDs from the database.
 *
 * Returns every non-deleted user who has at least one chat thread. A
 * fresh installation may legitimately return an empty array.
 */
export async function getActiveUserIds(): Promise<string[]> {
  const db = getDb();

  // Query users that are not soft-deleted and have at least one chat thread.
  // Uses INNER JOIN instead of correlated EXISTS subquery for better
  // performance — Postgres can use a hash join rather than executing
  // the subquery once per user row.
  const rows = await db
    .selectDistinct({ id: schema.users.id })
    .from(schema.users)
    .innerJoin(schema.chatThreads, eq(schema.chatThreads.userId, schema.users.id))
    .where(isNull(schema.users.deletedAt));

  const userIds = rows.map((r) => r.id);

  return userIds;
}
