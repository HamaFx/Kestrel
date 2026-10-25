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

// Journal CRUD, scoped to the authenticated user and tenant.
//
// Phase 7b: every successful create / update fires a best-effort
// re-embedding of the entry into the memory index so `search_knowledge`
// can recall journal context. The memory call is fire-and-forget — the
// CRUD response never waits on it.

import { requireTenantIdForUser, schema } from '@kestrel/db';
import {
  SymbolSchema,
  TradeOutcomeSchema,
  TradeSideSchema,
  type JournalEntry,
  type Symbol,
} from '@kestrel/shared';
import { createCategorizedLogger } from '@kestrel/shared/logger';
import { and, desc, eq } from 'drizzle-orm';

import { rememberJournalEntry } from '../../memory/memory-index';
import { getDb } from '../../runtime/db';
import { rowToEntry } from './rows';
import { computeRMultiple } from './stats/r-multiple';
import type { CreateJournalInput, UpdateJournalInput } from './types';

const jlog = createCategorizedLogger('ai', { component: 'journal' });

export async function listEntries(
  userId: string,
  opts: { limit?: number; symbol?: Symbol } = {},
): Promise<JournalEntry[]> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const filters = [
    eq(schema.journalEntries.userId, userId),
    eq(schema.journalEntries.tenantId, tenantId),
  ];
  if (opts.symbol) filters.push(eq(schema.journalEntries.symbol, opts.symbol));

  const rows = await db
    .select()
    .from(schema.journalEntries)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(schema.journalEntries.openedAt))
    .limit(opts.limit ?? 100);

  return rows.map(rowToEntry);
}

export async function getEntry(userId: string, id: string): Promise<JournalEntry | null> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const rows = await db
    .select()
    .from(schema.journalEntries)
    .where(
      and(
        eq(schema.journalEntries.id, id),
        eq(schema.journalEntries.userId, userId),
        eq(schema.journalEntries.tenantId, tenantId),
      ),
    )
    .limit(1);
  const row = rows[0];
  return row ? rowToEntry(row) : null;
}

export async function createEntry(input: CreateJournalInput): Promise<JournalEntry> {
  const symbol = SymbolSchema.parse(input.symbol);
  const side = TradeSideSchema.parse(input.side);

  const db = getDb();
  const tenantId = await requireTenantIdForUser(input.userId, db);
  const inserted = await db
    .insert(schema.journalEntries)
    .values({
      userId: input.userId,
      tenantId,
      symbol,
      side,
      openedAt: new Date(input.openedAt),
      entry: input.entry,
      stop: input.stop ?? null,
      target: input.target ?? null,
      size: input.size ?? null,
      outcome: 'open',
      notes: input.notes ?? null,
      tags: input.tags ?? [],
      screenshotUrl: input.screenshotUrl ?? null,
    })
    .returning();
  const entry = rowToEntry(inserted[0]!);

  // Best-effort memory write so `search_knowledge` can recall this trade.
  // Errors here must never block the journal-CRUD response.
  void rememberJournalEntry({ entryId: entry.id, userId: input.userId }).catch((err) => {
    jlog.warn('memory upsert failed', { err: String(err) });
  });

  return entry;
}

export async function updateEntry(
  userId: string,
  id: string,
  input: UpdateJournalInput,
): Promise<JournalEntry | null> {
  // Wrap in a transaction with SELECT ... FOR UPDATE to prevent
  // concurrent update races: two requests reading the same entry
  // and computing different rMultiple/outcome values would silently
  // overwrite each other without row-level locking.
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(schema.journalEntries)
      .where(
        and(
          eq(schema.journalEntries.id, id),
          eq(schema.journalEntries.userId, userId),
          eq(schema.journalEntries.tenantId, tenantId),
        ),
      )
      .for('update')
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    const existing = rowToEntry(row);

    const patch: Partial<typeof schema.journalEntries.$inferInsert> = {};

    if (input.closedAt !== undefined) {
      patch.closedAt = input.closedAt === null ? null : new Date(input.closedAt);
    }
    if (input.exit !== undefined) patch.exit = input.exit;
    if (input.stop !== undefined) patch.stop = input.stop;
    if (input.target !== undefined) patch.target = input.target;
    if (input.size !== undefined) patch.size = input.size;
    if (input.outcome !== undefined) patch.outcome = TradeOutcomeSchema.parse(input.outcome);
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.tags !== undefined) patch.tags = input.tags;

    // Auto-compute outcome + rMultiple when we have enough data.
    const exit = input.exit ?? existing.exit;
    const stop = input.stop ?? existing.stop;
    const closedAt = (input.closedAt ?? existing.closedAt) as number | null;
    if (exit !== null && stop !== null && closedAt !== null) {
      const r = computeRMultiple({
        side: existing.side,
        entry: existing.entry,
        stop,
        exit,
      });
      patch.rMultiple = r;
      if (input.outcome === undefined) {
        patch.outcome = r > 0.05 ? 'win' : r < -0.05 ? 'loss' : 'breakeven';
      }
    }

    const updated = await tx
      .update(schema.journalEntries)
      .set(patch)
      .where(
        and(
          eq(schema.journalEntries.id, id),
          eq(schema.journalEntries.userId, userId),
          eq(schema.journalEntries.tenantId, tenantId),
        ),
      )
      .returning();
    if (!updated[0]) return null;
    const entry = rowToEntry(updated[0]);

    // Re-embed: outcomes and notes change the natural-language summary
    // we feed the memory index, so a stale row would mislead recall.
    void rememberJournalEntry({ entryId: entry.id, userId }).catch((err) => {
      jlog.warn('memory upsert failed', { err: String(err) });
    });

    return entry;
  });
}

export async function deleteEntry(userId: string, id: string): Promise<boolean> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const result = await db
    .delete(schema.journalEntries)
    .where(
      and(
        eq(schema.journalEntries.id, id),
        eq(schema.journalEntries.userId, userId),
        eq(schema.journalEntries.tenantId, tenantId),
      ),
    )
    .returning({ id: schema.journalEntries.id });
  return result.length > 0;
}
