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

// Phase 3 Task 1 — soft-deleted journal entries must never resurface.
//
// The legacy `@kestrel/db` journal query layer soft-deleted rows
// (`SET deleted_at = now()`) but the canonical `@kestrel/ai` persistence
// layer hard-deleted them and never filtered `deletedAt` on reads, so any
// row soft-deleted through the legacy API stayed visible to the AI journal
// list, detail view, and coach stats. The canonical reads now filter
// `isNull(deletedAt)`; this test pins that every read path keeps doing so.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getEntry, listEntries } from '../src/journal/persistence/crud';
import { computeStats } from '../src/journal/persistence/stats/query';

const state = vi.hoisted(() => ({
  isNullColumns: [] as string[],
  rows: [] as unknown[],
}));

vi.mock('@kestrel/db', () => {
  const table = (name: string, columns: string[]) => {
    const t: Record<string, unknown> = { __table: name };
    for (const c of columns) t[c] = { name: c };
    return t;
  };
  const schema = {
    journalEntries: table('journal_entries', [
      'id',
      'userId',
      'tenantId',
      'deletedAt',
      'openedAt',
      'symbol',
      'side',
      'outcome',
    ]),
  };

  // Chainable Drizzle stub: both `await ...orderBy(...)` and
  // `await ...orderBy(...).limit(...)` resolve to the seeded rows.
  const chain: Record<string, unknown> = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => Promise.resolve(state.rows),
    then: (onFulfilled: unknown, onRejected?: unknown) =>
      Promise.resolve(state.rows).then(
        onFulfilled as (value: unknown[]) => unknown,
        onRejected as ((reason: unknown) => unknown) | undefined,
      ),
  };

  return {
    schema,
    getDb: () => chain,
    getAdminDb: () => chain,
    hasAdminDbScope: () => false,
    hasTenantDbScope: () => false,
    requireTenantIdForUser: async () => 'tenant-1',
  };
});

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = (await importOriginal<Record<string, unknown>>()) as Record<string, unknown>;
  const realIsNull = actual.isNull as (column: unknown) => unknown;
  // Wrap `isNull` so each read's deletedAt predicate is assertable; the fake
  // schema columns are opaque to the real SQL builder.
  const isNull = (column: unknown) => {
    state.isNullColumns.push((column as { name?: string } | undefined)?.name ?? String(column));
    return realIsNull(column);
  };
  return { ...actual, isNull };
});

// Keep the memory-index (embeddings, encryption, server-only) out of this
// query-shape unit test.
vi.mock('../src/memory/memory-index', () => ({ rememberJournalEntry: vi.fn() }));

describe('journal persistence — soft-deleted rows never resurface', () => {
  beforeEach(() => {
    state.isNullColumns = [];
    state.rows = [];
  });

  it('listEntries filters isNull(journalEntries.deletedAt)', async () => {
    await listEntries('user-1', { limit: 10 });
    expect(state.isNullColumns).toContain('deletedAt');
  });

  it('getEntry filters isNull(journalEntries.deletedAt)', async () => {
    await getEntry('user-1', 'entry-1');
    expect(state.isNullColumns).toContain('deletedAt');
  });

  it('computeStats filters isNull(journalEntries.deletedAt) so coach stats never count deleted trades', async () => {
    await computeStats('user-1');
    expect(state.isNullColumns).toContain('deletedAt');
  });
});
