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

// R16 (audit 2026-10-31) — explicit claim heartbeats for long handlers.
//
// pg-boss's worker loop already touches a claimed job when the fetched job
// carries `heartbeatSeconds`. These helpers keep the same `boss.touch()` in
// our code so the refresh is visible where long handlers run, and so the
// cadence and fencing are testable without a live queue. `@kestrel/db/queue`
// re-exports everything here.

import type { Job, PgBoss } from 'pg-boss';

import { BACKTEST_HEARTBEAT_SECONDS, MANAGED_QUEUES } from './definitions';

/** A claimed job as far as heartbeating is concerned. */
export interface JobHeartbeatTarget {
  id: string;
  /** Identifies the attempt the worker fetched; the touch is fenced on it. */
  retryCount: number;
  /** The interval resolved on the fetched job (job override or queue option). */
  heartbeatSeconds?: number | null;
}

export interface JobHeartbeatOptions {
  /** Refresh cadence in seconds; defaults to half the resolved heartbeat interval. */
  intervalSeconds?: number;
  /** Called when a touch fails; the heartbeat keeps running. */
  onError?: (error: unknown) => void;
}

/** How often an explicit heartbeat refreshes the claim, as a fraction of the interval. */
const HEARTBEAT_REFRESH_DIVISOR = 2;

/** The heartbeat interval a managed queue declares, in seconds, or null. */
export function heartbeatSecondsForQueue(queue: string): number | null {
  const managed = MANAGED_QUEUES.find((entry) => entry.name === queue);
  return managed?.options.heartbeatSeconds ?? null;
}

/** The heartbeat interval in force for a fetched job, or null when disabled. */
export function heartbeatSecondsForJob(
  queue: string,
  job: Pick<JobHeartbeatTarget, 'heartbeatSeconds'>,
): number | null {
  return job.heartbeatSeconds ?? heartbeatSecondsForQueue(queue);
}

/**
 * Refresh one claimed job's heartbeat while its handler runs.
 *
 * It is fenced to the fetched attempt (`id` + `retryCount`), so a job that was
 * retried or settled elsewhere is left alone instead of keeping a stale
 * attempt looking alive. Returns the stop function; call it in a `finally`
 * when the handler returns.
 */
export function startJobHeartbeat(
  boss: Pick<PgBoss, 'touch'>,
  queue: string,
  job: JobHeartbeatTarget,
  options: JobHeartbeatOptions = {},
): () => void {
  const heartbeatSeconds =
    options.intervalSeconds ?? heartbeatSecondsForJob(queue, job) ?? BACKTEST_HEARTBEAT_SECONDS;
  const intervalMs = Math.max(1, Math.floor(heartbeatSeconds / HEARTBEAT_REFRESH_DIVISOR)) * 1_000;
  let stopped = false;
  const timer = setInterval(() => {
    if (stopped) return;
    void boss
      .touch(queue, { id: job.id, retryCount: job.retryCount })
      .catch((error: unknown) => options.onError?.(error));
  }, intervalMs);
  // Never keep the process alive on its own.
  timer.unref?.();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

/**
 * Run one fetched job, refreshing its heartbeat for as long as the handler
 * runs. Queues with heartbeats disabled run unchanged.
 *
 * Exported so the wrapper is covered by tests without a live pg-boss; the
 * worker reaches it through `workQueue`.
 */
export async function runJobWithHeartbeat(
  boss: Pick<PgBoss, 'touch'>,
  queue: string,
  job: Job<Record<string, unknown>>,
  handler: (job: Job<Record<string, unknown>>) => Promise<unknown>,
  options: JobHeartbeatOptions = {},
): Promise<unknown> {
  if (heartbeatSecondsForJob(queue, job) === null) return handler(job);
  const stop = startJobHeartbeat(boss, queue, job, options);
  try {
    return await handler(job);
  } finally {
    stop();
  }
}
