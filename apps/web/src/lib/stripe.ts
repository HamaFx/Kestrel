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

// Stripe client wrapper — peer to nowpayments.ts.
//
// The client is lazy so a self-host deployment with billing disabled never
// needs a Stripe key. Signature verification always uses the raw request body.

import Stripe from 'stripe';

import { getServerEnv } from '@/lib/env';
import { createScopedLoggerWithContext } from '@/lib/logger';

let client: Stripe | null = null;
let clientKey: string | null = null;

export function getStripe(): Stripe {
  const env = getServerEnv();
  const key = env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
  if (key.startsWith('sk_test_') && process.env.NODE_ENV === 'production') {
    createScopedLoggerWithContext({ component: 'stripe' }).warn(
      'STRIPE_SECRET_KEY is a test key in a production process — no live charges will be taken',
    );
  }
  if (!client || clientKey !== key) {
    client = new Stripe(key, { maxNetworkRetries: 2, timeout: 20_000 });
    clientKey = key;
  }
  return client;
}

export async function createStripeCustomer(params: {
  email?: string | null;
  name?: string | null;
  metadata: Record<string, string>;
}): Promise<Stripe.Customer> {
  return getStripe().customers.create(
    {
      ...(params.email ? { email: params.email } : {}),
      ...(params.name ? { name: params.name } : {}),
      metadata: params.metadata,
    },
    { idempotencyKey: `customer:${params.metadata.tenantId ?? params.metadata.userId}` },
  );
}

export async function createStripeCheckoutSession(params: {
  customerId: string;
  priceId: string;
  mode: 'subscription' | 'payment';
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
  metadata: Record<string, string>;
  subscriptionMetadata?: Record<string, string>;
}): Promise<{ id: string; url: string | null }> {
  const session = await getStripe().checkout.sessions.create(
    {
      customer: params.customerId,
      mode: params.mode,
      line_items: [{ price: params.priceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      client_reference_id: params.metadata.userId,
      metadata: params.metadata,
      ...(params.subscriptionMetadata
        ? { subscription_data: { metadata: params.subscriptionMetadata } }
        : {}),
      allow_promotion_codes: true,
    },
    { idempotencyKey: params.idempotencyKey },
  );
  return { id: session.id, url: session.url };
}

export async function createStripeBillingPortalSession(params: {
  customerId: string;
  returnUrl: string;
}): Promise<{ url: string }> {
  const session = await getStripe().billingPortal.sessions.create({
    customer: params.customerId,
    return_url: params.returnUrl,
  });
  return { url: session.url };
}

/** Verify an incoming Stripe webhook over the raw body. */
export function verifyStripeWebhook(rawBody: string, signature: string): Stripe.Event {
  const env = getServerEnv();
  if (!env.STRIPE_WEBHOOK_SECRET) throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  return getStripe().webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
}

/** Fetch the authoritative subscription object after checkout. */
export async function retrieveStripeSubscription(id: string): Promise<Stripe.Subscription> {
  return getStripe().subscriptions.retrieve(id);
}
