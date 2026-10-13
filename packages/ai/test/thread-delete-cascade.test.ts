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

// P1-7 — thread deletion must clean up the thread-scoped memory rows that
// have no FK to chat_threads (backfill/projection state, thread-synopsis
// embeddings) in the same transaction, and delete the Mastra runtime thread
// through the storage API. Row-level SQL correctness belongs to the Postgres
// suite; this unit test pins which tables are deleted, the scoping of each
// delete, the ownership no-op, and the best-effort Mastra cleanup.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteAllThreads, deleteThread } from '../src/persistence/thread-persistence';

const state = vi.hoisted(() => ({
  deleteCalls: [] as Array<{ table: string; eqs: Array<{ column: string; value: unknown }> }>,
  eqCalls: [] as Array<{ column: string; value: unknown }>,
  eqMark: 0,
  threadRows: [] as Array<{ id: string }>,
  mastraDeletes: [] as string[],
  getStoreDomain: '',
  failMastra: false,
}));

vi.mock('@kestrel/db', () => {
  const table = (name: string, columns: string[]) => {
    const t: Record<string, unknown> = { __table: name };
    for (const c of columns) t[c] = { name: c };
    return t;
  };
  const schema = {
    chatThreads: table('chat_threads', ['id', 'userId', 'tenantId']),
    memoryBackfillState: table('memory_backfill_state', ['userId', 'tenantId', 'threadId']),
    memoryProjectionState: table('memory_projection_state', ['userId', 'tenantId', 'threadId']),
    memoryEmbeddings: table('memory_embeddings', [
      'userId',
      'tenantId',
      'threadId',
      'kind',
      'sourceId',
    ]),
  };

  const tx = {
    delete: (tableRef: { __table?: string }) => {
      const tableName = tableRef.__table ?? 'unknown';
      return {
        where: (cond: unknown) => {
          void cond;
          state.deleteCalls.push({ table: tableName, eqs: state.eqCalls.slice(state.eqMark) });
          state.eqMark = state.eqCalls.length;
          const awaited = Promise.resolve();
          return {
            returning: () => {
              const rows = state.threadRows;
              state.threadRows = [];
              return Promise.resolve(rows);
            },
            then: awaited.then.bind(awaited),
            catch: awaited.catch.bind(awaited),
            finally: awaited.finally.bind(awaited),
          };
        },
      };
    },
  };

  const db = {
    transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
  };

  return {
    schema,
    getDb: () => db,
    getAdminDb: () => db,
    hasTenantDbScope: () => false,
    requireTenantIdForUser: async () => 'tenant-1',
  };
});

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = (await importOriginal<Record<string, unknown>>()) as Record<string, unknown>;
  const realEq = actual.eq as (left: unknown, right: unknown) => unknown;
  // Wrap `eq` so each delete's ownership/thread scoping is assertable; the
  // fake schema columns are opaque, so the real SQL builder would inline the
  // values instead of binding them as params.
  const eq = (left: unknown, right: unknown) => {
    state.eqCalls.push({
      column: (left as { name?: string } | undefined)?.name ?? String(left),
      value: right,
    });
    return realEq(left, right);
  };
  return { ...actual, eq };
});

vi.mock('../src/mastra-v2/instance', () => ({
  getKestrelMastra: () => ({
    instance: {
      getStorage: () => ({
        getStore: async (domain: string) => {
          state.getStoreDomain = domain;
          if (state.failMastra) throw new Error('mastra storage down');
          return {
            deleteThread: async ({ threadId }: { threadId: string }) => {
              state.mastraDeletes.push(threadId);
            },
          };
        },
      }),
    },
  }),
}));

describe('deleteThread — P1-7 memory state cleanup', () => {
  beforeEach(() => {
    state.deleteCalls = [];
    state.eqCalls = [];
    state.eqMark = 0;
    state.threadRows = [{ id: 'thread-1' }];
    state.mastraDeletes = [];
    state.getStoreDomain = '';
    state.failMastra = false;
  });

  it('deletes the thread plus backfill, projection, and synopsis rows in one transaction', async () => {
    await deleteThread('user-1', 'thread-1');

    expect(state.deleteCalls.map((call) => call.table)).toEqual([
      'chat_threads',
      'memory_backfill_state',
      'memory_projection_state',
      'memory_embeddings',
    ]);
    // The business delete stays ownership-scoped.
    const threads = state.deleteCalls[0]!;
    expect(threads.eqs).toContainEqual({ column: 'id', value: 'thread-1' });
    expect(threads.eqs).toContainEqual({ column: 'userId', value: 'user-1' });
    // The memory-state deletes are scoped to the owner + thread.
    const backfill = state.deleteCalls.find((c) => c.table === 'memory_backfill_state')!;
    expect(backfill.eqs).toContainEqual({ column: 'userId', value: 'user-1' });
    expect(backfill.eqs).toContainEqual({ column: 'threadId', value: 'thread-1' });
    const projection = state.deleteCalls.find((c) => c.table === 'memory_projection_state')!;
    expect(projection.eqs).toContainEqual({ column: 'threadId', value: 'thread-1' });
    const synopsis = state.deleteCalls.find((c) => c.table === 'memory_embeddings')!;
    expect(synopsis.eqs).toContainEqual({ column: 'kind', value: 'thread_synopsis' });
    expect(synopsis.eqs).toContainEqual({ column: 'sourceId', value: 'thread-1' });
  });

  it('deletes the Mastra runtime thread through the storage memory domain', async () => {
    await deleteThread('user-1', 'thread-1');

    expect(state.getStoreDomain).toBe('memory');
    expect(state.mastraDeletes).toEqual(['thread-1']);
  });

  it('skips the Mastra cleanup when the ownership-scoped delete removed nothing', async () => {
    state.threadRows = [];

    await deleteThread('user-2', 'thread-owned-by-someone-else');

    expect(state.mastraDeletes).toEqual([]);
    // State deletes are still attempted (they are owner-scoped no-ops).
    expect(state.deleteCalls.map((c) => c.table)).toContain('memory_backfill_state');
  });

  it('never fails the business delete when the Mastra cleanup errors (best-effort)', async () => {
    state.failMastra = true;

    await expect(deleteThread('user-1', 'thread-1')).resolves.toBeUndefined();
    expect(state.deleteCalls.map((c) => c.table)).toContain('chat_threads');
  });
});

describe('deleteAllThreads — P1-7 memory state cleanup', () => {
  beforeEach(() => {
    state.deleteCalls = [];
    state.eqCalls = [];
    state.eqMark = 0;
    state.threadRows = [{ id: 'thread-a' }, { id: 'thread-b' }];
    state.mastraDeletes = [];
    state.getStoreDomain = '';
    state.failMastra = false;
  });

  it('deletes every Mastra thread for the user and the user-wide synopsis state', async () => {
    await deleteAllThreads('user-1');

    expect(state.deleteCalls.map((c) => c.table)).toEqual([
      'chat_threads',
      'memory_backfill_state',
      'memory_projection_state',
      'memory_embeddings',
    ]);
    // Backfill/projection cleanup is user-wide (no thread_id bound).
    const backfill = state.deleteCalls.find((c) => c.table === 'memory_backfill_state')!;
    expect(backfill.eqs).toContainEqual({ column: 'userId', value: 'user-1' });
    expect(backfill.eqs).not.toContainEqual({ column: 'threadId', value: 'thread-a' });
    const synopsis = state.deleteCalls.find((c) => c.table === 'memory_embeddings')!;
    expect(synopsis.eqs).toContainEqual({ column: 'kind', value: 'thread_synopsis' });
    expect(synopsis.eqs).not.toContainEqual({ column: 'sourceId', value: 'thread-a' });
    expect([...state.mastraDeletes].sort()).toEqual(['thread-a', 'thread-b']);
  });
});
