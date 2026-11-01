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

// Durable write of one closed 1m bar (R9, audit 2026-10-31).
//
// The closed-bar write used to be fire-and-forget with a 10 s timeout and no
// retry, so a failure dropped that minute forever. This module owns the
// bounded retry policy for one bar:
//
//   1. Up to `maxAttempts` attempts, backoff `retryDelaysMs` between them,
//      each bounded by `flushTimeoutMs` (the in-flight query is aborted, as
//      the persistence layer supports cancellation).
//   2. When the attempts are exhausted the bar goes to the durable hand-off
//      in `candle-queue.ts`, which the worker consumes later or after a
//      restart. Nothing is thrown: the caller gets an outcome to count.
//   3. During shutdown the retry loop stops early and hands the bar straight
//      over, so draining cannot spend the grace window re-trying a dead pool.

import type { DbClient } from '@kestrel/db';

import type { Candle1mBar } from '../aggregator/candle-1m.js';
import type { Logger } from '../log.js';
import { flushClosedCandle } from '../persistence/candles-1m.js';
import { handOffBar, type EnqueueFailedBar } from './candle-queue.js';
import { sleep } from './candle-timing.js';

export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_RETRY_DELAYS_MS = [250, 1_000];
export const DEFAULT_FLUSH_TIMEOUT_MS = 10_000;

/** Floor for a per-attempt timeout, even if the shutdown window has closed. */
const ATTEMPT_TIMEOUT_FLOOR_MS = 250;

export interface CandleWriteOutcome {
  /** 'written' to `candles_1m`, 'queued' for durable replay, or 'dropped'. */
  status: 'written' | 'queued' | 'dropped';
  /** DB write attempts made (1..maxAttempts, plus any made before shutdown). */
  attempts: number;
  /** Why the bar was dropped (status 'dropped' only). */
  failure: string | null;
}

export interface WriteCandleBarArgs {
  bar: Candle1mBar;
  db: DbClient;
  log: Logger;
  /** Total write attempts before the durable queue takes over. */
  maxAttempts: number;
  /** Delay before retry N (index 0 is the delay before attempt 2). */
  retryDelaysMs: number[];
  /** Timeout for one DB write attempt. */
  flushTimeoutMs: number;
  /** Timeout for one durable hand-off attempt. */
  handOffTimeoutMs: number;
  /**
   * Milliseconds left in the shutdown grace window, or null while the worker
   * is running normally. Once set, the retry loop stops early and hands the
   * bar over instead of spending the window on retries.
   */
  remainingShutdownMs: () => number | null;
  enqueue: EnqueueFailedBar;
}

/**
 * Write one closed bar, retrying within the policy above and falling back to
 * the durable queue. Never throws.
 */
export async function writeCandleBar(args: WriteCandleBarArgs): Promise<CandleWriteOutcome> {
  const { bar, db, log } = args;

  const writeOnce = async (timeoutMs: number): Promise<void> => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new DOMException('candle flush timed out', 'TimeoutError'));
    }, timeoutMs);
    timer.unref();
    try {
      await flushClosedCandle({ db, log, bar, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  /** One attempt's timeout, clamped to whatever the shutdown window allows. */
  const attemptTimeoutMs = (remainingShutdownMs: number | null): number => {
    if (remainingShutdownMs === null) return args.flushTimeoutMs;
    return Math.max(ATTEMPT_TIMEOUT_FLOOR_MS, Math.min(args.flushTimeoutMs, remainingShutdownMs));
  };

  let attempt = 0;
  let lastErr: unknown;

  while (attempt < args.maxAttempts) {
    if (attempt > 0) {
      const delay = args.retryDelaysMs[Math.min(attempt - 1, args.retryDelaysMs.length - 1)] ?? 0;
      const remaining = args.remainingShutdownMs();
      if (remaining !== null && remaining <= delay) break;
      await sleep(delay);
    }
    const remaining = args.remainingShutdownMs();
    if (remaining !== null && remaining <= 0) break;

    attempt += 1;
    try {
      await writeOnce(attemptTimeoutMs(remaining));
      log.info('candle closed', {
        symbol: bar.symbol,
        t: new Date(bar.t).toISOString(),
        o: bar.o,
        h: bar.h,
        l: bar.l,
        c: bar.c,
        ticks: bar.tickVolume,
        attempts: attempt,
      });
      return { status: 'written', attempts: attempt, failure: null };
    } catch (err) {
      lastErr = err;
      log.warn('flushClosedCandle attempt failed', {
        symbol: bar.symbol,
        t: new Date(bar.t).toISOString(),
        attempt,
        maxAttempts: args.maxAttempts,
        err: String(err),
      });
    }
  }

  const reason = args.remainingShutdownMs() !== null ? 'shutdown' : 'flush-failed';
  const outcome = await handOffBar({
    bar,
    reason,
    cause: lastErr,
    timeoutMs: args.handOffTimeoutMs,
    enqueue: args.enqueue,
    log,
  });
  if (outcome.status === 'queued') return { status: 'queued', attempts: attempt, failure: null };
  return { status: 'dropped', attempts: attempt, failure: outcome.reason };
}
