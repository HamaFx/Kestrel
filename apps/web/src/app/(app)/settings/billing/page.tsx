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

import { getUserPayments, getUserSubscription, listActivePlans } from '@kestrel/db';
import { IconCheck, IconSparkles } from '@tabler/icons-react';
import type { Metadata } from 'next';
import { Link } from 'next-view-transitions';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { getServerEnv } from '@/lib/env';

import { BillingPlans } from './_components/billing-plans';
import { PaymentHistory } from './_components/payment-history';
import { SubscriptionStatus } from './_components/subscription-status';

export const metadata: Metadata = {
  title: 'Subscription & Billing · Settings',
  description: 'Manage your Kestrel subscription, plan benefits, and billing history.',
};
export const revalidate = 0;

export default async function BillingPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const userId = session.user.id;
  if (!getServerEnv().BILLING_ENABLED) {
    return (
      <div className="flex max-w-2xl flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-fg text-lg font-semibold tracking-tight">Subscription & Billing</h2>
          <p className="text-fg-subtle text-sm">Your Kestrel membership and included capabilities.</p>
        </div>

        <section className="surface-panel flex flex-col gap-4 rounded-xl border border-brand/30 p-6 shadow-[var(--shadow-chip)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="bg-brand/15 text-brand border-brand/30 inline-flex size-9 items-center justify-center rounded-lg border">
                <IconSparkles className="size-5" />
              </span>
              <div>
                <h3 className="text-fg text-base font-semibold">Kestrel Pro Membership</h3>
                <p className="text-fg-subtle text-xs">Full access to all 4 specialist AI desks & live market feeds</p>
              </div>
            </div>
            <span className="bg-bull/15 text-bull border-bull/30 rounded-full border px-3 py-1 font-mono text-xs font-bold uppercase">
              Active
            </span>
          </div>

          <ul className="border-border/60 grid grid-cols-1 gap-2.5 border-t pt-4 text-xs sm:grid-cols-2">
            <li className="text-fg-muted flex items-center gap-2">
              <IconCheck className="text-bull size-4 shrink-0" />
              <span>4-Desk AI Committee (Technical, Macro, Risk, Sentiment)</span>
            </li>
            <li className="text-fg-muted flex items-center gap-2">
              <IconCheck className="text-bull size-4 shrink-0" />
              <span>Real-time Gold (XAU/USD), Forex & Crypto feeds</span>
            </li>
            <li className="text-fg-muted flex items-center gap-2">
              <IconCheck className="text-bull size-4 shrink-0" />
              <span>Instant Email, Browser Push & Telegram alerts</span>
            </li>
            <li className="text-fg-muted flex items-center gap-2">
              <IconCheck className="text-bull size-4 shrink-0" />
              <span>Trade Journal with R-multiple & drawdown analytics</span>
            </li>
          </ul>

          <div className="border-border/60 flex items-center justify-between border-t pt-3 text-xs">
            <span className="text-fg-subtle">Want to review your recent AI research sessions?</span>
            <Link href="/settings/usage" className="text-brand font-semibold hover:underline">
              View Activity →
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const allPlans = await listActivePlans();
  const subscription = await getUserSubscription(userId);
  const payments = await getUserPayments(userId, 20);

  const currentPlan = subscription
    ? (allPlans.find((p) => p.id === subscription.planId) ?? null)
    : null;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-fg text-lg font-semibold tracking-tight">Subscription & Billing</h2>
        <p className="text-fg-subtle text-sm">Manage your subscription plan and payment history.</p>
      </div>

      <SubscriptionStatus
        subscription={subscription ? JSON.parse(JSON.stringify(subscription)) : null}
        currentPlan={currentPlan ? JSON.parse(JSON.stringify(currentPlan)) : null}
      />
      <BillingPlans
        plans={JSON.parse(JSON.stringify(allPlans))}
        currentPlanId={subscription?.planId ?? null}
      />
      <PaymentHistory payments={JSON.parse(JSON.stringify(payments))} />
    </div>
  );
}
