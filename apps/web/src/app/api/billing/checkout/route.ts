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

// POST /api/billing/checkout — create a NOWPayments invoice and return
// the hosted checkout URL.
// Auth required. Body: { planId: string } → { checkoutUrl: string }

import { z } from 'zod';

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';
import { getServerEnv } from '@/lib/env';
import { createInvoice } from '@/lib/nowpayments';
import {
  claimCheckoutAttempt,
  completeCheckoutAttempt,
  createPayment,
  failCheckoutAttempt,
  getPlan,
  getTenantDbScope,
  saveCheckoutInvoice,
  upsertSubscription,
  withTenantDbFresh,
} from '@/lib/services/api-boundary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CheckoutSchema = z.object({
  planId: z.string().uuid('Invalid plan ID'),
});

const IDEMPOTENCY_KEY_MAX_LENGTH = 200;

export const POST = withAuth<void>(async (req, { user }) => {
  try {
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

    if (!env.NOWPAYMENTS_API_KEY) {
      return Response.json(
        { error: { code: 'NOT_CONFIGURED', message: 'Billing is not configured' } },
        { status: 503 },
      );
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
