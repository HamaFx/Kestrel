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

// Durable hand-off for closed 1m bars the direct write could not persist.
//
// R9 (audit 2026-10-31): the candle flush used to be fire-and-forget, so a
// failed (or shutdown-interrupted) INSERT dropped that minute forever. When
// the in-process retry in `bootstrap/candle-flush.ts` is exhausted, the bar
// is enqueued on the existing pg-boss queue (same Postgres, same mechanism
// as `backtest-run`) and written by the consumer below on a later cycle or
// the next worker start. Nothing new is invented: this is `packages/db/src/queue.ts`
// plus one queue definition owned by the worker.
//
// The write itself stays idempotent (`candles_1m` is keyed on (symbol, t)
// and the writer uses ON CONFLICT DO NOTHING), so a bar that was written
// after all and then replayed from the queue is a no-op.

import type { DbClient } from '@kestrel/db';
import { z } from 'zod';

import type { Candle1mBar } from '../aggregator/candle-1m.js';
import type { Logger } from '../log.js';
import { candle1mBarSchema, flushClosedCandle } from './candles-1m.js';

export const CANDLE_FLUSH_QUEUE = 'candle-flush';

/** Queue policy: a few retries with backoff, then the failed job is retained. */
const CANDLE_FLUSH_QUEUE_OPTIONS = {
  retryLimit: 3,
  retryDelay: 15,
  retryBackoff: true,
  expireInSeconds: 60,
  retentionSeconds: 7 * 24 * 3600,
  deleteAfterSeconds: 3_600,
} as const;

export const CandleFlushJobSchema = z.object({
  bar: candle1mBarSchema,
  /** Why the bar reached the queue (diagnostics only). */
  reason: z.string().max(200).optional(),
  /** ISO-8601 UTC time the hand-off happened (diagnostics only). */
  enqueuedAt: z.string().optional(),
});

export type CandleFlushJobData = z.infer<typeof CandleFlushJobSchema>;

/**
 * Create the queue if this worker is the first to need it. `send()` refuses
 * to write to a queue that does not exist, and pg-boss needs no Drizzle
 * migration for the queue row (the `pgboss` schema is created by `pg-boss`
 * itself at start). Cached per process: the check is a round-trip we do not
 * need on every hand-off, and a failed attempt re-arms.
 */
let candleQueueReady: Promise<void> | null = null;

function ensureCandleFlushQueue(): Promise<void> {
  candleQueueReady ??= (async () => {
    const { getQueue } = await import('@kestrel/db/queue');
    const boss = await getQueue();
    const existing = await boss.getQueue(CANDLE_FLUSH_QUEUE).catch(() => null);
    if (!existing) {
      await boss.createQueue(CANDLE_FLUSH_QUEUE, CANDLE_FLUSH_QUEUE_OPTIONS);
    }
  })().catch((err: unknown) => {
    candleQueueReady = null;
    throw err;
  });
  return candleQueueReady;
}

/**
 * Queue one closed bar for durable replay.
 *
 * Returns true when a job carrying the bar is now on the queue, false when
 * the queue itself refused the insert (a suppressed `send`). Callers must
 * treat a false return as data loss and log the bar payload.
 */
export async function enqueueClosedCandle(
  bar: Candle1mBar,
  meta: { reason: string } = { reason: 'flush-failed' },
): Promise<boolean> {
  await ensureCandleFlushQueue();
  const { enqueueJob } = await import('@kestrel/db/queue');
  const jobId = await enqueueJob(CANDLE_FLUSH_QUEUE, {
    bar,
    reason: meta.reason,
    enqueuedAt: new Date().toISOString(),
  });
  // pg-boss `send` resolves null when a queue policy suppressed the insert
  // (throttle/debounce). This queue is `standard` with no suppression
  // options, so a null here means the bar was NOT handed off: return false
  // and let the caller report the loss instead of assuming durability.
  return jobId !== null;
}

/**
 * Register the queue consumer. Safe to call when the queue is empty: the
 * consumer simply polls. Registered on every worker boot (not just when the
 * tick stream is enabled) so bars queued before a restart still land.
 */
export async function startCandleFlushQueueWorker(log: Logger): Promise<string> {
  const queueLog = log.with({ module: 'candle-flush-queue' });
  await ensureCandleFlushQueue();
  const { workQueue } = await import('@kestrel/db/queue');

  return workQueue(CANDLE_FLUSH_QUEUE, async (job) => {
    const parsed = CandleFlushJobSchema.safeParse(job.data);
    if (!parsed.success) {
      throw new Error(
        `Invalid candle-flush payload: ${parsed.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ')}`,
      );
    }
    const { bar } = parsed.data;
    await persistQueuedCandle(bar, queueLog, parsed.data.reason ?? 'flush-failed');
    return { symbol: bar.symbol, t: bar.t };
  });
}

/**
 * Write one queued bar. Exported so tests can drive the consumer without a
 * live pg-boss polling loop; `db` defaults to the process pool.
 */
export async function persistQueuedCandle(
  bar: Candle1mBar,
  log: Logger,
  reason: string,
  db?: DbClient,
): Promise<void> {
  const client = db ?? (await import('@kestrel/db')).getDb();
  await flushClosedCandle({ db: client, log, bar });
  log.warn('queued candle bar replayed to candles_1m', {
    symbol: bar.symbol,
    t: new Date(bar.t).toISOString(),
    reason,
    o: bar.o,
    h: bar.h,
    l: bar.l,
    c: bar.c,
    tickVolume: bar.tickVolume,
  });
}
