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

// Backtesting persistence helpers — runs and uninstall wipe.
//
// Every query is scoped by `user_id` and relies on the tenant RLS policy set
// by the caller's `withTenantDb` scope (chat tools, plugin API routes, and
// install hooks all run inside one).

import { getDb, requireTenantIdForUser } from '@kestrel/db';
import { and, count, desc, eq, inArray } from 'drizzle-orm';

import type {
  BacktestMetrics,
  BacktestTrade,
  EquityPoint,
  RejectedSignal,
} from '../../engine/types';
import { backtestRuns, backtestStrategies, type BacktestRunRow } from '../tables';

export interface PersistBacktestRunInput {
  userId: string;
  name: string;
  symbol: string;
  timeframe: string;
  source: string;
  params: Record<string, unknown>;
  status: 'completed' | 'failed';
  engineVersion: string;
  bars: number;
  fromTs: Date | null;
  toTs: Date | null;
  initialBalance: number;
  finalEquity: number;
  metrics: BacktestMetrics;
  equityCurve: EquityPoint[];
  trades: BacktestTrade[];
  rejectedSignals: RejectedSignal[];
  warnings: string[];
  logs: string[];
  durationMs: number;
  error: string | null;
}

export async function persistBacktestRun(input: PersistBacktestRunInput): Promise<BacktestRunRow> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(input.userId, db);
  const rows = await db
    .insert(backtestRuns)
    .values({
      tenantId,
      userId: input.userId,
      name: input.name,
      symbol: input.symbol,
      timeframe: input.timeframe,
      source: input.source,
      params: input.params,
      status: input.status,
      engineVersion: input.engineVersion,
      bars: input.bars,
      fromTs: input.fromTs,
      toTs: input.toTs,
      initialBalance: input.initialBalance,
      finalEquity: input.finalEquity,
      metrics: input.metrics,
      equityCurve: input.equityCurve,
      trades: input.trades,
      rejectedSignals: input.rejectedSignals,
      warnings: input.warnings,
      logs: input.logs,
      durationMs: input.durationMs,
      error: input.error,
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error('[backtesting] run insert returned no row');
  return row;
}

export async function listBacktestRuns(
  userId: string,
  opts: { limit?: number } = {},
): Promise<BacktestRunRow[]> {
  const db = getDb();
  return db
    .select()
    .from(backtestRuns)
    .where(eq(backtestRuns.userId, userId))
    .orderBy(desc(backtestRuns.createdAt))
    .limit(Math.max(1, Math.min(opts.limit ?? 20, 100)));
}

export async function getBacktestRun(
  userId: string,
  runId: string,
): Promise<BacktestRunRow | undefined> {
  const db = getDb();
  const rows = await db
    .select()
    .from(backtestRuns)
    .where(and(eq(backtestRuns.userId, userId), eq(backtestRuns.id, runId)))
    .limit(1);
  return rows[0];
}

export async function countBacktestRuns(userId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ value: count() })
    .from(backtestRuns)
    .where(eq(backtestRuns.userId, userId));
  return Number(rows[0]?.value ?? 0);
}

/** Keep the newest `keep` runs for a user; older rows are deleted. */
export async function pruneBacktestRuns(userId: string, keep = 50): Promise<number> {
  const db = getDb();
  const stale = await db
    .select({ id: backtestRuns.id })
    .from(backtestRuns)
    .where(eq(backtestRuns.userId, userId))
    .orderBy(desc(backtestRuns.createdAt))
    .offset(Math.max(1, keep))
    .limit(500);
  if (stale.length === 0) return 0;
  await db.delete(backtestRuns).where(
    inArray(
      backtestRuns.id,
      stale.map((row) => row.id),
    ),
  );
  return stale.length;
}

export async function deleteBacktestRun(userId: string, runId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .delete(backtestRuns)
    .where(and(eq(backtestRuns.userId, userId), eq(backtestRuns.id, runId)))
    .returning({ id: backtestRuns.id });
  return rows.length > 0;
}

/** Hard-delete every run and saved strategy for a user (uninstall + wipe). */
export async function deleteAllBacktestData(userId: string): Promise<void> {
  const db = getDb();
  await db.delete(backtestRuns).where(eq(backtestRuns.userId, userId));
  await db.delete(backtestStrategies).where(eq(backtestStrategies.userId, userId));
}
