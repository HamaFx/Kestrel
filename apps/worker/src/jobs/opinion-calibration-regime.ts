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

// Phase 3 (Jev roadmap) — realized 4-hour outcome resolution and the
// `market_regime` memory backfill (split from `opinion-calibration.ts` for
// the file-size gate).

import { schema, type DbClient } from '@kestrel/db';
import { and, eq, gte, lte } from 'drizzle-orm';

export interface CandlePoint {
  t: number;
  c: number;
}

/** Last candle at or before `atMs`, or null when the window has no data. */
export function closeAtOrBefore(candles: readonly CandlePoint[], atMs: number): number | null {
  let found: number | null = null;
  for (const candle of candles) {
    if (candle.t > atMs) break;
    found = candle.c;
  }
  return found;
}

/** Resolution band: ±0.3% of the entry close is still a range. */
const RANGE_BAND = 0.003;

/**
 * Window (ms) around an opinion's creation time used to locate the
 * `market_regime` memory row for the same run. `rememberMarketRegime` stores
 * `occurred_at` from the packet's `generatedAt`, so the row can predate the
 * opinion by the committee run duration (minutes on Full mode).
 */
const REGIME_OUTCOME_WINDOW_MS = 10 * 60 * 1000;

/** Realized 4-hour outcome resolved from the already-loaded candle slice. */
export interface RegimeOutcome4h {
  resolution4h: 'bullish' | 'bearish' | 'range';
  /** Max favourable excursion, % from the entry close. */
  mfePct: number;
  /** Max adverse excursion, % from the entry close. */
  maePct: number;
}

/**
 * Phase 3 (Jev roadmap) — realized 4-hour outcome from the already-loaded
 * `candles_1m` slice: max favourable / adverse excursion around the entry
 * close plus a ±0.3% resolution band. Returns null when the entry or exit
 * close cannot be resolved from the candle window.
 */
export function computeRegimeOutcomeFromCandles(
  candles: readonly CandlePoint[],
  entryMs: number,
  exitMs: number,
): RegimeOutcome4h | null {
  const entry = closeAtOrBefore(candles, entryMs);
  const exit = closeAtOrBefore(candles, exitMs);
  if (entry === null || exit === null || entry <= 0) return null;

  // The window includes the entry and exit candles themselves so a
  // single-point move registers as both extremes.
  const windowCandles = candles.filter((candle) => candle.t >= entryMs && candle.t <= exitMs);
  const maxClose = Math.max(entry, exit, ...windowCandles.map((candle) => candle.c));
  const minClose = Math.min(entry, exit, ...windowCandles.map((candle) => candle.c));
  const mfePct = Number((((maxClose - entry) / entry) * 100).toFixed(2));
  const maePct = Number((((minClose - entry) / entry) * 100).toFixed(2));
  const resolution4h: RegimeOutcome4h['resolution4h'] =
    Math.abs(exit - entry) <= entry * RANGE_BAND
      ? 'range'
      : exit > entry
        ? 'bullish'
        : 'bearish';
  return { resolution4h, mfePct, maePct };
}

/** Minimal opinion-row projection needed to locate the run's regime memory. */
export interface RegimeMemoryOwner {
  userId: string;
  tenantId: string;
  createdAt: Date;
}

/**
 * Phase 3 (Jev roadmap) — backfill the realized 4-hour outcome into the
 * `market_regime` memory row(s) written by the same run. Matched by
 * `(userId, tenantId, kind, symbol)` inside a bounded window around the
 * opinion's creation time; the outcome line is appended to `text` once (a
 * row that already carries `OUTCOME_4H` is left as-is) and merged into
 * `meta.outcome`. Best-effort at the call site: a memory failure never fails
 * the grading pass.
 */
export async function patchRegimeMemoryOutcome(
  db: DbClient,
  row: RegimeMemoryOwner,
  symbol: string,
  outcome: RegimeOutcome4h,
): Promise<void> {
  const occurredFrom = new Date(row.createdAt.getTime() - REGIME_OUTCOME_WINDOW_MS);
  const occurredTo = new Date(row.createdAt.getTime() + REGIME_OUTCOME_WINDOW_MS);
  const memories = await db
    .select({
      id: schema.memoryEmbeddings.id,
      text: schema.memoryEmbeddings.text,
      meta: schema.memoryEmbeddings.meta,
    })
    .from(schema.memoryEmbeddings)
    .where(
      and(
        eq(schema.memoryEmbeddings.userId, row.userId),
        eq(schema.memoryEmbeddings.tenantId, row.tenantId),
        eq(schema.memoryEmbeddings.kind, 'market_regime'),
        eq(schema.memoryEmbeddings.symbol, symbol),
        gte(schema.memoryEmbeddings.occurredAt, occurredFrom),
        lte(schema.memoryEmbeddings.occurredAt, occurredTo),
      ),
    );

  const outcomeLine = `\nOUTCOME_4H=${outcome.resolution4h}(MFE=${outcome.mfePct >= 0 ? '+' : ''}${outcome.mfePct}%,MAE=${outcome.maePct}%)`;
  for (const memory of memories) {
    const text = typeof memory.text === 'string' ? memory.text : '';
    const meta =
      memory.meta && typeof memory.meta === 'object'
        ? (memory.meta as Record<string, unknown>)
        : {};
    await db
      .update(schema.memoryEmbeddings)
      .set({
        text: text.includes('OUTCOME_4H') ? text : `${text}${outcomeLine}`,
        meta: { ...meta, outcome },
      })
      .where(eq(schema.memoryEmbeddings.id, memory.id));
  }
}
