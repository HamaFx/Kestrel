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

// Daily/monthly spend counters backed by `daily_ai_spend`.
//
// Telemetry is intentionally not used for the daily counter: it can contain
// auxiliary planner/title/specialist rows, while `daily_ai_spend` is the
// atomic budget source of truth and includes reservations that have not
// emitted telemetry yet.

import { requireTenantIdForUser, schema } from '@kestrel/db';
import { KNOWN_BYOK_PROVIDERS } from '@kestrel/shared';
import { and, eq, gte, sql } from 'drizzle-orm';

import { getDb } from '../runtime/db';

export function utcDayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Read today's authoritative reserved/actual spend counter. */
export async function dailySpendUsd(userId: string, now = new Date()): Promise<number> {
  return reservedSpendUsd(userId, now);
}

/** Read the authoritative running counter for today for a specific user. */
export async function reservedSpendUsd(userId: string, now = new Date()): Promise<number> {
  const day = utcDayKey(now);
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const rows = await db
    .select({ cents: schema.dailyAiSpend.totalUsdCents })
    .from(schema.dailyAiSpend)
    .where(
      sql`${schema.dailyAiSpend.userId} = ${userId} AND ${schema.dailyAiSpend.tenantId} = ${tenantId} AND ${schema.dailyAiSpend.day} = ${day}`,
    )
    .limit(1);
  return Number(rows[0]?.cents ?? 0) / 100;
}

/** Apply an already-known cost delta (used when there is no durable reservation). */
export async function applyBudgetDelta(
  userId: string,
  deltaUsd: number,
  now = new Date(),
): Promise<void> {
  if (!Number.isFinite(deltaUsd) || deltaUsd === 0) return;
  const day = utcDayKey(now);
  const cents = Math.round(deltaUsd * 100);
  if (cents === 0) return;
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  await db.execute(
    sql`
      INSERT INTO daily_ai_spend (user_id, tenant_id, day, total_usd_cents)
      VALUES (${userId}, ${tenantId}, ${day}, GREATEST(0, ${cents}))
      ON CONFLICT (user_id, day) DO UPDATE
        SET total_usd_cents = GREATEST(0, daily_ai_spend.total_usd_cents + ${cents})
    `,
  );
}

/** Throw if today's spend has already crossed `maxUsd` for the given user. */
export async function enforceDailyBudget(
  userId: string,
  maxUsd: number,
): Promise<{ spent: number; max: number }> {
  const spent = await reservedSpendUsd(userId);
  if (spent >= maxUsd) {
    throw new BudgetExceededError(spent, maxUsd);
  }
  return { spent, max: maxUsd };
}

export class BudgetExceededError extends Error {
  readonly code = 'BUDGET_EXCEEDED' as const;
  readonly spent: number;
  readonly max: number;

  constructor(spent: number, max: number) {
    super(`Daily AI budget exceeded: spent $${spent.toFixed(4)} / $${max.toFixed(2)}`);
    this.name = 'BudgetExceededError';
    this.spent = spent;
    this.max = max;
  }
}

export async function getMonthlySpend(userId: string, now = new Date()): Promise<number> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startOfMonthStr = startOfMonth.toISOString().slice(0, 10);
  const rows = await db
    .select({ totalCents: sql<number>`coalesce(sum(${schema.dailyAiSpend.totalUsdCents}), 0)` })
    .from(schema.dailyAiSpend)
    .where(
      and(
        eq(schema.dailyAiSpend.userId, userId),
        eq(schema.dailyAiSpend.tenantId, tenantId),
        gte(schema.dailyAiSpend.day, startOfMonthStr),
      ),
    );
  return (rows[0]?.totalCents ?? 0) / 100;
}

export async function getProviderMonthlySpend(
  userId: string,
  providerId: string,
  now = new Date(),
): Promise<number> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  // Provider attribution must match the JS resolver: '<prefix>/model' bills to
  // `prefix`, a bare model id bills to 'google', and only KNOWN_BYOK_PROVIDERS
  // (or the 'google' default) are billable — anything else accrues no spend.
  if (providerId !== 'google' && !KNOWN_BYOK_PROVIDERS.has(providerId)) return 0;

  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${schema.chatTelemetry.estCostUsd}) filter (
        where coalesce(nullif(split_part(${schema.chatTelemetry.model}, '/', 1), ''), 'google') = ${providerId}
      ), 0)::text`,
    })
    .from(schema.chatTelemetry)
    .where(
      and(
        eq(schema.chatTelemetry.userId, userId),
        eq(schema.chatTelemetry.tenantId, tenantId),
        gte(schema.chatTelemetry.createdAt, startOfMonth),
      ),
    );
  return Number(row?.total ?? 0);
}
