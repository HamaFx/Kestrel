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

// Chat telemetry query helpers.

import { and, between, desc, eq, sql } from 'drizzle-orm';

import { getDb, schema } from '../client';
import { requireTenantIdForUser } from '../tenant';

export type TelemetryRow = typeof schema.chatTelemetry.$inferSelect;

export async function listTelemetry(
  userId: string,
  opts?: { from?: Date; to?: Date; limit?: number },
): Promise<TelemetryRow[]> {
  const conditions = [eq(schema.chatTelemetry.userId, userId)];
  if (opts?.from && opts?.to)
    conditions.push(between(schema.chatTelemetry.createdAt, opts.from, opts.to));
  const tenantId = await requireTenantIdForUser(userId, getDb());
  conditions.push(eq(schema.chatTelemetry.tenantId, tenantId));
  const db = getDb();
  return db
    .select()
    .from(schema.chatTelemetry)
    .where(and(...conditions))
    .orderBy(desc(schema.chatTelemetry.createdAt))
    .limit(opts?.limit ?? 100);
}

export async function recordTelemetry(
  data: Omit<typeof schema.chatTelemetry.$inferInsert, 'id' | 'createdAt'>,
): Promise<TelemetryRow> {
  const db = getDb();
  const values =
    data.userId === '__system__'
      ? data
      : { ...data, tenantId: await requireTenantIdForUser(data.userId, db) };
  const rows = await db.insert(schema.chatTelemetry).values(values).returning();
  return rows[0]!;
}

export async function getDailySpend(
  userId: string,
  date: Date,
): Promise<{ estimatedCost: number; tokenCount: number }> {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  // Aggregated in SQL — fetching every telemetry row for the day into
  // Node.js memory just to `.reduce()` it scales linearly with usage.
  const [row] = await db
    .select({
      cost: sql<string>`coalesce(sum(${schema.chatTelemetry.estCostUsd}), 0)::text`,
      tokens: sql<number>`coalesce(sum(${schema.chatTelemetry.inputTokens} + ${schema.chatTelemetry.outputTokens}), 0)::int`,
    })
    .from(schema.chatTelemetry)
    .where(
      and(
        eq(schema.chatTelemetry.userId, userId),
        eq(schema.chatTelemetry.tenantId, tenantId),
        between(schema.chatTelemetry.createdAt, start, end),
      ),
    );

  return {
    estimatedCost: Number(row?.cost ?? 0),
    tokenCount: Number(row?.tokens ?? 0),
  };
}
