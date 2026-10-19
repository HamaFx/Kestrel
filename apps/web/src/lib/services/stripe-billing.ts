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

// Stripe → Kestrel projection.
//
// Webhook mutations run in fresh tenant transactions. Lookups that cross
// tenants (find the subscription behind a Stripe customer) use the BYPASSRLS
// admin connection when configured; single-tenant self-host falls back to the
// primary connection.

import 'server-only';

import {
  addCredits,
  getAdminDb,
  getDb,
  getSubscription,
  grantCredits,
  expireUnusedSubscriptionGrant,
  schema,
  withTenantDbFresh,
} from '@kestrel/db';
import { createCategorizedLogger } from '@kestrel/shared/logger';
import { and, desc, eq, or } from 'drizzle-orm';
import type Stripe from 'stripe';

const log = createCategorizedLogger('billing', { component: 'stripe' });

function billingDb() {
  return process.env.ADMIN_DATABASE_URL ? getAdminDb() : getDb();
}

function metadataOf(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'string') out[key] = raw;
  }
  return out;
}

function mapStatus(status: Stripe.Subscription.Status): 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired' {
  switch (status) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'canceled':
      return 'canceled';
    case 'incomplete_expired':
      return 'expired';
    case 'past_due':
    case 'unpaid':
    case 'incomplete':
    case 'paused':
    default:
      return 'past_due';
  }
}

function toDate(seconds: number | null | undefined): Date | null {
  return typeof seconds === 'number' && seconds > 0 ? new Date(seconds * 1000) : null;
}

async function findPlanByPriceId(priceId: string | null | undefined) {
  if (!priceId) return null;
  const db = billingDb();
  const [plan] = await db
    .select()
    .from(schema.plans)
    .where(
      or(
        eq(schema.plans.stripePriceId, priceId),
        eq(schema.plans.stripePriceIdYearly, priceId),
      ),
    )
    .limit(1);
  return plan ?? null;
}

async function findTenantForStripeCustomer(stripeCustomerId: string | null | undefined) {
  if (!stripeCustomerId) return null;
  const db = billingDb();
  const [row] = await db
    .select()
    .from(schema.billingCustomers)
    .where(eq(schema.billingCustomers.stripeCustomerId, stripeCustomerId))
    .limit(1);
  return row ?? null;
}

async function resolveTenantUser(input: {
  metadata?: unknown;
  stripeCustomerId?: string | null;
}): Promise<{ tenantId: string; userId: string } | null> {
  const meta = metadataOf(input.metadata);
  if (meta.tenantId && meta.userId) {
    return { tenantId: meta.tenantId, userId: meta.userId };
  }
  const customer = await findTenantForStripeCustomer(input.stripeCustomerId);
  if (customer) return { tenantId: customer.tenantId, userId: customer.userId };
  return null;
}

/** Resolve the human user that owns a tenant (personal-org convention first). */
async function resolveUserForTenant(tenantId: string): Promise<string | null> {
  const db = billingDb();
  const [customer] = await db
    .select({ userId: schema.billingCustomers.userId })
    .from(schema.billingCustomers)
    .where(eq(schema.billingCustomers.tenantId, tenantId))
    .limit(1);
  if (customer?.userId) return customer.userId;
  const [member] = await db
    .select({ userId: schema.organizationMember.userId })
    .from(schema.organizationMember)
    .where(eq(schema.organizationMember.orgId, tenantId))
    .limit(1);
  return member?.userId ?? null;
}

async function findSubscriptionByStripeId(stripeSubscriptionId: string) {
  const db = billingDb();
  const [row] = await db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.stripeSubscriptionId, stripeSubscriptionId))
    .limit(1);
  return row ?? null;
}

/**
 * Insert or update the local subscription projection. One active row per
 * tenant is enforced by the partial unique index, so upgrades update the
 * existing active row instead of inserting a second one.
 */
async function upsertStripeSubscription(input: {
  tenantId: string;
  planId: string;
  stripeSubscriptionId: string;
  stripePriceId: string | null;
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  trialEnd: Date | null;
}): Promise<string> {
  return withTenantDbFresh(input.tenantId, async (db) => {
    const [existingByStripe] = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.stripeSubscriptionId, input.stripeSubscriptionId))
      .limit(1);

    const [existingActive] = existingByStripe
      ? [existingByStripe]
      : await db
          .select()
          .from(schema.subscriptions)
          .where(
            and(
              eq(schema.subscriptions.tenantId, input.tenantId),
              or(
                eq(schema.subscriptions.status, 'active'),
                eq(schema.subscriptions.status, 'trialing'),
              ),
            ),
          )
          .orderBy(desc(schema.subscriptions.createdAt))
          .limit(1);

    if (existingActive) {
      await db
        .update(schema.subscriptions)
        .set({
          planId: input.planId,
          status: input.status,
          stripeSubscriptionId: input.stripeSubscriptionId,
          stripePriceId: input.stripePriceId,
          currentPeriodStart: input.currentPeriodStart,
          currentPeriodEnd: input.currentPeriodEnd,
          cancelAtPeriodEnd: input.cancelAtPeriodEnd,
          trialEnd: input.trialEnd,
          updatedAt: new Date(),
        })
        .where(eq(schema.subscriptions.id, existingActive.id));
      return existingActive.id;
    }

    const [inserted] = await db
      .insert(schema.subscriptions)
      .values({
        tenantId: input.tenantId,
        planId: input.planId,
        status: input.status,
        stripeSubscriptionId: input.stripeSubscriptionId,
        stripePriceId: input.stripePriceId,
        currentPeriodStart: input.currentPeriodStart,
        currentPeriodEnd: input.currentPeriodEnd,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd,
        trialEnd: input.trialEnd,
      })
      .returning({ id: schema.subscriptions.id });
    if (!inserted) throw new Error('Stripe subscription upsert returned no row');
    return inserted.id;
  });
}

async function projectSubscriptionObject(
  subscription: Stripe.Subscription,
  fallback?: { tenantId?: string; userId?: string },
): Promise<string> {
  const priceId = subscription.items.data[0]?.price?.id ?? null;
  const plan = await findPlanByPriceId(priceId);
  if (!plan) throw new Error(`No Kestrel plan is mapped to Stripe price ${priceId ?? '(none)'}`);

  const identity =
    (await resolveTenantUser({
      metadata: subscription.metadata,
      stripeCustomerId:
        typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id,
    })) ??
    (fallback?.tenantId && fallback.userId
      ? { tenantId: fallback.tenantId, userId: fallback.userId }
      : null);
  if (!identity) throw new Error(`Cannot resolve tenant for Stripe subscription ${subscription.id}`);

  const periodItem = subscription.items.data[0];
  const compatibility = subscription as unknown as {
    current_period_start?: number;
    current_period_end?: number;
  };
  return upsertStripeSubscription({
    tenantId: identity.tenantId,
    planId: plan.id,
    stripeSubscriptionId: subscription.id,
    stripePriceId: priceId,
    status: mapStatus(subscription.status),
    currentPeriodStart: toDate(
      periodItem?.current_period_start ?? compatibility.current_period_start,
    ),
    currentPeriodEnd: toDate(periodItem?.current_period_end ?? compatibility.current_period_end),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    trialEnd: toDate(subscription.trial_end),
  });
}

async function grantSubscriptionPeriodCredits(input: {
  tenantId: string;
  userId: string;
  subscriptionId: string;
  planName: string;
  monthlyCredits: number;
  periodStart: Date;
}) {
  if (input.monthlyCredits <= 0) return { granted: 0, idempotent: false };
  const periodKey = input.periodStart.toISOString().slice(0, 10);
  const result = await withTenantDbFresh(input.tenantId, async () => {
    // D4: expire the unused portion of the previous cycle before granting
    // the new one (subscription credits do not roll over).
    await expireUnusedSubscriptionGrant({
      userId: input.userId,
      tenantId: input.tenantId,
      subscriptionId: input.subscriptionId,
      newPeriodStart: input.periodStart,
    });
    return addCredits({
      userId: input.userId,
      tenantId: input.tenantId,
      amountCredits: input.monthlyCredits,
      kind: 'subscription_grant',
      idempotencyKey: `sub:${input.subscriptionId}:${periodKey}`,
      referenceType: 'subscription',
      referenceId: input.subscriptionId,
      metadata: { plan: input.planName, periodStart: input.periodStart.toISOString() },
    });
  });
  return { granted: result.applied ? result.balanceAfter : 0, idempotent: !result.applied };
}

async function recordStripePayment(input: {
  tenantId: string;
  userId: string;
  subscriptionId: string | null;
  stripeInvoiceId?: string | null;
  stripePaymentIntentId?: string | null;
  usdAmountCents: number;
  creditsGranted: number;
  status: 'finished' | 'refunded' | 'failed' | 'waiting';
  billingReason?: string | null;
  payload: unknown;
}) {
  await withTenantDbFresh(input.tenantId, async (db) => {
    await db
      .insert(schema.payments)
      .values({
        tenantId: input.tenantId,
        subscriptionId: input.subscriptionId,
        provider: 'stripe',
        status: input.status,
        usdAmountCents: input.usdAmountCents,
        stripeInvoiceId: input.stripeInvoiceId ?? null,
        stripePaymentIntentId: input.stripePaymentIntentId ?? null,
        creditsGranted: input.creditsGranted,
        billingReason: input.billingReason ?? null,
        ipnPayload: input.payload as Record<string, unknown>,
      })
      .onConflictDoNothing();
  });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const meta = metadataOf(session.metadata);
  const identity =
    (await resolveTenantUser({
      metadata: session.metadata,
      stripeCustomerId:
        typeof session.customer === 'string' ? session.customer : session.customer?.id,
    })) ?? (meta.tenantId && meta.userId ? { tenantId: meta.tenantId, userId: meta.userId } : null);
  if (!identity) throw new Error(`Cannot resolve tenant for checkout session ${session.id}`);

  if (session.mode === 'subscription' && session.subscription) {
    const stripeSubId =
      typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
    // The subscription.* events carry the authoritative object; fetch it here
    // so a missed event cannot leave the projection empty.
    const { retrieveStripeSubscription } = await import('@/lib/stripe');
    const subscription = await retrieveStripeSubscription(stripeSubId);
    const localId = await projectSubscriptionObject(subscription, identity);
    log.info({ sessionId: session.id, subscriptionId: localId }, 'Stripe checkout completed');
    return;
  }

  // One-time top-up. Granting here is idempotent and covers configurations
  // where payment_intent.succeeded is not enabled on the webhook endpoint.
  if (session.mode === 'payment' && meta.productId) {
    const { getTopupProduct } = await import('@kestrel/db');
    const product = await getTopupProduct(meta.productId);
    if (!product) throw new Error(`Top-up product ${meta.productId} not found`);
    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? null);
    // Canonical key shared with `payment_intent.succeeded` — Stripe can
    // deliver both events for one purchase and they must not double-grant.
    const idempotencyKey = paymentIntentId
      ? `stripe:topup:${paymentIntentId}`
      : `stripe:topup:session:${session.id}`;
    const result = await withTenantDbFresh(identity.tenantId, async () =>
      addCredits({
        userId: identity.userId,
        tenantId: identity.tenantId,
        amountCredits: product.credits,
        kind: 'topup_grant',
        idempotencyKey,
        referenceType: 'payment',
        referenceId: paymentIntentId ?? session.id,
        metadata: { productId: product.id, productName: product.name },
      }),
    );
    await recordStripePayment({
      tenantId: identity.tenantId,
      userId: identity.userId,
      subscriptionId: null,
      stripePaymentIntentId: paymentIntentId,
      usdAmountCents: product.priceUsdCents,
      creditsGranted: product.credits,
      status: 'finished',
      billingReason: 'topup',
      payload: session,
    });
    log.info(
      { sessionId: session.id, credits: product.credits, applied: result.applied },
      'Stripe top-up checkout completed',
    );
  }
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const subscriptionRef =
    (invoice as unknown as { subscription?: string | Stripe.Subscription }).subscription ??
    (invoice as unknown as { parent?: { subscription_details?: { subscription?: string | Stripe.Subscription } } })
      .parent?.subscription_details?.subscription;
  const stripeSubId =
    typeof subscriptionRef === 'string' ? subscriptionRef : subscriptionRef?.id ?? null;
  if (!stripeSubId) return;

  let localSub = await findSubscriptionByStripeId(stripeSubId);
  if (!localSub) {
    // Repair a missed subscription webhook.
    const { retrieveStripeSubscription } = await import('@/lib/stripe');
    const remote = await retrieveStripeSubscription(stripeSubId);
    await projectSubscriptionObject(remote);
    localSub = await findSubscriptionByStripeId(stripeSubId);
  }
  if (!localSub) throw new Error(`Local subscription missing for Stripe ${stripeSubId}`);

  const { plan, subscription } = await withTenantDbFresh(localSub.tenantId, async () => {
    const tenantSub = await getSubscription(localSub!.tenantId);
    const [planRow] = await getDb()
      .select()
      .from(schema.plans)
      .where(eq(schema.plans.id, localSub!.planId))
      .limit(1);
    if (!tenantSub || !planRow) throw new Error('Subscription plan missing');
    return { plan: planRow, subscription: tenantSub };
  });

  const periodStart =
    toDate(invoice.period_start) ??
    subscription.currentPeriodStart ??
    new Date(invoice.created * 1000);
  const periodEnd = toDate(invoice.period_end) ?? subscription.currentPeriodEnd ?? null;

  if (periodEnd) {
    await withTenantDbFresh(localSub.tenantId, async (db) => {
      await db
        .update(schema.subscriptions)
        .set({
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          status: 'active',
          updatedAt: new Date(),
        })
        .where(eq(schema.subscriptions.id, localSub!.id));
    });
  }

  const userId = await resolveUserForTenant(localSub.tenantId);
  if (!userId) throw new Error(`No user found for tenant ${localSub.tenantId}`);
  const grant = await grantSubscriptionPeriodCredits({
    tenantId: localSub.tenantId,
    userId,
    subscriptionId: localSub.id,
    planName: plan.name,
    monthlyCredits: Number(plan.monthlyCredits ?? 0),
    periodStart,
  });

  await recordStripePayment({
    tenantId: localSub.tenantId,
    userId,
    subscriptionId: localSub.id,
    stripeInvoiceId: invoice.id,
    stripePaymentIntentId:
      typeof (invoice as unknown as { payment_intent?: string | Stripe.PaymentIntent }).payment_intent ===
      'string'
        ? ((invoice as unknown as { payment_intent: string }).payment_intent ?? null)
        : ((invoice as unknown as { payment_intent?: Stripe.PaymentIntent }).payment_intent?.id ??
          null),
    usdAmountCents: invoice.amount_paid ?? 0,
    creditsGranted: grant.idempotent ? 0 : Number(plan.monthlyCredits ?? 0),
    status: 'finished',
    billingReason: invoice.billing_reason ?? null,
    payload: invoice,
  });

  log.info(
    { invoiceId: invoice.id, subscriptionId: localSub.id, idempotent: grant.idempotent },
    'Stripe invoice paid → credits granted',
  );
}

async function handleTopupPaymentIntent(intent: Stripe.PaymentIntent) {
  const meta = metadataOf(intent.metadata);
  if (!meta.productId) return;
  const identity = await resolveTenantUser({
    metadata: intent.metadata,
    stripeCustomerId:
      typeof intent.customer === 'string' ? intent.customer : intent.customer?.id,
  });
  if (!identity) throw new Error(`Cannot resolve tenant for payment intent ${intent.id}`);

  const { getTopupProduct } = await import('@kestrel/db');
  const product = await getTopupProduct(meta.productId);
  if (!product) throw new Error(`Top-up product ${meta.productId} not found`);

  await withTenantDbFresh(identity.tenantId, async () =>
    addCredits({
      userId: identity.userId,
      tenantId: identity.tenantId,
      amountCredits: product.credits,
      kind: 'topup_grant',
      idempotencyKey: `stripe:topup:${intent.id}`,
      referenceType: 'payment',
      referenceId: intent.id,
      metadata: { productId: product.id, productName: product.name },
    }),
  );

  await recordStripePayment({
    tenantId: identity.tenantId,
    userId: identity.userId,
    subscriptionId: null,
    stripePaymentIntentId: intent.id,
    usdAmountCents: intent.amount_received || product.priceUsdCents,
    creditsGranted: product.credits,
    status: 'finished',
    billingReason: 'topup',
    payload: intent,
  });
}

async function handleChargeRefunded(charge: Stripe.Charge) {
  const paymentIntentId =
    typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntentId) return;
  const db = billingDb();
  const [payment] = await db
    .select()
    .from(schema.payments)
    .where(eq(schema.payments.stripePaymentIntentId, paymentIntentId))
    .limit(1);
  if (!payment || !payment.creditsGranted) return;
  const userId = await resolveUserForTenant(payment.tenantId);
  if (!userId) return;

  await withTenantDbFresh(payment.tenantId, async () =>
    grantCredits({
      userId,
      tenantId: payment.tenantId,
      amountCredits: -Number(payment.creditsGranted),
      kind: 'refund',
      idempotencyKey: `stripe:refund:${charge.id}`,
      referenceType: 'payment',
      referenceId: charge.id,
      metadata: { paymentId: payment.id, paymentIntentId },
    }),
  );
  await withTenantDbFresh(payment.tenantId, async (tenantDb) => {
    await tenantDb
      .update(schema.payments)
      .set({ status: 'refunded', updatedAt: new Date() })
      .where(eq(schema.payments.id, payment.id));
  });
}

/**
 * Repair drift after a missed webhook: re-project the subscription and, when
 * the newest invoice is already paid, replay the idempotent credit grant.
 */
export async function reconcileStripeSubscription(stripeSubscriptionId: string): Promise<{
  found: boolean;
  replayedInvoice: boolean;
}> {
  const local = await findSubscriptionByStripeId(stripeSubscriptionId);
  if (!local) return { found: false, replayedInvoice: false };
  const { getStripe } = await import('@/lib/stripe');
  const stripe = getStripe();
  const remote = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  await projectSubscriptionObject(remote);
  const invoices = await stripe.invoices.list({ subscription: stripeSubscriptionId, limit: 1 });
  const latest = invoices.data[0];
  if (latest?.status === 'paid') {
    await handleInvoicePaid(latest);
    return { found: true, replayedInvoice: true };
  }
  return { found: true, replayedInvoice: false };
}

/** Apply one verified Stripe event. Idempotency is handled by billing_events. */
export async function processStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      return;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await projectSubscriptionObject(event.data.object as Stripe.Subscription);
      return;
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const local = await findSubscriptionByStripeId(subscription.id);
      if (local) {
        await withTenantDbFresh(local.tenantId, async (db) => {
          await db
            .update(schema.subscriptions)
            .set({
              status: subscription.status === 'canceled' ? 'canceled' : 'expired',
              cancelAtPeriodEnd: false,
              currentPeriodEnd:
                toDate(
                  subscription.items.data[0]?.current_period_end ??
                    (
                      subscription as unknown as {
                        current_period_end?: number;
                      }
                    ).current_period_end,
                ) ?? local.currentPeriodEnd,
              updatedAt: new Date(),
            })
            .where(eq(schema.subscriptions.id, local.id));
        });
      }
      return;
    }
    case 'invoice.paid':
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
      return;
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionRef = (invoice as unknown as { subscription?: string | Stripe.Subscription })
        .subscription;
      const stripeSubId =
        typeof subscriptionRef === 'string' ? subscriptionRef : subscriptionRef?.id ?? null;
      if (!stripeSubId) return;
      const local = await findSubscriptionByStripeId(stripeSubId);
      if (local) {
        await withTenantDbFresh(local.tenantId, async (db) => {
          await db
            .update(schema.subscriptions)
            .set({ status: 'past_due', updatedAt: new Date() })
            .where(eq(schema.subscriptions.id, local.id));
        });
      }
      return;
    }
    case 'payment_intent.succeeded':
      await handleTopupPaymentIntent(event.data.object as Stripe.PaymentIntent);
      return;
    case 'charge.refunded':
      await handleChargeRefunded(event.data.object as Stripe.Charge);
      return;
    default:
      log.debug({ type: event.type }, 'Unhandled Stripe event (acknowledged)');
  }
}
