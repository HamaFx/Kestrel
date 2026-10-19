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

import { IconCoins, IconTrendingDown, IconTrendingUp } from '@tabler/icons-react';

interface WalletCardProps {
  available: number;
  lifetimeGranted: number;
  lifetimeConsumed: number;
  monthlyCredits: number;
  planName: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

function formatCredits(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.max(0, Math.round(value)));
}

function formatUsd(credits: number): string {
  return `$${(credits / 1000).toFixed(2)}`;
}

export function WalletCard({
  available,
  lifetimeGranted,
  lifetimeConsumed,
  monthlyCredits,
  planName,
  currentPeriodEnd,
  cancelAtPeriodEnd,
}: WalletCardProps) {
  const periodEnd = currentPeriodEnd ? new Date(currentPeriodEnd) : null;
  return (
    <section className="border-border bg-bg-elev-1 rounded-sm border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-fg-subtle text-xs font-medium tracking-wide uppercase">
            Available credits
          </p>
          <p className="text-fg mt-1 text-3xl font-bold tracking-tight">
            {formatCredits(available)}
            <span className="text-fg-subtle ml-2 text-sm font-normal">≈ {formatUsd(available)}</span>
          </p>
          <p className="text-fg-subtle mt-1 text-sm">
            {planName} plan · {formatCredits(monthlyCredits)} credits / cycle
            {periodEnd
              ? ` · renews ${periodEnd.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}`
              : ''}
          </p>
          {cancelAtPeriodEnd && (
            <p className="text-warn mt-1 text-xs">
              Cancels at period end — credits remain usable until then.
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="bg-bg-elev-2 rounded-sm px-3 py-2">
            <p className="text-fg-subtle flex items-center gap-1">
              <IconTrendingUp className="size-3.5" /> Granted
            </p>
            <p className="text-fg mt-0.5 font-mono text-sm">{formatCredits(lifetimeGranted)}</p>
          </div>
          <div className="bg-bg-elev-2 rounded-sm px-3 py-2">
            <p className="text-fg-subtle flex items-center gap-1">
              <IconTrendingDown className="size-3.5" /> Consumed
            </p>
            <p className="text-fg mt-0.5 font-mono text-sm">{formatCredits(lifetimeConsumed)}</p>
          </div>
        </div>
      </div>
      <p className="text-fg-subtle mt-3 flex items-center gap-1.5 text-[11px]">
        <IconCoins className="size-3.5" />
        1 credit = $0.001. Managed AI turns consume credits; BYOK turns are free.
      </p>
    </section>
  );
}
