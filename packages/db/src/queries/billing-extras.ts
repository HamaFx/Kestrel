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

// Billing query helpers — plans, subscriptions, payments.

import { randomUUID } from 'node:crypto';

import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';

import { getDb, schema } from '../client';
import { requireTenantIdForUser } from '../tenant';

/** Get all active plans. */
export async function listActivePlans() {
  const db = getDb();
  return db.select().from(schema.plans).where(eq(schema.plans.isActive, true));
}

/** Get a single plan by ID. Returns null if not found. */
export async function getPlan(planId: string) {
  const db = getDb();
  const [plan] = await db.select().from(schema.plans).where(eq(schema.plans.id, planId)).limit(1);
  return plan ?? null;
}

/** Get a user's subscription. Returns null if not subscribed. */
export async function getUserSubscription(userId: string) {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId);
  // Historical rows (canceled/expired) can coexist with the active one, so
  // always read the newest row for the tenant.
  const [sub] = await db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.tenantId, tenantId))
    .orderBy(desc(schema.subscriptions.createdAt))
    .limit(1);
  return sub ?? null;
}

/** Get a user's payment history, newest first, limited to `limit` rows. */
export async function getUserPayments(userId: string, limit: number = 50) {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId);
  return db
    .select()
    .from(schema.payments)
    .where(eq(schema.payments.tenantId, tenantId))
    .orderBy(desc(schema.payments.createdAt))
    .limit(limit);
}

/**
 * Upsert a subscription for a user in one atomic statement.
 *
 * The previous SELECT-then-INSERT/UPDATE raced under concurrent checkout or
 * webhook calls: both saw no row and both INSERTed, violating
 * `subscriptions_tenant_active_idx` (SQLSTATE 23505). `ON CONFLICT` against
 * that partial unique index serialises the claim — the loser of the race
 * updates the winner's row instead of crashing.
 *
 * Non-active historical rows (canceled/expired/past_due) do not conflict; a
 * fresh active row is inserted for the tenant, matching the index's intent of
 * preserving history.
 */
export async function upsertSubscription(
  userId: string,
  data: { planId: string; nowpaymentsInvoiceId: string },
): Promise<string> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId);
  const now = new Date();
  const [row] = await db
    .insert(schema.subscriptions)
    .values({
      tenantId,
      planId: data.planId,
      status: 'active',
      provider: 'nowpayments',
      nowpaymentsInvoiceId: data.nowpaymentsInvoiceId,
    })
    .onConflictDoUpdate({
      target: [schema.subscriptions.tenantId],
      targetWhere: sql`${schema.subscriptions.status} IN ('active', 'trialing')`,
      set: {
        planId: data.planId,
        status: 'active',
        provider: 'nowpayments',
        nowpaymentsInvoiceId: data.nowpaymentsInvoiceId,
        updatedAt: now,
      },
    })
    .returning({ id: schema.subscriptions.id });
  return row!.id;
}

/**
 * Atomically claim a checkout idempotency key before calling NOWPayments.
 * Pending claims remain in progress until explicitly failed; this avoids
 * creating duplicate provider invoices while an original request may still
 * be in flight. Failed claims can be safely reclaimed.
 */
export async function claimCheckoutAttempt(data: {
  userId: string;
  planId: string;
  idempotencyKey: string;
}): Promise<
  | { kind: 'claimed'; attempt: typeof schema.billingCheckoutAttempts.$inferSelect }
  | { kind: 'completed'; attempt: typeof schema.billingCheckoutAttempts.$inferSelect }
  | { kind: 'in_progress' }
  | { kind: 'conflict' }
> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(data.userId);
  const processingToken = randomUUID();
  const [inserted] = await db
    .insert(schema.billingCheckoutAttempts)
    .values({
      tenantId,
      planId: data.planId,
      idempotencyKey: data.idempotencyKey,
      status: 'pending',
      processingAt: new Date(),
      processingToken,
    })
    .onConflictDoNothing({
      target: [
        schema.billingCheckoutAttempts.tenantId,
        schema.billingCheckoutAttempts.idempotencyKey,
      ],
    })
    .returning();

  if (inserted) return { kind: 'claimed', attempt: inserted };

  const [existing] = await db
    .select()
    .from(schema.billingCheckoutAttempts)
    .where(
      and(
        eq(schema.billingCheckoutAttempts.tenantId, tenantId),
        eq(schema.billingCheckoutAttempts.idempotencyKey, data.idempotencyKey),
      ),
    )
    .limit(1);

  if (!existing) return { kind: 'conflict' };
  if (existing.planId !== data.planId) return { kind: 'conflict' };
  if (existing.status === 'completed' && existing.invoiceId && existing.checkoutUrl) {
    return { kind: 'completed', attempt: existing };
  }
  if (existing.status === 'provider_created' && existing.invoiceId && existing.checkoutUrl) {
    // The provider invoice is durable, but the local subscription/payment
    // bookkeeping may still be in flight. Acquire a short lease so a
    // concurrent retry cannot complete that bookkeeping twice. A crashed
    // request is reclaimable after ten minutes.
    const now = new Date();
    const leaseCutoff = new Date(now.getTime() - 10 * 60_000);
    const [resumed] = await db
      .update(schema.billingCheckoutAttempts)
      .set({ processingAt: now, processingToken: randomUUID(), updatedAt: now })
      .where(
        and(
          eq(schema.billingCheckoutAttempts.id, existing.id),
          eq(schema.billingCheckoutAttempts.status, 'provider_created'),
          or(
            isNull(schema.billingCheckoutAttempts.processingAt),
            lt(schema.billingCheckoutAttempts.processingAt, leaseCutoff),
          ),
        ),
      )
      .returning();
    return resumed ? { kind: 'claimed', attempt: resumed } : { kind: 'in_progress' };
  }
  if (existing.status === 'failed') {
    const [reclaimed] = await db
      .update(schema.billingCheckoutAttempts)
      .set({
        status: 'pending',
        error: null,
        processingAt: new Date(),
        processingToken: randomUUID(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.billingCheckoutAttempts.id, existing.id),
          eq(schema.billingCheckoutAttempts.status, 'failed'),
        ),
      )
      .returning();
    return reclaimed ? { kind: 'claimed', attempt: reclaimed } : { kind: 'in_progress' };
  }
  return { kind: 'in_progress' };
}

/** Provider-created attempts always reuse their saved external invoice. */
export async function saveCheckoutInvoice(data: {
  attemptId: string;
  invoiceId: string;
  checkoutUrl: string;
  processingToken: string;
}): Promise<void> {
  const db = getDb();
  const [saved] = await db
    .update(schema.billingCheckoutAttempts)
    .set({
      status: 'provider_created',
      invoiceId: data.invoiceId,
      checkoutUrl: data.checkoutUrl,
      error: null,
      processingAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.billingCheckoutAttempts.id, data.attemptId),
        eq(schema.billingCheckoutAttempts.processingToken, data.processingToken),
      ),
    )
    .returning();
  if (!saved) throw new Error('Checkout claim lease was lost before invoice persistence');
}

/** Mark a claimed checkout as complete and persist the stable response. */
export async function completeCheckoutAttempt(data: {
  attemptId: string;
  invoiceId: string;
  checkoutUrl: string;
  processingToken: string;
}): Promise<void> {
  const db = getDb();
  const [completed] = await db
    .update(schema.billingCheckoutAttempts)
    .set({
      status: 'completed',
      invoiceId: data.invoiceId,
      checkoutUrl: data.checkoutUrl,
      error: null,
      processingAt: null,
      processingToken: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.billingCheckoutAttempts.id, data.attemptId),
        eq(schema.billingCheckoutAttempts.processingToken, data.processingToken),
      ),
    )
    .returning();
  if (!completed) throw new Error('Checkout claim lease was lost before completion');
}

/** Mark a failed checkout claim so a retry can safely reclaim it. */
export async function failCheckoutAttempt(
  attemptId: string,
  error: string,
  processingToken: string,
): Promise<void> {
  const db = getDb();
  const [failed] = await db
    .update(schema.billingCheckoutAttempts)
    .set({
      status: 'failed',
      error,
      processingAt: null,
      processingToken: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.billingCheckoutAttempts.id, attemptId),
        eq(schema.billingCheckoutAttempts.processingToken, processingToken),
      ),
    )
    .returning();
  if (!failed) throw new Error('Checkout claim lease was lost before failure persistence');
}

/** Record a one-time top-up payment (no subscription row). */
export async function createTopupPayment(data: {
  userId: string;
  provider: 'nowpayments' | 'stripe';
  externalId: string;
  invoiceId?: string;
  usdAmountCents: number;
  creditsGranted: number;
  payload?: unknown;
}) {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(data.userId);
  const [payment] = await db
    .insert(schema.payments)
    .values({
      tenantId,
      subscriptionId: null,
      provider: data.provider,
      status: 'finished',
      usdAmountCents: data.usdAmountCents,
      creditsGranted: data.creditsGranted,
      ...(data.provider === 'nowpayments'
        ? {
            nowpaymentsPaymentId: data.externalId,
            nowpaymentsInvoiceId: data.invoiceId ?? null,
          }
        : { stripePaymentIntentId: data.externalId }),
      ...(data.payload ? { ipnPayload: data.payload as Record<string, unknown> } : {}),
    })
    .onConflictDoNothing()
    .returning();
  return payment ?? null;
}

/**
 * Create a new payment record.
 */
export async function createPayment(data: {
  subscriptionId: string;
  userId: string;
  nowpaymentsPaymentId?: string;
  nowpaymentsInvoiceId: string;
  payCurrency: string;
}) {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(data.userId);
  const [payment] = await db
    .insert(schema.payments)
    .values({
      subscriptionId: data.subscriptionId,
      tenantId,
      ...(data.nowpaymentsPaymentId ? { nowpaymentsPaymentId: data.nowpaymentsPaymentId } : {}),
      nowpaymentsInvoiceId: data.nowpaymentsInvoiceId,
      status: 'waiting',
      payCurrency: data.payCurrency,
    })
    .onConflictDoNothing({ target: schema.payments.nowpaymentsInvoiceId })
    .returning();

  if (payment) return payment;

  // The provider invoice is the stable idempotency key before a payment ID
  // exists. A retry after a local failure must reuse the existing accounting
  // row rather than turn a single invoice into two payments.
  const [existing] = await db
    .select()
    .from(schema.payments)
    .where(
      and(
        eq(schema.payments.nowpaymentsInvoiceId, data.nowpaymentsInvoiceId),
        eq(schema.payments.tenantId, tenantId),
      ),
    )
    .limit(1);
  if (!existing) {
    throw new Error(
      `Payment row for invoice ${data.nowpaymentsInvoiceId} disappeared after an idempotent insert`,
    );
  }
  return existing;
}
