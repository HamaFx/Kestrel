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

// SPDX-License-Identifier: Apache-2.0

// Gammal Tech → Kestrel projection.
//
// Gammal is a one-time payment rail. A successful payment activates a prepaid
// plan pass; it never creates an auto-renewing subscription. Payment events
// arrive from the browser return URL and/or a webhook, and both paths converge
// on the same idempotent activation function.

import 'server-only';

import { randomUUID } from 'node:crypto';

import {
  addCredits,
  completeCheckoutAttempt,
  expireUnusedSubscriptionGrant,
  getAdminDb,
  getBillingUserIdForTenant,
  getDb,
  getPlan,
  grantCredits,
  requireTenantIdForUser,
  saveCheckoutInvoice,
  schema,
  withTenantDbFresh,
} from '@kestrel/db';
import { createCategorizedLogger } from '@kestrel/shared/logger';
import { and, desc, eq, inArray, isNotNull, lt, sql } from 'drizzle-orm';

import { getServerEnv } from '@/lib/env';
import {
  buildGammalPaymentLink,
  extractGammalOrderRef,
  gammalAmountToCents,
  getGammalProjectId,
  passDaysForPlanInterval,
  verifyGammalToken,
  type GammalClaims,
} from '@/lib/gammal';

const log = createCategorizedLogger('billing', { component: 'gammal' });

type BillingDb = ReturnType<typeof getDb> | ReturnType<typeof getAdminDb>;

type GammalPlan = {
  id: string;
  name: string;
  priceUsdCents: number;
  interval: string;
  monthlyCredits: number;
};

function billingDb(): BillingDb {
  return process.env.ADMIN_DATABASE_URL ? getAdminDb() : getDb();
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export interface CreateGammalPassInput {
  userId: string;
  tenantId: string;
  plan: GammalPlan;
  attemptId: string;
  processingToken: string;
}

/**
 * Create a local payment row and return the Gammal hosted payment link.
 *
 * `payment.id` is deliberately also the Gammal `desc` reference and the
 * callback's `payment` parameter. It is a UUID, so retries can recover the
 * local order without trusting a provider-side invoice id.
 */
export async function createGammalPassCheckout(
  input: CreateGammalPassInput,
): Promise<{ checkoutUrl: string; paymentId: string }> {
  const env = getServerEnv();
  if (env.GAMMAL_CURRENCY.toUpperCase() !== 'USD') {
    throw new Error('Gammal billing is configured for USD only');
  }
  if (input.plan.priceUsdCents <= 0) {
    throw new Error('Gammal checkout requires a paid plan');
  }

  const projectId = getGammalProjectId();
  const paymentId = randomUUID();
  const appUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '');
  const callbackUrl = `${appUrl}/settings/billing/gammal/return?payment=${paymentId}`;
  const description = `Kestrel ${input.plan.name} pass ${paymentId}`.slice(0, 200);
  const checkoutUrl = buildGammalPaymentLink({
    projectId,
    amountCents: input.plan.priceUsdCents,
    currency: env.GAMMAL_CURRENCY,
    description,
    callbackUrl,
  });

  await withTenantDbFresh(input.tenantId, async (db) => {
    await db.insert(schema.payments).values({
      id: paymentId,
      tenantId: input.tenantId,
      subscriptionId: null,
      provider: 'gammal',
      status: 'waiting',
      gammalOrderRef: paymentId,
      gammalAmountCents: input.plan.priceUsdCents,
      gammalCurrency: env.GAMMAL_CURRENCY.toUpperCase(),
      usdAmountCents: input.plan.priceUsdCents,
      ipnPayload: {
        kind: 'pass',
        planId: input.plan.id,
        planName: input.plan.name,
        userId: input.userId,
        tenantId: input.tenantId,
      },
    });
  });

  // Two-step claim completion mirrors the Stripe flow: `provider_created`
  // makes the link durable before the local attempt is marked completed.
  await saveCheckoutInvoice({
    attemptId: input.attemptId,
    invoiceId: paymentId,
    checkoutUrl,
    processingToken: input.processingToken,
  });
  await completeCheckoutAttempt({
    attemptId: input.attemptId,
    invoiceId: paymentId,
    checkoutUrl,
    processingToken: input.processingToken,
  });

  return { checkoutUrl, paymentId };
}

async function findGammalPayment(
  claims: GammalClaims,
  localPaymentId?: string,
): Promise<typeof schema.payments.$inferSelect | null> {
  const db = billingDb();
  if (localPaymentId) {
    const [byId] = await db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.id, localPaymentId))
      .limit(1);
    if (byId) return byId;
  }
  if (claims.type === 'refund' && claims.sale_txn) {
    const [byTxn] = await db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.gammalTxn, claims.sale_txn))
      .limit(1);
    if (byTxn) return byTxn;
  }
  const orderRef = extractGammalOrderRef(claims.description);
  if (orderRef) {
    const [byRef] = await db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.gammalOrderRef, orderRef))
      .limit(1);
    if (byRef) return byRef;
  }
  const [byTxn] = await db
    .select()
    .from(schema.payments)
    .where(eq(schema.payments.gammalTxn, claims.txn))
    .limit(1);
  return byTxn ?? null;
}

function assertGammalPaymentMatches(
  payment: typeof schema.payments.$inferSelect,
  claims: GammalClaims,
): void {
  if (payment.provider !== 'gammal') {
    throw new Error('Gammal token does not belong to a Gammal payment');
  }
  if (claims.project_id !== getGammalProjectId()) {
    throw new Error('Gammal token project does not match this deployment');
  }
  const currency = getServerEnv().GAMMAL_CURRENCY.toUpperCase();
  if (claims.currency.toUpperCase() !== (payment.gammalCurrency ?? currency)) {
    throw new Error('Gammal token currency does not match the local order');
  }
  const expected = payment.gammalAmountCents ?? payment.usdAmountCents ?? null;
  if (expected == null || gammalAmountToCents(claims.amount) !== expected) {
    throw new Error('Gammal token amount does not match the local order');
  }
}

async function processGammalPayment(
  claims: GammalClaims,
  payment: typeof schema.payments.$inferSelect,
): Promise<'processed' | 'already'> {
  const env = getServerEnv();
  const userId = await getBillingUserIdForTenant(payment.tenantId);
  if (!userId) throw new Error(`No user found for tenant ${payment.tenantId}`);

  const payload = asRecord(payment.ipnPayload);
  const planId = typeof payload.planId === 'string' ? payload.planId : null;
  if (!planId) throw new Error('Gammal payment has no planId in its payload');
  const plan = await getPlan(planId);
  if (!plan) throw new Error(`Plan ${planId} not found`);

  const passDays = passDaysForPlanInterval(plan.interval, env.GAMMAL_PASS_DAYS);
  const now = new Date();

  return withTenantDbFresh(payment.tenantId, async (db) => {
    // Serialise pass activation per tenant so two paid checkouts cannot race
    // the partial unique index for the one active subscription.
    await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${payment.tenantId}))`);
    const [locked] = await db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.id, payment.id))
      .for('update')
      .limit(1);
    if (!locked) throw new Error(`Payment ${payment.id} disappeared during activation`);
    assertGammalPaymentMatches(locked, claims);

    if (locked.status === 'finished' && locked.gammalTxn === claims.txn) {
      return 'already' as const;
    }

    const [existing] = await db
      .select()
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.tenantId, payment.tenantId),
          inArray(schema.subscriptions.status, ['active', 'trialing']),
        ),
      )
      .orderBy(desc(schema.subscriptions.createdAt))
      .for('update')
      .limit(1);

    if (existing?.provider && existing.provider !== 'gammal') {
      throw new Error(
        `Cannot activate a Gammal pass while a ${existing.provider} subscription is active`,
      );
    }

    const periodStart =
      existing?.currentPeriodEnd && existing.currentPeriodEnd.getTime() > now.getTime()
        ? existing.currentPeriodEnd
        : now;
    const periodEnd = addDays(periodStart, passDays);

    let subscriptionId: string;
    if (existing) {
      subscriptionId = existing.id;
      await db
        .update(schema.subscriptions)
        .set({
          planId: plan.id,
          status: 'active',
          provider: 'gammal',
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: true,
          canceledAt: null,
          trialEnd: null,
          updatedAt: now,
        })
        .where(eq(schema.subscriptions.id, existing.id));
      // No rollover: expire the unused portion of the previous pass cycle.
      await expireUnusedSubscriptionGrant({
        userId,
        tenantId: payment.tenantId,
        subscriptionId,
        newPeriodStart: periodStart,
        db,
      });
    } else {
      const [created] = await db
        .insert(schema.subscriptions)
        .values({
          tenantId: payment.tenantId,
          planId: plan.id,
          status: 'active',
          provider: 'gammal',
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: true,
        })
        .returning({ id: schema.subscriptions.id });
      if (!created) throw new Error('Gammal pass subscription insert returned no row');
      subscriptionId = created.id;
    }

    const credits = Number(plan.monthlyCredits ?? 0);
    if (credits > 0) {
      const periodKey = periodStart.toISOString().slice(0, 10);
      await grantCredits({
        userId,
        tenantId: payment.tenantId,
        amountCredits: credits,
        kind: 'subscription_grant',
        idempotencyKey: `sub:${subscriptionId}:${periodKey}`,
        referenceType: 'subscription',
        referenceId: subscriptionId,
        metadata: {
          plan: plan.name,
          periodStart: periodStart.toISOString(),
          provider: 'gammal',
          paymentId: payment.id,
        },
        db,
      });
    }

    await db
      .update(schema.payments)
      .set({
        subscriptionId,
        status: 'finished',
        gammalTxn: claims.txn,
        gammalAmountCents: gammalAmountToCents(claims.amount),
        gammalCurrency: claims.currency.toUpperCase(),
        creditsGranted: credits,
        ipnPayload: claims,
        updatedAt: now,
      })
      .where(eq(schema.payments.id, payment.id));

    log.info(
      {
        paymentId: payment.id,
        subscriptionId,
        planId: plan.id,
        periodEnd: periodEnd.toISOString(),
        txn: claims.txn,
      },
      'Gammal pass activated',
    );
    return 'processed' as const;
  });
}

async function processGammalRefund(
  claims: GammalClaims,
  payment: typeof schema.payments.$inferSelect,
): Promise<'processed' | 'already'> {
  const userId = await getBillingUserIdForTenant(payment.tenantId);
  if (!userId) throw new Error(`No user found for tenant ${payment.tenantId}`);
  const revoke = claims.event === 'payment.refunded' || claims.event === 'payment.disputed';
  const restore =
    claims.event === 'payment.dispute_reversed' || claims.event === 'payment.refund_failed';
  if (!revoke && !restore) throw new Error(`Unsupported Gammal refund event ${claims.event}`);

  return withTenantDbFresh(payment.tenantId, async (db) => {
    const [locked] = await db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.id, payment.id))
      .for('update')
      .limit(1);
    if (!locked) throw new Error(`Payment ${payment.id} disappeared during refund`);
    if (locked.gammalRefundTxn === claims.txn) return 'already' as const;
    if (revoke && locked.status === 'refunded') return 'already' as const;

    const credits = Number(locked.creditsGranted ?? 0);
    if (revoke) {
      if (credits > 0) {
        await grantCredits({
          userId,
          tenantId: payment.tenantId,
          amountCredits: -credits,
          kind: 'refund',
          idempotencyKey: `gammal:refund:${claims.txn}`,
          referenceType: 'payment',
          referenceId: locked.id,
          metadata: {
            reason: claims.reason ?? null,
            full: claims.full ?? true,
            ratio: claims.ratio ?? null,
            provider: 'gammal',
          },
          db,
        });
      }
      await db
        .update(schema.payments)
        .set({
          status: 'refunded',
          gammalRefundTxn: claims.txn,
          ipnPayload: claims,
          updatedAt: new Date(),
        })
        .where(eq(schema.payments.id, locked.id));
      if (locked.subscriptionId) {
        await db
          .update(schema.subscriptions)
          .set({
            status: 'canceled',
            canceledAt: new Date(),
            cancelAtPeriodEnd: false,
            updatedAt: new Date(),
          })
          .where(eq(schema.subscriptions.id, locked.subscriptionId));
      }
    } else {
      if (credits > 0) {
        await addCredits({
          userId,
          tenantId: payment.tenantId,
          amountCredits: credits,
          kind: 'topup_grant',
          idempotencyKey: `gammal:restore:${claims.txn}`,
          referenceType: 'payment',
          referenceId: locked.id,
          metadata: { event: claims.event ?? null, provider: 'gammal' },
          db,
        });
      }
      await db
        .update(schema.payments)
        .set({
          status: 'finished',
          gammalRefundTxn: claims.txn,
          ipnPayload: claims,
          updatedAt: new Date(),
        })
        .where(eq(schema.payments.id, locked.id));
      if (locked.subscriptionId) {
        const [sub] = await db
          .select()
          .from(schema.subscriptions)
          .where(eq(schema.subscriptions.id, locked.subscriptionId))
          .limit(1);
        if (sub && (!sub.currentPeriodEnd || sub.currentPeriodEnd.getTime() > Date.now())) {
          await db
            .update(schema.subscriptions)
            .set({ status: 'active', canceledAt: null, updatedAt: new Date() })
            .where(eq(schema.subscriptions.id, sub.id));
        }
      }
    }

    log.info(
      {
        paymentId: locked.id,
        event: claims.event,
        txn: claims.txn,
        saleTxn: claims.sale_txn,
      },
      'Gammal refund notice processed',
    );
    return 'processed' as const;
  });
}

/**
 * Apply verified Gammal claims. Safe to call from both the webhook and the
 * browser return page; the payment row lock + ledger idempotency keys make
 * duplicate delivery a no-op.
 */
export async function processGammalClaims(
  claims: GammalClaims,
  opts: { localPaymentId?: string } = {},
): Promise<'processed' | 'already' | 'ignored'> {
  const payment = await findGammalPayment(claims, opts.localPaymentId);
  if (!payment) {
    log.warn({ txn: claims.txn }, 'Gammal payment not found for verified claims');
    return 'ignored';
  }
  if (claims.type === 'refund') {
    return processGammalRefund(claims, payment);
  }
  if (payment.status === 'refunded') {
    log.warn(
      { paymentId: payment.id, txn: claims.txn },
      'Ignoring payment success for refunded order',
    );
    return 'ignored';
  }
  return processGammalPayment(claims, payment);
}

/** Return-page path: verify the token, bind it to the current tenant, process. */
export async function syncGammalPaymentToken(input: {
  userId: string;
  localPaymentId: string;
  token: string;
}): Promise<'processed' | 'already' | 'ignored'> {
  const claims = await verifyGammalToken(input.token);
  const orderRef = extractGammalOrderRef(claims.description);
  if (orderRef && orderRef !== input.localPaymentId) {
    throw new Error('Gammal token does not match this payment link');
  }
  const tenantId = await requireTenantIdForUser(input.userId);
  const db = billingDb();
  const [payment] = await db
    .select({ id: schema.payments.id, tenantId: schema.payments.tenantId })
    .from(schema.payments)
    .where(
      and(eq(schema.payments.id, input.localPaymentId), eq(schema.payments.tenantId, tenantId)),
    )
    .limit(1);
  if (!payment) throw new Error('Payment not found for this account');
  return processGammalClaims(claims, { localPaymentId: input.localPaymentId });
}

/** Expire prepaid Gammal passes whose paid period has ended. */
export async function expireGammalPasses(now = new Date()): Promise<number> {
  const db = billingDb();
  const rows = await db
    .select({
      id: schema.subscriptions.id,
      tenantId: schema.subscriptions.tenantId,
      currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
    })
    .from(schema.subscriptions)
    .where(
      and(
        eq(schema.subscriptions.provider, 'gammal'),
        eq(schema.subscriptions.status, 'active'),
        eq(schema.subscriptions.cancelAtPeriodEnd, true),
        isNotNull(schema.subscriptions.currentPeriodEnd),
        lt(schema.subscriptions.currentPeriodEnd, now),
      ),
    )
    .limit(200);

  let expired = 0;
  for (const row of rows) {
    if (!row.currentPeriodEnd) continue;
    const userId = await getBillingUserIdForTenant(row.tenantId);
    if (!userId) continue;
    try {
      await withTenantDbFresh(row.tenantId, async (tenantDb) => {
        await expireUnusedSubscriptionGrant({
          userId,
          tenantId: row.tenantId,
          subscriptionId: row.id,
          newPeriodStart: now,
          db: tenantDb,
        });
        await tenantDb
          .update(schema.subscriptions)
          .set({
            status: 'expired',
            cancelAtPeriodEnd: false,
            updatedAt: now,
          })
          .where(eq(schema.subscriptions.id, row.id));
      });
      expired += 1;
    } catch (err) {
      log.error({ subscriptionId: row.id, err: String(err) }, 'Failed to expire Gammal pass');
    }
  }
  return expired;
}
