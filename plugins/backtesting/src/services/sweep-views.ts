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

// Read-side projections for parameter sweeps (API + agent tool surface).

import { getBacktestSweep, listBacktestSweeps } from '../db/queries';
import type { BacktestSweepRow } from '@kestrel/db';
import { SweepDetailSchema, SweepSummarySchema } from '../schemas';

function rowSummary(row: BacktestSweepRow) {
  return SweepSummarySchema.parse({
    id: row.id,
    name: row.name,
    symbol: row.symbol,
    timeframe: row.timeframe,
    objective: row.objective,
    status: row.status,
    total: row.total,
    completed: row.completed,
    bestScore: row.bestScore,
    bestParams: row.bestParams,
    bestMetrics: row.bestMetrics,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function rowDetail(row: BacktestSweepRow) {
  return SweepDetailSchema.parse({
    ...rowSummary(row),
    strategyId: row.strategyId,
    source: row.source,
    baseParams: row.baseParams,
    parameterSpace: row.parameterSpace,
    count: row.count,
    initialBalance: row.initialBalance,
    riskPct: row.riskPct,
    minTrades: row.minTrades,
    persistRuns: row.persistRuns,
    results: row.results,
  });
}

export async function listSweepViews(userId: string, limit = 20) {
  const rows = await listBacktestSweeps(userId, limit);
  return rows.map(rowSummary);
}

export async function getSweepDetail(userId: string, sweepId: string) {
  const row = await getBacktestSweep(userId, sweepId);
  return row ? rowDetail(row) : null;
}
