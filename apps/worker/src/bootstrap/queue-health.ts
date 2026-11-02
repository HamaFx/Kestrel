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

// R16 (audit 2026-10-31) — queue visibility for the worker health surface.
//
// A pg-boss job that exhausts its retries used to sit `failed` and disappear
// an hour later with nothing to alert on. With the dead-letter queues
// configured in `@kestrel/db/queue`, the failure is retained for 30 days; this
// probe samples the queue counts and the newest dead-letter rows on a timer so
// `/health/jobs` (and the operator reading it) can see them without a database
// round trip inside the health handler.
//
// The same snapshot answers "is the worker safe to restart", which the VM
// self-update script gates on: an active queue job means work is in flight.

import {
  BACKTEST_RUN_QUEUE,
  BACKTEST_SWEEP_QUEUE,
  DEAD_LETTER_QUEUES,
  getQueue,
} from '@kestrel/db/queue';
import type { JobWithMetadata, QueueResult } from 'pg-boss';

import type { Logger } from '../log.js';
import { CANDLE_FLUSH_QUEUE } from '../persistence/candle-outbox.js';

/** Sample interval for the health probe. */
const QUEUE_HEALTH_INTERVAL_MS = 30_000;
/** Newest dead-letter rows kept in the snapshot, per DLQ. */
const DEAD_LETTER_SAMPLE = 5;

interface QueueActivity {
  name: string;
  /** Jobs currently held by a worker. */
  active: number;
  /** Jobs waiting to be picked up. */
  queued: number;
  /** Terminally failed jobs still retained on the source queue. */
  failed: number;
  /** Rows currently sitting in this dead-letter queue. */
  deadLettered: number;
}

interface DeadLetterJobSummary {
  /** The dead-letter queue the row lives in. */
  queue: string;
  id: string;
  /** Queue the job originally failed on. */
  sourceQueue: string | null;
  sourceJobId: string | null;
  deadLetteredAt: string;
  /** Retries the original job consumed before it was dead-lettered. */
  retries: number | null;
  /** The failure message pg-boss recorded for the original attempt. */
  error: string | null;
}

export interface QueueHealthSnapshot {
  capturedAt: string;
  queues: QueueActivity[];
  deadLetters: DeadLetterJobSummary[];
  /** Last probe error, or null when the latest sample succeeded. */
  error: string | null;
}

const SOURCE_QUEUES: readonly string[] = [
  BACKTEST_RUN_QUEUE,
  BACKTEST_SWEEP_QUEUE,
  CANDLE_FLUSH_QUEUE,
];

let snapshot: QueueHealthSnapshot | null = null;
let starting: Promise<void> | null = null;
/** Last probe error, so a persistent outage is not logged every interval. */
let lastError: string | null = null;

/** Latest sampled snapshot (synchronous: the health handler must not query). */
export function getQueueHealthSnapshot(): QueueHealthSnapshot | null {
  return snapshot;
}

function extractMessage(output: unknown): string | null {
  if (output === null || typeof output !== 'object') return null;
  const message = (output as Record<string, unknown>)['message'];
  if (typeof message === 'string' && message.length > 0) return message.slice(0, 500);
  return null;
}

function toDeadLetter(row: JobWithMetadata<Record<string, unknown>>, queue: string) {
  return {
    queue,
    id: row.id,
    sourceQueue: row.sourceName ?? null,
    sourceJobId: row.sourceId ?? null,
    deadLetteredAt: new Date(row.createdOn).toISOString(),
    retries: row.sourceRetryCount ?? null,
    error: extractMessage(row.sourceOutput ?? row.output),
  };
}

/** The subset of the pg-boss client the probe needs (injectable for tests). */
export interface QueueProbeSource {
  getQueues(names?: string[]): Promise<QueueResult[]>;
  findJobs<T>(name: string, options?: { limit?: number }): Promise<JobWithMetadata<T>[]>;
}

/** Query the queues once. Throws on any database/queue error. */
export async function sampleQueueHealth(boss?: QueueProbeSource): Promise<QueueHealthSnapshot> {
  const queue = boss ?? (await getQueue());
  const names = [...SOURCE_QUEUES, ...DEAD_LETTER_QUEUES];
  const results = await queue.getQueues(names);
  const byName = new Map(results.map((entry) => [entry.name, entry]));

  const queues: QueueActivity[] = SOURCE_QUEUES.map((name) => {
    const row = byName.get(name);
    return {
      name,
      active: row?.activeCount ?? 0,
      queued: row?.queuedCount ?? 0,
      failed: row?.failedCount ?? 0,
      deadLettered: 0,
    };
  });

  const deadLetters: DeadLetterJobSummary[] = [];
  for (const name of DEAD_LETTER_QUEUES) {
    const row = byName.get(name);
    const retained = row?.totalCount ?? 0;
    queues.push({
      name,
      active: row?.activeCount ?? 0,
      queued: row?.queuedCount ?? 0,
      failed: row?.failedCount ?? 0,
      deadLettered: retained,
    });
    if (retained === 0) continue;
    const rows = await queue.findJobs<Record<string, unknown>>(name, {
      limit: DEAD_LETTER_SAMPLE,
    });
    for (const job of rows) deadLetters.push(toDeadLetter(job, name));
  }

  return {
    capturedAt: new Date().toISOString(),
    queues,
    deadLetters,
    error: null,
  };
}

/**
 * Refresh the cached snapshot (deduplicated when a refresh is in flight).
 * `boss` is injectable so tests can exercise the failure path.
 */
export function refreshQueueHealth(log?: Logger, boss?: QueueProbeSource): Promise<void> {
  starting ??= sampleQueueHealth(boss)
    .then((next) => {
      lastError = null;
      // Surface a newly dead-lettered job in the worker log as well as the
      // health payload. The first sample after boot is silent: those rows are
      // already visible, and a restart should not replay every old failure.
      if (log && snapshot) {
        const known = new Set(snapshot.deadLetters.map((job) => job.id));
        for (const job of next.deadLetters) {
          if (known.has(job.id)) continue;
          log.error('background job dead-lettered', {
            queue: job.queue,
            sourceQueue: job.sourceQueue,
            sourceJobId: job.sourceJobId,
            retries: job.retries,
            err: job.error,
          });
        }
      }
      snapshot = next;
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      snapshot = {
        capturedAt: snapshot?.capturedAt ?? new Date().toISOString(),
        queues: snapshot?.queues ?? [],
        deadLetters: snapshot?.deadLetters ?? [],
        error: message,
      };
      // Log a changed failure once, not the same outage every sample.
      if (message !== lastError) {
        log?.warn('queue health probe failed', { err: String(err) });
      }
      lastError = message;
    })
    .finally(() => {
      starting = null;
    });
  return starting;
}

/**
 * Start sampling. Returns a stop function; the timer is unref'd so it never
 * keeps the process alive on its own.
 */
export function startQueueHealthProbe(log: Logger): () => void {
  void refreshQueueHealth(log);
  const timer = setInterval(() => {
    void refreshQueueHealth(log);
  }, QUEUE_HEALTH_INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}

/**
 * True when no queue job is being worked in the given snapshot. Unknown or
 * errored snapshots count as idle: `getQueue()` keeps a failed sample from
 * blocking an update forever, and the scheduled-job check is done separately
 * by the caller.
 */
export function isSnapshotIdle(snapshot: QueueHealthSnapshot | null): boolean {
  if (!snapshot || snapshot.error) return true;
  return snapshot.queues.every((queue) => queue.active === 0);
}
