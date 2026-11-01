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

// R16 (audit 2026-10-31) — heartbeat and expiry for the long backtest jobs.
//
// pg-boss 12 keeps these independent: `expireInSeconds` is a hard ceiling on
// how long one attempt may stay active (a heartbeat does NOT extend it), and
// `heartbeatSeconds` is the liveness check that lets the supervisor fail a
// dead worker quickly. These tests pin both halves: the sweep expiry sits
// above the engine's derived worst case, and a running handler refreshes its
// claim with a fenced `boss.touch()`.

import type { Job, PgBoss } from 'pg-boss';
import { describe, expect, it, vi } from 'vitest';

import {
  BACKTEST_HEARTBEAT_SECONDS,
  BACKTEST_RUN_QUEUE,
  BACKTEST_SWEEP_QUEUE,
  heartbeatSecondsForJob,
  heartbeatSecondsForQueue,
  MANAGED_QUEUES,
  runJobWithHeartbeat,
  startJobHeartbeat,
} from '../src/queue';

function queueOptions(name: string) {
  const managed = MANAGED_QUEUES.find((entry) => entry.name === name);
  expect(managed).toBeDefined();
  return managed!.options;
}

function fakeBoss(touch: ReturnType<typeof vi.fn>): Pick<PgBoss, 'touch'> {
  return { touch } as unknown as Pick<PgBoss, 'touch'>;
}

function fakeJob(overrides: Partial<Job<Record<string, unknown>>> = {}) {
  return {
    id: 'job-1',
    name: 'test',
    data: {},
    expireInSeconds: 600,
    heartbeatSeconds: null,
    retryCount: 0,
    signal: new AbortController().signal,
    ...overrides,
  } as Job<Record<string, unknown>>;
}

describe('long-job heartbeat configuration (R16)', () => {
  it('declares a heartbeat on both long backtest queues', () => {
    for (const name of [BACKTEST_RUN_QUEUE, BACKTEST_SWEEP_QUEUE]) {
      const options = queueOptions(name);
      expect(options.heartbeatSeconds).toBe(BACKTEST_HEARTBEAT_SECONDS);
      expect(options.heartbeatSeconds).toBeGreaterThanOrEqual(10);
      // A heartbeat only helps if the expiry it protects is far longer.
      expect(options.heartbeatSeconds!).toBeLessThan(options.expireInSeconds!);
      expect(heartbeatSecondsForQueue(name)).toBe(BACKTEST_HEARTBEAT_SECONDS);
    }
  });

  it('sets the sweep expiry above the derived worst case', () => {
    // 200 combinations x 2 sandbox slices x 5s deadline = 2,000s of sandbox
    // time, before the candle fetch, feature matrices, simulator and progress
    // flushes. The old 1,800s sat below it and failed a live sweep.
    const sweep = queueOptions(BACKTEST_SWEEP_QUEUE);
    expect(sweep.expireInSeconds).toBe(7_200);
    expect(sweep.expireInSeconds!).toBeGreaterThan(200 * 2 * 5);

    // A single run is one 5s sandbox evaluation plus a fetch and a persist;
    // its 600s ceiling already sits well above that and is unchanged.
    const run = queueOptions(BACKTEST_RUN_QUEUE);
    expect(run.expireInSeconds).toBe(600);
  });

  it('leaves queues without a heartbeat alone', () => {
    expect(heartbeatSecondsForQueue('candle-flush')).toBeNull();
    expect(heartbeatSecondsForJob('candle-flush', { heartbeatSeconds: null })).toBeNull();
  });

  it('prefers the interval resolved on the fetched job', () => {
    expect(heartbeatSecondsForJob(BACKTEST_SWEEP_QUEUE, { heartbeatSeconds: 15 })).toBe(15);
    expect(heartbeatSecondsForJob(BACKTEST_SWEEP_QUEUE, { heartbeatSeconds: null })).toBe(
      BACKTEST_HEARTBEAT_SECONDS,
    );
  });
});

describe('job heartbeat', () => {
  it('touches the claim at half the interval, fenced to the fetched attempt', async () => {
    vi.useFakeTimers();
    try {
      const touch = vi.fn(async () => ({ jobs: ['job-1'], requested: 1, affected: 1 }));
      const stop = startJobHeartbeat(fakeBoss(touch), BACKTEST_RUN_QUEUE, {
        id: 'job-1',
        retryCount: 2,
      });

      await vi.advanceTimersByTimeAsync(29_000);
      expect(touch).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1_000);
      expect(touch).toHaveBeenCalledTimes(1);
      expect(touch).toHaveBeenCalledWith(BACKTEST_RUN_QUEUE, { id: 'job-1', retryCount: 2 });

      await vi.advanceTimersByTimeAsync(60_000);
      expect(touch).toHaveBeenCalledTimes(3);

      stop();
      await vi.advanceTimersByTimeAsync(120_000);
      expect(touch).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the claim fresh for as long as the handler runs', async () => {
    vi.useFakeTimers();
    try {
      const touch = vi.fn(async () => ({ jobs: ['job-1'], requested: 1, affected: 1 }));
      let finish!: () => void;
      const handled = new Promise<void>((resolve) => {
        finish = resolve;
      });

      const result = runJobWithHeartbeat(
        fakeBoss(touch),
        BACKTEST_RUN_QUEUE,
        fakeJob(),
        async () => {
          await handled;
          return 'done';
        },
      );

      await vi.advanceTimersByTimeAsync(90_000);
      expect(touch.mock.calls.length).toBeGreaterThanOrEqual(2);

      finish();
      await expect(result).resolves.toBe('done');

      const afterHandler = touch.mock.calls.length;
      await vi.advanceTimersByTimeAsync(120_000);
      expect(touch.mock.calls.length).toBe(afterHandler);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not touch a queue that has no heartbeat', async () => {
    const touch = vi.fn();
    const result = await runJobWithHeartbeat(
      fakeBoss(touch),
      'candle-flush',
      fakeJob({ name: 'candle-flush' }),
      async () => 'ok',
    );
    expect(result).toBe('ok');
    expect(touch).not.toHaveBeenCalled();
  });

  it('reports a failed touch without stopping the heartbeat', async () => {
    vi.useFakeTimers();
    try {
      const touch = vi.fn(async () => {
        throw new Error('pool exhausted');
      });
      const onError = vi.fn();
      const stop = startJobHeartbeat(
        fakeBoss(touch),
        BACKTEST_RUN_QUEUE,
        { id: 'job-1', retryCount: 0 },
        { onError },
      );

      await vi.advanceTimersByTimeAsync(30_000);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));

      await vi.advanceTimersByTimeAsync(30_000);
      expect(touch).toHaveBeenCalledTimes(2);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
