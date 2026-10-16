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

// SPDX-License-Identifier: Apache-2.0

// GET /api/cron/warm-cache — pre-fetches the most-used market data so the
// first chat / first chart load of the day is hot. Runs cheap because it
// reuses the same adapters every other read goes through; success populates
// the Next.js Data Cache and the per-instance memory cache for the next
// few minutes.
//
// Schedule: every 2 minutes via the GCE-VM crontab. Idempotent + fast.

import { withCronAuth } from '@/lib/cron';
import { createScopedLoggerWithContext } from '@/lib/logger';
import { getCandlesWithMeta, getPricesWithMeta, SYMBOLS } from '@/lib/services/api-boundary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * BiQuote provides 15,000 req/min/IP over anonymous REST and supports
 * multi-symbol batching via `/api/latest?symbols=A&symbols=B`. We warm
 * `SYMBOLS` in a single batch price call plus `1h` candles on every tick
 * and `4h` candles every 10 minutes.
 */
const TIMEFRAMES_TO_WARM: Array<'1h'> = ['1h'];
/** Less-hot timeframes warmed only on every 10th cron tick. */
const SLOW_TIMEFRAMES_EVERY_10_MIN: Array<'4h'> = ['4h'];

/** Stagger candle requests so the throttle sees them spread out. */
const STAGGER_MS = 1500;

/** H4: Max concurrent candle fetches — avoids 9s serial delay while still
 *  respecting the per-provider throttle. */
const MAX_CONCURRENT = 2;

export async function GET(req: Request): Promise<Response> {
  const log = createScopedLoggerWithContext({ component: 'cron', job: 'warm-cache' });
  return withCronAuth(req, async () => {
    const errors: Array<{ key: string; message: string }> = [];
    let processed = 0;

    // Prices: single batched call via getPricesWithMeta (`/api/latest`).
    try {
      const results = await getPricesWithMeta([...SYMBOLS]);
      processed += results.length;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ key: 'price:batch', message });
      log.warn('price batch warm failed', { message });
    }

    // H4: Parallelize candle warming with a concurrency cap instead of
    // serial execution. 3 symbols × 2 tfs × 1.5s stagger = 9s serial.
    // With MAX_CONCURRENT=2, total time drops to ~4.5s.
    const minute = new Date().getUTCMinutes();
    const slowTfs: ReadonlyArray<'4h'> = minute % 10 === 0 ? SLOW_TIMEFRAMES_EVERY_10_MIN : [];
    const tfs: ReadonlyArray<'1h' | '4h'> = [...TIMEFRAMES_TO_WARM, ...slowTfs];

    // Build all candle fetch tasks.
    const tasks: Array<() => Promise<void>> = [];
    for (const symbol of SYMBOLS) {
      for (const tf of tfs) {
        tasks.push(async () => {
          try {
            await getCandlesWithMeta(symbol, tf, { count: 200 });
            processed += 1;
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            errors.push({ key: `candles:${symbol}:${tf}`, message });
            log.warn('candles warm failed', { symbol, tf, message });
          }
        });
      }
    }

    // Execute with concurrency cap + stagger between batches.
    for (let i = 0; i < tasks.length; i += MAX_CONCURRENT) {
      const batch = tasks.slice(i, i + MAX_CONCURRENT);
      await Promise.all(batch.map((t) => t()));
      if (i + MAX_CONCURRENT < tasks.length) {
        await new Promise((r) => setTimeout(r, STAGGER_MS));
      }
    }

    return {
      processed,
      ...(errors.length > 0
        ? { note: `${errors.length} key(s) failed: ${errors.map((e) => e.key).join(', ')}` }
        : {}),
    };
  });
}
