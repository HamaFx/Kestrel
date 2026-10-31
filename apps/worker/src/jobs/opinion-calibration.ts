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

// Phase 3 (Jev roadmap) — opinion calibration job.
//
// Grades historical `agent_opinions` against realized `candles_1m` price
// outcomes so Committee Fusion can weigh each desk by empirically measured
// accuracy (`packages/ai/src/committee/calibration-weights.ts`). An opinion is
// eligible once it is older than 4 hours (the 4-hour evaluation horizon has
// closed) and younger than 7 days (the `candles_1m` retention window).
//
// Each graded row gets `{ calibrationEvaluated: true, correct, brierContribution }`
// merged into `raw_data`; the scan filters on `raw_data->>'calibrationEvaluated'`
// so a run only ever grades each opinion once, even across retries. Rows whose
// symbol or 4-hour price window cannot be resolved are marked with a reason
// instead of being re-scanned forever.
//
// Tenant scoping: every update is bound to the row's `(id, userId, tenantId)`,
// and the symbol/pinned-symbol lookups are tenant-scoped reads.

import { computeBrierScore, evaluateOpinionOutcome } from '@kestrel/ai/mastra-v2';
import { getDb, schema, type DbClient } from '@kestrel/db';
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, lte, sql } from 'drizzle-orm';

import type { JobContext, JobResult } from './types.js';

/** Minimum age: the 4-hour evaluation horizon must have closed. */
const MIN_AGE_MS = 4 * 60 * 60 * 1000;

/** Maximum age: `candles_1m` is pruned to the trailing 14 days. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Evaluation horizon. */
const HORIZON_MS = 4 * 60 * 60 * 1000;

/** Max opinions graded per invocation (keeps the job inside its budget). */
const BATCH_LIMIT = 200;

/** Slack allowed when locating a candle for a timestamp. */
const CANDLE_LOOKBACK_MS = 6 * 60 * 60 * 1000;

type GradableBias = 'bullish' | 'bearish' | 'neutral';

interface OpinionRow {
  id: string;
  userId: string;
  tenantId: string;
  threadId: string;
  messageId: string;
  agentName: string;
  bias: string;
  confidence: number;
  rawData: unknown;
  createdAt: Date;
}

interface CandlePoint {
  t: number;
  c: number;
}

/** Last candle at or before `atMs`, or null when the window has no data. */
function closeAtOrBefore(candles: readonly CandlePoint[], atMs: number): number | null {
  let found: number | null = null;
  for (const candle of candles) {
    if (candle.t > atMs) break;
    found = candle.c;
  }
  return found;
}

function gradableBias(value: string): GradableBias | null {
  return value === 'bullish' || value === 'bearish' || value === 'neutral' ? value : null;
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

/** Row-level `raw_data.symbol` hint, when a producer stored one. */
function rawSymbol(rawData: unknown): string | null {
  if (rawData && typeof rawData === 'object') {
    const value = (rawData as { symbol?: unknown }).symbol;
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

/** Merge the calibration outcome into `raw_data` as one atomic JSONB update. */
async function markCalibrated(
  db: DbClient,
  row: OpinionRow,
  patch: Record<string, unknown>,
): Promise<void> {
  await db
    .update(schema.agentOpinions)
    .set({
      rawData: sql`${schema.agentOpinions.rawData} || ${JSON.stringify(patch)}::jsonb`,
    })
    .where(
      and(
        eq(schema.agentOpinions.id, row.id),
        eq(schema.agentOpinions.userId, row.userId),
        eq(schema.agentOpinions.tenantId, row.tenantId),
      ),
    );
}

/** Map `chat_messages.id -> symbol` from the durable Full-analysis runs. */
async function symbolsByMessageId(
  db: DbClient,
  threadIds: readonly string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (threadIds.length === 0) return map;
  const rows = await db
    .select({
      messageId: sql<string | null>`${schema.fullAnalysisQueue.result} ->> 'messageId'`,
      symbol: sql<string | null>`${schema.fullAnalysisQueue.result} ->> 'symbol'`,
    })
    .from(schema.fullAnalysisQueue)
    .where(
      and(
        inArray(schema.fullAnalysisQueue.threadId, [...threadIds]),
        isNotNull(schema.fullAnalysisQueue.result),
      ),
    )
    .orderBy(desc(schema.fullAnalysisQueue.createdAt))
    .limit(2_000);
  for (const row of rows) {
    if (row.messageId && row.symbol && !map.has(row.messageId)) {
      map.set(row.messageId, row.symbol);
    }
  }
  return map;
}

/** Map `chat_threads.id -> pinned_symbol` for web-path (single-mode) opinions. */
async function symbolsByThreadId(
  db: DbClient,
  threadIds: readonly string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (threadIds.length === 0) return map;
  const rows = await db
    .select({ id: schema.chatThreads.id, pinnedSymbol: schema.chatThreads.pinnedSymbol })
    .from(schema.chatThreads)
    .where(inArray(schema.chatThreads.id, [...threadIds]));
  for (const row of rows) {
    if (row.pinnedSymbol) map.set(row.id, row.pinnedSymbol);
  }
  return map;
}

/** All `candles_1m` closes for one symbol inside the grading window. */
async function candlesForSymbol(
  db: DbClient,
  symbol: string,
  from: Date,
  to: Date,
): Promise<CandlePoint[]> {
  const rows = await db
    .select({ t: schema.candles1m.t, c: schema.candles1m.c })
    .from(schema.candles1m)
    .where(
      and(
        eq(schema.candles1m.symbol, symbol),
        gte(schema.candles1m.t, from),
        lte(schema.candles1m.t, to),
      ),
    )
    .orderBy(asc(schema.candles1m.t));
  return rows.map((row) => ({
    t: row.t instanceof Date ? row.t.getTime() : Date.parse(String(row.t)),
    c: row.c,
  }));
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
async function patchRegimeMemoryOutcome(
  db: DbClient,
  row: OpinionRow,
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

/**
 * Grade every eligible opinion in the 4h–7d window. Idempotent: only rows with
 * no `raw_data.calibrationEvaluated` flag are scanned, and each row is written
 * exactly once per invocation.
 */
export async function runOpinionCalibration(ctx: JobContext): Promise<JobResult> {
  const log = ctx.log;
  const db = getDb();
  const now = Date.now();

  const rows = (await db
    .select({
      id: schema.agentOpinions.id,
      userId: schema.agentOpinions.userId,
      tenantId: schema.agentOpinions.tenantId,
      threadId: schema.agentOpinions.threadId,
      messageId: schema.agentOpinions.messageId,
      agentName: schema.agentOpinions.agentName,
      bias: schema.agentOpinions.bias,
      confidence: schema.agentOpinions.confidence,
      rawData: schema.agentOpinions.rawData,
      createdAt: schema.agentOpinions.createdAt,
    })
    .from(schema.agentOpinions)
    .where(
      and(
        lt(schema.agentOpinions.createdAt, new Date(now - MIN_AGE_MS)),
        gte(schema.agentOpinions.createdAt, new Date(now - MAX_AGE_MS)),
        sql`(${schema.agentOpinions.rawData} ->> 'calibrationEvaluated') IS NULL`,
      ),
    )
    .orderBy(asc(schema.agentOpinions.createdAt))
    .limit(BATCH_LIMIT)) as OpinionRow[];

  if (rows.length === 0) {
    return { processed: 0, note: 'no ungraded opinions in the 4h–7d window' };
  }

  const threadIds = [...new Set(rows.map((row) => row.threadId))];
  const [messageSymbols, threadSymbols] = await Promise.all([
    symbolsByMessageId(db, threadIds),
    symbolsByThreadId(db, threadIds),
  ]);

  let graded = 0;
  let skipped = 0;
  let failed = 0;
  // One regime-memory backfill per run: every desk in a run shares a
  // messageId, so the first graded opinion patches the row.
  const patchedRegimeMessages = new Set<string>();

  // One candle read per symbol over the whole batch window.
  const from = new Date(rows[0]!.createdAt.getTime() - CANDLE_LOOKBACK_MS);
  const to = new Date(rows[rows.length - 1]!.createdAt.getTime() + HORIZON_MS + 60_000);
  const symbolCache = new Map<string, CandlePoint[]>();

  for (const row of rows) {
    if (ctx.signal?.aborted) {
      log.warn('opinion calibration aborted mid-batch', { graded, remaining: rows.length });
      break;
    }
    try {
      const symbol =
        rawSymbol(row.rawData) ??
        messageSymbols.get(row.messageId) ??
        threadSymbols.get(row.threadId);
      if (!symbol) {
        await markCalibrated(db, row, {
          calibrationEvaluated: true,
          correct: null,
          reason: 'symbol_unresolved',
        });
        skipped += 1;
        continue;
      }

      let candles = symbolCache.get(symbol);
      if (candles === undefined) {
        candles = await candlesForSymbol(db, symbol, from, to);
        symbolCache.set(symbol, candles);
      }

      const bias = gradableBias(row.bias);
      const entry = closeAtOrBefore(candles, row.createdAt.getTime());
      const exit = closeAtOrBefore(candles, row.createdAt.getTime() + HORIZON_MS);
      if (!bias || entry === null || exit === null) {
        await markCalibrated(db, row, {
          calibrationEvaluated: true,
          correct: null,
          reason: !bias ? 'bias_not_gradable' : 'price_unavailable',
        });
        skipped += 1;
        continue;
      }

      const observation = evaluateOpinionOutcome({ bias, confidence: row.confidence }, entry, exit);
      await markCalibrated(db, row, {
        calibrationEvaluated: true,
        correct: observation.correct,
        brierContribution: computeBrierScore([observation]),
        evaluatedAt: new Date().toISOString(),
      });
      graded += 1;

      // Phase 3 (Jev roadmap) — feed the realized 4-hour outcome back into
      // the run's `market_regime` memory so later recalls can compare similar
      // regimes with known resolutions. Best-effort: a memory failure is
      // logged and never fails the grading pass.
      const outcome = computeRegimeOutcomeFromCandles(
        candles,
        row.createdAt.getTime(),
        row.createdAt.getTime() + HORIZON_MS,
      );
      if (outcome) {
        const regimeKey = `${row.userId}:${row.messageId}`;
        if (!patchedRegimeMessages.has(regimeKey)) {
          patchedRegimeMessages.add(regimeKey);
          try {
            await patchRegimeMemoryOutcome(db, row, symbol, outcome);
          } catch (err) {
            log.warn('market-regime outcome backfill failed (non-fatal)', {
              opinionId: row.id,
              symbol,
              err: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
    } catch (err) {
      failed += 1;
      log.error('opinion calibration failed for one row', {
        opinionId: row.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    processed: graded,
    note: `graded=${graded} skipped=${skipped} failed=${failed} scanned=${rows.length}`,
  };
}
