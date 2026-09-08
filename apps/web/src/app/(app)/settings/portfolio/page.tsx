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

// /settings/portfolio — Portfolio Management page.
// Shows open positions with live P&L, risk dashboard, and account settings.

import { getOpenPositionsWithPnL, getPortfolioRiskReport, getPortfolioSettings } from '@kestrel/ai';
import type { PortfolioRiskReport, PortfolioSettings, PositionWithPnL } from '@kestrel/shared';
import { IconAlertTriangle, IconShield, IconTrendingUp, IconWallet } from '@tabler/icons-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/cn';

export const metadata: Metadata = {
  title: 'Portfolio · Settings',
  description: 'Manage position sizing, maximum risk limits, and account equity.',
};
export const dynamic = 'force-dynamic';

export default async function PortfolioPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const [positions, riskReport, settings] = await Promise.all([
    getOpenPositionsWithPnL(session.user.id),
    getPortfolioRiskReport(session.user.id),
    getPortfolioSettings(session.user.id),
  ]);

  return <PortfolioContent positions={positions} riskReport={riskReport} settings={settings} />;
}

function PortfolioContent({
  positions,
  riskReport,
  settings,
}: {
  positions: PositionWithPnL[];
  riskReport: PortfolioRiskReport;
  settings: PortfolioSettings;
}) {
  if (positions.length === 0 && !settings.accountBalance) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-fg text-lg font-semibold tracking-tight">Portfolio</h2>
          <p className="text-fg-subtle text-sm">
            Track your forex and gold positions with live P&amp;L, risk analysis, and AI-aware
            position sizing advice.
          </p>
        </div>
        <EmptyState
          icon={<IconWallet />}
          title="No positions yet"
          description="Add your positions manually to start tracking live P&amp;L, risk metrics, and performance analysis."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-fg text-lg font-semibold tracking-tight">Portfolio & Risk Engine</h2>
        <p className="text-fg-subtle text-sm">Open positions, live mark-to-market P&amp;L, and account exposure controls.</p>
      </div>

      {/* Risk Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={IconWallet}
          label="Open Positions"
          value={String(riskReport.openPositionCount)}
        />
        <StatCard
          icon={IconTrendingUp}
          label="Total Exposure"
          value={`$${riskReport.totalExposureUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          subValue={`${riskReport.totalExposurePct.toFixed(1)}% of balance`}
        />
        <StatCard
          icon={IconShield}
          label="Total Risk"
          value={`$${riskReport.totalRiskUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          subValue={`${riskReport.totalRiskPct.toFixed(1)}% max loss`}
        />
        <StatCard
          icon={IconAlertTriangle}
          label="Risk Alerts"
          value={String(riskReport.alerts.length)}
          valueClass={riskReport.alerts.length > 0 ? 'text-warn' : ''}
        />
      </div>

      {/* Alerts */}
      {riskReport.alerts.length > 0 && (
        <div className="surface-well rounded-xl border border-warn/30 bg-warn/5 p-4 shadow-inner">
          <div className="mb-2 flex items-center gap-2">
            <IconAlertTriangle className="text-warn size-4" />
            <h3 className="text-warn text-sm font-semibold tracking-tight">Risk & Drawdown Alerts</h3>
          </div>
          <ul className="space-y-1">
            {riskReport.alerts.map((alert, i) => (
              <li
                key={i}
                className={cn('text-xs font-mono', alert.level === 'danger' ? 'text-bear' : 'text-warn')}
              >
                • {alert.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Positions Table */}
      {positions.length > 0 && (
        <div className="surface-panel overflow-hidden rounded-xl border border-white/10 shadow-[var(--shadow-chip)]">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
            <h3 className="text-fg text-sm font-semibold tracking-tight">Open Book Positions</h3>
            <span className="surface-chip text-fg-subtle rounded-md px-2 py-0.5 font-mono text-[11px] font-medium uppercase">
              Live MTM
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="surface-well border-b border-white/5 font-mono text-[11px] uppercase tracking-wider text-fg-muted">
                  <th className="px-4 py-2.5 text-left font-medium">Symbol</th>
                  <th className="px-4 py-2.5 text-left font-medium">Side</th>
                  <th className="px-4 py-2.5 text-right font-medium">Lots</th>
                  <th className="px-4 py-2.5 text-right font-medium">Entry</th>
                  <th className="px-4 py-2.5 text-right font-medium">Current</th>
                  <th className="px-4 py-2.5 text-right font-medium">P&amp;L ($)</th>
                  <th className="px-4 py-2.5 text-right font-medium">P&amp;L (%)</th>
                  <th className="px-4 py-2.5 text-right font-medium">R:R</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {positions.map((p) => (
                  <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="text-fg px-4 py-3 font-mono text-xs font-semibold">{p.symbol}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'rounded-md px-2 py-0.5 font-mono text-[11px] font-medium uppercase',
                          p.direction === 'long'
                            ? 'border border-bull/30 bg-bull/10 text-bull'
                            : 'border border-bear/30 bg-bear/10 text-bear',
                        )}
                      >
                        {p.direction.toUpperCase()}
                      </span>
                    </td>
                    <td className="text-fg px-4 py-3 text-right font-mono text-xs">{p.lotSize.toFixed(2)}</td>
                    <td className="text-fg px-4 py-3 text-right font-mono text-xs">{p.entryPrice.toFixed(2)}</td>
                    <td className="text-fg px-4 py-3 text-right font-mono text-xs">
                      {p.stale ? (
                        <span className="text-fg-muted italic">stale</span>
                      ) : (
                        (p.currentPrice?.toFixed(2) ?? '—')
                      )}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-3 text-right font-mono text-xs font-medium',
                        p.unrealizedPnlUsd === null
                          ? 'text-fg-muted'
                          : p.unrealizedPnlUsd >= 0
                            ? 'text-bull'
                            : 'text-bear',
                      )}
                    >
                      {p.unrealizedPnlUsd === null
                        ? '—'
                        : `${p.unrealizedPnlUsd >= 0 ? '+' : ''}$${p.unrealizedPnlUsd.toFixed(2)}`}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-3 text-right font-mono text-xs',
                        p.unrealizedPnlPct === null
                          ? 'text-fg-muted'
                          : p.unrealizedPnlPct >= 0
                            ? 'text-bull'
                            : 'text-bear',
                      )}
                    >
                      {p.unrealizedPnlPct === null
                        ? '—'
                        : `${p.unrealizedPnlPct >= 0 ? '+' : ''}${p.unrealizedPnlPct.toFixed(2)}%`}
                    </td>
                    <td className="text-fg px-4 py-3 text-right font-mono text-xs">
                      {p.riskRewardRatio?.toFixed(2) ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Concentration */}
      {riskReport.concentration.length > 0 && (
        <div className="surface-panel flex flex-col gap-3 rounded-xl border border-white/10 p-5 shadow-[var(--shadow-chip)]">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <h3 className="text-fg text-sm font-semibold tracking-tight">Asset Concentration</h3>
            <span className="surface-chip text-fg-subtle rounded-md px-2 py-0.5 font-mono text-[11px] font-medium uppercase">
              Cap Limits
            </span>
          </div>
          <div className="space-y-3 pt-1">
            {riskReport.concentration.map((c) => (
              <div key={c.symbol} className="flex items-center gap-3">
                <span className="text-fg font-mono text-xs font-semibold w-20">{c.symbol}</span>
                <div className="surface-well h-2.5 flex-1 overflow-hidden rounded-full border border-white/5">
                  <div
                    className={cn('h-full rounded-full transition-all', c.alert ? 'bg-warn' : 'bg-cyan-500')}
                    style={{ width: `${Math.min(c.pct, 100)}%` }}
                  />
                </div>
                <span
                  className={cn(
                    'w-16 text-right font-mono text-xs',
                    c.alert ? 'text-warn font-semibold' : 'text-fg-muted',
                  )}
                >
                  {c.pct.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Account Settings */}
      <div className="surface-panel flex flex-col gap-3 rounded-xl border border-white/10 p-5 shadow-[var(--shadow-chip)]">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div>
            <h3 className="text-fg text-sm font-semibold tracking-tight">Account Limits & Equity</h3>
            <p className="text-fg-subtle text-xs">
              Baseline equity, margin currency, and drawdown thresholds
            </p>
          </div>
          <span className="surface-chip text-fg-subtle rounded-md px-2 py-0.5 font-mono text-[11px] font-medium uppercase">
            Risk Bounds
          </span>
        </div>
        <dl className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
          <div className="surface-well flex flex-col gap-1 rounded-xl border border-white/5 p-3.5 shadow-inner">
            <dt className="text-fg-muted font-mono text-[11px] uppercase">Account Balance</dt>
            <dd className="text-fg font-mono text-base font-bold">
              {settings.accountBalance ? `$${settings.accountBalance.toLocaleString()}` : 'Not set'}
            </dd>
          </div>
          <div className="surface-well flex flex-col gap-1 rounded-xl border border-white/5 p-3.5 shadow-inner">
            <dt className="text-fg-muted font-mono text-[11px] uppercase">Base Currency</dt>
            <dd className="text-fg font-mono text-base font-bold">{settings.baseCurrency}</dd>
          </div>
          <div className="surface-well flex flex-col gap-1 rounded-xl border border-white/5 p-3.5 shadow-inner">
            <dt className="text-fg-muted font-mono text-[11px] uppercase">Max Risk / Trade</dt>
            <dd className="text-fg font-mono text-base font-bold">{settings.maxRiskPerTradePct}%</dd>
          </div>
          <div className="surface-well flex flex-col gap-1 rounded-xl border border-white/5 p-3.5 shadow-inner">
            <dt className="text-fg-muted font-mono text-[11px] uppercase">Max Total Exposure</dt>
            <dd className="text-fg font-mono text-base font-bold">{settings.maxTotalExposurePct}%</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  valueClass,
}: {
  icon: typeof IconWallet;
  label: string;
  value: string;
  subValue?: string;
  valueClass?: string;
}) {
  return (
    <div className="surface-panel flex flex-col justify-between rounded-xl border border-white/10 p-4 shadow-[var(--shadow-chip)]">
      <div className="flex items-center justify-between">
        <span className="text-fg-muted text-xs font-medium">{label}</span>
        <div className="flex size-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-cyan-400">
          <Icon className="size-3.5" />
        </div>
      </div>
      <div className="mt-3">
        <p className={cn('text-fg font-mono text-2xl font-bold tracking-tight', valueClass)}>{value}</p>
        {subValue && <p className="text-fg-subtle mt-0.5 font-mono text-[11px]">{subValue}</p>}
      </div>
    </div>
  );
}

