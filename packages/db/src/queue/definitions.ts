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

// Queue names and policies owned by this build.
//
// Kept apart from `queue.ts` (the pg-boss client) so the definitions can be
// read and asserted without opening a pool. `@kestrel/db/queue` re-exports
// everything here.

import type { QueueOptions } from 'pg-boss';

export const BACKTEST_RUN_QUEUE = 'backtest-run';
export const BACKTEST_SWEEP_QUEUE = 'backtest-sweep';

// -----------------------------------------------------------------------
// R16 (audit 2026-10-31) — dead-letter queues.
//
// Without a `deadLetter`, a backtest job that exhausts `retryLimit` sits in
// `failed` and is deleted an hour later with nothing to alert on. Each queue
// now copies a terminally-failed job into its own DLQ (pg-boss keeps the
// original payload plus `source_*` metadata and the error output), where it
// stays for 30 days: long enough for the worker health payload / an operator
// to see it and redrive it with `boss.redrive()`.
//
// pg-boss refuses a `deadLetter` that does not exist yet, so the DLQ rows are
// created before their source queues.
// -----------------------------------------------------------------------

/** Dead-letter queues, one per retrying queue. Created by `getQueue()`. */
export const BACKTEST_RUN_DLQ = 'backtest-run-dlq';
export const BACKTEST_SWEEP_DLQ = 'backtest-sweep-dlq';

/** How long a dead-lettered job stays visible. 30 days. */
export const DEAD_LETTER_RETENTION_SECONDS = 30 * 24 * 3_600;

/**
 * DLQ policy: nothing consumes a DLQ, so retries and completion are
 * irrelevant; the retention window is the whole point (`retentionSeconds`
 * caps a job in `created` state, which is how a dead-lettered copy lands).
 * `deleteAfterSeconds` matches it so a row an operator processes or fails by
 * hand cannot accumulate forever either.
 */
export const DEAD_LETTER_QUEUE_OPTIONS: QueueOptions = {
  retryLimit: 0,
  retryDelay: 0,
  retryBackoff: false,
  expireInSeconds: 3_600,
  retentionSeconds: DEAD_LETTER_RETENTION_SECONDS,
  deleteAfterSeconds: DEAD_LETTER_RETENTION_SECONDS,
};

// -----------------------------------------------------------------------
// R16 (audit 2026-10-31) — heartbeat and expiration for the long jobs.
//
// pg-boss 12 treats these as two independent mechanisms (`Queues` docs):
//
//   - `expireInSeconds` is a hard ceiling on how long one attempt may stay
//     active. The supervisor fails any active job past it and the worker's
//     own handler race aborts at the same deadline, alive or not. A heartbeat
//     does NOT extend it, so it has to sit above the job's worst-case
//     duration, not at it.
//   - `heartbeatSeconds` is a liveness check. A worker holding the job
//     touches it every `heartbeatSeconds / 2`; once a heartbeat goes missing
//     (crash, OOM, network partition, a wedged event loop) the supervisor
//     fails the attempt after `heartbeatSeconds` plus at most one monitor
//     interval, so a retry starts quickly instead of waiting out the expiry.
//
// A 200-combination sweep evaluates up to two 5s QuickJS slices per
// combination (`DEFAULT_SANDBOX_LIMITS.timeoutMs` in the backtesting engine),
// so the sandbox alone can occupy 200 x 2 x 5s = 2,000s on top of the candle
// fetch (~60s with provider failover), the feature-matrix builds, the
// simulator and the progress flushes. The legacy `persistRuns` path refetches
// the same candle window per combination (30s TTL), which adds up to ~4,000s
// more when every fetch has to fail over. The old 1,800s expiry was below
// even the in-memory bound and pg-boss would fail and retry a sweep that was
// still running. 7,200s covers both bounds and stays the hard cap; 60s
// heartbeats mean a genuinely dead worker is noticed within ~2 minutes even
// for a job that may legitimately run for hours.
//
// A single run is one sandbox evaluation (5s bound) plus a fetch and a
// persist: a worst case near two minutes. Its 600s expiry already sits well
// above that and is kept; the heartbeat only shortens dead-worker detection.
// -----------------------------------------------------------------------

/** Expected heartbeat interval for both long backtest queues. */
export const BACKTEST_HEARTBEAT_SECONDS = 60;

/** Queues this build owns, with their DLQ wiring. Exported for tests. */
export const MANAGED_QUEUES: ReadonlyArray<{
  name: string;
  deadLetter: string;
  options: QueueOptions;
}> = [
  {
    name: BACKTEST_RUN_QUEUE,
    deadLetter: BACKTEST_RUN_DLQ,
    options: {
      retryLimit: 2,
      retryDelay: 15,
      retryBackoff: true,
      expireInSeconds: 600,
      heartbeatSeconds: BACKTEST_HEARTBEAT_SECONDS,
      retentionSeconds: 86_400,
      deleteAfterSeconds: 3_600,
    },
  },
  {
    name: BACKTEST_SWEEP_QUEUE,
    deadLetter: BACKTEST_SWEEP_DLQ,
    options: {
      retryLimit: 1,
      retryDelay: 30,
      retryBackoff: true,
      expireInSeconds: 7_200,
      heartbeatSeconds: BACKTEST_HEARTBEAT_SECONDS,
      retentionSeconds: 86_400,
      deleteAfterSeconds: 3_600,
    },
  },
];

/** Every dead-letter queue this build creates. */
export const DEAD_LETTER_QUEUES: readonly string[] = MANAGED_QUEUES.map(
  (queue) => queue.deadLetter,
);
