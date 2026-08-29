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

// IPN (NOWPayments) webhook and checkout safety query helpers.

import { randomUUID } from 'node:crypto';

import { and, eq, isNull, lt, or, sql, type SQL } from 'drizzle-orm';

import { getDb, schema } from '../client';

export type IpnClaim =
  | { kind: 'claimed'; event: typeof schema.ipnEvents.$inferSelect }
  | { kind: 'processed' }
  | { kind: 'in_progress' }
  | { kind: 'conflict'; event: typeof schema.ipnEvents.$inferSelect };

/**
 * Atomically claim an IPN event for processing.
 *
 * A unique key protects against concurrent deliveries. Failed claims are
 * released and can be claimed again, while successful claims remain done.
 */
export async function claimIpnEvent(data: {
  nowpaymentsPaymentId: string;
  paymentStatus: string;
  bodyHash: string;
  rawBody: unknown;
}): Promise<IpnClaim> {
  const db = getDb();
  const [inserted] = await db
    .insert(schema.ipnEvents)
    .values({
      nowpaymentsPaymentId: data.nowpaymentsPaymentId,
      paymentStatus: data.paymentStatus,
      bodyHash: data.bodyHash,
      rawBody: data.rawBody,
      processing: true,
      processingAt: new Date(),
    })
    .onConflictDoNothing({
      target: [schema.ipnEvents.nowpaymentsPaymentId, schema.ipnEvents.paymentStatus],
    })
    .returning();

  if (inserted) return { kind: 'claimed', event: inserted };

  const [existing] = await db
    .select()
    .from(schema.ipnEvents)
    .where(
      and(
        eq(schema.ipnEvents.nowpaymentsPaymentId, data.nowpaymentsPaymentId),
        eq(schema.ipnEvents.paymentStatus, data.paymentStatus),
      ),
    )
    .limit(1);

  // The idempotency key identifies one immutable provider event. Do not let a
  // conflicting delivery overwrite the first authenticated payload, even if
  // the original claim is still active or has already completed.
  if (existing && existing.bodyHash !== data.bodyHash) {
    return { kind: 'conflict', event: existing };
  }
  if (!existing || existing.processed) return { kind: 'processed' };
  const leaseExpired =
    existing.processing &&
    (!existing.processingAt || existing.processingAt < new Date(Date.now() - 5 * 60_000));
  if (existing.processing && !leaseExpired) return { kind: 'in_progress' };

  const [reclaimed] = await db
    .update(schema.ipnEvents)
    .set({
      processing: true,
      processingAt: new Date(),
      // Preserve bodyHash, rawBody, and receivedAt from the first delivery;
      // they are the immutable audit record for this idempotency key.
      error: null,
    })
    .where(
      and(
        eq(schema.ipnEvents.nowpaymentsPaymentId, data.nowpaymentsPaymentId),
        eq(schema.ipnEvents.paymentStatus, data.paymentStatus),
        eq(schema.ipnEvents.processed, false),
        or(
          eq(schema.ipnEvents.processing, false),
          isNull(schema.ipnEvents.processingAt),
          lt(schema.ipnEvents.processingAt, new Date(Date.now() - 5 * 60_000)),
        ),
      ),
    )
    .returning();

  return reclaimed ? { kind: 'claimed', event: reclaimed } : { kind: 'in_progress' };
}

/**
 * Legacy lookup retained for callers and operational tooling.
 */
export async function findIpnEvent(paymentId: string, paymentStatus: string) {
  const db = getDb();
  const existing = await db
    .select()
    .from(schema.ipnEvents)
    .where(
      and(
        eq(schema.ipnEvents.nowpaymentsPaymentId, paymentId),
        eq(schema.ipnEvents.paymentStatus, paymentStatus),
      ),
    )
    .limit(1);
  return existing[0] ?? null;
}

/** Insert an IPN event for legacy/manual callers. */
export async function insertIpnEvent(data: {
  nowpaymentsPaymentId: string;
  paymentStatus: string;
  bodyHash: string;
  rawBody: unknown;
}): Promise<void> {
  const db = getDb();
  await db
    .insert(schema.ipnEvents)
    .values(data)
    .onConflictDoNothing({
      target: [schema.ipnEvents.nowpaymentsPaymentId, schema.ipnEvents.paymentStatus],
    });
}

/** Mark a claimed IPN event as successfully processed. */
export async function markIpnProcessed(
  paymentId: string,
  paymentStatus: string,
  error: string | null,
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.ipnEvents)
    .set({ processed: true, processing: false, processingAt: null, error, processedAt: new Date() })
    .where(
      and(
        eq(schema.ipnEvents.nowpaymentsPaymentId, paymentId),
        eq(schema.ipnEvents.paymentStatus, paymentStatus),
      ),
    );
}

/** Release a failed claim so a provider retry or operator replay can retry it. */
export async function markIpnFailed(
  paymentId: string,
  paymentStatus: string,
  error: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.ipnEvents)
    .set({ processed: false, processing: false, processingAt: null, error, processedAt: null })
    .where(
      and(
        eq(schema.ipnEvents.nowpaymentsPaymentId, paymentId),
        eq(schema.ipnEvents.paymentStatus, paymentStatus),
      ),
    );
}

/** Persist an authenticated webhook failure for manual replay. */
export async function recordBillingWebhookFailure(data: {
  eventType: string;
  eventId: string;
  payload: unknown;
  error: string;
}): Promise<void> {
  const db = getDb();
  await db
    .insert(schema.billingWebhookDlq)
    .values({
      provider: 'nowpayments',
      eventType: data.eventType,
      eventId: data.eventId,
      payload: data.payload,
      error: data.error,
    })
    .onConflictDoUpdate({
      target: [
        schema.billingWebhookDlq.provider,
        schema.billingWebhookDlq.eventId,
        schema.billingWebhookDlq.eventType,
      ],
      set: {
        payload: data.payload,
        error: data.error,
        status: 'pending',
        replayedAt: null,
        replayStartedAt: null,
        replayToken: null,
      },
    });
}

/**
 * Count billing webhook failures that need operator attention.
 *
 * Pending rows are stale by their receive time. A replaying row is stale by
 * its replay lease start time; an active lease must not page, but a lease
 * older than the alert window indicates a crashed or wedged replay worker.
 */
export async function countStaleBillingWebhookFailures(cutoff: Date): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.billingWebhookDlq)
    .where(
      or(
        and(
          eq(schema.billingWebhookDlq.status, 'pending'),
          lt(schema.billingWebhookDlq.receivedAt, cutoff),
        ),
        and(
          eq(schema.billingWebhookDlq.status, 'replaying'),
          or(
            isNull(schema.billingWebhookDlq.replayStartedAt),
            lt(schema.billingWebhookDlq.replayStartedAt, cutoff),
          ),
        ),
      ),
    );
  return Number(row?.count ?? 0);
}

/** Get one DLQ entry for an authenticated operator replay. */
export async function getBillingWebhookFailure(id: string) {
  const db = getDb();
  const [entry] = await db
    .select()
    .from(schema.billingWebhookDlq)
    .where(eq(schema.billingWebhookDlq.id, id))
    .limit(1);
  return entry ?? null;
}

/** Atomically reserve a pending DLQ entry for replay. */
export async function claimBillingWebhookReplay(id: string) {
  const db = getDb();
  const replayCutoff = new Date(Date.now() - 10 * 60_000);
  const replayToken = randomUUID();
  const [entry] = await db
    .update(schema.billingWebhookDlq)
    .set({ status: 'replaying', replayStartedAt: new Date(), replayToken })
    .where(
      and(
        eq(schema.billingWebhookDlq.id, id),
        or(
          eq(schema.billingWebhookDlq.status, 'pending'),
          and(
            eq(schema.billingWebhookDlq.status, 'replaying'),
            or(
              isNull(schema.billingWebhookDlq.replayStartedAt),
              lt(schema.billingWebhookDlq.replayStartedAt, replayCutoff),
            ),
          ),
        ),
      ),
    )
    .returning();
  return entry ?? null;
}

/** Mark a successfully replayed DLQ entry owned by this replay lease. */
export async function markBillingWebhookReplayed(id: string, replayToken: string): Promise<void> {
  const db = getDb();
  const [updated] = await db
    .update(schema.billingWebhookDlq)
    .set({ status: 'replayed', replayedAt: new Date(), replayStartedAt: null, replayToken: null })
    .where(
      and(
        eq(schema.billingWebhookDlq.id, id),
        eq(schema.billingWebhookDlq.status, 'replaying'),
        eq(schema.billingWebhookDlq.replayToken, replayToken),
      ),
    )
    .returning();
  if (!updated) throw new Error('DLQ replay lease was lost before completion');
}

/** Release a failed replay owned by this replay lease back to the queue. */
export async function releaseBillingWebhookReplay(
  id: string,
  error: string,
  replayToken: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.billingWebhookDlq)
    .set({ status: 'pending', error, replayStartedAt: null, replayToken: null })
    .where(
      and(
        eq(schema.billingWebhookDlq.id, id),
        eq(schema.billingWebhookDlq.status, 'replaying'),
        eq(schema.billingWebhookDlq.replayToken, replayToken),
      ),
    );
}

/** Provider order for the mutable payment projection. */
const PAYMENT_STATUS_RANK: Record<string, number> = {
  waiting: 10,
  confirming: 20,
  confirmed: 30,
  sending: 40,
  finished: 50,
  failed: 50,
  expired: 50,
  refunded: 60,
};

/**
 * Accept a provider status only when it advances the mutable projection.
 * Same-status retries are idempotent; terminal statuses cannot replace one
 * another, while refunded remains the only valid terminal advance.
 */
function statusAdvancePredicate(
  currentStatus: SQL,
  incomingStatus: string,
  incomingRank: number,
): SQL {
  return sql`(
    ${currentStatus} IS NULL
    OR ${currentStatus} = ${incomingStatus}
    OR (${incomingStatus} = 'refunded' AND ${currentStatus} <> 'refunded')
    OR (${currentStatus} = 'waiting' AND ${incomingRank} >= 10)
    OR (${currentStatus} = 'confirming' AND ${incomingRank} >= 20)
    OR (${currentStatus} = 'confirmed' AND ${incomingRank} >= 30)
    OR (${currentStatus} = 'sending' AND ${incomingRank} >= 40)
  )`;
}

/** Update a payment row status and associated fields without accepting stale regressions. */
export async function updatePaymentStatus(
  paymentId: string,
  data: {
    tenantId: string;
    status: string;
    nowpaymentsPaymentId?: string;
    txHash?: string | null;
    payAmount?: string | null;
    payCurrency?: string | null;
    ipnPayload?: unknown;
  },
): Promise<boolean> {
  const db = getDb();
  const incomingRank = PAYMENT_STATUS_RANK[data.status] ?? 0;
  const updateData: Record<string, unknown> = {
    status: data.status,
    updatedAt: new Date(),
  };
  if (data.nowpaymentsPaymentId !== undefined)
    updateData.nowpaymentsPaymentId = data.nowpaymentsPaymentId;
  if (data.txHash !== undefined) updateData.txHash = data.txHash;
  if (data.payAmount !== undefined) updateData.payAmount = data.payAmount;
  if (data.payCurrency !== undefined) updateData.payCurrency = data.payCurrency;
  if (data.ipnPayload !== undefined) updateData.ipnPayload = data.ipnPayload;

  const [updated] = await db
    .update(schema.payments)
    .set(updateData)
    .where(
      and(
        eq(schema.payments.id, paymentId),
        eq(schema.payments.tenantId, data.tenantId),
        statusAdvancePredicate(
          sql`${schema.payments.status}`,
          data.status,
          incomingRank,
        ),
      ),
    )
    .returning({ id: schema.payments.id });
  return Boolean(updated);
}

/**
 * Resolve a payment by provider payment ID and, when supplied, invoice ID.
 * If both identifiers resolve to different rows, reject the webhook instead
 * of allowing an ambiguous cross-invoice update.
 */
export async function getPaymentByNowpaymentsId(
  nowpaymentsPaymentId: string,
  nowpaymentsInvoiceId?: string,
  tenantId?: string,
) {
  const db = getDb();
  const [byPaymentId] = await db
    .select()
    .from(schema.payments)
    .where(
      tenantId
        ? and(
            eq(schema.payments.nowpaymentsPaymentId, nowpaymentsPaymentId),
            eq(schema.payments.tenantId, tenantId),
          )
        : eq(schema.payments.nowpaymentsPaymentId, nowpaymentsPaymentId),
    )
    .limit(1);

  if (!nowpaymentsInvoiceId) return byPaymentId ?? null;

  const [byInvoiceId] = await db
    .select()
    .from(schema.payments)
    .where(
      tenantId
        ? and(
            eq(schema.payments.nowpaymentsInvoiceId, nowpaymentsInvoiceId),
            eq(schema.payments.tenantId, tenantId),
          )
        : eq(schema.payments.nowpaymentsInvoiceId, nowpaymentsInvoiceId),
    )
    .limit(1);

  // Older payment rows may not have stored an invoice ID. In that case an
  // exact payment-ID match remains authoritative; reject only a proven
  // cross-row mismatch.
  if (byPaymentId && !byInvoiceId) return byPaymentId;
  if (byPaymentId && byInvoiceId && byPaymentId.id !== byInvoiceId.id) {
    throw new Error('NOWPayments payment ID and invoice ID refer to different payment rows');
  }
  return byInvoiceId ?? null;
}

/** Subscription status mapper from NOWPayments status. */
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled';

/** Update subscription status based on payment outcome. */
export async function updateSubscriptionFromPayment(
  subscriptionId: string,
  paymentStatus: string,
  data: { tenantId: string; invoiceId?: string },
): Promise<boolean> {
  const db = getDb();
  const incomingRank = PAYMENT_STATUS_RANK[paymentStatus] ?? 0;

  switch (paymentStatus) {
    case 'finished':
    case 'confirmed': {
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      const [updated] = await db
        .update(schema.subscriptions)
        .set({
          status: 'active',
          currentPeriodEnd: periodEnd,
          lastPaymentStatus: paymentStatus,
          ...(data?.invoiceId ? { nowpaymentsInvoiceId: data.invoiceId } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.subscriptions.id, subscriptionId),
            eq(schema.subscriptions.tenantId, data.tenantId),
            statusAdvancePredicate(
              sql`${schema.subscriptions.lastPaymentStatus}`,
              paymentStatus,
              incomingRank,
            ),
          ),
        )
        .returning({ id: schema.subscriptions.id });
      return Boolean(updated);
    }
    case 'failed':
    case 'expired': {
      const [updated] = await db
        .update(schema.subscriptions)
        .set({ status: 'past_due', lastPaymentStatus: paymentStatus, updatedAt: new Date() })
        .where(
          and(
            eq(schema.subscriptions.id, subscriptionId),
            eq(schema.subscriptions.tenantId, data.tenantId),
            statusAdvancePredicate(
              sql`${schema.subscriptions.lastPaymentStatus}`,
              paymentStatus,
              incomingRank,
            ),
          ),
        )
        .returning({ id: schema.subscriptions.id });
      return Boolean(updated);
    }
    case 'refunded': {
      const [updated] = await db
        .update(schema.subscriptions)
        .set({
          status: 'canceled',
          lastPaymentStatus: paymentStatus,
          canceledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.subscriptions.id, subscriptionId),
            eq(schema.subscriptions.tenantId, data.tenantId),
            statusAdvancePredicate(
              sql`${schema.subscriptions.lastPaymentStatus}`,
              paymentStatus,
              incomingRank,
            ),
          ),
        )
        .returning({ id: schema.subscriptions.id });
      return Boolean(updated);
    }
  }
  return false;
}
