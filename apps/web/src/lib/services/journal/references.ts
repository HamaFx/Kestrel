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

// Database side of the upload-retention journal exemption (audit 2026-10-31,
// R7 follow-up). A screenshot attached to a journal entry must outlive the
// 7-day upload window, so `runUploadCleanup` asks this loader for the paths
// one user's rows reference inside the day folders it is about to sweep.
//
// Scope: `withCronAuth` opens no database scope, so the read runs on the admin
// (BYPASSRLS) connection exactly like `getActiveUserIdsForCron`; on the
// non-bypass role every tenant policy would evaluate false and the lookup
// would silently report "no references".
//
// Bound: one query per inspected user, at most once per run, filtered by
// `user_id` and by the swept days, and capped at
// `MAX_JOURNAL_REFERENCE_ROWS + 1` rows. Hitting the cap (or a query failure)
// makes the caller keep that user's expired objects for a later run instead of
// deleting a file it could not clear. Soft-deleted rows are included: a user
// can restore them, and their screenshot must still resolve.
//
// No migration (owner constraint): the query leans on the existing
// `journal_entries_user_id_idx` plus a `LIKE '%/<day>/%'` match against the two
// reference columns. `screenshot_url` is nullable text and `attachments` is a
// non-null text[]; every stored shape that names a chat-image object (proxy
// path, bare storage path, legacy public URL) contains `/<userId>/<day>/`, so
// a day match is exact for the layout the uploader writes. A false positive
// costs one kept object, while a false negative would delete a file a logged
// trade still points at, so the match errs wide.

import { schema, withAdminDb } from '@kestrel/db';
import { and, eq, or, sql } from 'drizzle-orm';

import type { JournalReferenceLoader, JournalReferenceLookup } from '@/lib/http/upload-cleanup';

/**
 * Rows read per user per run. A user with more matching rows than this has
 * their sweep deferred (objects kept, `journalUsersDeferred` reported) rather
 * than risking a partial exclusion list.
 */
export const MAX_JOURNAL_REFERENCE_ROWS = 1000;

/** Cron-side loader passed to `runUploadCleanup`. */
export const loadJournalReferences: JournalReferenceLoader = async (userId, expiredDays) => {
  if (expiredDays.length === 0) return { references: [], truncated: false };

  return withAdminDb(async (db) => {
    const journal = schema.journalEntries;
    const rows = await db
      .select({ screenshotUrl: journal.screenshotUrl, attachments: journal.attachments })
      .from(journal)
      .where(
        and(
          eq(journal.userId, userId),
          or(
            ...expiredDays.map(
              (day) =>
                sql`(${journal.screenshotUrl} like ${dayPattern(day)} or exists (select 1 from unnest(${journal.attachments}) as attachment where attachment like ${dayPattern(day)}))`,
            ),
          ),
        ),
      )
      .limit(MAX_JOURNAL_REFERENCE_ROWS + 1);

    const truncated = rows.length > MAX_JOURNAL_REFERENCE_ROWS;
    return journalReferencesFromRows(rows.slice(0, MAX_JOURNAL_REFERENCE_ROWS), truncated);
  });
};

/** Flatten one page of journal rows into the raw reference list. */
export function journalReferencesFromRows(
  rows: readonly { screenshotUrl: string | null; attachments: readonly string[] | null }[],
  truncated: boolean,
): JournalReferenceLookup {
  const references: string[] = [];
  for (const row of rows) {
    if (row.screenshotUrl) references.push(row.screenshotUrl);
    for (const attachment of row.attachments ?? []) {
      if (attachment) references.push(attachment);
    }
  }
  return { references, truncated };
}

/** Match a stored reference whose path contains the swept day folder. */
function dayPattern(day: string): string {
  return `%/${day}/%`;
}
