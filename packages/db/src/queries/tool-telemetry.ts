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

// Tool telemetry query helpers.
//
// Audit 2026-10-31 (R1): `getToolStats` aggregates across every tenant and is
// only reachable from admin-gated surfaces, so it runs on the admin
// (BYPASSRLS) connection and fails loudly when `ADMIN_DATABASE_URL` is unset
// rather than silently reporting an empty catalogue.

import { gte, sql } from 'drizzle-orm';

import { getAdminDb, schema, type DbClient } from '../client';

export type ToolTelemetryRow = typeof schema.chatToolTelemetry.$inferSelect;
export type ToolTelemetryInsert = typeof schema.chatToolTelemetry.$inferInsert;

export interface ToolStats {
  tool: string | null;
  invocations: number;
  failures: number;
  median: number;
  p95: number;
}

/**
 * Aggregate tool telemetry for the last N hours.
 * Returns per-tool stats: invocation count, failure count, median/p95 latency.
 *
 * Cross-tenant by design (the platform-wide tool catalogue), so it reads on
 * the admin (BYPASSRLS) connection. Deliberately throws when
 * `ADMIN_DATABASE_URL` is not configured — a fallback read would return zero
 * rows under the non-bypass application role, which looks like "no tool has
 * ever run". Callers are admin-gated surfaces only.
 *
 * @param db Optional client the caller already holds. Pass the admin client
 *   (e.g. the handle from `withAdminDb`), never a tenant-scoped one.
 */
export async function getToolStats(sinceMs: number, db?: DbClient): Promise<ToolStats[]> {
  const since = new Date(sinceMs);
  const client = db ?? getAdminDb();
  const result = await client
    .select({
      tool: schema.chatToolTelemetry.tool,
      invocations: sql<number>`count(*)`.as('invocations'),
      failures:
        sql<number>`sum(case when ${schema.chatToolTelemetry.ok} = false then 1 else 0 end)`.as(
          'failures',
        ),
      median:
        sql<number>`percentile_cont(0.5) within group (order by ${schema.chatToolTelemetry.ms})`.as(
          'median',
        ),
      p95: sql<number>`percentile_cont(0.95) within group (order by ${schema.chatToolTelemetry.ms})`.as(
        'p95',
      ),
    })
    .from(schema.chatToolTelemetry)
    .where(gte(schema.chatToolTelemetry.createdAt, since))
    .groupBy(schema.chatToolTelemetry.tool);

  return result as unknown as ToolStats[];
}
