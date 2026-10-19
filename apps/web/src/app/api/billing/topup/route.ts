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

// POST /api/billing/topup — buy a one-time credit pack.
// Auth required. Body: { productId, provider? } → { checkoutUrl, … }.

import { z } from 'zod';

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';
import { getServerEnv } from '@/lib/env';
import { createInvoice } from '@/lib/nowpayments';
import { createStripeCheckoutSession, createStripeCustomer } from '@/lib/stripe';
import {
  ensureBillingCustomer,
  getBillingCustomer,
  getTenantDbScope,
  getTopupProduct,
  getUserWithSettings,
  withRateLimit,
} from '@/lib/services/api-boundary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TopupSchema = z.object({
  productId: z.uuid('Invalid product ID'),
  provider: z.enum(['stripe', 'nowpayments']).optional(),
});

export const POST = withAuth<void>(async (req, { user }) => {
  try {
    const rateLimit = await withRateLimit(user.userId, 'billing_checkout', 10);
    if (!rateLimit.allowed) {
      return Response.json(
        { error: { code: 'RATE_LIMITED', message: 'Too many checkout attempts. Try again shortly.' } },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }
    const body = await parseJsonBody(req, TopupSchema);
    const idempotencyKey = req.headers.get('idempotency-key')?.trim();
    if (!idempotencyKey || idempotencyKey.length > 200) {
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
    if (!env.BILLING_TOPUPS_ENABLED) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'Credit top-ups are disabled' } },
        { status: 404 },
      );
    }

    const provider =
      body.provider ?? (env.BILLING_PROVIDER === 'nowpayments' ? 'nowpayments' : 'stripe');
    if (env.BILLING_PROVIDER !== 'both' && env.BILLING_PROVIDER !== provider) {
      return Response.json(
        { error: { code: 'BAD_REQUEST', message: `Billing provider ${provider} is not enabled` } },
        { status: 400 },
      );
    }

    const product = await getTopupProduct(body.productId);
    if (!product) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'Top-up product not found' } },
        { status: 404 },
      );
    }

    const tenantId = getTenantDbScope()?.tenantId;
    if (!tenantId) throw new Error('Top-up requires an active tenant scope');
    const appUrl = env.NEXT_PUBLIC_APP_URL;

    if (provider === 'stripe') {
      if (!env.BILLING_STRIPE_ENABLED || !env.STRIPE_SECRET_KEY) {
        return Response.json(
          { error: { code: 'NOT_CONFIGURED', message: 'Stripe billing is not configured' } },
          { status: 503 },
        );
      }
      if (!product.stripePriceId) {
        return Response.json(
          { error: { code: 'NOT_CONFIGURED', message: 'This pack has no Stripe price configured' } },
          { status: 503 },
        );
      }

      const { user: userRow } = await getUserWithSettings(user.userId);
      let customer = await getBillingCustomer(user.userId);
      if (!customer?.stripeCustomerId) {
        const created = await createStripeCustomer({
          email: userRow?.email ?? null,
          name: userRow?.name ?? null,
          metadata: { userId: user.userId, tenantId },
        });
        await ensureBillingCustomer(user.userId, { tenantId, stripeCustomerId: created.id });
        customer = await getBillingCustomer(user.userId);
      }
      if (!customer?.stripeCustomerId) throw new Error('Stripe customer mapping could not be created');

      const session = await createStripeCheckoutSession({
        customerId: customer.stripeCustomerId,
        priceId: product.stripePriceId,
        mode: 'payment',
        successUrl: `${appUrl}/settings/billing?status=topup-success`,
        cancelUrl: `${appUrl}/settings/billing?status=topup-cancelled`,
        idempotencyKey: `topup:${tenantId}:${idempotencyKey}`,
        metadata: {
          userId: user.userId,
          tenantId,
          productId: product.id,
          kind: 'topup',
          idempotencyKey,
        },
      });
      if (!session.url) throw new Error('Stripe Checkout returned no URL');
      return Response.json({
        checkoutUrl: session.url,
        sessionId: session.id,
        provider: 'stripe',
        credits: product.credits,
      });
    }

    if (!env.NOWPAYMENTS_API_KEY) {
      return Response.json(
        { error: { code: 'NOT_CONFIGURED', message: 'NOWPayments is not configured' } },
        { status: 503 },
      );
    }
    const invoice = await createInvoice({
      price_amount: product.priceUsdCents / 100,
      price_currency: 'usd',
      pay_currency: product.nowpaymentsCurrency ?? 'usdt',
      order_id: `topup:${user.userId}:${product.id}:${idempotencyKey}`,
      order_description: `${product.name} — Kestrel top-up`,
      success_url: `${appUrl}/settings/billing?status=topup-success`,
      cancelled_url: `${appUrl}/settings/billing?status=topup-cancelled`,
    });
    return Response.json({
      checkoutUrl: invoice.invoice_url,
      invoiceId: invoice.id,
      provider: 'nowpayments',
      credits: product.credits,
    });
  } catch (err) {
    return errorResponse(err, req);
  }
});
