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
import { useCallback, useEffect, useState } from 'react';
import type { z } from 'zod';

import type { SummaryOutputSchema } from '../schemas';
import { AccountCards } from './account-cards';
import { errorMessage, pluginFetch } from './api';
import { fmtDate, fmtMoney, fmtMoneyPlain, fmtNumber, fmtQty, toneClass } from './format';
import { OrdersTable } from './orders-table';
import { PlaceOrderForm } from './place-order-form';
import { PositionsTable } from './positions-table';

type Summary = z.infer<typeof SummaryOutputSchema>;

export function PaperTradingPage(_props: PluginPageProps) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await pluginFetch<Summary>('/summary'));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      void load();
    }, 15_000);
    return () => clearInterval(timer);
  }, [load]);

  const closePosition = useCallback(
    async (positionId: string, quantity?: number) => {
      setBusyId(positionId);
      setError(null);
      try {
        await pluginFetch(`/positions/${encodeURIComponent(positionId)}/close`, {
          method: 'POST',
          body: JSON.stringify(quantity !== undefined ? { quantity } : {}),
        });
        await load();
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const cancelOrder = useCallback(
    async (orderId: string) => {
      setBusyId(orderId);
      setError(null);
      try {
        await pluginFetch(`/orders/${encodeURIComponent(orderId)}`, { method: 'DELETE' });
        await load();
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const resetAccount = useCallback(
    async (accountId: string) => {
      if (!window.confirm('Reset this account? Positions, orders and fills will be deleted.')) {
        return;
      }
      setBusyId(accountId);
      setError(null);
      try {
        await pluginFetch(`/accounts/${encodeURIComponent(accountId)}/reset`, {
          method: 'POST',
          body: JSON.stringify({ confirm: true }),
        });
        await load();
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

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

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Total equity" value={fmtMoneyPlain(summary?.totalEquity ?? 0)} />
        <div className="surface-panel flex flex-col gap-0.5 rounded-xl border border-white/10 p-3">
          <span className="text-fg-subtle text-[10px] font-semibold tracking-wider uppercase">
            Open P&L
          </span>
          <span
            className={`font-mono text-lg font-semibold tabular-nums ${toneClass(
              summary?.totalUnrealizedPnl ?? 0,
            )}`}
          >
            {fmtMoney(summary?.totalUnrealizedPnl ?? 0)}
          </span>
        </div>
        <Stat label="Open positions" value={String(summary?.openPositions.length ?? 0)} />
        <Stat label="Resting orders" value={String(summary?.pendingOrders.length ?? 0)} />
      </section>

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

      <PlaceOrderForm accounts={summary?.accounts ?? []} onPlaced={() => void load()} />

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <IconChartLine className="text-fg-subtle size-4" />
          <h2 className="text-fg text-sm font-semibold">Open positions</h2>
          <span className="text-fg-subtle font-mono text-[10px]">
            {summary?.openPositions.length ?? 0}
          </span>
        </div>
        <PositionsTable
          positions={summary?.openPositions ?? []}
          busyId={busyId}
          onClose={(position, half) => {
            const halfQuantity = half ? Number((position.quantity / 2).toFixed(6)) : undefined;
            if (half && (!halfQuantity || halfQuantity <= 0)) return;
            void closePosition(position.id, halfQuantity);
          }}
        />
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-fg text-sm font-semibold">Resting orders</h2>
          <span className="text-fg-subtle font-mono text-[10px]">
            {summary?.pendingOrders.length ?? 0}
          </span>
        </div>
        <OrdersTable
          orders={summary?.pendingOrders ?? []}
          busyId={busyId}
          onCancel={(order) => void cancelOrder(order.id)}
        />
      </section>

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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-panel flex flex-col gap-0.5 rounded-xl border border-white/10 p-3">
      <span className="text-fg-subtle text-[10px] font-semibold tracking-wider uppercase">
        {label}
      </span>
      <span className="text-fg font-mono text-lg font-semibold tabular-nums">{value}</span>
    </div>
  );
}
