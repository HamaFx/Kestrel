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

// Billing — provider webhook event registry (claim/lease/finish).

import { and, eq, lt, or, sql } from 'drizzle-orm';

import { getDb, schema } from '../client';

export type ClaimBillingEventResult =
  | { kind: 'claimed'; id: string }
  | { kind: 'processed' }
  | { kind: 'in_progress' }
  | { kind: 'conflict' };

const LEASE_MS = 10 * 60_000;

/**
 * Claim a provider event before any mutation.
 *
 * - new event → claimed
 * - processed event → processed (no-op)
 * - processing with a live lease → in_progress
 * - processing with an expired lease → reclaimed
 */
export async function claimBillingEvent(input: {
  provider: string;
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
}): Promise<ClaimBillingEventResult> {
  const db = getDb();
  const [inserted] = await db
    .insert(schema.billingEvents)
    .values({
      provider: input.provider,
      eventId: input.eventId,
      eventType: input.eventType,
      status: 'processing',
      payload: input.payload,
      processing: true,
    })
    .onConflictDoNothing({
      target: [schema.billingEvents.provider, schema.billingEvents.eventId],
    })
    .returning({ id: schema.billingEvents.id });

  if (inserted) return { kind: 'claimed', id: inserted.id };

  const [existing] = await db
    .select()
    .from(schema.billingEvents)
    .where(
      and(
        eq(schema.billingEvents.provider, input.provider),
        eq(schema.billingEvents.eventId, input.eventId),
      ),
    )
    .limit(1);
  if (!existing) return { kind: 'conflict' };
  if (existing.status === 'processed') return { kind: 'processed' };

  const cutoff = new Date(Date.now() - LEASE_MS);
  const [reclaimed] = await db
    .update(schema.billingEvents)
    .set({
      status: 'processing',
      processing: true,
      error: null,
      attempts: existing.attempts + 1,
      receivedAt: new Date(),
    })
    .where(
      and(
        eq(schema.billingEvents.id, existing.id),
        or(
          eq(schema.billingEvents.processing, false),
          lt(schema.billingEvents.receivedAt, cutoff),
        ),
      ),
    )
    .returning({ id: schema.billingEvents.id });
  return reclaimed ? { kind: 'claimed', id: reclaimed.id } : { kind: 'in_progress' };
}

export async function markBillingEventProcessed(id: string): Promise<void> {
  const db = getDb();
  await db
    .update(schema.billingEvents)
    .set({ status: 'processed', processing: false, processedAt: new Date(), error: null })
    .where(eq(schema.billingEvents.id, id));
}

export async function markBillingEventFailed(id: string, error: string): Promise<void> {
  const db = getDb();
  await db
    .update(schema.billingEvents)
    .set({ status: 'failed', processing: false, error: error.slice(0, 2_000) })
    .where(eq(schema.billingEvents.id, id));
}

export async function countBillingEventsSince(provider: string, since: Date): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.billingEvents)
    .where(
      and(eq(schema.billingEvents.provider, provider), sql`${schema.billingEvents.receivedAt} >= ${since}`),
    );
  return row?.count ?? 0;
}
