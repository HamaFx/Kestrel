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

import {
  getCreditUsageDaily,
  getEntitlementSnapshot,
  getUserPayments,
  getUserSubscription,
  listActiveTopupProducts,
  listActivePlans,
  listLedger,
  requireTenantIdForUser,
  withTenantDbFresh,
} from '@kestrel/db';
import { IconSparkles } from '@tabler/icons-react';
import type { Metadata } from 'next';
import { Link } from 'next-view-transitions';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { getServerEnv } from '@/lib/env';

import { BillingPlans } from './_components/billing-plans';
import { CreditUsageChart } from './_components/credit-usage-chart';
import { LedgerTable } from './_components/ledger-table';
import { PaymentHistory } from './_components/payment-history';
import { SubscriptionStatus } from './_components/subscription-status';
import { TopupPacks } from './_components/topup-packs';
import { WalletCard } from './_components/wallet-card';

export const metadata: Metadata = {
  title: 'Subscription & Billing · Settings',
  description: 'Manage your Kestrel subscription, credits, and billing history.',
};
export const revalidate = 0;

export default async function BillingPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const userId = session.user.id;
  const env = getServerEnv();
  if (!env.BILLING_ENABLED) {
    return (
      <div className="flex max-w-2xl flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-fg text-lg font-semibold tracking-tight">Subscription & Billing</h2>
          <p className="text-fg-subtle text-sm">
            Your Kestrel membership and included capabilities.
          </p>
        </div>

        <section className="surface-panel border-brand/30 flex flex-col gap-4 rounded-xl border p-6 shadow-[var(--shadow-chip)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="bg-brand/15 text-brand border-brand/30 inline-flex size-9 items-center justify-center rounded-lg border">
                <IconSparkles className="size-5" />
              </span>
              <div>
                <h3 className="text-fg text-base font-semibold">Self-hosted deployment</h3>
                <p className="text-fg-subtle text-xs">
                  Billing is disabled. Bring your own provider keys for unlimited access.
                </p>
              </div>
            </div>
            <span className="bg-bg-elev-2 text-fg-subtle border-border rounded-full border px-3 py-1 font-mono text-xs font-bold uppercase">
              BYOK
            </span>
          </div>
          <div className="border-border/60 flex items-center justify-between border-t pt-3 text-xs">
            <span className="text-fg-subtle">Review your recent AI research sessions.</span>
            <Link href="/settings/usage" className="text-brand font-semibold hover:underline">
              View Activity →
            </Link>
          </div>
        </section>
      </div>
    );
  }

  // Server components do not inherit the API boundary's tenant transaction.
  // Enter one explicitly: FORCE RLS hides subscriptions/payments/ledger rows
  // from an unscoped connection, and the lazy cycle grant needs a write tx.
  const tenantId = await requireTenantIdForUser(userId);
  const [allPlans, subscription, payments, snapshot, topups, usage, ledger] =
    await withTenantDbFresh(tenantId, () =>
      Promise.all([
        listActivePlans(),
        getUserSubscription(userId),
        getUserPayments(userId, 20),
        getEntitlementSnapshot(userId),
        env.BILLING_TOPUPS_ENABLED ? listActiveTopupProducts() : Promise.resolve([]),
        getCreditUsageDaily(userId, 7),
        listLedger(userId, { limit: 25 }),
      ]),
    );

  const currentPlan = subscription
    ? (allPlans.find((plan) => plan.id === subscription.planId) ?? null)
    : null;

  const topupProvider: 'stripe' | 'nowpayments' =
    env.BILLING_PROVIDER === 'nowpayments' ? 'nowpayments' : 'stripe';

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-fg text-lg font-semibold tracking-tight">Subscription & Billing</h2>
        <p className="text-fg-subtle text-sm">
          Manage your plan, credit balance, top-ups, and billing history.
        </p>
      </div>

      <WalletCard
        available={snapshot.wallet.availableCredits}
        lifetimeGranted={snapshot.wallet.lifetimeGranted}
        lifetimeConsumed={snapshot.wallet.lifetimeConsumed}
        monthlyCredits={snapshot.monthlyCredits}
        planName={snapshot.planName}
        currentPeriodEnd={snapshot.currentPeriodEnd?.toISOString() ?? null}
        cancelAtPeriodEnd={snapshot.cancelAtPeriodEnd}
      />

      <CreditUsageChart buckets={usage} />

      <SubscriptionStatus
        subscription={subscription ? JSON.parse(JSON.stringify(subscription)) : null}
        currentPlan={currentPlan ? JSON.parse(JSON.stringify(currentPlan)) : null}
      />
      <BillingPlans
        plans={JSON.parse(JSON.stringify(allPlans))}
        currentPlanId={subscription?.planId ?? null}
        provider={topupProvider}
      />
      {topups.length > 0 && (
        <TopupPacks
          products={JSON.parse(JSON.stringify(topups))}
          provider={topupProvider}
        />
      )}
      <LedgerTable
        initialRows={JSON.parse(JSON.stringify(ledger.rows))}
        initialCursor={ledger.nextCursor}
      />
      <PaymentHistory payments={JSON.parse(JSON.stringify(payments))} />
    </div>
  );
}
