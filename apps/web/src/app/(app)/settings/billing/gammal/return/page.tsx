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

import { Link } from 'next-view-transitions';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { getServerEnv } from '@/lib/env';
import { getUserSubscription } from '@/lib/services/api-boundary';
import { syncGammalPaymentToken } from '@/lib/services/gammal-billing';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{
  payment?: string | string[];
  status?: string | string[];
  txn?: string | string[];
  payment_token?: string | string[];
}>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function GammalReturnPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const env = getServerEnv();
  if (!env.BILLING_ENABLED || !env.BILLING_GAMMAL_ENABLED) {
    redirect('/settings/billing');
  }

  const sp = await searchParams;
  const paymentId = first(sp.payment);
  const status = first(sp.status);
  const token = first(sp.payment_token);

  let state: 'success' | 'already' | 'pending' | 'cancelled' | 'error' = 'pending';
  if (status === 'cancelled') {
    state = 'cancelled';
  } else if (!paymentId) {
    state = 'error';
  } else if (token) {
    try {
      const result = await syncGammalPaymentToken({
        userId: session.user.id,
        localPaymentId: paymentId,
        token,
      });
      state = result === 'processed' ? 'success' : result === 'already' ? 'already' : 'pending';
    } catch {
      state = 'error';
    }
  }

  const subscription =
    state === 'success' || state === 'already' ? await getUserSubscription(session.user.id) : null;
  const periodEnd = subscription?.currentPeriodEnd
    ? subscription.currentPeriodEnd.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  const copy = {
    success: {
      title: 'Payment confirmed',
      body: periodEnd
        ? `Your pass is active until ${periodEnd}. This is a one-time pass and will not renew.`
        : 'Your pass is active. This is a one-time pass and will not renew.',
      tone: 'text-success',
    },
    already: {
      title: 'Payment already confirmed',
      body: periodEnd
        ? `Your pass is active until ${periodEnd}. No further action is needed.`
        : 'This payment was already applied. No further action is needed.',
      tone: 'text-success',
    },
    pending: {
      title: 'Payment received',
      body: 'We are confirming the payment with the provider. This page will not refresh automatically; check billing in a moment.',
      tone: 'text-warn',
    },
    cancelled: {
      title: 'Payment cancelled',
      body: 'No charge was made. You can return to billing and try again.',
      tone: 'text-warn',
    },
    error: {
      title: 'Could not confirm payment',
      body: 'We could not verify this payment. If you were charged, contact support with your transaction reference.',
      tone: 'text-danger',
    },
  }[state];

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 py-10">
      <section className="border-border bg-bg-elev-1 rounded-sm border p-6">
        <p className={`text-xs font-semibold tracking-wide uppercase ${copy.tone}`}>Gammal Tech</p>
        <h1 className="text-fg mt-2 text-xl font-semibold">{copy.title}</h1>
        <p className="text-fg-subtle mt-2 text-sm">{copy.body}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/settings/billing"
            className="bg-fg hover:bg-fg/90 inline-flex items-center justify-center rounded-sm px-4 py-2 text-sm font-medium text-white transition-colors"
          >
            Back to billing
          </Link>
          {state === 'cancelled' && (
            <Link
              href="/settings/billing"
              className="border-border bg-bg-elev-2 text-fg hover:border-brand/40 inline-flex items-center justify-center rounded-sm border px-4 py-2 text-sm font-medium transition-colors"
            >
              Try again
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
