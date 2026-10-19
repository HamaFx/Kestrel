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

// GET /api/cron/billing-reconcile — repair missed Stripe webhooks.
// Every 6h: for subscriptions past `current_period_end + 24h`, re-fetch the
// provider state and replay the idempotent period grant.

import { and, eq, isNotNull, lt, or } from 'drizzle-orm';

import { withCronAuth } from '@/lib/cron';
import { getServerEnv } from '@/lib/env';
import { createScopedLoggerWithContext } from '@/lib/logger';
import { reconcileStripeSubscription } from '@/lib/services/stripe-billing';
import { getAdminDb, getDb, schema } from '@/lib/services/api-boundary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  return withCronAuth(
    req,
    async () => {
      const env = getServerEnv();
      if (!env.BILLING_ENABLED || !env.BILLING_STRIPE_ENABLED) {
        return { processed: 0, note: 'Stripe billing is disabled' };
      }

      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const db = process.env.ADMIN_DATABASE_URL ? getAdminDb() : getDb();
      const rows = await db
        .select({
          id: schema.subscriptions.id,
          stripeSubscriptionId: schema.subscriptions.stripeSubscriptionId,
        })
        .from(schema.subscriptions)
        .where(
          and(
            isNotNull(schema.subscriptions.stripeSubscriptionId),
            or(
              eq(schema.subscriptions.status, 'active'),
              eq(schema.subscriptions.status, 'trialing'),
              eq(schema.subscriptions.status, 'past_due'),
            ),
            or(
              lt(schema.subscriptions.currentPeriodEnd, cutoff),
              eq(schema.subscriptions.status, 'past_due'),
            ),
          ),
        )
        .limit(100);

      let processed = 0;
      let failed = 0;
      for (const row of rows) {
        if (!row.stripeSubscriptionId) continue;
        try {
          await reconcileStripeSubscription(row.stripeSubscriptionId);
          processed += 1;
        } catch (err) {
          failed += 1;
          createScopedLoggerWithContext({ component: 'cron', job: 'billing-reconcile' }).warn(
            { subscriptionId: row.id, err: String(err) },
            'Stripe subscription reconciliation failed',
          );
        }
      }
      return { processed, failed, note: `${processed} reconciled, ${failed} failed` };
    },
    { requireAdminSession: true },
  );
}
