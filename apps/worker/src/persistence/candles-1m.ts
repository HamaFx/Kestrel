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

// `candles_1m` writer. Inserts a closed 1-minute bar; idempotent on
// (symbol, t) so worker restarts that re-emit the same bar are safe, and so
// replaying a bar from the durable `candle-flush` queue after it was written
// anyway is a no-op.
//
// The aggregator drives this via `onClosed`; retry, backoff and the durable
// hand-off when this write ultimately fails live in `bootstrap/candle-flush.ts`
// (R9, audit 2026-10-31). Batched writes are still not needed: the closed-bar
// rate is 3 symbols/minute.

import type { getDb } from '@kestrel/db';
import { candles1m } from '@kestrel/db/schema';
import { SymbolSchema } from '@kestrel/shared';
import { z } from 'zod';

import type { Candle1mBar } from '../aggregator/candle-1m.js';
import type { Logger } from '../log.js';

/**
 * Wire schema for a persisted 1m bar. Used to validate the durable outbox
 * payload (`persistence/candle-outbox.ts`) before replaying it into
 * `candles_1m`.
 */
export const candle1mBarSchema: z.ZodType<Candle1mBar> = z.object({
  symbol: SymbolSchema,
  /** Bar open time, ms epoch UTC. */
  t: z.number().int().nonnegative(),
  o: z.number().finite(),
  h: z.number().finite(),
  l: z.number().finite(),
  c: z.number().finite(),
  v: z.number().finite().nullable(),
  tickVolume: z.number().int().nonnegative(),
  source: z.string().min(1).max(64),
});

export interface FlushClosedCandleArgs {
  db: ReturnType<typeof getDb>;
  log: Logger;
  bar: Candle1mBar;
  signal?: AbortSignal;
  /** Optional driver-specific cancellation hook for an already-issued query. */
  cancel?: () => void | Promise<void>;
}

/**
 * Persist a single closed 1m bar. Returns silently on success; bubbles up
 * any DB error so the caller decides whether to retry, queue or log + skip.
 */
export async function flushClosedCandle(args: FlushClosedCandleArgs): Promise<void> {
  const { bar } = args;
  if (args.signal?.aborted) throw new DOMException('Candle flush aborted', 'AbortError');
  const writePromise = args.db
    .insert(candles1m)
    .values({
      symbol: bar.symbol,
      t: new Date(bar.t),
      o: bar.o,
      h: bar.h,
      l: bar.l,
      c: bar.c,
      v: bar.v,
      tickVolume: bar.tickVolume,
      source: bar.source,
    })
    .onConflictDoNothing();
  if (args.signal) {
    await Promise.race([
      writePromise,
      new Promise<never>((_, reject) => {
        if (args.signal?.aborted) {
          reject(new DOMException('Candle flush aborted', 'AbortError'));
          return;
        }
        args.signal?.addEventListener(
          'abort',
          () => {
            void args.cancel?.();
            reject(new DOMException('Candle flush aborted', 'AbortError'));
          },
          { once: true },
        );
      }),
    ]);
  } else {
    await writePromise;
  }
}
