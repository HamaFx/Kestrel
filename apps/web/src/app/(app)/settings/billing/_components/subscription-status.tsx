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

import { cn } from '@/lib/cn';

interface Subscription {
  id: string;
  status: string;
  currentPeriodEnd: string | null;
  trialEnd: string | null;
  canceledAt: string | null;
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

  return (
    <div className="border-border bg-bg-elev-1 rounded-sm border p-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <p className="text-fg font-medium">{currentPlan.name} Plan</p>
            <span
              className={cn('rounded-sm px-2.5 py-0.5 text-xs font-medium capitalize', statusColor)}
            >
              {subscription.status.replace('_', ' ')}
            </span>
          </div>
          {periodEnd && (
            <p className="text-fg-subtle text-sm">
              Next billing date:{' '}
              {periodEnd.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </p>
          )}
        </div>
        <p className="text-fg text-lg font-bold">
          ${currentPlan.priceUsdCents / 100}
          <span className="text-fg-subtle text-sm font-normal">/mo</span>
        </p>
      </div>
    </div>
  );
}
