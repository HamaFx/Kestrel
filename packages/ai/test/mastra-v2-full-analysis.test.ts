/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as KestrelDbModule from '@kestrel/db';

import { _resetKestrelMastra, getKestrelMastra } from '../src/mastra-v2';
import {
  claimNextFullAnalysisRun,
  completeFullAnalysisRun,
  enqueueFullAnalysis,
  failFullAnalysisRun,
  FULL_ANALYSIS_WORKFLOW_ID,
  fullAnalysisRunId,
  getFullAnalysisQueueHealth,
  getFullAnalysisRun,
  purgeOldFullAnalysisRuns,
  reconcileFullAnalysisSnapshots,
  recoverStaleFullAnalysisRuns,
  requeueFullAnalysisRun,
  touchFullAnalysisRun,
  updateFullAnalysisProgress,
} from '../src/mastra-v2/workflows/full-analysis';
import { withQueueStorage } from './helpers/full-analysis-queue-db';

// B-07 (audit 2026-10-18) — fault injection between the Mastra snapshot
// projection and the Drizzle queue completion.
const dbMocks = vi.hoisted(() => ({ failNextComplete: false }));

vi.mock('@kestrel/db', async (importOriginal) => {
  const actual = await importOriginal<typeof KestrelDbModule>();
  return {
    ...actual,
    completeFullAnalysisQueue: async (
      args: Parameters<typeof actual.completeFullAnalysisQueue>[0],
    ) => {
      if (dbMocks.failNextComplete) {
        dbMocks.failNextComplete = false;
        throw new Error('injected crash before queue completion');
      }
      return actual.completeFullAnalysisQueue(args);
    },
  };
});

async function readProjectedSnapshot(runId: string): Promise<{ status?: unknown } | null> {
  const storage = getKestrelMastra().instance.getStorage();
  if (!storage) return null;
  const workflows = (await storage.getStore('workflows')) as {
    getWorkflowRunById: (args: {
      runId: string;
      workflowName: string;
    }) => Promise<{ snapshot?: unknown } | null>;
  };
  const existing = await workflows.getWorkflowRunById({
    runId,
    workflowName: FULL_ANALYSIS_WORKFLOW_ID,
  });
  if (!existing?.snapshot) return null;
  const snapshot =
    typeof existing.snapshot === 'string' ? JSON.parse(existing.snapshot) : existing.snapshot;
  return snapshot as { status?: unknown };
}

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

describe.skipIf(process.env.RUN_AI_QUEUE_POSTGRES_TESTS !== '1')(
  'database-backed Full-analysis queue',
  { timeout: 30_000 },
  () => {
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
        expect(row[0]).toMatchObject({ status: 'failed' });
      });
    });

    it('persists progress and exposes it through the polling view', async () => {
      await withQueueStorage(async () => {
        const runId = await enqueueFullAnalysis(INPUT);
        await claimNextFullAnalysisRun('worker-1');
        await updateFullAnalysisProgress(runId!, 'worker-1', 'collect-packet');
        await updateFullAnalysisProgress(runId!, 'worker-1', 'technical');
        const poll = await getFullAnalysisRun('user-1', runId!);
        const entries = (poll?.progress ?? []) as Array<{
          type: string;
          data: { mode: string; agents: Array<{ agentName: string; status: string }> };
        }>;
        // The persisted payload is the CommitteeProgressSnapshot consumed by
        // AgentDeliberation: all four full-mode specialists as status rows.
        expect(entries.map((entry) => entry.type)).toEqual([
          'data-agent-progress',
          'data-agent-progress',
        ]);
        expect(entries.map((entry) => entry.data.mode)).toEqual(['full', 'full']);
        expect(entries[0]!.data.agents.map((a) => `${a.agentName}:${a.status}`)).toEqual([
          'technical:pending',
          'fundamental:pending',
          'risk:pending',
          'sentiment:pending',
        ]);
        expect(entries[1]!.data.agents.map((a) => `${a.agentName}:${a.status}`)).toEqual([
          'technical:running',
          'fundamental:pending',
          'risk:pending',
          'sentiment:pending',
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

    it('projects the terminal snapshot before queue completion and survives a crash between them (B-07)', async () => {
      await withQueueStorage(async () => {
        const runId = await enqueueFullAnalysis(INPUT);
        await claimNextFullAnalysisRun('worker-1');

        // Inject a crash between the snapshot projection and the completion.
        dbMocks.failNextComplete = true;
        await expect(
          completeFullAnalysisRun(runId!, 'worker-1', { finalText: 'done', mode: 'full' }),
        ).rejects.toThrow('injected crash before queue completion');

        // The queue row is still running (completion never landed)…
        expect((await getFullAnalysisRun('user-1', runId!))?.status).toBe('running');
        // …but the Mastra snapshot is already terminal, so the run is never
        // completed-but-invisible in the admin viewer.
        expect((await readProjectedSnapshot(runId!))?.status).toBe('success');

        // The worker retry completes normally on the next attempt.
        await completeFullAnalysisRun(runId!, 'worker-1', { finalText: 'done', mode: 'full' });
        expect((await getFullAnalysisRun('user-1', runId!))?.status).toBe('succeeded');
      });
    });

    it('reconciles terminal rows whose Mastra snapshot never landed (B-07)', async () => {
      await withQueueStorage(async () => {
        const runId = await enqueueFullAnalysis(INPUT);
        await claimNextFullAnalysisRun('worker-1');
        await completeFullAnalysisRun(runId!, 'worker-1', { finalText: 'done' });

        // Simulate the historic crash window: the row completed but the
        // projection never persisted (or was lost).
        const storage = getKestrelMastra().instance.getStorage()!;
        const workflows = (await storage.getStore('workflows')) as {
          deleteWorkflowRunById: (args: {
            runId: string;
            workflowName: string;
          }) => Promise<void>;
        };
        await workflows.deleteWorkflowRunById({
          runId: runId!,
          workflowName: FULL_ANALYSIS_WORKFLOW_ID,
        });
        expect(await readProjectedSnapshot(runId!)).toBeNull();

        const repaired = await reconcileFullAnalysisSnapshots({
          since: new Date(Date.now() - 60_000),
        });
        expect(repaired).toBeGreaterThanOrEqual(1);
        expect((await readProjectedSnapshot(runId!))?.status).toBe('success');
      });
    });
  },
);

describe('Full-analysis queue query surface', () => {
  it('exports bounded row listing and SQL-aggregate stats helpers', async () => {
    const mod = await import('@kestrel/db');
    expect(typeof mod.listFullAnalysisQueueRows).toBe('function');
    expect(typeof mod.getFullAnalysisQueueStats).toBe('function');
  });
});
