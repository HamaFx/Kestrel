/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { applyMigrations, closePGliteDb, getPGliteDb } from '@kestrel/db/pglite';
import { container } from '@kestrel/shared';
import { LibSQLStore } from '@mastra/libsql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  _resetKestrelMastra,
  _setKestrelMastraForTest,
  createKestrelMastra,
  initializeKestrelMastra,
} from '../src/mastra-v2';
import {
  claimNextFullAnalysisRun,
  completeFullAnalysisRun,
  enqueueFullAnalysis,
  failFullAnalysisRun,
  fullAnalysisRunId,
  getFullAnalysisQueueHealth,
  getFullAnalysisRun,
  purgeOldFullAnalysisRuns,
  recoverStaleFullAnalysisRuns,
  requeueFullAnalysisRun,
  touchFullAnalysisRun,
  updateFullAnalysisProgress,
} from '../src/mastra-v2/workflows/full-analysis';
import { DB } from '../src/tokens';

const INPUT = {
  userId: 'user-1',
  threadId: 'thread-1',
  userMessageText: 'Analyze XAUUSD',
  userMessageParts: [{ type: 'text' as const, text: 'Analyze XAUUSD' }],
  idempotencyKey: 'full:thread-1:message-1',
  maxDailyUsd: 5,
  modelSnapshot: {
    modelId: 'google/gemini-2.5-flash',
    providerId: 'google',
    bareModelId: 'gemini-2.5-flash',
  },
};

async function withQueueStorage<T>(
  fn: (db: Awaited<ReturnType<typeof getPGliteDb>>) => Promise<T>,
): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'kestrel-full-analysis-'));
  await applyMigrations(dir);
  const db = await getPGliteDb(dir);
  await db.execute(
    `INSERT INTO "user" ("id", "email") VALUES ('user-1', 'full-analysis@example.com')`,
  );
  await db.execute(
    `INSERT INTO "organization" ("id", "name") VALUES ('user-1', 'Full analysis workspace') ON CONFLICT ("id") DO NOTHING`,
  );
  await db.execute(
    `INSERT INTO "organization_member" ("org_id", "user_id", "role") VALUES ('user-1', 'user-1', 'owner') ON CONFLICT ("org_id", "user_id") DO NOTHING`,
  );
  container.register(DB, () => db as never);

  const file = join(dir, 'mastra.db');
  const store = new LibSQLStore({ id: 'test-durable', url: `file:${file}` });
  const mastra = createKestrelMastra({ storage: store, storageKind: 'libsql', env: {} });
  await initializeKestrelMastra(mastra);
  _setKestrelMastraForTest(mastra);
  try {
    return await fn(db);
  } finally {
    _resetKestrelMastra();
    container.register(DB, () => {
      throw new Error('Full-analysis test DB was not initialized');
    });
    await closePGliteDb();
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('database-backed Full-analysis queue', { timeout: 30_000 }, () => {
  beforeEach(() => {
    _resetKestrelMastra();
  });

  afterEach(() => {
    _resetKestrelMastra();
  });

  it('round-trips enqueue, claim, complete, and poll with user scoping', async () => {
    await withQueueStorage(async () => {
      const runId = await enqueueFullAnalysis(INPUT);
      expect(runId).toBeTruthy();

      const claimed = await claimNextFullAnalysisRun('worker-1');
      expect(claimed?.runId).toBe(runId);
      expect(claimed?.tenantId).toBe('user-1');
      expect(claimed?.payload.userId).toBe('user-1');
      expect(claimed?.payload.attemptCount).toBe(1);
      expect(claimed?.payload.workerRunId).toBe('worker-1');
      expect(claimed?.payload.startedAt).toBeDefined();
      expect(claimed?.payload.modelSnapshot).toEqual(INPUT.modelSnapshot);

      await completeFullAnalysisRun(runId!, 'worker-1', { finalText: 'done', mode: 'full' });

      const poll = await getFullAnalysisRun('user-1', runId!);
      expect(poll?.status).toBe('succeeded');
      expect(poll?.result).toMatchObject({ finalText: 'done' });
      expect(poll?.completedAt).not.toBeNull();
      expect(await getFullAnalysisRun('user-2', runId!)).toBeNull();
    });
  });

  it('converges concurrent enqueue requests to one canonical run', async () => {
    await withQueueStorage(async () => {
      const [first, second] = await Promise.all([
        enqueueFullAnalysis(INPUT),
        enqueueFullAnalysis({ ...INPUT, userMessageText: 'Analyze XAUUSD again' }),
      ]);
      expect(first).toBe(second);
      expect((await getFullAnalysisQueueHealth()).pending).toBe(1);
    });
  });

  it('makes run IDs deterministic across submissions', () => {
    const a = fullAnalysisRunId('user-1', INPUT.idempotencyKey);
    const b = fullAnalysisRunId('user-1', INPUT.idempotencyKey);
    const c = fullAnalysisRunId('user-2', INPUT.idempotencyKey);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('allows only one concurrent worker to claim a pending run', async () => {
    await withQueueStorage(async () => {
      const runId = await enqueueFullAnalysis(INPUT);
      const [first, second] = await Promise.all([
        claimNextFullAnalysisRun('worker-1'),
        claimNextFullAnalysisRun('worker-2'),
      ]);
      expect([first?.runId, second?.runId].filter(Boolean)).toEqual([runId]);
      expect(
        [first?.payload.workerRunId, second?.payload.workerRunId].filter(Boolean),
      ).toHaveLength(1);
    });
  });

  it('rejects stale-worker completion after the run is requeued and reclaimed', async () => {
    await withQueueStorage(async () => {
      const runId = await enqueueFullAnalysis(INPUT);
      await claimNextFullAnalysisRun('worker-1');
      await recoverStaleFullAnalysisRuns(new Date(Date.now() + 60_000), 3);
      const reclaimed = await claimNextFullAnalysisRun('worker-2');
      expect(reclaimed?.payload.workerRunId).toBe('worker-2');

      await expect(
        completeFullAnalysisRun(runId!, 'worker-1', { finalText: 'stale' }),
      ).rejects.toMatchObject({ code: 'FULL_ANALYSIS_LEASE_LOST' });
      await completeFullAnalysisRun(runId!, 'worker-2', { finalText: 'current' });
      expect((await getFullAnalysisRun('user-1', runId!))?.result).toMatchObject({
        finalText: 'current',
      });
    });
  });

  it('requeues retryable failures while preserving attempt count', async () => {
    await withQueueStorage(async () => {
      const runId = await enqueueFullAnalysis(INPUT);
      await claimNextFullAnalysisRun('worker-1');
      await requeueFullAnalysisRun(runId!, 'worker-1', 'attempt failed; retrying');
      expect((await getFullAnalysisQueueHealth()).pending).toBe(1);
      const reclaimed = await claimNextFullAnalysisRun('worker-2');
      expect(reclaimed?.payload.attemptCount).toBe(2);
    });
  });

  it('recovers stale runs and fails them at the attempt cap', async () => {
    await withQueueStorage(async () => {
      const runId = await enqueueFullAnalysis(INPUT);
      await claimNextFullAnalysisRun('worker-1');
      expect(await recoverStaleFullAnalysisRuns(new Date(Date.now() + 60_000), 2)).toEqual({
        requeued: 1,
        failed: 0,
      });
      await claimNextFullAnalysisRun('worker-2');
      expect(await recoverStaleFullAnalysisRuns(new Date(Date.now() + 60_000), 2)).toEqual({
        requeued: 0,
        failed: 1,
      });
      expect((await getFullAnalysisRun('user-1', runId!))?.status).toBe('failed');
    });
  });

  it('rejects malformed queue payloads without an identity fallback', async () => {
    await withQueueStorage(async (db) => {
      const runId = await enqueueFullAnalysis(INPUT);
      await db.execute(
        `UPDATE "full_analysis_queue" SET payload = '{"kind":"full-analysis"}' WHERE run_id = '${runId}'`,
      );
      await expect(claimNextFullAnalysisRun('worker-1')).resolves.toBeNull();
      const row = await db.execute(
        `SELECT status, error FROM "full_analysis_queue" WHERE run_id = '${runId}'`,
      );
      expect(row.rows[0]).toMatchObject({ status: 'failed' });
    });
  });

  it('persists progress and exposes it through the polling view', async () => {
    await withQueueStorage(async () => {
      const runId = await enqueueFullAnalysis(INPUT);
      await claimNextFullAnalysisRun('worker-1');
      await updateFullAnalysisProgress(runId!, 'worker-1', 'collect-packet');
      await updateFullAnalysisProgress(runId!, 'worker-1', 'technical');
      const poll = await getFullAnalysisRun('user-1', runId!);
      expect(poll?.progress).toEqual([
        { type: 'data-agent-progress', data: { step: 'collect-packet' } },
        { type: 'data-agent-progress', data: { step: 'technical' } },
      ]);
    });
  });

  it('requires the active lease for heartbeat and terminal failure', async () => {
    await withQueueStorage(async () => {
      const runId = await enqueueFullAnalysis(INPUT);
      await claimNextFullAnalysisRun('worker-1');
      await expect(touchFullAnalysisRun(runId!, 'worker-2')).rejects.toMatchObject({
        code: 'FULL_ANALYSIS_LEASE_LOST',
      });

      await expect(touchFullAnalysisRun(runId!, 'worker-1')).resolves.toBeUndefined();
      await expect(
        failFullAnalysisRun(runId!, 'worker-1', new Error('model unavailable')),
      ).resolves.toBeUndefined();
      expect((await getFullAnalysisRun('user-1', runId!))?.status).toBe('failed');
    });
  });

  it('purges terminal queue rows after the retention cutoff', async () => {
    await withQueueStorage(async () => {
      const runId = await enqueueFullAnalysis(INPUT);
      await claimNextFullAnalysisRun('worker-1');
      await completeFullAnalysisRun(runId!, 'worker-1', { finalText: 'done' });
      expect(await purgeOldFullAnalysisRuns(new Date(Date.now() + 60_000))).toBe(1);
      expect(await getFullAnalysisRun('user-1', runId!)).toBeNull();
    });
  });
});
