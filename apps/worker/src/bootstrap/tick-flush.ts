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

// Periodic live_ticks flush loop: drains the tick buffer on an interval,
// skipping overlapping runs and retaining un-flushed ticks on failure.

import type { DbClient } from '@kestrel/db';

import type { Logger } from '../log.js';
import { flushLiveTicks } from '../persistence/live-ticks.js';
import type { TickBuffer } from '../signalr/tick-buffer.js';

export interface TickFlusher {
  /** Schedule the next flush (no-op once stopped). */
  schedule(): void;
  /** Stop scheduling further flushes; an in-flight flush keeps running. */
  stopScheduling(): void;
  /** Await the in-flight flush, if any. */
  awaitInFlight(): Promise<void>;
}

export function createTickFlusher({
  db,
  buffer,
  log,
  flushIntervalMs,
}: {
  db: DbClient;
  buffer: TickBuffer;
  log: Logger;
  flushIntervalMs: number;
}): TickFlusher {
  let tickFlushFailureCount = 0;
  let flushInFlight = false;
  let activeFlushPromise: Promise<void> | null = null;
  let stopping = false;
  let flushTimer: NodeJS.Timeout | null = null;

  const schedule = () => {
    if (stopping) return;
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void runSingleFlush();
    }, flushIntervalMs);
    flushTimer.unref();
  };

  const runSingleFlush = async () => {
    if (stopping) return;
    if (flushInFlight) {
      log.warn('flushLiveTicks skipped — previous flush still in flight');
      schedule();
      return;
    }

    const drained = buffer.peek();
    if (drained.length === 0) {
      schedule();
      return;
    }

    flushInFlight = true;
    const work = (async () => {
      try {
        const r = await flushLiveTicks({ db, buffer, log }, drained);
        buffer.drain(drained);
        if (r.written > 0) {
          log.info('flushed live_ticks', { written: r.written, ticks: r.totalTicks });
        }
        tickFlushFailureCount = 0;
      } catch (err) {
        tickFlushFailureCount += 1;
        log.error('flushLiveTicks failed — ticks retained in buffer for next attempt', {
          err: String(err),
          consecutiveFailures: tickFlushFailureCount,
        });
      } finally {
        flushInFlight = false;
        activeFlushPromise = null;
        schedule();
      }
    })();
    activeFlushPromise = work;
    await work;
  };

  const stopScheduling = () => {
    stopping = true;
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  };

  const awaitInFlight = async (): Promise<void> => {
    if (activeFlushPromise) {
      await activeFlushPromise;
    }
  };

  return { schedule, stopScheduling, awaitInFlight };
}
