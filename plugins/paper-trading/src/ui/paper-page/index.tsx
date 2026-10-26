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
import type { PluginPageProps } from '@kestrel/plugin-sdk/ui';
import { IconAlertTriangle, IconChartLine, IconLoader2 } from '@tabler/icons-react';
import { useState } from 'react';

import { PlaceOrderForm } from '../place-order-form';
import { StrategyRunsTable } from '../strategy-runs-table';
import { AccountSummary } from './account-summary';
import { AccountsHistoryPanel } from './accounts-history-panel';
import { DeskTabs, type PaperDeskTab } from './desk-tabs';
import { OrdersSection } from './orders-section';
import { PositionsSection } from './positions-section';
import { usePaperPage } from './use-paper-page';

export function PaperTradingPage(_props: PluginPageProps) {
  const {
    summary,
    strategyRuns,
    loading,
    error,
    busyId,
    load,
    closePosition,
    cancelOrder,
    resetAccount,
    strategyRunAction,
    deleteStrategyRun,
  } = usePaperPage();
  const [tab, setTab] = useState<PaperDeskTab>('positions');

  if (loading && !summary) {
    return (
      <div className="surface-panel flex items-center gap-2 rounded-xl border border-white/10 p-6 text-sm">
        <IconLoader2 className="text-brand size-4 animate-spin" />
        <span className="text-fg-muted">Loading paper accounts…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <div className="border-danger/30 bg-danger/5 text-danger flex items-start gap-2 rounded-lg border p-3 text-xs">
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span className="whitespace-pre-wrap">{error}</span>
        </div>
      ) : null}

      <AccountSummary summary={summary} />

      {/* Execution desk: books on the left, order ticket always visible on the right. */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-8">
          <DeskTabs
            active={tab}
            onSelect={setTab}
            loading={loading}
            onRefresh={() => void load()}
            openCount={(summary?.openPositions.length ?? 0) + (summary?.pendingOrders.length ?? 0)}
            strategyCount={strategyRuns.length}
          />

          <div
            id={`paper-desk-${tab}`}
            role="tabpanel"
            aria-labelledby={`paper-desk-${tab}-tab`}
            tabIndex={0}
            className="flex flex-col gap-4 outline-none"
          >
            {tab === 'positions' ? (
              <>
                <PositionsSection
                  positions={summary?.openPositions ?? []}
                  busyId={busyId}
                  onClose={(position, half) => {
                    const halfQuantity = half
                      ? Number((position.quantity / 2).toFixed(6))
                      : undefined;
                    if (half && (!halfQuantity || halfQuantity <= 0)) return;
                    void closePosition(position.id, halfQuantity);
                  }}
                />
                <OrdersSection
                  orders={summary?.pendingOrders ?? []}
                  busyId={busyId}
                  onCancel={(order) => void cancelOrder(order.id)}
                />
              </>
            ) : null}

            {tab === 'strategies' ? (
              <section className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <IconChartLine className="text-fg-subtle size-4" />
                  <h2 className="text-fg text-sm font-semibold">Deployed strategies</h2>
                  <span className="text-fg-subtle font-mono text-[10px]">
                    {strategyRuns.length}
                  </span>
                </div>
                <StrategyRunsTable
                  runs={strategyRuns}
                  busyId={busyId}
                  onAction={(run, action) => void strategyRunAction(run, action)}
                  onDelete={(run) => void deleteStrategyRun(run)}
                />
              </section>
            ) : null}

            {tab === 'accounts' ? (
              <AccountsHistoryPanel
                summary={summary}
                busyId={busyId}
                onReset={(account) => void resetAccount(account.id)}
              />
            ) : null}
          </div>
        </div>

        <div className="lg:sticky lg:top-4 lg:col-span-4">
          <PlaceOrderForm accounts={summary?.accounts ?? []} onPlaced={() => void load()} />
        </div>
      </div>

      <footer className="text-fg-subtle text-[10px]">
        Virtual accounts only. Fills use bid/ask + synthetic spread/slippage; no real money or
        broker is involved.
      </footer>
    </div>
  );
}
