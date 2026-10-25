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

// POST /api/billing/checkout — create a provider checkout and return the
// hosted checkout URL. Stripe/NOWPayments create subscriptions; Gammal
// creates a one-time prepaid pass.
// Auth required. Body: { planId: string, provider?: string } → { checkoutUrl: string }

import { z } from 'zod';

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';
import { getServerEnv } from '@/lib/env';
import { createInvoice } from '@/lib/nowpayments';
import {
  claimCheckoutAttempt,
  completeCheckoutAttempt,
  createPayment,
  ensureBillingCustomer,
  failCheckoutAttempt,
  getBillingCustomer,
  getPlan,
  getTenantDbScope,
  getUserSubscription,
  getUserWithSettings,
  metrics,
  saveCheckoutInvoice,
  upsertSubscription,
  withRateLimit,
  withTenantDbFresh,
} from '@/lib/services/api-boundary';
import { createGammalPassCheckout } from '@/lib/services/gammal-billing';
import { createStripeCheckoutSession, createStripeCustomer } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CheckoutSchema = z.object({
  planId: z.uuid('Invalid plan ID'),
  provider: z.enum(['stripe', 'nowpayments', 'gammal']).optional(),
});

function defaultProvider(env: ReturnType<typeof getServerEnv>): 'stripe' | 'nowpayments' {
  if (env.BILLING_PROVIDER === 'nowpayments') return 'nowpayments';
  if (env.BILLING_PROVIDER === 'both') return 'stripe';
  return 'stripe';
}

function providerAllowed(
  env: ReturnType<typeof getServerEnv>,
  provider: 'stripe' | 'nowpayments' | 'gammal',
): boolean {
  if (provider === 'gammal') return env.BILLING_GAMMAL_ENABLED;
  if (env.BILLING_PROVIDER === 'both') return true;
  if (env.BILLING_PROVIDER === 'stripe') return provider === 'stripe';
  return provider === 'nowpayments';
}

const IDEMPOTENCY_KEY_MAX_LENGTH = 200;

export const POST = withAuth<void>(async (req, { user }) => {
  try {
    const rateLimit = await withRateLimit(user.userId, 'billing_checkout', 10);
    if (!rateLimit.allowed) {
      return Response.json(
        {
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many checkout attempts. Try again shortly.',
          },
        },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }
    const body = await parseJsonBody(req, CheckoutSchema);
    const idempotencyKey = req.headers.get('idempotency-key')?.trim();
    if (!idempotencyKey || idempotencyKey.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
      return Response.json(
        { error: { code: 'VALIDATION', message: 'A valid Idempotency-Key header is required' } },
        { status: 400 },
      );
    }
    const env = getServerEnv();
    if (!env.BILLING_ENABLED) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'Billing is disabled in this deployment' } },
        { status: 404 },
      );
    }

    const plan = await getPlan(body.planId);

    if (!plan) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'Plan not found' } },
        { status: 404 },
      );
    }

    if (plan.priceUsdCents === 0) {
      return Response.json(
        { error: { code: 'BAD_REQUEST', message: 'Free plan does not require checkout' } },
        { status: 400 },
      );
    }

    const provider = body.provider ?? defaultProvider(env);
    if (!providerAllowed(env, provider)) {
      return Response.json(
        { error: { code: 'BAD_REQUEST', message: `Billing provider ${provider} is not enabled` } },
        { status: 400 },
      );
    }

    if (provider === 'stripe' && (!env.BILLING_STRIPE_ENABLED || !env.STRIPE_SECRET_KEY)) {
      return Response.json(
        { error: { code: 'NOT_CONFIGURED', message: 'Stripe billing is not configured' } },
        { status: 503 },
      );
    }
    if (provider === 'stripe' && !plan.stripePriceId) {
      return Response.json(
        { error: { code: 'NOT_CONFIGURED', message: 'This plan has no Stripe price configured' } },
        { status: 503 },
      );
    }
    if (provider === 'nowpayments' && !env.NOWPAYMENTS_API_KEY) {
      return Response.json(
        { error: { code: 'NOT_CONFIGURED', message: 'Billing is not configured' } },
        { status: 503 },
      );
    }
    if (provider === 'gammal' && (!env.BILLING_GAMMAL_ENABLED || !env.GAMMAL_PROJECT_ID)) {
      return Response.json(
        { error: { code: 'NOT_CONFIGURED', message: 'Gammal billing is not configured' } },
        { status: 503 },
      );
    }

    if (provider === 'gammal') {
      const active = await getUserSubscription(user.userId);
      if (active && (active.status === 'active' || active.status === 'trialing')) {
        return Response.json(
          {
            error: {
              code: 'PLAN_ACTIVE',
              message: active.currentPeriodEnd
                ? `You already have an active plan until ${active.currentPeriodEnd.toISOString().slice(0, 10)}.`
                : 'You already have an active plan.',
            },
          },
          { status: 409 },
        );
      }
    }

    const claim = await claimCheckoutAttempt({
      userId: user.userId,
      planId: plan.id,
      idempotencyKey,
    });

    if (claim.kind === 'completed') {
      return Response.json({
        checkoutUrl: claim.attempt.checkoutUrl,
        invoiceId: claim.attempt.invoiceId,
        idempotent: true,
      });
    }
    if (claim.kind === 'in_progress') {
      return Response.json(
        {
          error: {
            code: 'CONFLICT',
            message: 'Checkout is already being created for this Idempotency-Key',
          },
        },
        { status: 409 },
      );
    }
    if (claim.kind === 'conflict') {
      return Response.json(
        {
          error: { code: 'CONFLICT', message: 'Idempotency-Key was already used for another plan' },
        },
        { status: 409 },
      );
    }

    const appUrl = env.NEXT_PUBLIC_APP_URL;
    const orderId = `${user.userId}-${plan.id}-${idempotencyKey}`;
    const priceAmount = plan.priceUsdCents / 100;

    // Billing bookkeeping deliberately runs in its OWN tenant transactions
    // instead of the request-scoped one from withAuth. If any step throws a
    // DB error, the request transaction is left aborted (25P02) and rolled
    // back — which previously wiped claimCheckoutAttempt + saveCheckoutInvoice
    // and lost the created NOWPayments invoice. Fresh transactions keep the
    // claim and the provider invoice durable, and let failCheckoutAttempt
    // persist on a connection that is not poisoned.
    const tenantId = getTenantDbScope()?.tenantId;

    try {
      const recoveredInvoice =
        claim.kind === 'claimed' && claim.attempt.invoiceId && claim.attempt.checkoutUrl
          ? {
              id: claim.attempt.invoiceId,
              invoice_url: claim.attempt.checkoutUrl,
            }
          : null;

      if (provider === 'gammal') {
        if (!tenantId) throw new Error('Checkout requires an active tenant scope');
        if (claim.attempt.status === 'provider_created' && claim.attempt.checkoutUrl) {
          return Response.json({
            checkoutUrl: claim.attempt.checkoutUrl,
            paymentId: claim.attempt.invoiceId,
            provider: 'gammal',
            idempotent: true,
          });
        }

        const created = await createGammalPassCheckout({
          userId: user.userId,
          tenantId,
          plan: {
            id: plan.id,
            name: plan.name,
            priceUsdCents: plan.priceUsdCents,
            interval: plan.interval,
            monthlyCredits: Number(plan.monthlyCredits ?? 0),
          },
          attemptId: claim.attempt.id,
          processingToken: claim.attempt.processingToken!,
        });
        metrics.increment('checkout_completed_total', {
          tags: { provider: 'gammal', plan: plan.name },
        });
        return Response.json({
          checkoutUrl: created.checkoutUrl,
          paymentId: created.paymentId,
          provider: 'gammal',
        });
      }

      if (provider === 'stripe') {
        if (!tenantId) throw new Error('Checkout requires an active tenant scope');
        let session = recoveredInvoice
          ? { id: recoveredInvoice.id, url: recoveredInvoice.invoice_url }
          : null;

        if (!session) {
          const { user: userRow } = await getUserWithSettings(user.userId);
          let customer = await getBillingCustomer(user.userId);
          if (!customer?.stripeCustomerId) {
            const created = await createStripeCustomer({
              email: userRow?.email ?? null,
              name: userRow?.name ?? null,
              metadata: { userId: user.userId, tenantId },
            });
            await ensureBillingCustomer(user.userId, {
              tenantId,
              stripeCustomerId: created.id,
            });
            customer = await getBillingCustomer(user.userId);
          }
          if (!customer?.stripeCustomerId) {
            throw new Error('Stripe customer mapping could not be created');
          }

          const createdSession = await createStripeCheckoutSession({
            customerId: customer.stripeCustomerId,
            priceId: plan.stripePriceId!,
            mode: 'subscription',
            successUrl: `${appUrl}/settings/billing?status=success`,
            cancelUrl: `${appUrl}/settings/billing?status=cancelled`,
            idempotencyKey: `checkout:${tenantId}:${idempotencyKey}`,
            metadata: {
              userId: user.userId,
              tenantId,
              planId: plan.id,
              idempotencyKey,
            },
            subscriptionMetadata: {
              userId: user.userId,
              tenantId,
              planId: plan.id,
            },
          });
          if (!createdSession.url) throw new Error('Stripe Checkout returned no URL');
          session = { id: createdSession.id, url: createdSession.url };
          await withTenantDbFresh(tenantId, () =>
            saveCheckoutInvoice({
              attemptId: claim.attempt.id,
              invoiceId: createdSession.id,
              checkoutUrl: createdSession.url!,
              processingToken: claim.attempt.processingToken!,
            }),
          );
        }

        await withTenantDbFresh(tenantId, () =>
          completeCheckoutAttempt({
            attemptId: claim.attempt.id,
            invoiceId: session!.id,
            checkoutUrl: session!.url,
            processingToken: claim.attempt.processingToken!,
          }),
        );
        metrics.increment('checkout_completed_total', {
          tags: { provider: 'stripe', plan: plan.name },
        });
        return Response.json({
          checkoutUrl: session.url,
          sessionId: session.id,
          invoiceId: session.id,
          provider: 'stripe',
        });
      }

      const invoice =
        recoveredInvoice ??
        (await createInvoice({
          price_amount: priceAmount,
          price_currency: 'usd',
          pay_currency: plan.payCurrency ?? 'usdt',
          order_id: orderId,
          order_description: `${plan.name} subscription — Kestrel`,
          success_url: `${appUrl}/settings/billing?status=success`,
          cancelled_url: `${appUrl}/settings/billing?status=cancelled`,
        }));

      if (!recoveredInvoice) {
        if (!tenantId) throw new Error('Checkout requires an active tenant scope');
        await withTenantDbFresh(tenantId, () =>
          saveCheckoutInvoice({
            attemptId: claim.attempt.id,
            invoiceId: invoice.id,
            checkoutUrl: invoice.invoice_url,
            processingToken: claim.attempt.processingToken!,
          }),
        );
      }

      if (!tenantId) throw new Error('Checkout requires an active tenant scope');
      await withTenantDbFresh(tenantId, async () => {
        const subscriptionId = await upsertSubscription(user.userId, {
          planId: plan.id,
          nowpaymentsInvoiceId: invoice.id,
        });
        await createPayment({
          subscriptionId,
          userId: user.userId,
          nowpaymentsInvoiceId: invoice.id,
          payCurrency: plan.payCurrency ?? 'usdt',
        });
        await completeCheckoutAttempt({
          attemptId: claim.attempt.id,
          invoiceId: invoice.id,
          checkoutUrl: invoice.invoice_url,
          processingToken: claim.attempt.processingToken!,
        });
      });

      metrics.increment('checkout_completed_total', {
        tags: { provider: 'nowpayments', plan: plan.name },
      });
      return Response.json({ checkoutUrl: invoice.invoice_url, invoiceId: invoice.id });
    } catch (err) {
      const failureMessage = err instanceof Error ? err.message : String(err);
      if (tenantId) {
        // Persist the failure outside the (possibly aborted) request
        // transaction so a retry can reclaim the claim row.
        await withTenantDbFresh(tenantId, () =>
          failCheckoutAttempt(claim.attempt.id, failureMessage, claim.attempt.processingToken!),
        ).catch(() => {});
      } else {
        await failCheckoutAttempt(
          claim.attempt.id,
          failureMessage,
          claim.attempt.processingToken!,
        ).catch(() => {});
      }
      throw err;
    }
  } catch (err) {
    return errorResponse(err, req);
  }
});
