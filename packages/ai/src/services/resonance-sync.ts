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

// Intermarket resonance sync: ingest FRED real-yield and breakeven-inflation
// observations, align them with stored XAUUSD daily closes, fit the
// gold-vs-real-yield regression, and upsert the standardized divergence rows.
//
// This is the single implementation shared by the worker cron job and the
// operator-confirmed `run_system_action` mutation. The previous copies drifted:
// the worker skipped non-finite closes and checked for aborts before writing,
// while the chat tool did neither.

import { fred } from '@kestrel/data';
import { schema, type DbClient } from '@kestrel/db';
import { and, eq, gte, lte, sql } from 'drizzle-orm';

import { getDb } from '../runtime/db';

/** Ingest the last 45 calendar days of daily observations. */
const RESONANCE_SYNC_WINDOW_DAYS = 45;

/** Minimum aligned observations required to fit a regression. */
const MIN_ALIGNED_OBSERVATIONS = 5;

export type ResonanceSyncStatus = 'synced' | 'skipped' | 'aborted';

export interface SyncIntermarketResonanceResult {
  status: ResonanceSyncStatus;
  /** Number of resonance rows written. */
  processed: number;
  /** Number of dates where yields, inflation and gold all had a value. */
  aligned: number;
  /** False when the residual spread made standardized divergence undefined. */
  divergencesDefined: boolean;
  note: string;
}

export interface SyncIntermarketResonanceOptions {
  /** FRED API key; defaults to `process.env.FRED_API_KEY`. */
  apiKey?: string;
  /** Abort long-running syncs (worker SIGTERM, request cancellation). */
  signal?: AbortSignal;
  /** Override "now" for tests. */
  now?: Date;
  /** Transaction-capable client; defaults to the RLS-aware runtime client. */
  db?: DbClient;
}

interface AlignedObservation {
  date: string;
  realYield: number;
  inflation: number;
  gold: number;
}

function skipped(
  note: string,
  aligned: number,
  divergencesDefined = false,
): SyncIntermarketResonanceResult {
  return { status: 'skipped', processed: 0, aligned, divergencesDefined, note };
}

export async function syncIntermarketResonance(
  options: SyncIntermarketResonanceOptions = {},
): Promise<SyncIntermarketResonanceResult> {
  const apiKey = options.apiKey ?? process.env['FRED_API_KEY'];
  if (!apiKey) {
    return skipped('FRED_API_KEY missing', 0);
  }

  const now = options.now ?? new Date();
  const endDateStr = now.toISOString().slice(0, 10);
  const startDate = new Date(now);
  startDate.setUTCDate(now.getUTCDate() - RESONANCE_SYNC_WINDOW_DAYS);
  const startDateStr = startDate.toISOString().slice(0, 10);

  const rawInputs = await fred.fetchResonanceInputs({
    apiKey,
    start: startDateStr,
    end: endDateStr,
    ...(options.signal ? { signal: options.signal } : {}),
  });

  const yieldsMap = new Map<string, number>();
  for (const observation of rawInputs.realYields) {
    yieldsMap.set(observation.date, observation.value);
  }
  const inflationMap = new Map<string, number>();
  for (const observation of rawInputs.breakevenInflation) {
    inflationMap.set(observation.date, observation.value);
  }

  const db = options.db ?? getDb();
  const goldSnapshots = await db
    .select()
    .from(schema.snapshots)
    .where(
      and(
        eq(schema.snapshots.symbol, 'XAUUSD'),
        eq(schema.snapshots.kind, 'daily'),
        gte(schema.snapshots.asOf, startDate),
        lte(schema.snapshots.asOf, now),
      ),
    );

  const goldMap = new Map<string, number>();
  for (const snapshot of goldSnapshots) {
    const dateStr = snapshot.asOf.toISOString().slice(0, 10);
    const data = snapshot.data as { close?: number };
    // A non-finite close is an unmeasured price; feeding it to the regression
    // would poison every coefficient. Skip it instead.
    if (data && typeof data.close === 'number' && Number.isFinite(data.close)) {
      goldMap.set(dateStr, data.close);
    }
  }

  const aligned: AlignedObservation[] = [];
  for (const [dateStr, realYield] of yieldsMap.entries()) {
    const inflation = inflationMap.get(dateStr);
    const gold = goldMap.get(dateStr);
    if (inflation !== undefined && gold !== undefined) {
      aligned.push({ date: dateStr, realYield, inflation, gold });
    }
  }

  if (aligned.length < MIN_ALIGNED_OBSERVATIONS) {
    return skipped(
      `insufficient data (aligned=${aligned.length}, yields=${yieldsMap.size}, gold=${goldMap.size})`,
      aligned.length,
    );
  }

  const n = aligned.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (const point of aligned) {
    sumX += point.realYield;
    sumY += point.gold;
    sumXY += point.realYield * point.gold;
    sumXX += point.realYield * point.realYield;
  }

  const denominator = n * sumXX - sumX * sumX;
  if (!Number.isFinite(denominator) || denominator === 0) {
    // R8 (audit 2026-10-31): zero variance in real yields leaves the OLS
    // slope undefined. A 0 slope (and the intercept-only baseline) would be
    // persisted as measured coefficients and turned into fake divergence
    // scores, so skip the run entirely and leave stored rows untouched.
    return skipped(
      `regression not estimable (no variance in real yields, aligned=${n}); nothing written`,
      n,
    );
  }
  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  if (!Number.isFinite(slope) || !Number.isFinite(intercept)) {
    return skipped(
      `regression not estimable (non-finite coefficients, aligned=${n}); nothing written`,
      n,
    );
  }

  const residuals: number[] = [];
  for (const point of aligned) {
    residuals.push(point.gold - (intercept + slope * point.realYield));
  }

  const meanResidual = residuals.reduce((sum, residual) => sum + residual, 0) / n;
  const varianceResidual =
    residuals.reduce((sum, residual) => sum + Math.pow(residual - meanResidual, 2), 0) / n;
  // R8 (audit 2026-10-31): a zero (or non-finite) residual spread makes the
  // standardized divergence 0/0. The observations themselves are real, so they
  // are still stored, but `divergence_score` is NULL — never `residual / 1`,
  // which would persist a fake z-score as a measurement.
  const stdDevResidual = Math.sqrt(varianceResidual);
  const divergencesDefined = Number.isFinite(stdDevResidual) && stdDevResidual > 0;

  if (options.signal?.aborted) {
    return {
      status: 'aborted',
      processed: 0,
      aligned: n,
      divergencesDefined,
      note: 'aborted before persistence',
    };
  }

  const rows = aligned.map((point) => {
    const residual = point.gold - (intercept + slope * point.realYield);
    return {
      date: point.date,
      realYieldPct: point.realYield,
      breakevenInflationPct: point.inflation,
      // DXY is not part of this sync, so the column stays NULL rather than a
      // hard-coded placeholder read as a measured dollar index.
      dxyIndex: null,
      goldClose: point.gold,
      divergenceScore: divergencesDefined ? residual / stdDevResidual : null,
      createdAt: new Date(),
    };
  });

  if (rows.length > 0) {
    await db
      .insert(schema.intermarketResonance)
      .values(rows)
      .onConflictDoUpdate({
        target: schema.intermarketResonance.date,
        set: {
          realYieldPct: sql`excluded.real_yield_pct`,
          breakevenInflationPct: sql`excluded.breakeven_inflation_pct`,
          dxyIndex: sql`excluded.dxy_index`,
          goldClose: sql`excluded.gold_close`,
          divergenceScore: sql`excluded.divergence_score`,
          createdAt: sql`now()`,
        },
      });
  }

  return {
    status: 'synced',
    processed: rows.length,
    aligned: n,
    divergencesDefined,
    note:
      `synchronized=${rows.length} observations` +
      (divergencesDefined ? '' : ' (divergence scores null: residual spread not positive)'),
  };
}
