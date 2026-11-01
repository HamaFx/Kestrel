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

// Durable hand-off for a closed 1m bar the direct write could not persist
// (R9, audit 2026-10-31).
//
// `candle-writer.ts` owns the retry loop; when that is exhausted it calls
// `handOffBar` here. The bar goes to the pg-boss `candle-flush` queue
// (`persistence/candle-outbox.ts`), which the worker consumes on a later
// cycle or on the next boot. The write is idempotent, so a bar that reached
// the database after all and is then replayed from the queue is a no-op.
//
// Only when the write AND the queue both fail is the bar counted as lost and
// logged at `error` level with its full OHLCV payload, so it can be
// reconstructed from the log instead of vanishing.

import type { Candle1mBar } from '../aggregator/candle-1m.js';
import type { Logger } from '../log.js';
import { withTimeout } from './candle-timing.js';

/** Default cap on one durable hand-off attempt. */
export const DEFAULT_HAND_OFF_TIMEOUT_MS = 2_000;

/**
 * Floor for one hand-off attempt. The queue insert is either fast or dead,
 * and a shutdown hand-off must not be abandoned while the pool is merely
 * slow, so the configured timeout is never lowered below this.
 */
const HAND_OFF_TIMEOUT_FLOOR_MS = 250;

/** Hands one unpersisted bar to the durable queue. Injected by tests. */
export type EnqueueFailedBar = (bar: Candle1mBar, reason: string) => Promise<boolean>;

/**
 * Default hand-off: the pg-boss `candle-flush` queue. Imported lazily so the
 * pure rig tests never load pg-boss.
 */
export async function defaultEnqueueFailedBar(bar: Candle1mBar, reason: string): Promise<boolean> {
  const { enqueueClosedCandle } = await import('../persistence/candle-outbox.js');
  return enqueueClosedCandle(bar, { reason });
}

export type HandOffOutcome = { status: 'queued' } | { status: 'dropped'; reason: string };

export interface HandOffBarArgs {
  bar: Candle1mBar;
  /** Why the bar reached the queue: 'flush-failed' or 'shutdown'. */
  reason: string;
  /** Error that exhausted the write attempts (diagnostics only). */
  cause: unknown;
  /** Configured cap for the insert; floored at HAND_OFF_TIMEOUT_FLOOR_MS. */
  timeoutMs: number;
  enqueue: EnqueueFailedBar;
  log: Logger;
}

/**
 * Queue one unpersisted bar. Never throws: the caller maps the outcome to
 * counters so a total failure (write + queue) is visible rather than lost.
 */
export async function handOffBar(args: HandOffBarArgs): Promise<HandOffOutcome> {
  const { bar, log } = args;
  let failure: string;
  try {
    const outcome = await withTimeout(
      args.enqueue(bar, args.reason),
      Math.max(HAND_OFF_TIMEOUT_FLOOR_MS, args.timeoutMs),
    );
    if (outcome === true) {
      log.warn('candle bar queued for durable replay', {
        symbol: bar.symbol,
        t: new Date(bar.t).toISOString(),
        reason: args.reason,
        err: args.cause === undefined ? null : String(args.cause),
      });
      return { status: 'queued' };
    }
    failure = outcome === 'timeout' ? 'durable queue hand-off timed out' : 'durable queue refused';
  } catch (queueErr) {
    failure = String(queueErr);
  }

  // Last resort: the write failed and the queue failed. Emit the whole bar
  // so it can be reconstructed from logs instead of vanishing.
  log.error('candle bar LOST (write and durable queue both failed)', {
    symbol: bar.symbol,
    t: new Date(bar.t).toISOString(),
    o: bar.o,
    h: bar.h,
    l: bar.l,
    c: bar.c,
    v: bar.v,
    tickVolume: bar.tickVolume,
    source: bar.source,
    reason: args.reason,
    lastError: failure,
  });
  return { status: 'dropped', reason: failure };
}
