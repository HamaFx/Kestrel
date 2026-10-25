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

// POST /api/billing/webhook — provider webhook receiver.
// PUBLIC route — auth via Stripe signature, NOWPayments HMAC, or a verified
// Gammal payment token; never a user session.

import { createHash } from 'node:crypto';

import { z } from 'zod';

import { getServerEnv } from '@/lib/env';
import { getGammalProjectId, verifyGammalToken, type GammalClaims } from '@/lib/gammal';
import { createScopedLoggerWithContext } from '@/lib/logger';
import { verifyIpnSignature } from '@/lib/nowpayments';
import { getRequestId } from '@/lib/request-id';
import {
  addCredits,
  claimBillingEvent,
  claimIpnEvent,
  createTopupPayment,
  ensureMonthlyGrant,
  getBillingUserIdForTenant,
  getPaymentByNowpaymentsId,
  getTopupProduct,
  markBillingEventFailed,
  markBillingEventProcessed,
  markIpnFailed,
  markIpnProcessed,
  metrics,
  recordBillingWebhookFailure,
  requireTenantIdForUser,
  updatePaymentStatus,
  updateSubscriptionFromPayment,
  withTenantDbFresh,
} from '@/lib/services/api-boundary';
import { processGammalClaims } from '@/lib/services/gammal-billing';
import { processStripeEvent } from '@/lib/services/stripe-billing';
import { verifyStripeWebhook } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const providerIdentifier = z.preprocess(
  (value) => (typeof value === 'number' ? String(value) : value),
  z.string().min(1),
);
const optionalProviderIdentifier = z.preprocess(
  (value) => (typeof value === 'number' ? String(value) : value),
  z.string().min(1).nullable().optional(),
);

export const IpnPayloadSchema = z.looseObject({
  payment_id: providerIdentifier,
  invoice_id: optionalProviderIdentifier.transform((value) => value ?? undefined),
  payment_status: z.enum([
    'waiting',
    'confirming',
    'confirmed',
    'sending',
    'finished',
    'failed',
    'expired',
    'refunded',
  ]),
  pay_amount: z.string().optional(),
  pay_currency: z.string().optional(),
  price_amount: z.number().optional(),
  price_currency: z.string().optional(),
  order_id: z.string().optional(),
  order_description: z.string().optional(),
  txid: z.string().optional(),
});

export interface IpnPayload {
  payment_id: string;
  invoice_id?: string;
  payment_status:
    | 'waiting'
    | 'confirming'
    | 'confirmed'
    | 'sending'
    | 'finished'
    | 'failed'
    | 'expired'
    | 'refunded';
  pay_amount?: string;
  pay_currency?: string;
  price_amount?: number;
  price_currency?: string;
  order_id?: string;
  order_description?: string;
  txid?: string;
  [key: string]: unknown;
}

/**
 * Process a payload after signature verification and IPN claiming.
 * The admin DLQ replay endpoint uses this same path, preventing replay from
 * silently drifting from normal webhook accounting behavior.
 */
export async function processVerifiedIpnPayload(payload: IpnPayload): Promise<void> {
  const { payment_id, payment_status, invoice_id, txid, pay_amount, pay_currency } = payload;

  // One-time top-up invoices carry a synthetic order id because no
  // subscription/checkout-attempt row exists for them.
  if (payload.order_id?.startsWith('topup:')) {
    if (payment_status !== 'finished') {
      await markIpnProcessed(payment_id, payment_status, null);
      return;
    }
    const [, userId, productId, topupKey] = payload.order_id.split(':');
    if (!userId || !productId) throw new Error('Malformed top-up order id');
    const product = await getTopupProduct(productId);
    if (!product) throw new Error(`Top-up product ${productId} not found`);
    const tenantId = await requireTenantIdForUser(userId);
    await withTenantDbFresh(tenantId, async () => {
      await addCredits({
        userId,
        tenantId,
        amountCredits: product.credits,
        kind: 'topup_grant',
        idempotencyKey: `nowpayments:payment:${payment_id}`,
        referenceType: 'payment',
        referenceId: payment_id,
        metadata: { productId: product.id, productName: product.name, topupKey: topupKey ?? null },
      });
      await createTopupPayment({
        userId,
        provider: 'nowpayments',
        externalId: payment_id,
        ...(invoice_id ? { invoiceId: invoice_id } : {}),
        usdAmountCents: Math.round((payload.price_amount ?? product.priceUsdCents / 100) * 100),
        creditsGranted: product.credits,
        payload,
      });
    });
    await markIpnProcessed(payment_id, payment_status, null);
    return;
  }

  const payment = await getPaymentByNowpaymentsId(payment_id, invoice_id);

  if (!payment) {
    throw new Error('Payment row not found for IPN');
  }

  const mappedStatus = mapPaymentStatus(payment_status);

  await withTenantDbFresh(payment.tenantId, async () => {
    const paymentUpdated = await updatePaymentStatus(payment.id, {
      status: mappedStatus,
      nowpaymentsPaymentId: payment_id,
      txHash: txid ?? payment.txHash,
      payAmount: pay_amount ?? payment.payAmount,
      payCurrency: pay_currency ?? payment.payCurrency,
      ipnPayload: payload,
      tenantId: payment.tenantId,
    });

    const shouldUpdateSubscription =
      (paymentUpdated || payment.status === mappedStatus) && payment.subscriptionId;

    if (shouldUpdateSubscription && payment.subscriptionId) {
      await updateSubscriptionFromPayment(payment.subscriptionId, payment_status, {
        tenantId: payment.tenantId,
        ...(invoice_id ? { invoiceId: invoice_id } : {}),
      });
    }

    // NOWPayments parity (plan Phase 7): a finished subscription payment
    // grants the plan's monthly credits exactly once per period.
    if (mappedStatus === 'finished' && payment.subscriptionId) {
      const userId = await getBillingUserIdForTenant(payment.tenantId);
      if (userId) {
        await ensureMonthlyGrant(userId, { tenantId: payment.tenantId });
      }
    }

    await markIpnProcessed(payment_id, payment_status, null);
  });
}

export async function POST(req: Request): Promise<Response> {
  const env = getServerEnv();
  const requestId = getRequestId(req);
  const responseHeaders = requestId ? { 'x-request-id': requestId } : undefined;
  const logger = createScopedLoggerWithContext({
    component: 'billing-webhook',
    ...(requestId ? { requestId } : {}),
  });
  if (!env.BILLING_ENABLED) {
    return new Response('Not Found', { status: 404, headers: responseHeaders });
  }
  const rawBody = await req.text();

  // ── Stripe dispatch (signature header distinguishes the providers) ──────
  const stripeSignature = req.headers.get('stripe-signature');
  if (stripeSignature) {
    if (!env.BILLING_STRIPE_ENABLED) {
      return new Response('Not Found', { status: 404, headers: responseHeaders });
    }
    let event;
    try {
      event = verifyStripeWebhook(rawBody, stripeSignature);
    } catch (err) {
      logger.warn({ err: String(err) }, 'Invalid Stripe webhook signature');
      return new Response('Unauthorized', { status: 401, headers: responseHeaders });
    }

    const claim = await claimBillingEvent({
      provider: 'stripe',
      eventId: event.id,
      eventType: event.type,
      payload: event as unknown as Record<string, unknown>,
    });
    if (claim.kind === 'processed' || claim.kind === 'in_progress') {
      return new Response('OK', { status: 200, headers: responseHeaders });
    }
    if (claim.kind === 'conflict') {
      return new Response('Conflicting event payload', { status: 409, headers: responseHeaders });
    }

    try {
      await processStripeEvent(event);
      await markBillingEventProcessed(claim.id);
      metrics.increment('webhook_processed_total', {
        tags: { provider: 'stripe', event_type: event.type },
      });
      logger.info({ eventId: event.id, type: event.type }, 'Stripe webhook processed');
      return new Response('OK', { status: 200, headers: responseHeaders });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error({ err: error, eventId: event.id, type: event.type }, 'Stripe webhook failed');
      try {
        await markBillingEventFailed(claim.id, error);
        await recordBillingWebhookFailure({
          provider: 'stripe',
          eventType: event.type,
          eventId: event.id,
          payload: event,
          error,
        });
      } catch (dlqError) {
        logger.error(
          { err: String(dlqError), eventId: event.id },
          'Failed to persist Stripe webhook DLQ entry',
        );
        return new Response('Internal Server Error', { status: 500, headers: responseHeaders });
      }
      // Authenticated and safely recorded for replay; acknowledge so Stripe
      // does not retry forever.
      return new Response('OK', { status: 200, headers: responseHeaders });
    }
  }

  // ── Gammal dispatch (X-Gammal-Event is informational; the token is trusted) ──
  const gammalEvent = req.headers.get('x-gammal-event');
  if (gammalEvent) {
    if (!env.BILLING_ENABLED || !env.BILLING_GAMMAL_ENABLED) {
      return new Response('Not Found', { status: 404, headers: responseHeaders });
    }
    let body: { payment_token?: unknown };
    try {
      body = JSON.parse(rawBody) as { payment_token?: unknown };
    } catch {
      return new Response('Bad Request', { status: 400, headers: responseHeaders });
    }
    if (typeof body.payment_token !== 'string' || body.payment_token.length === 0) {
      return new Response('Bad Request', { status: 400, headers: responseHeaders });
    }

    let claims: GammalClaims;
    try {
      claims = await verifyGammalToken(body.payment_token);
      if (claims.project_id !== getGammalProjectId()) {
        logger.warn({ projectId: claims.project_id }, 'Gammal token project mismatch');
        return new Response('Bad Request', { status: 400, headers: responseHeaders });
      }
    } catch (err) {
      logger.warn({ err: String(err) }, 'Invalid Gammal payment token');
      return new Response('Unauthorized', { status: 401, headers: responseHeaders });
    }

    const claim = await claimBillingEvent({
      provider: 'gammal',
      eventId: claims.txn,
      eventType: claims.event ?? claims.type,
      payload: claims as unknown as Record<string, unknown>,
    });
    if (claim.kind === 'processed' || claim.kind === 'in_progress') {
      return new Response('OK', { status: 200, headers: responseHeaders });
    }
    if (claim.kind === 'conflict') {
      return new Response('Conflicting event payload', { status: 409, headers: responseHeaders });
    }

    try {
      const result = await processGammalClaims(claims);
      await markBillingEventProcessed(claim.id);
      metrics.increment('webhook_processed_total', {
        tags: { provider: 'gammal', event_type: claims.event ?? claims.type },
      });
      logger.info(
        { event: claims.event ?? claims.type, txn: claims.txn, result },
        'Gammal webhook processed',
      );
      return new Response('OK', { status: 200, headers: responseHeaders });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error(
        { err: error, event: claims.event ?? claims.type, txn: claims.txn },
        'Gammal webhook failed',
      );
      try {
        await markBillingEventFailed(claim.id, error);
        await recordBillingWebhookFailure({
          provider: 'gammal',
          eventType: claims.event ?? claims.type,
          eventId: claims.txn,
          payload: claims,
          error,
        });
      } catch (dlqError) {
        logger.error(
          { err: String(dlqError), txn: claims.txn },
          'Failed to persist Gammal webhook DLQ entry',
        );
        return new Response('Internal Server Error', { status: 500, headers: responseHeaders });
      }
      // Token lifetime is short; persist the failure for operator replay and
      // acknowledge so Gammal does not retry an already-expired token.
      return new Response('OK', { status: 200, headers: responseHeaders });
    }
  }

  const signature = req.headers.get('x-nowpayments-sig') ?? '';
  const ipnSecret = env.NOWPAYMENTS_IPN_SECRET;

  if (!ipnSecret) {
    logger.error('NOWPAYMENTS_IPN_SECRET is not configured');
    return new Response('Server misconfigured', { status: 500, headers: responseHeaders });
  }

  const isValid = await verifyIpnSignature(rawBody, signature, ipnSecret);
  if (!isValid) {
    logger.warn({ signaturePresent: !!signature }, 'Invalid IPN signature');
    return new Response('Unauthorized', { status: 401, headers: responseHeaders });
  }

  let payload: IpnPayload;
  try {
    const parsed = IpnPayloadSchema.safeParse(JSON.parse(rawBody));
    if (!parsed.success) throw new Error('invalid payload');
    payload = parsed.data as IpnPayload;
  } catch {
    logger.warn('Invalid JSON or unsupported fields in IPN body');
    return new Response('Bad Request', { status: 400, headers: responseHeaders });
  }

  const { payment_id, payment_status } = payload;

  logger.info({ payment_id, payment_status, invoice_id: payload.invoice_id }, 'IPN received');
  const bodyHash = createHash('sha256').update(rawBody).digest('hex');
  const claim = await claimIpnEvent({
    nowpaymentsPaymentId: payment_id,
    paymentStatus: payment_status,
    bodyHash,
    rawBody: payload,
  });

  if (claim.kind === 'conflict') {
    logger.error({ payment_id, payment_status }, 'Conflicting IPN payload for existing event key');
    return new Response('Conflicting event payload', { status: 409 });
  }
  if (claim.kind === 'processed') {
    logger.info({ payment_id, payment_status }, 'IPN already processed, skipping');
    return new Response('OK', { status: 200 });
  }
  if (claim.kind === 'in_progress') {
    logger.info({ payment_id, payment_status }, 'IPN already being processed, acknowledging retry');
    return new Response('OK', { status: 200 });
  }

  try {
    await processVerifiedIpnPayload(payload);
    metrics.increment('webhook_processed_total', {
      tags: { provider: 'nowpayments', event_type: payment_status },
    });
    logger.info({ payment_id, payment_status }, 'IPN processed successfully');
    return new Response('OK', { status: 200 });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ err: error, payment_id, payment_status }, 'IPN processing failed');
    try {
      await recordBillingWebhookFailure({
        eventType: payment_status,
        eventId: payment_id,
        payload,
        error,
      });
      await markIpnFailed(payment_id, payment_status, error);
    } catch (dlqError) {
      logger.error(
        { err: String(dlqError), payment_id },
        'Failed to persist billing webhook DLQ entry',
      );
      return new Response('Internal Server Error', { status: 500, headers: responseHeaders });
    }
    // The event is authenticated and safely recorded for replay. A 200
    // prevents NOWPayments from retrying forever while preserving the failure.
    return new Response('OK', { status: 200 });
  }
}

function mapPaymentStatus(
  npStatus: string,
):
  | 'waiting'
  | 'confirming'
  | 'confirmed'
  | 'sending'
  | 'finished'
  | 'failed'
  | 'expired'
  | 'refunded' {
  const map: Record<string, string> = {
    waiting: 'waiting',
    confirming: 'confirming',
    confirmed: 'confirmed',
    sending: 'sending',
    finished: 'finished',
    failed: 'failed',
    expired: 'expired',
    refunded: 'refunded',
  };
  return (map[npStatus] ?? 'waiting') as
    | 'waiting'
    | 'confirming'
    | 'confirmed'
    | 'sending'
    | 'finished'
    | 'failed'
    | 'expired'
    | 'refunded';
}
