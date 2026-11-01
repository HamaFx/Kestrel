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

import { getDb } from '@kestrel/ai';
import { fred } from '@kestrel/data';
import { schema } from '@kestrel/db';
import { and, eq, gte, lte, sql } from 'drizzle-orm';

import type { JobContext, JobResult } from './types.js';

const { fetchResonanceInputs } = fred;

/** Ingest the last 30 days of daily observations. */
const RETRIEVAL_WINDOW_DAYS = 45;

export async function runResonanceSync(ctx: JobContext): Promise<JobResult> {
  const log = ctx.log;
  const apiKey = process.env['FRED_API_KEY'];
  if (!apiKey) {
    log.warn('FRED_API_KEY missing — skipping intermarket resonance sync');
    return { processed: 0, note: 'FRED_API_KEY missing' };
  }

  // 1. Calculate the start and end dates
  const today = new Date();
  const endDateStr = today.toISOString().slice(0, 10);
  const startDate = new Date();
  startDate.setUTCDate(today.getUTCDate() - RETRIEVAL_WINDOW_DAYS);
  const startDateStr = startDate.toISOString().slice(0, 10);

  log.info('fetching intermarket inputs from FRED', { start: startDateStr, end: endDateStr });

  // 2. Fetch FRED yield and inflation data
  let rawInputs;
  try {
    rawInputs = await fetchResonanceInputs({
      apiKey,
      start: startDateStr,
      end: endDateStr,
      ...(ctx.signal ? { signal: ctx.signal } : {}),
    });
  } catch (err) {
    log.error('failed to fetch FRED resonance inputs', { err: String(err) });
    throw err;
  }

  const yieldsMap = new Map<string, number>();
  for (const o of rawInputs.realYields) {
    yieldsMap.set(o.date, o.value);
  }

  const inflationMap = new Map<string, number>();
  for (const o of rawInputs.breakevenInflation) {
    inflationMap.set(o.date, o.value);
  }

  // 3. Fetch Gold daily closes from Snapshots
  const db = getDb();
  const goldSnapshots = await db
    .select()
    .from(schema.snapshots)
    .where(
      and(
        eq(schema.snapshots.symbol, 'XAUUSD'),
        eq(schema.snapshots.kind, 'daily'),
        gte(schema.snapshots.asOf, startDate),
        lte(schema.snapshots.asOf, today),
      ),
    );

  const goldMap = new Map<string, number>();
  for (const s of goldSnapshots) {
    const dateStr = s.asOf.toISOString().slice(0, 10);
    const data = s.data as { close?: number };
    // A non-finite close is an unmeasured price; feeding it to the regression
    // would poison every coefficient. Skip it instead.
    if (data && typeof data.close === 'number' && Number.isFinite(data.close)) {
      goldMap.set(dateStr, data.close);
    }
  }

  // 4. Align observations by date
  // Real yields are only reported on US business days (exclude weekends).
  const aligned: Array<{
    date: string;
    realYield: number;
    inflation: number;
    gold: number;
  }> = [];

  for (const [dateStr, realYield] of yieldsMap.entries()) {
    const inflation = inflationMap.get(dateStr);
    const gold = goldMap.get(dateStr);
    if (inflation !== undefined && gold !== undefined) {
      aligned.push({
        date: dateStr,
        realYield,
        inflation,
        gold,
      });
    }
  }

  if (aligned.length < 5) {
    log.warn('insufficient aligned data points to run macro regression', {
      aligned: aligned.length,
      yields: yieldsMap.size,
      gold: goldMap.size,
    });
    return {
      processed: 0,
      note: `insufficient data (aligned=${aligned.length})`,
    };
  }

  // 5. Compute Linear Regression of Gold Price against US Real Yields
  // Model: GoldExpected = a + b * RealYield
  const n = aligned.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (const pt of aligned) {
    sumX += pt.realYield;
    sumY += pt.gold;
    sumXY += pt.realYield * pt.gold;
    sumXX += pt.realYield * pt.realYield;
  }

  const denominator = n * sumXX - sumX * sumX;
  if (!Number.isFinite(denominator) || denominator === 0) {
    // R8 (audit 2026-10-31): zero variance in real yields leaves the OLS
    // slope undefined. A 0 slope (and the intercept-only baseline) would be
    // persisted as measured coefficients and turned into fake divergence
    // scores, so skip the run entirely and leave stored rows untouched.
    // Mirrors `run_system_action`, which throws before writing.
    log.warn('real yields show no variance — regression cannot be estimated; nothing written', {
      aligned: n,
    });
    return {
      processed: 0,
      note: `regression not estimable (no variance in real yields, aligned=${n}); nothing written`,
    };
  }
  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  if (!Number.isFinite(slope) || !Number.isFinite(intercept)) {
    log.warn('regression produced non-finite coefficients; nothing written', { aligned: n });
    return {
      processed: 0,
      note: `regression not estimable (non-finite coefficients, aligned=${n}); nothing written`,
    };
  }

  // Calculate residuals and standard deviation of residuals
  const residuals: number[] = [];
  for (const pt of aligned) {
    const expected = intercept + slope * pt.realYield;
    residuals.push(pt.gold - expected);
  }

  const meanResidual = residuals.reduce((sum, r) => sum + r, 0) / n;
  const varianceResidual = residuals.reduce((sum, r) => sum + Math.pow(r - meanResidual, 2), 0) / n;
  // R8 (audit 2026-10-31): a zero (or non-finite) residual spread makes the
  // standardized divergence 0/0. The observations themselves are real, so they
  // are still stored, but `divergence_score` is NULL — never `residual / 1`,
  // which would persist a fake z-score as a measurement.
  const stdDevResidual = Math.sqrt(varianceResidual);
  const divergencesDefined = Number.isFinite(stdDevResidual) && stdDevResidual > 0;
  if (!divergencesDefined) {
    log.warn(
      'residual standard deviation is zero or non-finite — divergence scores stored as NULL',
      { aligned: n, stdDevResidual },
    );
  }

  // 6. Generate rows to persist
  const dbRows = aligned.map((pt, i) => {
    const residual = residuals[i]!;
    // Standardized z-score representing the institutional safe-haven premium divergence.
    const divergenceScore = divergencesDefined ? residual / stdDevResidual : null;

    return {
      date: pt.date,
      realYieldPct: pt.realYield,
      breakevenInflationPct: pt.inflation,
      // DXY is handled primarily on the AI tool / live route, so we persist
      // a placeholder. Set to null to indicate the column is unused for now.
      dxyIndex: null,
      goldClose: pt.gold,
      divergenceScore,
      createdAt: new Date(),
    };
  });

  // 7. Write to database — batch insert for better performance.
  log.info('persisting resonance rows', { rows: dbRows.length });
  let processed = 0;

  if (ctx.signal?.aborted) {
    log.warn('resonance-sync aborted before persistence');
    return { processed: 0, note: 'aborted before persistence' };
  }

  if (dbRows.length > 0) {
    await db
      .insert(schema.intermarketResonance)
      .values(dbRows)
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
    processed = dbRows.length;
  }

  log.info('resonance-sync complete', { processed });
  return {
    processed,
    note:
      `synchronized=${processed} observations` +
      (divergencesDefined ? '' : ' (divergence scores null: residual spread not positive)'),
  };
}
