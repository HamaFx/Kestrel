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

// P1-6 — outbox replay conflict guard. A re-catch for the same dedupe key
// must never flip a row the recovery worker has claimed ('processing') or
// already finished ('completed') back to 'pending', and callers must be able
// to detect the suppressed no-op from the return value.
//
// The SQL-level behavior (the ON CONFLICT WHERE actually guarding rows in
// Postgres) belongs to the Postgres integration suite; this unit test pins
// the statement shape and the boolean contract.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { enqueuePersistenceFailure } from '../src/persistence/outbox';

interface CapturedConflict {
  target: unknown[];
  set: Record<string, unknown>;
  where: unknown;
}

const state = vi.hoisted(() => ({
  insertValues: [] as Array<Record<string, unknown>>,
  conflict: null as CapturedConflict | null,
  returningRows: [] as Array<{ id: string }>,
  failInsert: false,
}));

vi.mock('@kestrel/db', () => {
  const column = (name: string) => ({ __column: name, name });
  const persistenceOutbox = {
    __table: 'persistence_outbox',
    id: column('id'),
    tenantId: column('tenant_id'),
    dedupeKey: column('dedupe_key'),
    status: column('status'),
  };
  const getDb = () => ({
    insert: (table: { __table?: string }) => {
      expect(table.__table).toBe('persistence_outbox');
      if (state.failInsert) throw new Error('sink down');
      return {
        values: (values: Record<string, unknown>) => {
          state.insertValues.push(values);
          return {
            onConflictDoUpdate: (cfg: CapturedConflict) => {
              state.conflict = cfg;
              return {
                returning: () => Promise.resolve(state.returningRows),
              };
            },
          };
        },
      };
    },
  });
  return {
    getDb,
    getAdminDb: getDb,
    hasTenantDbScope: () => false,
    requireTenantIdForUser: async () => 'tenant-1',
    schema: { persistenceOutbox },
  };
});

/** Reconstruct a drizzle `sql` template's text from its query chunks. */
function sqlText(sqlObj: unknown): string {
  const chunks = (sqlObj as { queryChunks?: unknown[] })?.queryChunks ?? [];
  return chunks
    .map((chunk) => {
      if (chunk == null) return '?';
      const constructorName = (chunk as { constructor?: { name?: string } }).constructor?.name;
      if (constructorName === 'StringChunk') {
        const value = (chunk as { value?: unknown }).value;
        return Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');
      }
      if (typeof chunk === 'string') return chunk;
      const name = (chunk as { name?: string }).name;
      return typeof name === 'string' ? `"${name}"` : '?';
    })
    .join('');
}

const baseArgs = {
  userId: 'user-1',
  operation: 'message.user' as const,
  dedupeKey: 'message.user:thread-1:msg-1',
  payload: { content: 'hello' },
  threadId: 'thread-1',
  messageId: 'msg-1',
  error: new Error('db down'),
};

describe('enqueuePersistenceFailure — P1-6 conflict guard', () => {
  beforeEach(() => {
    state.insertValues = [];
    state.conflict = null;
    state.returningRows = [{ id: 'row-1' }];
    state.failInsert = false;
  });

  it('inserts a pending row and reports true for a queued item', async () => {
    await expect(enqueuePersistenceFailure(baseArgs)).resolves.toBe(true);

    const values = state.insertValues[0]!;
    expect(values.userId).toBe('user-1');
    expect(values.status).toBe('pending');
    expect(values.dedupeKey).toBe(baseArgs.dedupeKey);
  });

  it('guards the conflict SET with status NOT IN (processing, completed)', async () => {
    await enqueuePersistenceFailure(baseArgs);

    const cfg = state.conflict!;
    expect(cfg).not.toBeNull();
    // Re-arm a pending/failed row instead of the old status CASE dance; the
    // WHERE clause alone decides whether the update applies at all.
    expect(cfg.set.status).toBe('pending');
    expect(sqlText(cfg.where).replace(/\s+/g, ' ').trim()).toContain(
      `NOT IN ('processing', 'completed')`,
    );
    // The guard reads the EXISTING row's status column.
    expect(sqlText(cfg.where)).toContain('"status"');
    // Conflict target stays the tenant dedupe key.
    expect((cfg.target as Array<{ name: string }>).map((c) => c.name)).toEqual([
      'tenant_id',
      'dedupe_key',
    ]);
  });

  it('returns false when the conflict guard suppresses the update (no-op)', async () => {
    state.returningRows = [];

    await expect(enqueuePersistenceFailure(baseArgs)).resolves.toBe(false);
  });

  it('returns false without throwing when the outbox sink itself fails', async () => {
    state.failInsert = true;

    await expect(enqueuePersistenceFailure(baseArgs)).resolves.toBe(false);
  });
});
