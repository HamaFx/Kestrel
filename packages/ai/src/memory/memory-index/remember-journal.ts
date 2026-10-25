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

// Journal-entry writer for the memory index.

import { requireTenantIdForUser, schema } from '@kestrel/db';
import type { Symbol } from '@kestrel/shared';
import { and, eq } from 'drizzle-orm';

import { getDb } from '../../runtime/db';
import type { EmbedEnv, EmbedUserSettings } from './types';
import { upsertMemory } from './upsert';

export interface RememberJournalArgs {
  entryId: string;
  userId: string;
  env?: Partial<EmbedEnv>;
  /** Phase D2 — user's embedding pick. */
  userSettings?: EmbedUserSettings;
  signal?: AbortSignal | null;
}

/**
 * Embed a journal entry from the live row. Composes `notes` + side/symbol
 * context so the search can hit on either lexical or semantic prompts.
 */
export async function rememberJournalEntry(
  args: RememberJournalArgs,
): Promise<{ stored: boolean; reason?: string }> {
  const rows = await getDb()
    .select()
    .from(schema.journalEntries)
    .where(
      and(
        eq(schema.journalEntries.id, args.entryId),
        eq(schema.journalEntries.userId, args.userId),
        eq(schema.journalEntries.tenantId, await requireTenantIdForUser(args.userId, getDb())),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return { stored: false, reason: 'not_found' };

  const text = composeJournalText(row);
  return upsertMemory({
    kind: 'journal',
    sourceId: row.id,
    symbol: row.symbol as Symbol,
    text,
    meta: {
      side: row.side,
      outcome: row.outcome,
      rMultiple: row.rMultiple,
      tags: row.tags,
    },
    occurredAt: row.openedAt,
    userId: args.userId,
    ...(args.env ? { env: args.env } : {}),
    ...(args.userSettings ? { userSettings: args.userSettings } : {}),
    ...(args.signal ? { signal: args.signal } : {}),
  });
}

/** Exported for testing — composes a searchable text from a journal entry row. */
export function composeJournalText(row: typeof schema.journalEntries.$inferSelect): string {
  const lines = [
    `${row.side === 'long' ? 'Long' : 'Short'} ${row.symbol} @ ${row.entry}`,
    row.stop !== null ? `stop ${row.stop}` : null,
    row.target !== null ? `target ${row.target}` : null,
    row.exit !== null ? `exit ${row.exit}` : null,
    row.outcome !== 'open' ? `outcome ${row.outcome}` : null,
    row.rMultiple !== null ? `R ${row.rMultiple.toFixed(2)}` : null,
    Array.isArray(row.tags) && row.tags.length > 0 ? `tags ${row.tags.join(', ')}` : null,
    row.notes ?? null,
  ].filter((s): s is string => s !== null);
  return lines.join(' · ');
}
