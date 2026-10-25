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

// Closed-candle flush rig: wires the 1m aggregator to the persistence layer
// with a per-flush timeout and in-flight tracking for shutdown.

import type { DbClient } from '@kestrel/db';

import { Candle1mAggregator, type ClosedCandle } from '../aggregator/candle-1m.js';
import type { Logger } from '../log.js';
import { flushClosedCandle } from '../persistence/candles-1m.js';

export interface CandleFlushRig {
  aggregator: Candle1mAggregator;
  /** Close all open bars and await any in-flight flushes. */
  drain(): Promise<void>;
}

export function createCandleFlushRig({ db, log }: { db: DbClient; log: Logger }): CandleFlushRig {
  let candleFailureCount = 0;
  const inFlightCandleFlushes = new Set<Promise<void>>();

  const aggregator = new Candle1mAggregator((bar: ClosedCandle) => {
    const CANDLE_FLUSH_TIMEOUT_MS = 10_000;
    const flushController = new AbortController();
    let timeoutId: NodeJS.Timeout | null = null;

    const flushPromise = (async () => {
      try {
        await flushClosedCandle({ db, log, bar, signal: flushController.signal });
        log.info('candle closed', {
          symbol: bar.symbol,
          t: new Date(bar.t).toISOString(),
          o: bar.o,
          h: bar.h,
          l: bar.l,
          c: bar.c,
          ticks: bar.tickVolume,
        });
        candleFailureCount = 0;
      } catch (err) {
        candleFailureCount += 1;
        log.error('flushClosedCandle failed', {
          err: String(err),
          symbol: bar.symbol,
          consecutiveFailures: candleFailureCount,
        });
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      }
    })();

    const timeoutPromise = new Promise<void>((resolve) => {
      timeoutId = setTimeout(() => {
        timeoutId = null;
        flushController.abort();
        log.warn('flushClosedCandle timed out', { symbol: bar.symbol });
        resolve();
      }, CANDLE_FLUSH_TIMEOUT_MS);
      timeoutId.unref();
    });

    const tracked = Promise.race([flushPromise, timeoutPromise]).finally(() => {
      inFlightCandleFlushes.delete(tracked);
    });
    inFlightCandleFlushes.add(tracked);
  });

  const drain = async (): Promise<void> => {
    aggregator.closeAll();
    if (inFlightCandleFlushes.size > 0) {
      await Promise.allSettled([...inFlightCandleFlushes]);
    }
  };

  return { aggregator, drain };
}
