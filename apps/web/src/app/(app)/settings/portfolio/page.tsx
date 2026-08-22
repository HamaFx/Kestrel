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
        <h2 className="text-fg text-lg font-semibold tracking-tight">Portfolio</h2>
        <p className="text-fg-subtle text-sm">Open positions, live P&amp;L, and risk analysis.</p>
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
          subValue={`${riskReport.totalExposurePct.toFixed(1)}% of account`}
        />
        <StatCard
          icon={IconShield}
          label="Total Risk"
          value={`$${riskReport.totalRiskUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          subValue={`${riskReport.totalRiskPct.toFixed(1)}% of account`}
        />
        <StatCard
          icon={IconAlertTriangle}
          label="Alerts"
          value={String(riskReport.alerts.length)}
          valueClass={riskReport.alerts.length > 0 ? 'text-warn' : ''}
        />
      </div>

      {/* Alerts */}
      {riskReport.alerts.length > 0 && (
        <div className="border-warn/30 bg-warn/10 rounded-sm border p-4">
          <div className="mb-2 flex items-center gap-2">
            <IconAlertTriangle className="text-warn size-4" />
            <h3 className="text-warn text-sm font-semibold">Risk Alerts</h3>
          </div>
          <ul className="space-y-1">
            {riskReport.alerts.map((alert, i) => (
              <li
                key={i}
                className={cn('text-sm', alert.level === 'danger' ? 'text-bear' : 'text-warn')}
              >
                • {alert.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Positions Table */}
      {positions.length > 0 && (
        <div className="border-border bg-bg-elev-1 overflow-hidden rounded-sm border">
          <div className="border-border border-b px-4 py-3">
            <h3 className="text-fg text-sm font-semibold">Open Positions</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border bg-bg-elev-1 border-b">
                  <th className="text-fg-muted px-4 py-2 text-left font-medium">Symbol</th>
                  <th className="text-fg-muted px-4 py-2 text-left font-medium">Direction</th>
                  <th className="text-fg-muted px-4 py-2 text-right font-medium">Lots</th>
                  <th className="text-fg-muted px-4 py-2 text-right font-medium">Entry</th>
                  <th className="text-fg-muted px-4 py-2 text-right font-medium">Current</th>
                  <th className="text-fg-muted px-4 py-2 text-right font-medium">P&amp;L ($)</th>
                  <th className="text-fg-muted px-4 py-2 text-right font-medium">P&amp;L (%)</th>
                  <th className="text-fg-muted px-4 py-2 text-right font-medium">R:R</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.id} className="border-border/50 border-b last:border-0">
                    <td className="text-fg px-4 py-3 font-medium">{p.symbol}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'rounded-sm px-2 py-0.5 text-xs font-medium',
                          p.direction === 'long' ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear',
                        )}
                      >
                        {p.direction.toUpperCase()}
                      </span>
                    </td>
                    <td className="text-fg px-4 py-3 text-right">{p.lotSize.toFixed(2)}</td>
                    <td className="text-fg px-4 py-3 text-right">{p.entryPrice.toFixed(2)}</td>
                    <td className="text-fg px-4 py-3 text-right">
                      {p.stale ? (
                        <span className="text-fg-muted italic">stale</span>
                      ) : (
                        (p.currentPrice?.toFixed(2) ?? '—')
                      )}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-3 text-right font-medium',
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
                        'px-4 py-3 text-right',
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
                    <td className="text-fg px-4 py-3 text-right">
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
        <div className="border-border bg-bg-elev-1 rounded-sm border p-4">
          <h3 className="text-fg mb-3 text-sm font-semibold">Concentration</h3>
          <div className="space-y-2">
            {riskReport.concentration.map((c) => (
              <div key={c.symbol} className="flex items-center gap-3">
                <span className="text-fg w-20 text-sm">{c.symbol}</span>
                <div className="bg-bg-elev-1 h-2 flex-1 overflow-hidden rounded-sm">
                  <div
                    className={cn('h-full rounded-sm', c.alert ? 'bg-warn' : 'bg-fg')}
                    style={{ width: `${Math.min(c.pct, 100)}%` }}
                  />
                </div>
                <span
                  className={cn(
                    'w-16 text-right text-sm',
                    c.alert ? 'text-warn font-medium' : 'text-fg-muted',
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
      <div className="border-border bg-bg-elev-1 rounded-sm border p-4">
        <h3 className="text-fg mb-3 text-sm font-semibold">Account Settings</h3>
        <p className="text-fg-subtle mb-3 text-xs">
          Set your account balance and risk preferences below.
        </p>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-fg-muted">Account Balance</dt>
            <dd className="text-fg font-medium">
              {settings.accountBalance ? `$${settings.accountBalance.toLocaleString()}` : 'Not set'}
            </dd>
          </div>
          <div>
            <dt className="text-fg-muted">Base Currency</dt>
            <dd className="text-fg font-medium">{settings.baseCurrency}</dd>
          </div>
          <div>
            <dt className="text-fg-muted">Max Risk / Trade</dt>
            <dd className="text-fg font-medium">{settings.maxRiskPerTradePct}%</dd>
          </div>
          <div>
            <dt className="text-fg-muted">Max Total Exposure</dt>
            <dd className="text-fg font-medium">{settings.maxTotalExposurePct}%</dd>
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
    <div className="border-border bg-bg-elev-1 rounded-sm border p-4">
      <div className="text-fg-subtle flex items-center gap-2">
        <Icon className="size-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className={cn('text-fg mt-2 text-2xl font-bold', valueClass)}>{value}</p>
      {subValue && <p className="text-fg-muted mt-0.5 text-xs">{subValue}</p>}
    </div>
  );
}
