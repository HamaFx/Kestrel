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

// Daily snapshot refresh: one HLOC/pivot/ATR/key-level row per supported
// symbol, then prune `candles_1m` to the trailing retention window. Shared by
// the worker `snapshots` job and the `/api/cron/snapshots` fallback route, so
// the manual path prunes the minute table exactly like the scheduled path.

import * as marketData from '@kestrel/data';
import { getDb } from '@kestrel/db';
import { candles1m } from '@kestrel/db/schema';
import { ALL_SYMBOLS } from '@kestrel/shared';
import { lt, sql } from 'drizzle-orm';

import type { CronRunOptions } from '../runtime/cron-runner';
import { computeDailySnapshot, previousUtcMidnight } from './compute';
import { upsertSnapshot } from './persistence';

const SOURCE_TF = '1h' as const;
const SOURCE_COUNT = 240; // ~10 days of 1H bars; covers ATR14 + PDH/PDL.

/** Hold candles_1m to 14 trailing days. Spec §4.3. */
const CANDLES_RETENTION_DAYS = 14;

export interface RunSnapshotRefreshArgs extends CronRunOptions {
  /** Disable the candles_1m tail prune (tests / read-only backfills). */
  pruneCandles1m?: boolean;
}

export interface SnapshotRefreshResult {
  processed: number;
  /** Symbols that failed this run. */
  errors: Array<{ symbol: string; message: string }>;
  pruned: number;
  candles1mTotal: number;
  /** Healthchecks.io ping body, identical for the worker job and web route. */
  note: string;
}

export async function runSnapshotRefresh(
  args: RunSnapshotRefreshArgs = {},
): Promise<SnapshotRefreshResult> {
  const { signal, log } = args;
  const asOf = previousUtcMidnight();
  let processed = 0;
  const errors: Array<{ symbol: string; message: string }> = [];

  for (const symbol of ALL_SYMBOLS) {
    if (signal?.aborted) {
      log?.warn('snapshots aborted mid-loop', {
        processed,
        remaining: ALL_SYMBOLS.length - processed,
      });
      break;
    }
    try {
      const candles = await marketData.getCandlesUnchecked(symbol, SOURCE_TF, {
        count: SOURCE_COUNT,
        ...(signal ? { signal } : {}),
      });
      const data = computeDailySnapshot({ candles, asOf });
      await upsertSnapshot({ symbol, kind: 'daily', asOf, data });
      processed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ symbol, message });
      log?.warn('snapshot failed', { symbol, err: message });
    }
  }

  let pruned = 0;
  if (args.pruneCandles1m !== false) {
    pruned = await pruneCandles1mTail(log);
  }
  const candles1mTotal = await countCandles1mTail();

  return {
    processed,
    errors,
    pruned,
    candles1mTotal,
    note: `symbols=${processed}/${ALL_SYMBOLS.length} errors=${errors.length} pruned=${pruned} candles_1m_total=${candles1mTotal}`,
  };
}

/** Count-before-delete keeps Postgres from shipping every deleted row back. */
async function pruneCandles1mTail(log: CronRunOptions['log']): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - CANDLES_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const [row] = await getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(candles1m)
      .where(lt(candles1m.t, cutoff));
    const pruned = row?.count ?? 0;
    await getDb().delete(candles1m).where(lt(candles1m.t, cutoff));
    log?.info('candles_1m prune complete', { cutoff: cutoff.toISOString(), pruned });
    return pruned;
  } catch (err) {
    log?.warn('candles_1m prune failed', { err: String(err) });
    return 0;
  }
}

async function countCandles1mTail(): Promise<number> {
  try {
    const [row] = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(candles1m);
    return row?.n ?? 0;
  } catch {
    return 0;
  }
}
