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

// Emission dedupe for `briefings_emitted` — the cron fan-out consults these
// before emitting a pre/post/weekly briefing for an event.

import { requireTenantIdForUser, schema } from '@kestrel/db';
import { and, eq, inArray } from 'drizzle-orm';

import { getDb } from '../../runtime/db';

/** True when a briefing of `(eventId, kind)` has already been emitted. */
export async function wasEmitted(
  userId: string,
  eventId: string,
  kind: 'pre' | 'post' | 'weekly_review',
): Promise<boolean> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const rows = await db
    .select({ k: schema.briefingsEmitted.kind })
    .from(schema.briefingsEmitted)
    .where(
      and(
        eq(schema.briefingsEmitted.userId, userId),
        eq(schema.briefingsEmitted.tenantId, tenantId),
        eq(schema.briefingsEmitted.eventId, eventId),
        eq(schema.briefingsEmitted.kind, kind),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Batch idempotency lookup for the cron fan-out: returns the subset of
 * `eventIds` for which `(userId, eventId, kind)` has already been emitted.
 * One query per user replaces the per-(event, user) `wasEmitted` probe that
 * otherwise repeats for every pair on every tick.
 */
export async function listEmittedEventIds(
  userId: string,
  eventIds: string[],
  kind: 'pre' | 'post' | 'weekly_review',
): Promise<Set<string>> {
  if (eventIds.length === 0) return new Set();
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const rows = await db
    .select({ eventId: schema.briefingsEmitted.eventId })
    .from(schema.briefingsEmitted)
    .where(
      and(
        eq(schema.briefingsEmitted.userId, userId),
        eq(schema.briefingsEmitted.tenantId, tenantId),
        inArray(schema.briefingsEmitted.eventId, eventIds),
        eq(schema.briefingsEmitted.kind, kind),
      ),
    );
  return new Set(rows.map((r) => r.eventId));
}

/**
 * Record that a briefing has been emitted, linking back to the message row
 * that carries the body. The (userId, eventId, kind) primary key gives us
 * idempotency for free at the DB layer — a parallel emit will throw, which
 * we catch upstream and treat as "already emitted by another runner".
 */
export async function recordEmitted(
  userId: string,
  eventId: string,
  kind: 'pre' | 'post' | 'weekly_review',
  messageId: string,
): Promise<void> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  await db
    .insert(schema.briefingsEmitted)
    .values({ userId, tenantId, eventId, kind, messageId })
    .onConflictDoNothing({
      target: [
        schema.briefingsEmitted.userId,
        schema.briefingsEmitted.eventId,
        schema.briefingsEmitted.kind,
      ],
    });
}
