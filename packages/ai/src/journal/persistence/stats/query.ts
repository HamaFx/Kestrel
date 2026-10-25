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

// Tenant-scoped stats query over the journal entries.

import { requireTenantIdForUser, schema } from '@kestrel/db';
import type { JournalStats } from '@kestrel/shared';
import { and, asc, eq, gte, lte } from 'drizzle-orm';

import { getDb } from '@ai/runtime/db';

import { rowToEntry } from '../rows';
import { summarize } from './summarize';

export async function computeStats(
  userId: string,
  opts: { sinceMs?: number; untilMs?: number } = {},
): Promise<JournalStats> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const filters = [
    eq(schema.journalEntries.userId, userId),
    eq(schema.journalEntries.tenantId, tenantId),
  ];
  if (opts.sinceMs !== undefined)
    filters.push(gte(schema.journalEntries.openedAt, new Date(opts.sinceMs)));
  if (opts.untilMs !== undefined)
    filters.push(lte(schema.journalEntries.openedAt, new Date(opts.untilMs)));

  const rows = await db
    .select()
    .from(schema.journalEntries)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(asc(schema.journalEntries.openedAt));
  return summarize(rows.map(rowToEntry));
}
