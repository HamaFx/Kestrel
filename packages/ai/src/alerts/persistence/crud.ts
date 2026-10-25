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

// Alert CRUD + read helpers. Used by route handlers, the cron evaluator,
// and the AI `set_alert` tool.

import { requireTenantIdForUser, schema } from '@kestrel/db';
import { AlertChannelSchema, AlertRuleSchema, type Alert } from '@kestrel/shared';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';

import { getDb } from '../../runtime/db';
import { plog } from './log';
import { rowToAlert } from './rows';
import { isInSnooze } from './snooze';
import type { CreateAlertInput, UpdateAlertInput } from './types';

export async function listAlerts(
  userId: string,
  opts: { activeOnly?: boolean; limit?: number } = {},
): Promise<Alert[]> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const filters = [eq(schema.alerts.userId, userId), eq(schema.alerts.tenantId, tenantId)];
  if (opts.activeOnly) filters.push(eq(schema.alerts.active, true));

  const rows = await getDb()
    .select()
    .from(schema.alerts)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(schema.alerts.createdAt))
    .limit(opts.limit ?? 100);

  // Skip rows with rules we can no longer parse (e.g. legacy malformed
  // indicator specs). The cron evaluator does the same in `listEvaluable`.
  const out: Alert[] = [];
  for (const row of rows) {
    try {
      out.push(rowToAlert(row));
    } catch (err) {
      plog.warn('skipping unparseable rule', { id: row.id, err: String(err) });
    }
  }
  return out;
}

/**
 * Active and not-yet-fired — what the cron evaluator iterates over.
 *
 * Phase 1 hardening §11 — invalid `indicatorCross.indicator` strings
 * (legacy "rsi:14:bogus" style) used to silently behave as `rsi(14)`.
 * The schema is now strict, so a row with a malformed indicator throws
 * during `rowToAlert`. We catch that here and skip the row instead of
 * crashing the cron tick — the user can fix the rule in the UI.
 */
export async function listEvaluable(): Promise<Alert[]> {
  // Phase C — UX_UPGRADE_PLAN.md item 17. Snooze filter.
  //
  // We can't do a "now >= lastFiredAt + snoozeHours" check in raw
  // SQL (Drizzle's pg-core doesn't expose a clean interval-arithmetic
  // builder for hours across all our drivers), so we pull
  // active rows and filter in JS. The set is small — the cron
  // pulls only active alerts that haven't fired-and-deactivated,
  // and after Phase 17 the snoozed set is a subset of that.
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.alerts)
    .where(and(eq(schema.alerts.active, true), isNull(schema.alerts.firedAt)))
    .orderBy(asc(schema.alerts.createdAt));
  const out: Alert[] = [];
  const now = Date.now();
  for (const row of rows) {
    try {
      const alert = rowToAlert(row);
      // Phase C — item 17. Snooze gate. Delegate to the pure
      // helper so the cron policy is unit-testable.
      if (isInSnooze(alert, now)) continue;
      out.push(alert);
    } catch (err) {
      plog.warn('skipping unparseable rule', { id: row.id, err: String(err) });
    }
  }
  return out;
}

export async function getAlert(userId: string, id: string): Promise<Alert | null> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const rows = await db
    .select()
    .from(schema.alerts)
    .where(
      and(
        eq(schema.alerts.id, id),
        eq(schema.alerts.userId, userId),
        eq(schema.alerts.tenantId, tenantId),
      ),
    )
    .limit(1);
  const row = rows[0];
  return row ? rowToAlert(row) : null;
}

export async function createAlert(input: CreateAlertInput): Promise<Alert> {
  // Re-validate at the DB boundary so a malformed rule can never reach the
  // evaluator, even if the caller skipped validation.
  const rule = AlertRuleSchema.parse(input.rule);
  const channels = (input.channels ?? ['email']).map((c) => AlertChannelSchema.parse(c));
  // Phase C — item 17. Clamp snoozeHours to the schema's
  // documented range (0..168). Caller validation should have
  // caught this already; the bound is a defensive guard.
  const snoozeHours = Math.max(0, Math.min(168, Math.trunc(input.snoozeHours ?? 0)));

  const db = getDb();
  const tenantId = await requireTenantIdForUser(input.userId, db);
  const inserted = await db
    .insert(schema.alerts)
    .values({
      userId: input.userId,
      tenantId,
      rule,
      channels,
      note: input.note ?? null,
      active: true,
      firedAt: null,
      lastFiredAt: null,
      snoozeHours,
    })
    .returning();
  return rowToAlert(inserted[0]!);
}

export async function updateAlert(
  userId: string,
  id: string,
  input: UpdateAlertInput,
): Promise<Alert | null> {
  const patch: Partial<typeof schema.alerts.$inferInsert> = {};
  if (input.rule !== undefined) patch.rule = AlertRuleSchema.parse(input.rule);
  if (input.channels !== undefined)
    patch.channels = input.channels.map((c) => AlertChannelSchema.parse(c));
  if (input.note !== undefined) patch.note = input.note;
  if (input.active !== undefined) patch.active = input.active;
  if (input.firedAt !== undefined) {
    patch.firedAt = input.firedAt === null ? null : new Date(input.firedAt);
  }
  if (input.snoozeHours !== undefined) {
    patch.snoozeHours = Math.max(0, Math.min(168, Math.trunc(input.snoozeHours)));
  }

  if (Object.keys(patch).length === 0) return getAlert(userId, id);

  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const updated = await db
    .update(schema.alerts)
    .set(patch)
    .where(
      and(
        eq(schema.alerts.id, id),
        eq(schema.alerts.userId, userId),
        eq(schema.alerts.tenantId, tenantId),
      ),
    )
    .returning();
  return updated[0] ? rowToAlert(updated[0]) : null;
}

export async function deleteAlert(userId: string, id: string): Promise<void> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  await db
    .delete(schema.alerts)
    .where(
      and(
        eq(schema.alerts.id, id),
        eq(schema.alerts.userId, userId),
        eq(schema.alerts.tenantId, tenantId),
      ),
    );
}
