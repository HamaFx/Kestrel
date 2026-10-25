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

// Delivery claims and fired-state transitions.

import { requireTenantIdForUser, schema } from '@kestrel/db';
import type { Alert } from '@kestrel/shared';
import { and, eq, isNull, lt, or } from 'drizzle-orm';

import { getDb } from '../../runtime/db';

/**
 * Atomically claim an alert for external delivery.
 *
 * Claims are leases rather than permanent flags: a crashed worker leaves a
 * stale claim that a later cron tick can reclaim. The evaluator still owns
 * the final fired-state transition.
 */
export async function claimAlertDelivery(
  userId: string,
  id: string,
  claimedAt = new Date(),
  leaseMs = 30 * 60_000,
  tenantId?: string,
): Promise<boolean> {
  const staleBefore = new Date(claimedAt.getTime() - leaseMs);
  const db = getDb();
  // Resolved once per tick by the evaluator; the fallback keeps other
  // callers unchanged.
  const tenant = tenantId ?? (await requireTenantIdForUser(userId, db));
  const claimed = await db
    .update(schema.alerts)
    .set({ deliveryClaimedAt: claimedAt })
    .where(
      and(
        eq(schema.alerts.id, id),
        eq(schema.alerts.userId, userId),
        eq(schema.alerts.tenantId, tenant),
        eq(schema.alerts.active, true),
        isNull(schema.alerts.firedAt),
        or(
          isNull(schema.alerts.deliveryClaimedAt),
          lt(schema.alerts.deliveryClaimedAt, staleBefore),
        ),
      ),
    )
    .returning({ id: schema.alerts.id });
  return claimed.length > 0;
}

/** Release a failed delivery claim without changing alert activation state. */
export async function releaseAlertDeliveryClaim(
  userId: string,
  id: string,
  claimedAt: Date,
): Promise<void> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  await db
    .update(schema.alerts)
    .set({ deliveryClaimedAt: null })
    .where(
      and(
        eq(schema.alerts.id, id),
        eq(schema.alerts.userId, userId),
        eq(schema.alerts.tenantId, tenantId),
        eq(schema.alerts.deliveryClaimedAt, claimedAt),
      ),
    );
}

/** Mark fired + deactivate (one-shot semantics — see schemas/alerts.ts). */
export async function markFired(
  userId: string,
  id: string,
  when = new Date(),
  claimedAt?: Date,
): Promise<boolean> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const predicates = [
    eq(schema.alerts.id, id),
    eq(schema.alerts.userId, userId),
    eq(schema.alerts.tenantId, tenantId),
  ];
  if (claimedAt) predicates.push(eq(schema.alerts.deliveryClaimedAt, claimedAt));
  const updated = await db
    .update(schema.alerts)
    .set({ firedAt: when, active: false, deliveryClaimedAt: null })
    .where(and(...predicates))
    .returning({ id: schema.alerts.id });
  return updated.length > 0;
}

/**
 * Mark fired WITHOUT deactivating. The alert stays `active=true` and the cron will
 * skip it until `now >= lastFiredAt + snoozeHours interval`. This
 * is the snooze path; the one-shot path above stays unchanged.
 */
export async function markFiredSnoozed(
  userId: string,
  id: string,
  when = new Date(),
  claimedAt?: Date,
): Promise<boolean> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const predicates = [
    eq(schema.alerts.id, id),
    eq(schema.alerts.userId, userId),
    eq(schema.alerts.tenantId, tenantId),
  ];
  if (claimedAt) predicates.push(eq(schema.alerts.deliveryClaimedAt, claimedAt));
  const updated = await db
    .update(schema.alerts)
    .set({ lastFiredAt: when, deliveryClaimedAt: null })
    .where(and(...predicates))
    .returning({ id: schema.alerts.id });
  return updated.length > 0;
}

/**
 * Phase C — UX_UPGRADE_PLAN.md item 17. Single entry point for
 * the delivery layer. Picks the one-shot vs snoozed path based on
 * `alert.snoozeHours`. The delivery layer doesn't need to know
 * about the difference; it just calls this after a 2xx response.
 */
export async function markFiredForAlert(
  alert: Alert,
  when = new Date(),
  claimedAt?: Date,
): Promise<boolean> {
  if (alert.snoozeHours > 0) {
    return markFiredSnoozed(alert.userId, alert.id, when, claimedAt);
  }
  return markFired(alert.userId, alert.id, when, claimedAt);
}
