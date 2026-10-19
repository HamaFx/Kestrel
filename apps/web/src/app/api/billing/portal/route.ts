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

// GET /api/billing/portal — returns the user's subscription, plans, and payments.
// Auth required.

import { errorResponse, withAuth } from '@/lib/api';
import { getServerEnv } from '@/lib/env';
import { createStripeBillingPortalSession } from '@/lib/stripe';
import {
  getBillingCustomer,
  getEntitlementSnapshot,
  getUserPayments,
  getUserSubscription,
  listActivePlans,
  listActiveTopupProducts,
  withRateLimit,
} from '@/lib/services/api-boundary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<void>(async (_req, { user }) => {
  try {
    if (!getServerEnv().BILLING_ENABLED) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'Billing is disabled in this deployment' } },
        { status: 404 },
      );
    }

    const [allPlans, subscription, payments, topups, snapshot] = await Promise.all([
      listActivePlans(),
      getUserSubscription(user.userId),
      getUserPayments(user.userId, 20),
      listActiveTopupProducts(),
      getEntitlementSnapshot(user.userId),
    ]);

    let currentPlan = null;
    if (subscription) {
      currentPlan = allPlans.find((p) => p.id === subscription.planId) ?? null;
    }

    return Response.json({
      plans: allPlans,
      subscription: subscription ? { ...subscription, plan: currentPlan } : null,
      payments,
      topups,
      wallet: {
        available: snapshot.wallet.availableCredits,
        lifetimeGranted: snapshot.wallet.lifetimeGranted,
        lifetimeConsumed: snapshot.wallet.lifetimeConsumed,
      },
      entitlements: {
        planName: snapshot.planName,
        features: snapshot.features,
        monthlyCredits: snapshot.monthlyCredits,
        status: snapshot.status,
        currentPeriodEnd: snapshot.currentPeriodEnd,
        cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
});

// POST /api/billing/portal — create a Stripe customer-portal session.
export const POST = withAuth<void>(async (_req, { user }) => {
  try {
    const rateLimit = await withRateLimit(user.userId, 'billing_portal', 30);
    if (!rateLimit.allowed) {
      return Response.json(
        { error: { code: 'RATE_LIMITED', message: 'Too many portal requests. Try again shortly.' } },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }
    const env = getServerEnv();
    if (!env.BILLING_ENABLED || !env.BILLING_STRIPE_ENABLED) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'Stripe billing portal is disabled' } },
        { status: 404 },
      );
    }
    const customer = await getBillingCustomer(user.userId);
    if (!customer?.stripeCustomerId) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'No Stripe customer exists for this account' } },
        { status: 404 },
      );
    }
    const returnUrl =
      env.STRIPE_BILLING_PORTAL_RETURN_URL ?? `${env.NEXT_PUBLIC_APP_URL}/settings/billing`;
    const session = await createStripeBillingPortalSession({
      customerId: customer.stripeCustomerId,
      returnUrl,
    });
    return Response.json({ url: session.url });
  } catch (err) {
    return errorResponse(err);
  }
});
