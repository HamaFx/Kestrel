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

// Retention sweep for chat-image uploads (audit 2026-10-31, R7).
//
// The sweep walks the same `<userId>/<YYYY-MM-DD>/<file>` layout the uploader
// writes (`buildChatImageObjectPath`) and deletes every day folder on or
// before the retention cutoff. It used to list bare `YYYY-MM-DD` prefixes,
// which matched nothing, so nothing was ever deleted.
//
// Cohort choice: the bucket listing is authoritative, not the database. An
// upload that was never sent to a chat or attached to a journal row is
// invisible in the database and would leak storage forever if the sweep
// depended on rows. The object path already carries the owner and the day, so
// the listing needs no rows to be correct, and it reclaims orphans too.
//
// Journal exemption (owner decision, R7 follow-up): a screenshot deliberately
// attached to a journal entry is not disposable storage. Before deleting a
// user's expired days the sweep asks `loadJournalReferences` for the paths
// those rows store, and skips every object they reference. The lookup is
// scoped to the day folders being swept and bounded by the caller; when it
// fails or its bound is hit, that user's expired objects are kept for another
// run rather than risking deletion of a referenced file.
//
// The sweep is bounded (`maxUsers`, `maxDeletes`) so the 60s cron budget can
// never be spent walking a pathological bucket. Within a visited user, day
// folders are swept oldest first and never exceed the deletion budget, so a
// truncated run leaves only the newest expired days for the next tick.

import {
  CHAT_IMAGE_BUCKET_NAME,
  CHAT_IMAGE_DAY_PATTERN,
  chatImageDay,
  chatImageObjectPrefix,
  parseChatImageObjectPath,
} from './chat-image-paths';

export const UPLOAD_RETENTION_DAYS = 7;

const LIST_PAGE_SIZE = 100;
const DELETE_BATCH_SIZE = 100;
const MAX_LIST_PAGES = 10;

interface StorageEntry {
  name?: unknown;
  id?: unknown;
}

/**
 * Stored journal references for one user's expired day folders, as returned
 * by the database-aware loader. `references` holds the raw stored values
 * (`journal_entries.screenshot_url` and every `attachments` entry); values
 * that are not chat-image paths are ignored by the sweep.
 */
export interface JournalReferenceLookup {
  references: readonly string[];
  /** True when the loader hit its own row bound, so the list is incomplete. */
  truncated: boolean;
}

/**
 * Fetch the journal references scoped to the day folders about to be swept.
 * The loader owns its bound; a truncated or failed lookup must never be
 * treated as "no references".
 */
export type JournalReferenceLoader = (
  userId: string,
  expiredDays: readonly string[],
) => Promise<JournalReferenceLookup>;

export interface UploadCleanupOptions {
  supabaseUrl: string;
  serviceRoleKey: string;
  /**
   * Journal-reference source. Required so the sweep can never silently delete
   * a screenshot a logged trade still points at; callers without a database
   * pass a loader that reports no references.
   */
  loadJournalReferences: JournalReferenceLoader;
  now?: Date;
  retentionDays?: number;
  listPageSize?: number;
  deleteBatchSize?: number;
  /**
   * Safety cap on user prefixes inspected per run. Users are swept in
   * alphabetical order, so a deployment with more uploaders than this would
   * starve the tail of the alphabet; raise it (or shard the sweep) only if the
   * bucket ever holds that many uploaders, since the 60s cron budget bounds
   * this too.
   */
  maxUsers?: number;
  maxDeletes?: number;
  warn?: (message: string, fields?: Record<string, unknown>) => void;
}

export interface UploadCleanupSummary {
  /** Objects deleted in this run. */
  deleted: number;
  /** User prefixes inspected. */
  usersScanned: number;
  /** Day folders swept (they had at least one object deleted). */
  dayFoldersSwept: number;
  /** Day folders at or before the cutoff, including empty ones. */
  dayFoldersExpired: number;
  /** Objects kept because a journal entry still references them. */
  journalReferencedKept: number;
  /** Users whose expired objects were kept because the reference lookup failed or was truncated. */
  journalUsersDeferred: number;
  /** Listing or deletion failures, including failed reference lookups. */
  errors: number;
  /** A safety cap stopped the sweep early; the remainder waits for a later run. */
  truncated: boolean;
  /** Day folders on or before this UTC day are deleted. */
  cutoffDay: string;
}

export async function runUploadCleanup(
  options: UploadCleanupOptions,
): Promise<UploadCleanupSummary> {
  const {
    supabaseUrl,
    serviceRoleKey,
    loadJournalReferences,
    now = new Date(),
    retentionDays = UPLOAD_RETENTION_DAYS,
    listPageSize = LIST_PAGE_SIZE,
    deleteBatchSize = DELETE_BATCH_SIZE,
    maxUsers = 500,
    maxDeletes = 5000,
    warn,
  } = options;

  const base = supabaseUrl.replace(/\/+$/, '');
  const headers = {
    authorization: `Bearer ${serviceRoleKey}`,
    'content-type': 'application/json',
  };
  const cutoffDay = chatImageDay(new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000));

  const summary: UploadCleanupSummary = {
    deleted: 0,
    usersScanned: 0,
    dayFoldersSwept: 0,
    dayFoldersExpired: 0,
    journalReferencedKept: 0,
    journalUsersDeferred: 0,
    errors: 0,
    truncated: false,
    cutoffDay,
  };

  /**
   * List one bucket prefix page by page. `null` means the listing failed and
   * the caller should skip that prefix rather than abort the whole sweep.
   */
  async function listPrefix(
    prefix: string,
    pageSize = LIST_PAGE_SIZE,
  ): Promise<StorageEntry[] | null> {
    const entries: StorageEntry[] = [];
    for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
      let res: Response;
      try {
        res = await fetch(`${base}/storage/v1/object/list/${CHAT_IMAGE_BUCKET_NAME}`, {
          method: 'POST',
          headers,
          cache: 'no-store',
          body: JSON.stringify({
            prefix,
            limit: pageSize,
            offset: page * pageSize,
            sortBy: { column: 'name', order: 'asc' },
          }),
        });
      } catch (err) {
        summary.errors += 1;
        warn?.('upload cleanup list failed', { prefix, err: String(err) });
        return null;
      }
      if (!res.ok) {
        summary.errors += 1;
        warn?.('upload cleanup list failed', { prefix, status: res.status });
        return null;
      }
      const pageEntries = (await res.json().catch(() => null)) as StorageEntry[] | null;
      if (!Array.isArray(pageEntries)) return entries;
      entries.push(...pageEntries);
      if (pageEntries.length < pageSize) return entries;
    }
    return entries;
  }

  /** Delete object paths in batches; returns how many were deleted. */
  async function deleteObjects(paths: string[], batchSize: number): Promise<number> {
    let deleted = 0;
    for (let index = 0; index < paths.length; index += batchSize) {
      const prefixes = paths.slice(index, index + batchSize);
      let res: Response;
      try {
        res = await fetch(`${base}/storage/v1/object/${CHAT_IMAGE_BUCKET_NAME}`, {
          method: 'DELETE',
          headers,
          cache: 'no-store',
          body: JSON.stringify({ prefixes }),
        });
      } catch (err) {
        summary.errors += 1;
        warn?.('upload cleanup delete failed', { err: String(err), count: prefixes.length });
        continue;
      }
      if (!res.ok) {
        summary.errors += 1;
        warn?.('upload cleanup delete failed', { status: res.status, count: prefixes.length });
        continue;
      }
      deleted += prefixes.length;
    }
    return deleted;
  }

  const rootEntries = await listPrefix('');
  if (rootEntries === null) return summary;
  const userFolders = folderNames(rootEntries)
    .filter((name) => !name.includes('/'))
    .sort();

  for (const userId of userFolders) {
    if (summary.usersScanned >= maxUsers || summary.deleted >= maxDeletes) {
      summary.truncated = true;
      break;
    }

    const dayEntries = await listPrefix(chatImageObjectPrefix(userId));
    if (dayEntries === null) continue;
    summary.usersScanned += 1;

    const expiredDays = folderNames(dayEntries)
      .filter((day) => CHAT_IMAGE_DAY_PATTERN.test(day) && day <= cutoffDay)
      .sort();
    summary.dayFoldersExpired += expiredDays.length;
    if (expiredDays.length === 0) continue;

    let referencedPaths: ReadonlySet<string>;
    try {
      const lookup = await loadJournalReferences(userId, expiredDays);
      if (lookup.truncated) {
        // Incomplete list: keep everything this user's expired days hold and
        // let an operator raise the bound before the next run.
        summary.journalUsersDeferred += 1;
        warn?.('upload cleanup journal reference bound hit; keeping expired uploads', {
          userId,
          expiredDays: expiredDays.length,
        });
        continue;
      }
      referencedPaths = collectReferencedPaths(lookup.references);
    } catch (err) {
      // Cannot prove an object is unreferenced, so do not delete any of them.
      summary.journalUsersDeferred += 1;
      summary.errors += 1;
      warn?.('upload cleanup journal reference lookup failed; keeping expired uploads', {
        userId,
        err: String(err),
      });
      continue;
    }

    for (const day of expiredDays) {
      const remaining = maxDeletes - summary.deleted;
      if (remaining <= 0) {
        summary.truncated = true;
        break;
      }
      const prefix = chatImageObjectPrefix(userId, day);
      const objects = await listPrefix(prefix, listPageSize);
      if (objects === null) continue;

      const objectPaths = objectNames(objects).map((name) => `${prefix}/${name}`);
      if (objectPaths.length === 0) continue;
      const deletable = objectPaths.filter((path) => {
        if (!referencedPaths.has(path)) return true;
        summary.journalReferencedKept += 1;
        return false;
      });
      // Never exceed the run's deletion budget: whatever is left waits for the
      // next tick (day folders are swept oldest first).
      const batch = deletable.slice(0, remaining);
      if (batch.length < deletable.length) summary.truncated = true;

      const deleted = await deleteObjects(batch, deleteBatchSize);
      if (deleted > 0) summary.dayFoldersSwept += 1;
      summary.deleted += deleted;
    }
  }

  return summary;
}

/** Normalise stored journal references to bucket object paths; ignore foreign values. */
function collectReferencedPaths(references: readonly string[]): Set<string> {
  const paths = new Set<string>();
  for (const reference of references) {
    const path = parseChatImageObjectPath(reference);
    if (path !== null) paths.add(path);
  }
  return paths;
}

/** Folder entries are the ones without an object id. */
function folderNames(entries: StorageEntry[]): string[] {
  return entries
    .filter((entry) => typeof entry.name === 'string' && entry.name.length > 0)
    .filter((entry) => entry.id === null || entry.id === undefined)
    .map((entry) => entry.name as string);
}

/** Object entries are the ones with an object id. */
function objectNames(entries: StorageEntry[]): string[] {
  return entries
    .filter((entry) => typeof entry.name === 'string' && entry.name.length > 0)
    .filter((entry) => entry.id !== null && entry.id !== undefined)
    .map((entry) => entry.name as string);
}
