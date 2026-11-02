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

/* eslint-disable @typescript-eslint/no-unused-vars */
import { requireTenantIdForUser, schema } from '@kestrel/db';
import {
  GetSystemDiagnosticsInputSchema,
  GetSystemDiagnosticsOutputSchema,
  type GetSystemDiagnosticsOutput,
} from '@kestrel/shared';
import { tool, type Tool } from 'ai';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { z } from 'zod';

import { getDb } from '../runtime/db';
import { getToolContext, maybeGetToolContext } from '../runtime/tool-context';

const InputSchema = GetSystemDiagnosticsInputSchema;

declare module '@kestrel/shared' {
  interface ToolIOMap {
    get_system_diagnostics: { input: z.infer<typeof InputSchema> };
  }
}

/** A `count(*)` probe row, or null when the row is missing or non-numeric. */
function readCount(rows: ReadonlyArray<{ count: number | string }> | undefined): number | null {
  const raw = rows?.[0]?.count;
  if (raw === undefined || raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export const getSystemDiagnosticsTool: Tool<
  z.infer<typeof InputSchema>,
  GetSystemDiagnosticsOutput
> = tool({
  description:
    'Query the real-time operational health, connection latency, database record volumes, active synchronized files status, remaining daily budget, and verified environment variables in the Copilot system.',
  inputSchema: InputSchema,
  execute: async ({ verbose, forceProbe }): Promise<GetSystemDiagnosticsOutput> => {
    const db = maybeGetToolContext()?.db ?? getDb();
    const ctx = getToolContext();
    const tenantId = await requireTenantIdForUser(ctx.userId, db);

    const dbStart = Date.now();
    let dbStatus: 'connected' | 'error' = 'connected';
    // R8 (audit 2026-10-31): these are null until the probe actually reads
    // them. A 0 would read as a measured "empty table" instead of "unknown".
    let latencyMs: number | null;

    let journalEntriesCount: number | null = null;
    let snapshotsCount: number | null = null;
    let briefingsCount: number | null = null;
    let resonanceCount: number | null = null;
    let memoryEmbeddingsCount: number | null = null;
    let activeAlertsCount: number | null = null;

    try {
      // Fetch table counts plus the caller's active alerts.
      const counts = await Promise.all([
        db
          .select({ count: sql<number>`count(*)` })
          .from(schema.journalEntries)
          .where(
            and(
              eq(schema.journalEntries.userId, ctx.userId),
              eq(schema.journalEntries.tenantId, tenantId),
            ),
          ),
        db.select({ count: sql<number>`count(*)` }).from(schema.snapshots),
        db
          .select({ count: sql<number>`count(*)` })
          .from(schema.briefingsEmitted)
          .where(
            and(
              eq(schema.briefingsEmitted.userId, ctx.userId),
              eq(schema.briefingsEmitted.tenantId, tenantId),
            ),
          ),
        db.select({ count: sql<number>`count(*)` }).from(schema.intermarketResonance),
        db
          .select({ count: sql<number>`count(*)` })
          .from(schema.memoryEmbeddings)
          .where(
            and(
              eq(schema.memoryEmbeddings.userId, ctx.userId),
              eq(schema.memoryEmbeddings.tenantId, tenantId),
            ),
          ),
        db
          .select({ count: sql<number>`count(*)` })
          .from(schema.alerts)
          .where(
            and(
              eq(schema.alerts.userId, ctx.userId),
              eq(schema.alerts.tenantId, tenantId),
              eq(schema.alerts.active, true),
            ),
          ),
      ]);

      latencyMs = Date.now() - dbStart;
      journalEntriesCount = readCount(counts[0]);
      snapshotsCount = readCount(counts[1]);
      briefingsCount = readCount(counts[2]);
      resonanceCount = readCount(counts[3]);
      memoryEmbeddingsCount = readCount(counts[4]);
      // Was a hard-coded 0 placeholder; now a real count of the alerts table.
      activeAlertsCount = readCount(counts[5]);
    } catch {
      dbStatus = 'error';
      latencyMs = null;
    }

    // Check last sync runs
    let resonanceSyncLastRun: string | null = null;
    let cotSyncLastRun: string | null = null;
    try {
      const resonanceRecent = await db
        .select({ date: schema.intermarketResonance.date })
        .from(schema.intermarketResonance)
        .orderBy(desc(schema.intermarketResonance.date))
        .limit(1);
      resonanceSyncLastRun = resonanceRecent[0]?.date ?? null;

      // Found in the same pass as R8: this probe used to read the newest
      // `briefings_emitted` row, which is not a COT sync at all (that table
      // only holds 'pre' | 'post' | 'weekly_review'). Read the actual
      // `cot_reports` table so "Pending execution" means none was ingested.
      const cotRecent = await db
        .select({ reportDate: schema.cotReports.reportDate })
        .from(schema.cotReports)
        .orderBy(desc(schema.cotReports.reportDate))
        .limit(1);
      cotSyncLastRun = cotRecent[0]?.reportDate
        ? cotRecent[0].reportDate.toISOString().slice(0, 10)
        : null;
    } catch {
      // best-effort
    }

    // Verify key environment parameters
    const envCheck: Record<string, boolean> = {
      FRED_API_KEY: !!process.env['FRED_API_KEY'],
      GOOGLE_GENERATIVE_AI_API_KEY: !!process.env['GOOGLE_GENERATIVE_AI_API_KEY'],
      DATABASE_URL: !!process.env['DATABASE_URL'],
    };

    // Calculate budget statistics
    const limitUsd = ctx.budget?.max ?? 10.0;
    const spentUsd = ctx.budget?.spent ?? 0.0;
    const remainingUsd = Math.max(0, limitUsd - spentUsd);

    const isHealthy =
      dbStatus === 'connected' &&
      latencyMs !== null &&
      latencyMs < 250 &&
      envCheck.FRED_API_KEY &&
      envCheck.GOOGLE_GENERATIVE_AI_API_KEY;

    // R8 follow-up (audit 2026-10-31): the old order checked `!isHealthy`
    // first, and `isHealthy` already requires `dbStatus === 'connected'`, so
    // every database error reported as merely 'degraded' and 'unhealthy' was
    // unreachable. A failed database probe is the one status we must not
    // understate, so it is classified first.
    const status: GetSystemDiagnosticsOutput['status'] =
      dbStatus === 'error' ? 'unhealthy' : !isHealthy ? 'degraded' : 'healthy';
    const statusDetail =
      status === 'unhealthy'
        ? ' (database probe failed)'
        : status === 'degraded'
          ? ' (a probe reading is unavailable or over the latency budget)'
          : '';

    const latencyText = latencyMs === null ? 'unavailable' : `${latencyMs}ms`;
    const countsText =
      journalEntriesCount === null ||
      snapshotsCount === null ||
      resonanceCount === null ||
      memoryEmbeddingsCount === null
        ? 'table counts unavailable'
        : `${journalEntriesCount} journals, ${snapshotsCount} market snapshots, ${resonanceCount} macro intermarket rows, ${memoryEmbeddingsCount} vectorized memories`;
    const narrative = `System status is ${status.toUpperCase()}${statusDetail}. DB latency: ${latencyText}. Table stats: ${countsText}. Remaining daily AI spend budget is $${remainingUsd.toFixed(2)} USD out of a cap of $${limitUsd.toFixed(2)} USD.`;

    return {
      status,
      asOf: new Date().toISOString(),
      database: {
        status: dbStatus,
        latencyMs,
        journalEntriesCount,
        snapshotsCount,
        briefingsCount,
        resonanceCount,
        memoryEmbeddingsCount,
      },
      worker: {
        resonanceSyncLastRun,
        cotSyncLastRun,
        activeAlertsCount,
      },
      budget: {
        spentUsd,
        limitUsd,
        remainingUsd,
      },
      envCheck,
      narrative,
    };
  },
});
