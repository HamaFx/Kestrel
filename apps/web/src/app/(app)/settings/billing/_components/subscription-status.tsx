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

'use client';

import { IconExternalLink, IconLoader2 } from '@tabler/icons-react';
import { useState } from 'react';

import { cn } from '@/lib/cn';
import { fetchCsrf } from '@/lib/csrf';

interface Subscription {
  id: string;
  status: string;
  currentPeriodEnd: string | null;
  trialEnd: string | null;
  canceledAt: string | null;
  cancelAtPeriodEnd?: boolean;
  provider?: string | null;
  plan: { name: string; priceUsdCents: number } | null;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-success/10 text-success',
  trialing: 'bg-info/10 text-info',
  past_due: 'bg-warn/10 text-warn',
  canceled: 'bg-danger/10 text-danger',
  expired: 'bg-fg-muted/10 text-fg-subtle',
};

export function SubscriptionStatus({
  subscription,
  currentPlan,
}: {
  subscription: Subscription | null;
  currentPlan: { name: string; priceUsdCents: number } | null;
}) {
  if (!subscription || !currentPlan) {
    return (
      <div className="border-border bg-bg-elev-1 rounded-sm border p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-fg font-medium">No active subscription</p>
            <p className="text-fg-subtle text-sm">You are on the Free tier.</p>
          </div>
          <span className="bg-fg-muted/10 text-fg-subtle rounded-sm px-3 py-1 text-xs font-medium">
            Free
          </span>
        </div>
      </div>
    );
  }

  const statusColor = STATUS_COLORS[subscription.status] ?? STATUS_COLORS.expired;
  const periodEnd = subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null;
  const isPrepaid = subscription.provider === 'gammal';

  return (
    <div className="border-border bg-bg-elev-1 rounded-sm border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <p className="text-fg font-medium">{currentPlan.name} Plan</p>
            <span
              className={cn('rounded-sm px-2.5 py-0.5 text-xs font-medium capitalize', statusColor)}
            >
              {subscription.status.replace('_', ' ')}
            </span>
            {isPrepaid && (
              <span className="bg-bg-elev-2 text-fg-subtle rounded-sm px-2 py-0.5 text-xs font-medium">
                Prepaid pass
              </span>
            )}
          </div>
          {periodEnd && (
            <p className="text-fg-subtle text-sm">
              {isPrepaid || subscription.cancelAtPeriodEnd ? 'Access ends' : 'Next billing date'}:{' '}
              {periodEnd.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </p>
          )}
          {isPrepaid ? (
            <p className="text-fg-subtle text-xs">
              This is a one-time pass. It will not renew; buy another pass when it ends.
            </p>
          ) : (
            subscription.cancelAtPeriodEnd && (
              <p className="text-warn text-xs">
                Subscription cancels at the end of this period. Remaining credits stay usable.
              </p>
            )
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <p className="text-fg text-lg font-bold">
            ${currentPlan.priceUsdCents / 100}
            <span className="text-fg-subtle text-sm font-normal">
              {isPrepaid ? '/pass' : '/mo'}
            </span>
          </p>
          {!isPrepaid && <ManageButton />}
        </div>
      </div>
    </div>
  );
}

function ManageButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCsrf('/api/billing/portal', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data?.error?.message ?? 'Could not open billing portal');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open billing portal');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void openPortal()}
        disabled={loading}
        className="border-border bg-bg-elev-2 text-fg hover:border-brand/40 inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
      >
        {loading ? (
          <IconLoader2 className="size-3.5 animate-spin" />
        ) : (
          <IconExternalLink className="size-3.5" />
        )}
        Manage billing
      </button>
      {error && <span className="text-danger text-[11px]">{error}</span>}
    </div>
  );
}
