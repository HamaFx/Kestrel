'use client';

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
import type { PluginDashboardWidgetProps } from '@kestrel/plugin-sdk/ui';
import { IconArrowUpRight, IconLoader2, IconWallet } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import type { z } from 'zod';

import type { SummaryOutputSchema } from '../schemas';
import { pluginFetch } from './api';
import { fmtMoney, fmtMoneyPlain, fmtNumber, toneClass } from './format';

type Summary = z.infer<typeof SummaryOutputSchema>;

export function PaperTradingWidget(_props: PluginDashboardWidgetProps) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    pluginFetch<Summary>('/summary')
      .then((result) => {
        if (!cancelled) setSummary(result);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const marginPct =
    summary && summary.totalEquity > 0
      ? (summary.accounts.reduce((sum, account) => sum + account.marginUsed, 0) /
          summary.totalEquity) *
        100
      : 0;

  return (
    <div className="surface-panel flex h-full flex-col gap-3 rounded-xl border border-white/10 p-4 shadow-[var(--shadow-chip)]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand/10 text-brand flex size-8 items-center justify-center rounded-md">
            <IconWallet className="size-4" />
          </span>
          <div className="flex flex-col">
            <span className="text-fg text-sm font-semibold">Paper Trading</span>
            <span className="text-fg-subtle text-[11px]">
              {summary
                ? `${summary.openPositions.length} open · ${summary.pendingOrders.length} resting`
                : 'Loading accounts…'}
            </span>
          </div>
        </div>
        {!summary && !error ? <IconLoader2 className="text-fg-subtle size-4 animate-spin" /> : null}
      </div>

      {error ? (
        <p className="text-fg-subtle text-xs">Could not load paper accounts.</p>
      ) : summary ? (
        <>
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-fg-subtle text-[10px] font-semibold tracking-wider uppercase">
                Total equity
              </p>
              <p className="text-fg font-mono text-lg font-semibold tabular-nums">
                {fmtMoneyPlain(summary.totalEquity)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-fg-subtle text-[10px] font-semibold tracking-wider uppercase">
                Open P&L
              </p>
              <p
                className={`font-mono text-sm font-semibold ${toneClass(
                  summary.totalUnrealizedPnl,
                )}`}
              >
                {fmtMoney(summary.totalUnrealizedPnl)}
              </p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-[11px]">
            {summary.accounts.map((account) => (
              <div key={account.id} className="bg-bg-elev-1/50 flex flex-col rounded-md p-2">
                <dt className="text-fg-subtle truncate text-[10px]">{account.name}</dt>
                <dd className="flex items-baseline justify-between gap-1">
                  <span className="text-fg font-mono font-semibold">
                    {fmtMoneyPlain(account.equity)}
                  </span>
                  <span className={`font-mono text-[10px] ${toneClass(account.unrealizedPnl)}`}>
                    {fmtMoney(account.unrealizedPnl)}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-fg-subtle font-mono text-[10px]">
            Margin used {fmtNumber(marginPct, 1)}% · virtual money
          </p>
        </>
      ) : null}

      <a
        href="/plugins/paper-trading"
        className="text-brand mt-auto inline-flex items-center gap-1.5 text-xs font-semibold hover:underline"
      >
        Open paper desk
        <IconArrowUpRight className="size-3.5" />
      </a>
    </div>
  );
}
