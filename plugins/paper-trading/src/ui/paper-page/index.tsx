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
import {
  IconAlertTriangle,
  IconChartLine,
  IconLoader2,
  IconRefresh,
  IconWallet,
} from '@tabler/icons-react';

import { AccountCards } from '../account-cards';
import { fmtDate, fmtMoney, fmtNumber, fmtQty, toneClass } from '../format';
import { PlaceOrderForm } from '../place-order-form';
import { StrategyRunsTable } from '../strategy-runs-table';
import { AccountSummary } from './account-summary';
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

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconWallet className="text-fg-subtle size-4" />
            <h2 className="text-fg text-sm font-semibold">Accounts</h2>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="text-fg-subtle hover:text-fg inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-semibold disabled:opacity-50"
          >
            {loading ? (
              <IconLoader2 className="size-3.5 animate-spin" />
            ) : (
              <IconRefresh className="size-3.5" />
            )}
            Refresh
          </button>
        </div>
        <AccountCards
          accounts={summary?.accounts ?? []}
          busyId={busyId}
          onReset={(account) => void resetAccount(account.id)}
        />
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <IconChartLine className="text-fg-subtle size-4" />
          <h2 className="text-fg text-sm font-semibold">Deployed strategies</h2>
          <span className="text-fg-subtle font-mono text-[10px]">{strategyRuns.length}</span>
        </div>
        <StrategyRunsTable
          runs={strategyRuns}
          busyId={busyId}
          onAction={(run, action) => void strategyRunAction(run, action)}
          onDelete={(run) => void deleteStrategyRun(run)}
        />
      </section>

      <PlaceOrderForm accounts={summary?.accounts ?? []} onPlaced={() => void load()} />

      <PositionsSection
        positions={summary?.openPositions ?? []}
        busyId={busyId}
        onClose={(position, half) => {
          const halfQuantity = half ? Number((position.quantity / 2).toFixed(6)) : undefined;
          if (half && (!halfQuantity || halfQuantity <= 0)) return;
          void closePosition(position.id, halfQuantity);
        }}
      />

      <OrdersSection
        orders={summary?.pendingOrders ?? []}
        busyId={busyId}
        onCancel={(order) => void cancelOrder(order.id)}
      />

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="surface-panel flex flex-col gap-2 rounded-xl border border-white/10 p-4">
          <h2 className="text-fg text-sm font-semibold">Recent closes</h2>
          {(summary?.recentClosed.length ?? 0) === 0 ? (
            <p className="text-fg-subtle text-xs">No closed trades yet.</p>
          ) : (
            <ul className="divide-border/40 flex flex-col divide-y">
              {summary?.recentClosed.map((position) => (
                <li key={position.id} className="flex items-center justify-between gap-2 py-1.5">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-fg font-mono text-[11px] font-semibold">
                      {position.symbol} · {position.side} {fmtQty(position.initialQuantity)}
                    </span>
                    <span className="text-fg-subtle font-mono text-[10px]">
                      {position.closeReason ?? 'closed'} ·{' '}
                      {fmtDate(position.closeTime ?? position.entryTime)}
                    </span>
                  </div>
                  <span className={`font-mono text-xs font-semibold ${toneClass(position.pnl)}`}>
                    {fmtMoney(position.pnl)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="surface-panel flex flex-col gap-2 rounded-xl border border-white/10 p-4">
          <h2 className="text-fg text-sm font-semibold">Execution ledger</h2>
          {(summary?.recentFills.length ?? 0) === 0 ? (
            <p className="text-fg-subtle text-xs">No fills yet.</p>
          ) : (
            <ul className="divide-border/40 flex max-h-64 flex-col divide-y overflow-auto">
              {summary?.recentFills.map((fill) => (
                <li key={fill.id} className="flex items-center justify-between gap-2 py-1.5">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-fg font-mono text-[10px] uppercase">{fill.kind}</span>
                    <span className="text-fg-subtle font-mono text-[10px]">
                      {fmtNumber(fill.quantity, 4)} @ {fmtNumber(fill.price, 4)} ·{' '}
                      {fmtDate(fill.ts)}
                    </span>
                  </div>
                  <span className={`font-mono text-[11px] ${toneClass(fill.pnl)}`}>
                    {fmtMoney(fill.pnl)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <footer className="text-fg-subtle text-[10px]">
        Virtual accounts only. Fills use bid/ask + synthetic spread/slippage; no real money or
        broker is involved.
      </footer>
    </div>
  );
}
