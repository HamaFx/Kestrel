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

// R16 (audit 2026-10-31) — heartbeat and expiry against a real pg-boss.
//
// Opt in with RUN_POSTGRES_RLS_TESTS=1 and TEST_POSTGRES_ADMIN_URL (the same
// gate the repo's other Postgres tests use). The test owns its pg-boss schema,
// so it cannot disturb a running queue.
//
// What the real library proves here:
//
//   1. A claimed job whose handler runs keeps being touched: `heartbeat_on`
//      starts NULL and advances while the handler works, the handler is
//      delivered exactly once and the job completes. Without a heartbeat the
//      row's `heartbeat_on` stays NULL, so the advancing assertion fails.
//      Both touch sources are live at once (pg-boss's worker loop and the
//      explicit `boss.touch()` in `runJobWithHeartbeat`); the unit test in
//      `queue-heartbeat.test.ts` pins the explicit call site on its own.
//   2. Expiration does not care about the heartbeat: a live handler that
//      outruns `expireInSeconds` has its signal aborted and its job failed.
//      That is the property that makes the sweep's raised expiry the fix,
//      rather than the heartbeat.
//
// A true "advance the clock past the expiry and assert no re-delivery" run
// needs the production numbers (7,200s), so the remaining end-to-end check is
// operational: watch a real worst-case sweep past the old 1,800s mark.

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const enabled = process.env.RUN_POSTGRES_RLS_TESTS === '1';
const url = process.env.TEST_POSTGRES_ADMIN_URL ?? process.env.DATABASE_URL ?? '';
const PGBOSS_SCHEMA = 'pgboss_queue_r16_test';
const EXPIRE_PROBE_QUEUE = 'r16-expire-probe';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(cond: () => Promise<boolean>, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await cond())) {
    if (Date.now() > deadline) throw new Error('waitUntil timed out');
    await sleep(250);
  }
}

describe.skipIf(!enabled || !url)(
  'pg-boss heartbeat and expiry (R16)',
  { timeout: 120_000 },
  () => {
    let sql: ReturnType<typeof postgres> | null = null;

    beforeAll(async () => {
      process.env.DATABASE_URL = url;
      process.env.ADMIN_DATABASE_URL = url;
      process.env.PGBOSS_SCHEMA = PGBOSS_SCHEMA;
      // Plain-TCP Postgres (local scratch instance).
      process.env.DB_DISABLE_SSL = 'true';
      sql = postgres(url, { max: 2 });
    });

    afterAll(async () => {
      const { stopQueue } = await import('../src/queue');
      await stopQueue();
      if (sql) {
        await sql`drop schema if exists ${sql(PGBOSS_SCHEMA)} cascade`;
        await sql.end();
        sql = null;
      }
    });

    it('refreshes a live claim and completes the job exactly once', async () => {
      const {
        BACKTEST_HEARTBEAT_SECONDS,
        BACKTEST_RUN_QUEUE,
        BACKTEST_SWEEP_QUEUE,
        getQueue,
        workQueue,
      } = await import('../src/queue');
      const boss = await getQueue();

      // The stored queue rows carry the production heartbeat/expiry, proving
      // `createQueue`/`updateQueue` applied the new definitions on a real
      // database (an upgrade path, not just a fresh install).
      const runQueue = await boss.getQueue(BACKTEST_RUN_QUEUE);
      const sweepQueue = await boss.getQueue(BACKTEST_SWEEP_QUEUE);
      expect(runQueue?.heartbeatSeconds).toBe(BACKTEST_HEARTBEAT_SECONDS);
      expect(sweepQueue?.heartbeatSeconds).toBe(BACKTEST_HEARTBEAT_SECONDS);
      expect(sweepQueue?.expireInSeconds).toBe(7_200);

      let delivered = 0;
      let markStarted!: () => void;
      const started = new Promise<void>((resolve) => {
        markStarted = resolve;
      });
      let release!: () => void;
      const keepRunning = new Promise<void>((resolve) => {
        release = resolve;
      });

      const workerId = await workQueue(BACKTEST_RUN_QUEUE, async () => {
        delivered += 1;
        markStarted();
        await keepRunning;
        return { ok: true };
      });
      expect(workerId).toBeTruthy();

      // The per-job override keeps the touch cadence short (the minimum is
      // 10s), so the mechanism is observable without waiting for the 60s
      // production value. The queue is one of ours, so `workQueue` wraps the
      // handler with the explicit heartbeat too.
      const jobId = await boss.send(BACKTEST_RUN_QUEUE, { probe: true }, { heartbeatSeconds: 10 });
      expect(jobId).toBeTruthy();

      await started;
      // First touch lands at ~5s; leave a margin before each read.
      await sleep(8_000);
      const first = await boss.getJobById(BACKTEST_RUN_QUEUE, jobId!);
      await sleep(8_000);
      const second = await boss.getJobById(BACKTEST_RUN_QUEUE, jobId!);
      release();

      expect(first?.heartbeatSeconds).toBe(10);
      expect(first?.heartbeatOn).toBeInstanceOf(Date);
      expect(second?.heartbeatOn).toBeInstanceOf(Date);
      expect(second!.heartbeatOn!.getTime()).toBeGreaterThan(first!.heartbeatOn!.getTime());

      await waitUntil(
        async () => (await boss.getJobById(BACKTEST_RUN_QUEUE, jobId!))?.state === 'completed',
      );
      expect(delivered).toBe(1);
    });

    it('fails a live handler that outruns expireInSeconds', async () => {
      const { getQueue, workQueue } = await import('../src/queue');
      const boss = await getQueue();

      // A short expiry with no heartbeat on this queue: the handler outlives
      // the attempt by seconds while the worker is clearly alive.
      await boss.createQueue(EXPIRE_PROBE_QUEUE, {
        policy: 'standard',
        retryLimit: 0,
        expireInSeconds: 2,
        deleteAfterSeconds: 60,
      });

      let abortedDuringRun: boolean | null = null;
      let delivered = 0;
      let markFinished!: () => void;
      const finished = new Promise<void>((resolve) => {
        markFinished = resolve;
      });
      await workQueue(EXPIRE_PROBE_QUEUE, async (job) => {
        delivered += 1;
        await sleep(3_000);
        abortedDuringRun = job.signal.aborted;
        await sleep(1_000);
        markFinished();
        return { ok: true };
      });

      const jobId = await boss.send(EXPIRE_PROBE_QUEUE, { probe: true });
      expect(jobId).toBeTruthy();

      await waitUntil(
        async () => (await boss.getJobById(EXPIRE_PROBE_QUEUE, jobId!))?.state === 'failed',
      );
      // The handler keeps running after the abort (pg-boss only fails the
      // job); wait for it so the signal assertion is not racing it.
      await finished;
      expect(abortedDuringRun).toBe(true);
      expect(delivered).toBe(1);
    });
  },
);
