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

// Durable candle outbox payload + consumer tests (R9, audit 2026-10-31).
// The pg-boss transport itself is exercised by the Postgres-gated test
// (`candle-outbox-postgres.test.ts`).

import type { DbClient } from '@kestrel/db';
import { describe, expect, it, vi } from 'vitest';

import type { Candle1mBar } from '../src/aggregator/candle-1m';
import type { Logger } from '../src/log';
import { CandleFlushJobSchema, persistQueuedCandle } from '../src/persistence/candle-outbox';

const BAR: Candle1mBar = {
  symbol: 'XAUUSD',
  t: 1_700_000_000_000,
  o: 2390,
  h: 2391,
  l: 2389,
  c: 2390.5,
  v: null,
  tickVolume: 47,
  source: 'biquote-signalr',
};

function makeFakeDb() {
  const rows: Array<Record<string, unknown>> = [];
  const db = {
    insert: () => ({
      values: (row: Record<string, unknown>) => ({
        onConflictDoNothing: async () => {
          rows.push(row);
        },
      }),
    }),
  } as unknown as DbClient;
  return { db, rows };
}

function makeLogger() {
  const lines: Array<{ msg: string; meta: Record<string, unknown> }> = [];
  const logger = {
    info: vi.fn(),
    warn: (msg: string, meta?: Record<string, unknown>) => lines.push({ msg, meta: meta ?? {} }),
    error: vi.fn(),
    with: () => logger,
  } as unknown as Logger;
  return { logger, lines };
}

describe('CandleFlushJobSchema (R9)', () => {
  it('accepts a valid bar payload', () => {
    const parsed = CandleFlushJobSchema.safeParse({
      bar: BAR,
      reason: 'flush-failed',
      enqueuedAt: '2026-10-31T00:00:00.000Z',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.bar).toEqual(BAR);
  });

  it('rejects an unknown symbol, a non-finite price and a negative tick count', () => {
    expect(CandleFlushJobSchema.safeParse({ bar: { ...BAR, symbol: 'NOPE' } }).success).toBe(false);
    expect(CandleFlushJobSchema.safeParse({ bar: { ...BAR, c: Number.NaN } }).success).toBe(false);
    expect(CandleFlushJobSchema.safeParse({ bar: { ...BAR, tickVolume: -1 } }).success).toBe(false);
  });
});

describe('persistQueuedCandle (R9)', () => {
  it('writes the queued bar idempotently and logs the replay', async () => {
    const { db, rows } = makeFakeDb();
    const { logger, lines } = makeLogger();

    await persistQueuedCandle(BAR, logger, 'shutdown', db);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      symbol: 'XAUUSD',
      t: new Date(BAR.t),
      c: 2390.5,
      tickVolume: 47,
    });
    expect(lines[0]?.msg).toBe('queued candle bar replayed to candles_1m');
    expect(lines[0]?.meta).toMatchObject({ reason: 'shutdown', symbol: 'XAUUSD' });
  });

  it('bubbles the write error so pg-boss retries the job', async () => {
    const db = {
      insert: () => ({
        values: () => ({
          onConflictDoNothing: async () => {
            throw new Error('still down');
          },
        }),
      }),
    } as unknown as DbClient;
    const { logger } = makeLogger();

    await expect(persistQueuedCandle(BAR, logger, 'flush-failed', db)).rejects.toThrow(
      'still down',
    );
  });
});
