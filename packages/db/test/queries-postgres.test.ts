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

// Real PostgreSQL integration coverage for the query layer.
//
// The query modules are consumed by the worker/AI packages through mocks, so
// this suite is the DB package's own direct proof that the SQL they emit
// actually runs: migrations, ownership/lease transitions, idempotency keys,
// tenant scoping, recovery semantics and row mapping. Opt in with
// RUN_POSTGRES_RLS_TESTS=1 and TEST_POSTGRES_ADMIN_URL (same gate as the RLS
// isolation suite); it provisions a disposable database, applies the real
// Drizzle migrations and drops everything afterwards.

import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDb } from '../src/client';
import {
  cancelFullAnalysisQueue,
  claimNextFullAnalysisQueue,
  completeFullAnalysisQueue,
  enqueueFullAnalysisQueue,
  failFullAnalysisQueue,
  FullAnalysisQueueOwnershipError,
  getFullAnalysisQueueRow,
  getFullAnalysisQueueStats,
  heartbeatFullAnalysisQueue,
  listFullAnalysisQueueRows,
  purgeOldFullAnalysisQueue,
  recoverStaleFullAnalysisQueue,
  requeueFullAnalysisQueue,
  updateFullAnalysisQueueProgress,
} from '../src/queries/full-analysis-queue';
import {
  countJournalEntriesByUser,
  createJournalEntry,
  deleteJournalEntry,
  getJournalEntry,
  listJournalEntries,
  updateJournalEntry,
} from '../src/queries/journal';
import { listMessages } from '../src/queries/threads';
import {
  addUserSymbol,
  countUserSymbols,
  listDistinctSymbols,
  listUserSymbols,
  removeUserSymbol,
} from '../src/queries/user-symbols';
import * as schema from '../src/schema';

const enabled = process.env.RUN_POSTGRES_RLS_TESTS === '1';
const adminUrl = process.env.TEST_POSTGRES_ADMIN_URL;

const USER_ID = 'queries-user-1';
// The user-table trigger provisions a personal organization whose id equals
// the user id, so the membership tenant for each seeded user is the user id.
const TENANT_ID = USER_ID;
const OTHER_USER_ID = 'queries-user-2';

type TestDb = ReturnType<typeof drizzle<typeof schema>>;

let admin: ReturnType<typeof postgres> | null = null;
let raw: ReturnType<typeof postgres> | null = null;
let db: TestDb | null = null;
let databaseName = '';
const previousDatabaseUrl = process.env.DATABASE_URL;

function makePayload(): Record<string, unknown> {
  return {
    kind: 'full-analysis',
    version: 1,
    userId: USER_ID,
    threadId: 'thread-1',
    text: 'integration payload',
  };
}

async function enqueue(label: string, userId = USER_ID) {
  const runId = `run-${label}-${randomUUID()}`;
  await enqueueFullAnalysisQueue({
    runId,
    userId,
    threadId: 'thread-1',
    idempotencyKey: `full:${label}:${randomUUID()}`,
    payload: makePayload(),
    db: db!,
  });
  return runId;
}

function lease(runId: string, workerRunId: string) {
  return { runId, workerRunId, db: db! };
}

async function applyMigrations(client: ReturnType<typeof postgres>): Promise<void> {
  const dir = join(process.cwd(), 'drizzle');
  const journal = JSON.parse(readFileSync(join(dir, 'meta/_journal.json'), 'utf-8'));
  for (const entry of journal.entries ?? []) {
    const file = readdirSync(dir).find((name: string) => name.startsWith(`${entry.tag}.sql`));
    if (!file) throw new Error(`Missing migration ${entry.tag}`);
    const statements = readFileSync(join(dir, file), 'utf-8').split('--> statement-breakpoint');
    for (const statement of statements) {
      const executable = statement
        .split('\n')
        .filter((line: string) => !line.trim().startsWith('--'))
        .join('\n')
        .trim();
      if (executable) await client.unsafe(executable);
    }
  }
}

describe.skipIf(!enabled || !adminUrl)('query layer — real PostgreSQL integration', () => {
  beforeAll(async () => {
    admin = postgres(adminUrl!, { max: 1, prepare: false });
    databaseName = `kestrel_queries_${randomUUID().replaceAll('-', '_')}`;
    await admin.unsafe(`CREATE DATABASE ${databaseName}`);
    const url = new URL(adminUrl!);
    url.pathname = `/${databaseName}`;
    const isolatedUrl = url.toString();

    raw = postgres(isolatedUrl, { max: 1, prepare: false });
    await raw.unsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
    await raw.unsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
      END
      $$;
    `);
    await applyMigrations(raw);
    await raw.unsafe(
      `INSERT INTO "user" ("id","email") VALUES ('${USER_ID}','queries-1@example.com'),('${OTHER_USER_ID}','queries-2@example.com')`,
    );
    await raw.unsafe(
      `INSERT INTO "symbol_catalog" ("symbol","name","category") VALUES ('XAUUSD','Gold','gold'),('EURUSD','Euro / US Dollar','forex') ON CONFLICT ("symbol") DO NOTHING`,
    );

    db = drizzle(raw, { schema });
    // Modules that call getDb() implicitly resolve this isolated database.
    // DB_DISABLE_SSL requires a non-production NODE_ENV (test) and keeps the
    // plain-TCP disposable container reachable.
    process.env.DATABASE_URL = isolatedUrl;
    process.env.DB_DISABLE_SSL = 'true';
  });

  beforeEach(async () => {
    await db!.delete(schema.fullAnalysisQueue);
    await db!.delete(schema.journalEntries);
    await db!.delete(schema.userSymbols);
  });

  afterAll(async () => {
    await closeDb();
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    delete process.env.DB_DISABLE_SSL;
    await raw?.end({ timeout: 5 });
    if (admin && databaseName) {
      try {
        await admin.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
      } finally {
        await admin.end({ timeout: 5 });
      }
    }
  });

  it('enqueues pending rows and reuses the row for a duplicate idempotency key', async () => {
    const runId = `run-idem-${randomUUID()}`;
    const input = {
      runId,
      userId: USER_ID,
      threadId: 'thread-1',
      idempotencyKey: `full:idem:${randomUUID()}`,
      payload: makePayload(),
      db: db!,
    };
    const first = await enqueueFullAnalysisQueue(input);
    expect(first).toMatchObject({
      runId,
      userId: USER_ID,
      tenantId: TENANT_ID,
      status: 'pending',
      attemptCount: 0,
    });

    const duplicate = await enqueueFullAnalysisQueue({ ...input, runId: `other-${runId}` });
    expect(duplicate.runId).toBe(runId);
  });

  it('claims through the atomic fast path with JS-key mapping and increments attemptCount', async () => {
    const runId = await enqueue('claim');

    const claimed = await claimNextFullAnalysisQueue({
      workerRunId: 'worker-a',
      leaseMs: 60_000,
      db: db!,
    });

    // Regression guard: the raw-SQL fast path must alias snake_case columns
    // back to the Drizzle JS keys callers rely on.
    expect(claimed).toMatchObject({
      runId,
      userId: USER_ID,
      tenantId: TENANT_ID,
      status: 'running',
      attemptCount: 1,
      workerRunId: 'worker-a',
    });
    expect(claimed?.leaseExpiresAt).toBeInstanceOf(Date);

    // The only pending row is now owned — a second claim finds nothing.
    await expect(
      claimNextFullAnalysisQueue({ workerRunId: 'worker-b', leaseMs: 60_000, db: db! }),
    ).resolves.toBeNull();
  });

  it('supports the tenant-partitioned claim path and skips unowned tenants', async () => {
    const runId = await enqueue('tenant');

    await expect(
      claimNextFullAnalysisQueue({
        workerRunId: 'worker-a',
        leaseMs: 60_000,
        ownsTenant: (tenantId) => tenantId !== TENANT_ID,
        db: db!,
      }),
    ).resolves.toBeNull();

    const claimed = await claimNextFullAnalysisQueue({
      workerRunId: 'worker-a',
      leaseMs: 60_000,
      ownsTenant: (tenantId) => tenantId === TENANT_ID,
      db: db!,
    });
    expect(claimed?.runId).toBe(runId);
    expect(claimed?.attemptCount).toBe(1);
  });

  it('heartbeats only for the owning worker and extends the lease', async () => {
    const runId = await enqueue('heartbeat');
    const claimed = await claimNextFullAnalysisQueue({
      workerRunId: 'worker-a',
      leaseMs: 60_000,
      db: db!,
    });

    await expect(
      heartbeatFullAnalysisQueue({ ...lease(runId, 'worker-other'), leaseMs: 60_000 }),
    ).rejects.toBeInstanceOf(FullAnalysisQueueOwnershipError);

    const refreshed = await heartbeatFullAnalysisQueue({
      ...lease(runId, 'worker-a'),
      leaseMs: 120_000,
    });
    expect(refreshed.leaseExpiresAt!.getTime()).toBeGreaterThan(claimed!.leaseExpiresAt!.getTime());
  });

  it('appends progress entries in order and rejects non-owners', async () => {
    const runId = await enqueue('progress');
    await claimNextFullAnalysisQueue({ workerRunId: 'worker-a', leaseMs: 60_000, db: db! });

    await updateFullAnalysisQueueProgress({
      ...lease(runId, 'worker-a'),
      entry: { type: 'data-agent-progress', data: { step: 'collect-packet' } },
    });
    const withTwo = await updateFullAnalysisQueueProgress({
      ...lease(runId, 'worker-a'),
      entry: { type: 'data-agent-progress', data: { step: 'technical' } },
    });
    expect(withTwo.progress.map((entry) => (entry.data as { step?: string }).step)).toEqual([
      'collect-packet',
      'technical',
    ]);

    await expect(
      updateFullAnalysisQueueProgress({ ...lease(runId, 'worker-b'), entry: { n: 1 } }),
    ).rejects.toBeInstanceOf(FullAnalysisQueueOwnershipError);
  });

  it('completes a run for the owner and refuses a stale worker afterwards', async () => {
    const runId = await enqueue('complete');
    await claimNextFullAnalysisQueue({ workerRunId: 'worker-a', leaseMs: 60_000, db: db! });

    const completed = await completeFullAnalysisQueue({
      ...lease(runId, 'worker-a'),
      result: { finalText: 'done' },
    });
    expect(completed.status).toBe('succeeded');
    expect(completed.result).toEqual({ finalText: 'done' });
    expect(completed.leaseExpiresAt).toBeNull();

    await expect(
      completeFullAnalysisQueue({ ...lease(runId, 'worker-a'), result: { finalText: 'late' } }),
    ).rejects.toBeInstanceOf(FullAnalysisQueueOwnershipError);
  });

  it('rejects stale-worker completion after a requeue is reclaimed by another worker', async () => {
    const runId = await enqueue('requeue');
    await claimNextFullAnalysisQueue({ workerRunId: 'worker-a', leaseMs: 60_000, db: db! });

    const requeued = await requeueFullAnalysisQueue({
      ...lease(runId, 'worker-a'),
      error: 'transient',
      ledgerSnapshot: {
        entries: [{ id: 'g1', kind: 'specialist', costUsd: 0.02 }],
        totalCostUsd: 0.02,
      },
    });
    expect(requeued.status).toBe('pending');
    expect(requeued.workerRunId).toBeNull();
    expect(
      (requeued.payload as { ledgerSnapshot?: { totalCostUsd: number } }).ledgerSnapshot
        ?.totalCostUsd,
    ).toBe(0.02);

    await claimNextFullAnalysisQueue({ workerRunId: 'worker-b', leaseMs: 60_000, db: db! });
    await expect(
      completeFullAnalysisQueue({ ...lease(runId, 'worker-a'), result: {} }),
    ).rejects.toBeInstanceOf(FullAnalysisQueueOwnershipError);
    await expect(
      completeFullAnalysisQueue({ ...lease(runId, 'worker-b'), result: { finalText: 'ok' } }),
    ).resolves.toMatchObject({ status: 'succeeded' });
  });

  it('records terminal failures with the error message', async () => {
    const runId = await enqueue('fail');
    await claimNextFullAnalysisQueue({ workerRunId: 'worker-a', leaseMs: 60_000, db: db! });

    const failed = await failFullAnalysisQueue({
      ...lease(runId, 'worker-a'),
      error: 'model unavailable',
    });
    expect(failed.status).toBe('failed');
    expect(failed.error).toBe('model unavailable');
    expect(failed.completedAt).toBeInstanceOf(Date);
  });

  it('recovers stale runs below the attempt cap and fails them at the cap', async () => {
    const runId = await enqueue('recover');
    await claimNextFullAnalysisQueue({ workerRunId: 'worker-a', leaseMs: 60_000, db: db! });
    const staleCutoff = new Date(Date.now() + 60_000);

    await expect(recoverStaleFullAnalysisQueue(staleCutoff, 3, db!)).resolves.toMatchObject({
      requeued: 1,
      failed: 0,
    });
    // Idempotent: the requeued row is no longer `running`.
    await expect(recoverStaleFullAnalysisQueue(staleCutoff, 3, db!)).resolves.toMatchObject({
      requeued: 0,
      failed: 0,
    });

    await claimNextFullAnalysisQueue({ workerRunId: 'worker-b', leaseMs: 60_000, db: db! });
    await expect(recoverStaleFullAnalysisQueue(staleCutoff, 2, db!)).resolves.toMatchObject({
      requeued: 0,
      failed: 1,
    });
    const row = await getFullAnalysisQueueRow(runId, undefined, db!);
    expect(row?.status).toBe('failed');
  });

  it('cancels pending/running runs for the owning user only', async () => {
    const runId = await enqueue('cancel');
    await claimNextFullAnalysisQueue({ workerRunId: 'worker-a', leaseMs: 60_000, db: db! });

    await expect(cancelFullAnalysisQueue(runId, OTHER_USER_ID, db!)).resolves.toBeNull();
    const cancelled = await cancelFullAnalysisQueue(runId, USER_ID, db!);
    expect(cancelled?.status).toBe('cancelled');
    // Cancelling again is a no-op that returns the terminal row for the owner.
    await expect(cancelFullAnalysisQueue(runId, USER_ID, db!)).resolves.toMatchObject({
      status: 'cancelled',
    });
  });

  it('scopes row reads by user and lists rows by status', async () => {
    const runId = await enqueue('list');
    await expect(getFullAnalysisQueueRow(runId, OTHER_USER_ID, db!)).resolves.toBeNull();
    await expect(getFullAnalysisQueueRow(runId, USER_ID, db!)).resolves.toMatchObject({ runId });

    const pending = await listFullAnalysisQueueRows('pending', db!, 50);
    expect(pending.some((row) => row.runId === runId)).toBe(true);
    const limited = await listFullAnalysisQueueRows(undefined, db!, 1);
    expect(limited.length).toBe(1);
  });

  it('reports queue stats for pending, running, stale and stuck rows', async () => {
    const stats = await getFullAnalysisQueueStats(db!);
    expect(typeof stats.pending).toBe('number');
    expect(typeof stats.running).toBe('number');

    const stuckId = await enqueue('stuck-running');
    await claimNextFullAnalysisQueue({
      workerRunId: 'worker-a',
      leaseMs: 60_000,
      db: db!,
    });
    await enqueue('stats');
    const staleId = await enqueue('stale-pending');
    await db!
      .update(schema.fullAnalysisQueue)
      .set({ createdAt: new Date(Date.now() - 20 * 60_000) })
      .where(eq(schema.fullAnalysisQueue.runId, staleId));
    await db!
      .update(schema.fullAnalysisQueue)
      .set({ updatedAt: new Date(Date.now() - 5 * 60_000), leaseExpiresAt: null })
      .where(eq(schema.fullAnalysisQueue.runId, stuckId));

    const after = await getFullAnalysisQueueStats(db!);
    expect(after.stalePending).toBeGreaterThanOrEqual(1);
    expect(after.stuckRunning).toBeGreaterThanOrEqual(1);
  });

  it('purges old terminal rows and their ids', async () => {
    const runId = await enqueue('purge');
    await claimNextFullAnalysisQueue({ workerRunId: 'worker-a', leaseMs: 60_000, db: db! });
    await failFullAnalysisQueue({ ...lease(runId, 'worker-a'), error: 'boom' });

    const removed = await purgeOldFullAnalysisQueue(new Date(Date.now() + 60_000), db!);
    expect(removed).toBeGreaterThanOrEqual(1);
    await expect(getFullAnalysisQueueRow(runId, undefined, db!)).resolves.toBeNull();
  });

  it('round-trips journal entries with tenant scoping and soft deletes', async () => {
    const created = await createJournalEntry({
      userId: USER_ID,
      symbol: 'XAUUSD',
      side: 'long',
      openedAt: new Date(),
      entry: 2600,
      notes: 'first entry',
    });
    expect(created.id).toBeTruthy();
    expect(created.tenantId).toBe(TENANT_ID);

    await expect(getJournalEntry(created.id, USER_ID)).resolves.toMatchObject({ id: created.id });
    await expect(getJournalEntry(created.id, OTHER_USER_ID)).resolves.toBeUndefined();

    const updated = await updateJournalEntry(created.id, USER_ID, { notes: 'updated notes' });
    expect(updated?.notes).toBe('updated notes');

    const filtered = await listJournalEntries(USER_ID, { symbol: 'XAUUSD', limit: 10, offset: 0 });
    expect(filtered.map((row) => row.id)).toContain(created.id);
    await expect(
      listJournalEntries(USER_ID, { symbol: 'EURUSD', limit: 10, offset: 0 }),
    ).resolves.toEqual([]);
    expect(await countJournalEntriesByUser(USER_ID)).toBeGreaterThanOrEqual(1);

    await deleteJournalEntry(created.id, USER_ID);
    expect(await countJournalEntriesByUser(USER_ID)).toBe(0);
    await expect(listJournalEntries(USER_ID, { limit: 10, offset: 0 })).resolves.toEqual([]);
  });

  it('maintains per-user watchlists with catalog-aware distinct symbol listing', async () => {
    await addUserSymbol(USER_ID, 'XAUUSD');
    await addUserSymbol(USER_ID, 'EURUSD');
    const rows = await listUserSymbols(USER_ID);
    expect(rows.map((row) => row.symbol)).toEqual(['XAUUSD', 'EURUSD']);
    expect(rows.map((row) => row.displayOrder)).toEqual([0, 1]);
    expect(await countUserSymbols(USER_ID)).toBe(2);
    expect(await listDistinctSymbols()).toEqual(expect.arrayContaining(['XAUUSD', 'EURUSD']));

    // Duplicate additions are idempotent; explicit order skips allocation.
    await addUserSymbol(USER_ID, 'XAUUSD');
    await addUserSymbol(USER_ID, 'GBPUSD', 7);
    expect(await countUserSymbols(USER_ID)).toBe(3);
    const reordered = await listUserSymbols(USER_ID);
    expect(reordered.at(-1)).toMatchObject({ symbol: 'GBPUSD', displayOrder: 7 });

    await removeUserSymbol(USER_ID, 'XAUUSD');
    expect(await countUserSymbols(USER_ID)).toBe(2);
    await expect(listUserSymbols(OTHER_USER_ID)).resolves.toEqual([]);
  });

  it('listMessages returns the NEWEST window of a long thread in chronological order', async () => {
    const threadId = randomUUID();
    await db!.insert(schema.chatThreads).values({
      id: threadId,
      userId: USER_ID,
      tenantId: TENANT_ID,
    });

    // Five messages with distinct createdAt values, oldest first.
    const base = Date.now() - 5 * 60_000;
    for (let i = 0; i < 5; i += 1) {
      await db!.insert(schema.chatMessages).values({
        id: randomUUID(),
        threadId,
        tenantId: TENANT_ID,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `message-${i}`,
        createdAt: new Date(base + i * 60_000),
      });
    }

    // A limit of 2 must return the two NEWEST messages (ascending), not the
    // two oldest — the pre-fix query was ASC + LIMIT and returned the first
    // rows of the thread, which is wrong for every caller (model history,
    // thread view, export).
    const recent = await listMessages(USER_ID, threadId, 2);
    expect(recent.map((m) => m.content)).toEqual(['message-3', 'message-4']);

    const all = await listMessages(USER_ID, threadId, 50);
    expect(all.map((m) => m.content)).toEqual([
      'message-0',
      'message-1',
      'message-2',
      'message-3',
      'message-4',
    ]);

    // Ownership predicate still applies to the newest window.
    await expect(listMessages(OTHER_USER_ID, threadId, 2)).resolves.toEqual([]);
  });
});
