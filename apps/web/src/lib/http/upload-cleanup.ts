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
// Cohort choice: the bucket listing is authoritative, not the database. The
// database only sees uploads that ended up in a chat message part or a journal
// row; an upload that was never sent is invisible there and would leak storage
// forever. The object path already carries the owner and the day, so the
// listing needs no database rows to be correct, and it reclaims orphans too.
// Deleting a blob still referenced by an old row is the intended retention
// policy: the reference is older than the window.
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
} from './chat-image-paths';

export const UPLOAD_RETENTION_DAYS = 7;

const LIST_PAGE_SIZE = 100;
const DELETE_BATCH_SIZE = 100;
const MAX_LIST_PAGES = 10;

interface StorageEntry {
  name?: unknown;
  id?: unknown;
}

export interface UploadCleanupOptions {
  supabaseUrl: string;
  serviceRoleKey: string;
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
  /** Listing or deletion failures. */
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
      // Never exceed the run's deletion budget: whatever is left waits for the
      // next tick (day folders are swept oldest first).
      const batch = objectPaths.slice(0, remaining);
      if (batch.length < objectPaths.length) summary.truncated = true;

      const deleted = await deleteObjects(batch, deleteBatchSize);
      if (deleted > 0) summary.dayFoldersSwept += 1;
      summary.deleted += deleted;
    }
  }

  return summary;
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
