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

// Read-only telemetry aggregates. Every probe degrades to null on failure so
// the health service can distinguish "unavailable" from "zero".

import { sql } from 'drizzle-orm';

import { createScopedLoggerWithContext } from '@/lib/logger';

import type {
  AnalysisAggregate,
  ChatAggregate,
  CronAggregate,
  DailySpendRow,
  HealthSloDb,
  OperationalAggregate,
  TickAggregate,
  ToolAggregate,
} from './probe-types';

export const SPEND_WATCH_QUERY_LIMIT = 100;

function extractRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (
    result &&
    typeof result === 'object' &&
    'rows' in result &&
    Array.isArray((result as Record<string, unknown>).rows)
  ) {
    return (result as Record<string, unknown>).rows as Record<string, unknown>[];
  }
  return [];
}

/** Minimal DB surface needed by the health service. */

export async function queryTickAggregate(db: HealthSloDb): Promise<TickAggregate | null> {
  try {
    const result = await db.execute(sql`
      SELECT
        COUNT(DISTINCT symbol)::int AS symbol_count,
        EXTRACT(EPOCH FROM (NOW() - MIN(ts)))::int AS oldest_age_s
      FROM live_ticks
    `);
    const rows = extractRows(result);
    const row = rows[0] as { symbol_count: number; oldest_age_s: number | null } | undefined;

    return {
      symbolCount: Number(row?.symbol_count ?? 0),
      oldestAgeSeconds: row?.oldest_age_s == null ? null : Number(row.oldest_age_s),
    };
  } catch {
    return null;
  }
}

export async function queryCronAggregate(
  db: HealthSloDb,
  since: string,
): Promise<CronAggregate | null> {
  try {
    const result = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE started_at >= ${since})::text AS total,
        COUNT(*) FILTER (WHERE status = 'done' AND started_at >= ${since})::text AS done,
        COUNT(*) FILTER (
          WHERE status = 'started'
          AND started_at >= ${since}
          AND started_at < NOW() - INTERVAL '5 minutes'
        )::text AS stuck
      FROM cron_runs
    `);
    const rows = extractRows(result);
    const row = rows[0] as { total: string; done: string; stuck: string } | undefined;

    return {
      total: Number(row?.total ?? 0),
      done: Number(row?.done ?? 0),
      stuck: Number(row?.stuck ?? 0),
    };
  } catch {
    return null;
  }
}

export async function queryToolAggregate(
  db: HealthSloDb,
  since: string,
): Promise<ToolAggregate | null> {
  try {
    const result = await db.execute(sql`
      SELECT
        COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE ok = true)::text AS ok
      FROM chat_tool_telemetry
      WHERE created_at >= ${since}
    `);
    const rows = extractRows(result);
    const row = rows[0] as { total: string; ok: string } | undefined;

    return {
      total: Number(row?.total ?? 0),
      ok: Number(row?.ok ?? 0),
    };
  } catch {
    return null;
  }
}

export async function queryChatAggregate(
  db: HealthSloDb,
  since: string,
): Promise<ChatAggregate | null> {
  try {
    const result = await db.execute(sql`
      SELECT COUNT(*)::text AS turns
      FROM chat_telemetry
      WHERE kind IS NULL AND created_at >= ${since}
    `);
    const rows = extractRows(result);
    const row = rows[0] as { turns: string } | undefined;

    return { turns: Number(row?.turns ?? 0) };
  } catch {
    return null;
  }
}

export async function queryOperationalAggregate(
  db: HealthSloDb,
  since: string,
): Promise<OperationalAggregate | null> {
  try {
    const result = await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM mastra_workflow_snapshot WHERE workflow_name = 'full-analysis' AND "createdAt" >= ${since})::text AS full_total,
        (SELECT COUNT(*) FROM mastra_workflow_snapshot WHERE workflow_name = 'full-analysis' AND "createdAt" >= ${since} AND snapshot ->> 'status' = 'success')::text AS full_completed,
        (SELECT COUNT(*) FROM mastra_workflow_snapshot WHERE workflow_name = 'full-analysis' AND "createdAt" >= ${since} AND snapshot ->> 'status' = 'failed')::text AS full_failed,
        (SELECT COUNT(*) FROM chat_telemetry WHERE kind IN ('multi_specialist_sentiment', 'multi_specialist_sentiment_failed') AND created_at >= ${since})::text AS sentiment_total,
        (SELECT COUNT(*) FROM chat_telemetry WHERE kind = 'multi_specialist_sentiment' AND created_at >= ${since})::text AS sentiment_succeeded,
        (SELECT COUNT(*) FROM persistence_outbox WHERE created_at >= ${since} AND status IN ('completed', 'dead'))::text AS outbox_terminal,
        (SELECT COUNT(*) FROM persistence_outbox WHERE created_at >= ${since} AND status = 'completed')::text AS outbox_completed,
        (SELECT COUNT(*) FROM persistence_outbox WHERE created_at >= ${since} AND status = 'dead')::text AS outbox_dead,
        (SELECT COUNT(*) FROM ai_budget_reservations WHERE created_at >= ${since} AND status IN ('reconciled', 'released'))::text AS budget_terminal,
        (SELECT COUNT(*) FROM ai_budget_reservations WHERE created_at >= ${since} AND status IN ('reconciled', 'released') AND last_error IS NOT NULL)::text AS budget_errors,
        (SELECT COUNT(*) FROM diagnostic_traces WHERE created_at >= ${since})::text AS trace_total,
        (SELECT COUNT(*) FROM diagnostic_traces WHERE created_at >= ${since} AND status = 'failed')::text AS trace_failed,
        (SELECT COUNT(*)
          FROM diagnostic_traces AS dt
          WHERE dt.created_at >= ${since}
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements(COALESCE(dt.trace -> 'steps', '[]'::jsonb)) AS step
              WHERE step ->> 'name' = 'provider_fallback'
            )
        )::text AS provider_fallback_traces
    `);
    const rows = extractRows(result);
    const row = rows[0] as Record<string, string> | undefined;
    if (!row) return null;
    return {
      fullTotal: Number(row.full_total ?? 0),
      fullCompleted: Number(row.full_completed ?? 0),
      fullFailed: Number(row.full_failed ?? 0),
      sentimentTotal: Number(row.sentiment_total ?? 0),
      sentimentSucceeded: Number(row.sentiment_succeeded ?? 0),
      outboxTerminal: Number(row.outbox_terminal ?? 0),
      outboxCompleted: Number(row.outbox_completed ?? 0),
      outboxDead: Number(row.outbox_dead ?? 0),
      budgetTerminal: Number(row.budget_terminal ?? 0),
      budgetErrors: Number(row.budget_errors ?? 0),
      traceTotal: Number(row.trace_total ?? 0),
      traceFailed: Number(row.trace_failed ?? 0),
      providerFallbackTraces: Number(row.provider_fallback_traces ?? 0),
    };
  } catch (error) {
    const underlying =
      error instanceof Error && error.cause instanceof Error ? error.cause.message : undefined;
    const sqlState =
      error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
        ? error.code
        : undefined;
    createScopedLoggerWithContext({
      component: 'admin-health',
      query: 'operational-aggregate',
    }).error(
      {
        err: error instanceof Error ? error.message : String(error),
        ...(underlying ? { cause: underlying } : {}),
        ...(sqlState ? { sqlState } : {}),
      },
      'health SLI operational aggregate query failed',
    );
    return null;
  }
}

export async function queryAnalysisAggregate(
  db: HealthSloDb,
  since: string,
): Promise<AnalysisAggregate | null> {
  try {
    const result = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (
          WHERE workflow_name = 'full-analysis'
          AND snapshot ->> 'status' = 'pending'
          AND "createdAt" >= ${since}
          AND "createdAt" < NOW() - INTERVAL '10 minutes'
        )::text AS stale,
        COUNT(*) FILTER (
          WHERE workflow_name = 'full-analysis'
          AND snapshot ->> 'status' = 'running'
          AND "createdAt" >= ${since}
          AND "updatedAt" < NOW() - INTERVAL '30 seconds'
        )::text AS stuck
      FROM mastra_workflow_snapshot
    `);
    const rows = extractRows(result);
    const row = rows[0] as { stale: string; stuck: string } | undefined;

    return {
      stale: Number(row?.stale ?? 0),
      stuck: Number(row?.stuck ?? 0),
    };
  } catch {
    return null;
  }
}

export async function queryDailySpendRows(db: HealthSloDb): Promise<DailySpendRow[] | null> {
  try {
    const result = await db.execute(sql`
      SELECT user_id, total_usd_cents::text AS total_usd_cents
      FROM daily_ai_spend
      WHERE day = (NOW() AT TIME ZONE 'utc')::date
        AND total_usd_cents > 0
      ORDER BY total_usd_cents DESC
      LIMIT ${SPEND_WATCH_QUERY_LIMIT}::int
    `);
    const rows = extractRows(result);

    return rows.map((row) => ({
      userId: String(row.user_id ?? ''),
      spendUsdCents: Number(row.total_usd_cents ?? 0),
    }));
  } catch {
    return null;
  }
}
