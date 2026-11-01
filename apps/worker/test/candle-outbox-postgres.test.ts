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

// R9 (audit 2026-10-31) — the durable candle hand-off, end to end.
//
// Opt in with RUN_POSTGRES_RLS_TESTS=1 and TEST_POSTGRES_ADMIN_URL (the same
// gate as the repo's other Postgres tests; `TEST_POSTGRES_ADMIN_URL` may be
// replaced by DATABASE_URL). The test uses its own pg-boss schema so it
// cannot disturb a running queue, and cleans up the queue, the schema and
// the bar it wrote.
//
// What this pins: a bar whose direct write failed is enqueued on the real
// pg-boss queue, survives a restart of the producer, and is written to
// `candles_1m` by the consumer when the worker comes back.

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Candle1mBar } from '../src/aggregator/candle-1m';
import { createLogger } from '../src/log';

const enabled = process.env.RUN_POSTGRES_RLS_TESTS === '1';
const url = process.env.TEST_POSTGRES_ADMIN_URL ?? process.env.DATABASE_URL ?? '';
const PGBOSS_SCHEMA = 'pgboss_candle_r9_test';

// A minute no live feed can produce, so the test owns the row outright.
const BAR: Candle1mBar = {
  symbol: 'XAUUSD',
  t: Date.UTC(2001, 0, 1, 0, 0, 0),
  o: 271.5,
  h: 272.25,
  l: 270.75,
  c: 271.9,
  v: null,
  tickVolume: 0,
  source: 'biquote-signalr',
};

async function waitUntil(cond: () => Promise<boolean>, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await cond())) {
    if (Date.now() > deadline) throw new Error('waitUntil timed out');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

describe.skipIf(!enabled || !url)(
  'candle outbox against Postgres (R9)',
  { timeout: 90_000 },
  () => {
    let sql: ReturnType<typeof postgres> | null = null;
    let stopQueue: (() => Promise<void>) | null = null;

    beforeAll(async () => {
      process.env.DATABASE_URL = url;
      process.env.ADMIN_DATABASE_URL = url;
      process.env.PGBOSS_SCHEMA = PGBOSS_SCHEMA;
      // Plain-TCP Postgres (local scratch instance): the repo's pools disable
      // TLS verification in non-production anyway, but the scratch server does
      // not speak TLS at all.
      process.env.DB_DISABLE_SSL = 'true';
      sql = postgres(url, { max: 2 });
      await sql`delete from candles_1m where symbol = ${BAR.symbol} and t = ${new Date(BAR.t)}`;
    });

    afterAll(async () => {
      if (stopQueue) await stopQueue();
      const { closeDb } = await import('@kestrel/db');
      await closeDb();
      if (sql) {
        await sql`delete from candles_1m where symbol = ${BAR.symbol} and t = ${new Date(BAR.t)}`;
        await sql`drop schema if exists ${sql(PGBOSS_SCHEMA)} cascade`;
        await sql.end();
        sql = null;
      }
    });

    it('queues a failed bar write and the consumer writes it after a restart', async () => {
      if (!sql) throw new Error('postgres client not initialised');
      const { CANDLE_FLUSH_QUEUE, enqueueClosedCandle, startCandleFlushQueueWorker } =
        await import('../src/persistence/candle-outbox.js');
      const { getQueue, stopQueue: stop } = await import('@kestrel/db/queue');
      stopQueue = stop;
      const log = createLogger({ service: 'worker:test:candle-outbox', forceJson: true });

      const rowsBefore = await sql`
      select 1 from candles_1m where symbol = ${BAR.symbol} and t = ${new Date(BAR.t)}
    `;
      expect(rowsBefore).toHaveLength(0);

      // The direct write failed far enough that the rig handed the bar over.
      await expect(enqueueClosedCandle(BAR, { reason: 'test' })).resolves.toBe(true);

      const boss = await getQueue();
      const jobs = await boss.findJobs<{ bar?: Candle1mBar; reason?: string }>(CANDLE_FLUSH_QUEUE, {
        queued: true,
        limit: 10,
      });
      const queued = jobs.find((job) => job.data?.bar?.t === BAR.t);
      expect(queued).toBeDefined();
      expect(queued?.data.bar).toMatchObject({ symbol: BAR.symbol, c: BAR.c });

      // A fresh consumer (the "restarted worker") drains the queue.
      await startCandleFlushQueueWorker(log);
      await waitUntil(async () => {
        const rows = await sql!`
        select 1 from candles_1m where symbol = ${BAR.symbol} and t = ${new Date(BAR.t)}
      `;
        return rows.length === 1;
      });

      const rows = await sql`
      select o, h, l, c, tick_volume, source
      from candles_1m
      where symbol = ${BAR.symbol} and t = ${new Date(BAR.t)}
    `;
      expect(rows[0]).toMatchObject({
        o: BAR.o,
        h: BAR.h,
        l: BAR.l,
        c: BAR.c,
        tick_volume: BAR.tickVolume,
        source: BAR.source,
      });
    });
  },
);
