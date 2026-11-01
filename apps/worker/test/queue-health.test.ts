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

// R16 (audit 2026-10-31) — queue visibility: active counts for the idle gate
// and the dead letters that replaced silent failed-job deletion. No database:
// the pg-boss client is a fake.

import {
  BACKTEST_RUN_DLQ,
  BACKTEST_RUN_QUEUE,
  BACKTEST_SWEEP_DLQ,
  BACKTEST_SWEEP_QUEUE,
} from '@kestrel/db/queue';
import type { QueueResult } from 'pg-boss';
import { describe, expect, it, vi } from 'vitest';

import {
  getQueueHealthSnapshot,
  isSnapshotIdle,
  refreshQueueHealth,
  sampleQueueHealth,
  type QueueHealthSnapshot,
  type QueueProbeSource,
} from '../src/bootstrap/queue-health';
import { CANDLE_FLUSH_QUEUE } from '../src/persistence/candle-outbox';

type FakeCounts = Partial<
  Record<string, { active?: number; queued?: number; failed?: number; total?: number }>
>;

const { deadLetterRows, queueCounts } = vi.hoisted(() => ({
  deadLetterRows: new Map<string, Array<Record<string, unknown>>>(),
  queueCounts: new Map<
    string,
    { active?: number; queued?: number; failed?: number; total?: number }
  >(),
}));

function countRow(name: string, counts: FakeCounts[string]) {
  return {
    name,
    activeCount: counts?.active ?? 0,
    queuedCount: counts?.queued ?? 0,
    failedCount: counts?.failed ?? 0,
    totalCount: counts?.total ?? 0,
  } as unknown as QueueResult;
}

function fakeBoss(
  counts: FakeCounts = {},
  deadLetters: Record<string, Array<Record<string, unknown>>> = {},
) {
  for (const [name, value] of Object.entries(counts)) queueCounts.set(name, value ?? {});
  for (const [name, rows] of Object.entries(deadLetters)) deadLetterRows.set(name, rows);
  return {
    getQueues: vi.fn(async (names?: string[]) =>
      (names ?? []).map((name) => countRow(name, queueCounts.get(name))),
    ),
    findJobs: vi.fn(async (name: string) => (deadLetterRows.get(name) ?? []) as never),
  } satisfies QueueProbeSource;
}

vi.mock('@kestrel/db/queue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kestrel/db/queue')>();
  return {
    ...actual,
    getQueue: vi.fn(async () =>
      fakeBoss(Object.fromEntries(queueCounts), Object.fromEntries(deadLetterRows)),
    ),
  };
});

describe('sampleQueueHealth', () => {
  it('reports per-queue counts, including the retained dead letters', async () => {
    const boss = fakeBoss({
      [BACKTEST_RUN_QUEUE]: { active: 1, queued: 2, failed: 0 },
      [BACKTEST_SWEEP_QUEUE]: { active: 0, queued: 0, failed: 0 },
      [CANDLE_FLUSH_QUEUE]: { active: 0, queued: 3, failed: 0 },
      [BACKTEST_RUN_DLQ]: { active: 0, queued: 0, failed: 4, total: 4 },
    });

    const snapshot = await sampleQueueHealth(boss);
    const run = snapshot.queues.find((queue) => queue.name === BACKTEST_RUN_QUEUE);
    const dlq = snapshot.queues.find((queue) => queue.name === BACKTEST_RUN_DLQ);

    expect(run).toMatchObject({ active: 1, queued: 2 });
    expect(dlq).toMatchObject({ deadLettered: 4 });
    expect(snapshot.error).toBeNull();
  });

  it('surfaces the original failure from a dead letter, not just a count', async () => {
    const boss = fakeBoss(
      { [BACKTEST_SWEEP_DLQ]: { total: 1 } },
      {
        [BACKTEST_SWEEP_DLQ]: [
          {
            id: 'dlq-1',
            createdOn: new Date('2026-10-31T12:00:00.000Z'),
            sourceName: BACKTEST_SWEEP_QUEUE,
            sourceId: 'original-1',
            sourceRetryCount: 1,
            sourceOutput: { message: 'Strategy exceeded the sandbox limits' },
          },
        ],
      },
    );

    const snapshot = await sampleQueueHealth(boss);

    expect(snapshot.deadLetters).toEqual([
      {
        queue: BACKTEST_SWEEP_DLQ,
        id: 'dlq-1',
        sourceQueue: BACKTEST_SWEEP_QUEUE,
        sourceJobId: 'original-1',
        deadLetteredAt: '2026-10-31T12:00:00.000Z',
        retries: 1,
        error: 'Strategy exceeded the sandbox limits',
      },
    ]);
  });
});

describe('isSnapshotIdle', () => {
  function snapshot(active: number, error: string | null = null): QueueHealthSnapshot {
    return {
      capturedAt: new Date().toISOString(),
      queues: [{ name: BACKTEST_RUN_QUEUE, active, queued: 0, failed: 0, deadLettered: 0 }],
      deadLetters: [],
      error,
    };
  }

  it('is idle when nothing is being worked', () => {
    expect(isSnapshotIdle(snapshot(0))).toBe(true);
  });

  it('is busy while a queue job is active', () => {
    expect(isSnapshotIdle(snapshot(1))).toBe(false);
  });

  it('does not block on an unknown or failed sample', () => {
    expect(isSnapshotIdle(null)).toBe(true);
    expect(isSnapshotIdle(snapshot(0, 'connection refused'))).toBe(true);
  });
});

describe('refreshQueueHealth', () => {
  it('caches the sampled snapshot for the synchronous health handler', async () => {
    queueCounts.set(BACKTEST_RUN_QUEUE, { active: 2 });
    deadLetterRows.set(BACKTEST_RUN_DLQ, []);
    await refreshQueueHealth();

    const snapshot = getQueueHealthSnapshot();
    expect(snapshot?.queues.find((queue) => queue.name === BACKTEST_RUN_QUEUE)?.active).toBe(2);
    expect(isSnapshotIdle(snapshot)).toBe(false);
  });

  it('logs a newly dead-lettered job once it appears', async () => {
    const error = vi.fn();
    const log = { warn: vi.fn(), error } as never;
    // First sample after boot is silent (it may carry rows from before).
    await refreshQueueHealth(log, fakeBoss({}, {}));
    expect(error).not.toHaveBeenCalled();

    // A job dead-lettered while the worker is up is logged for alerting.
    const withFailure = fakeBoss(
      { [BACKTEST_RUN_DLQ]: { total: 1 } },
      {
        [BACKTEST_RUN_DLQ]: [
          {
            id: 'new-dlq-1',
            createdOn: new Date('2026-10-31T13:00:00.000Z'),
            sourceName: BACKTEST_RUN_QUEUE,
            sourceId: 'run-9',
            sourceRetryCount: 2,
            sourceOutput: { message: 'sandbox unavailable' },
          },
        ],
      },
    );
    await refreshQueueHealth(log, withFailure);

    expect(error).toHaveBeenCalledWith(
      'background job dead-lettered',
      expect.objectContaining({
        queue: BACKTEST_RUN_DLQ,
        sourceQueue: BACKTEST_RUN_QUEUE,
        sourceJobId: 'run-9',
        err: 'sandbox unavailable',
      }),
    );
  });

  it('records the probe error instead of throwing out of the timer', async () => {
    const failing = {
      getQueues: vi.fn(async () => {
        throw new Error('pool exhausted');
      }),
      findJobs: vi.fn(async () => []),
    } satisfies QueueProbeSource;
    const warn = vi.fn();
    const log = { warn } as never;

    await refreshQueueHealth(log, failing);

    const snapshot = getQueueHealthSnapshot();
    expect(snapshot?.error).toContain('pool exhausted');
    expect(warn).toHaveBeenCalledWith('queue health probe failed', {
      err: 'Error: pool exhausted',
    });

    // A repeated identical failure is not logged again...
    await refreshQueueHealth(log, failing);
    expect(warn).toHaveBeenCalledTimes(1);
    // ...but a different failure is.
    await refreshQueueHealth(log, {
      getQueues: vi.fn(async () => {
        throw new Error('migration missing');
      }),
      findJobs: vi.fn(async () => []),
    } satisfies QueueProbeSource);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
