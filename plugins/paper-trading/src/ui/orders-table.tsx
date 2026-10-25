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
import { IconLoader2, IconX } from '@tabler/icons-react';
import type { z } from 'zod';

import type { OrderSchema } from '../schemas';
import { fmtDate, fmtNumber, fmtPrice, fmtQty } from './format';

type Order = z.infer<typeof OrderSchema>;

export function OrdersTable({
  orders,
  busyId,
  onCancel,
}: {
  orders: readonly Order[];
  busyId?: string | null;
  onCancel?: (order: Order) => void;
}) {
  if (orders.length === 0) {
    return (
      <div className="border-border/50 text-fg-subtle rounded-xl border border-dashed p-6 text-center text-xs">
        No resting orders.
      </div>
    );
  }

  return (
    <div className="border-border/50 overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[720px] text-left text-xs">
        <thead className="bg-bg-elev-2/60 text-fg-subtle font-mono text-[10px] uppercase">
          <tr>
            <th className="px-2.5 py-2 font-semibold">Market</th>
            <th className="px-2.5 py-2 font-semibold">Side</th>
            <th className="px-2.5 py-2 font-semibold">Type</th>
            <th className="px-2.5 py-2 text-right font-semibold">Qty</th>
            <th className="px-2.5 py-2 text-right font-semibold">Trigger</th>
            <th className="px-2.5 py-2 text-right font-semibold">SL</th>
            <th className="px-2.5 py-2 text-right font-semibold">TP</th>
            <th className="px-2.5 py-2 font-semibold">Status</th>
            <th className="px-2.5 py-2 font-semibold">Created</th>
            {onCancel ? <th className="px-2.5 py-2" /> : null}
          </tr>
        </thead>
        <tbody className="divide-border/40 divide-y">
          {orders.map((order) => (
            <tr key={order.id} className="hover:bg-bg-elev-1/40">
              <td className="text-fg px-2.5 py-2 font-mono text-[11px] font-semibold">
                {order.symbol}
              </td>
              <td className="px-2.5 py-2">
                <span
                  className={
                    order.side === 'buy'
                      ? 'bg-bull/10 text-bull rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase'
                      : 'bg-bear/10 text-bear rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase'
                  }
                >
                  {order.side}
                </span>
              </td>
              <td className="text-fg-muted px-2.5 py-2 font-mono text-[10px] uppercase">
                {order.type}
              </td>
              <td className="text-fg px-2.5 py-2 text-right font-mono tabular-nums">
                {fmtQty(order.quantity)}
              </td>
              <td className="text-fg-muted px-2.5 py-2 text-right font-mono tabular-nums">
                {fmtPrice(order.limitPrice ?? order.stopPrice)}
              </td>
              <td className="text-fg-muted px-2.5 py-2 text-right font-mono tabular-nums">
                {fmtPrice(order.stopLoss)}
              </td>
              <td className="text-fg-muted px-2.5 py-2 text-right font-mono tabular-nums">
                {fmtPrice(order.takeProfit)}
              </td>
              <td className="text-fg-subtle px-2.5 py-2 font-mono text-[10px] uppercase">
                {order.status}
              </td>
              <td className="text-fg-subtle px-2.5 py-2 font-mono text-[10px]">
                {fmtDate(order.createdAt)}
              </td>
              {onCancel && order.status === 'pending' ? (
                <td className="px-2.5 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onCancel(order)}
                    disabled={busyId !== null}
                    className="text-fg-subtle hover:text-danger inline-flex size-7 items-center justify-center rounded-md disabled:opacity-40"
                    aria-label="Cancel order"
                  >
                    {busyId === order.id ? (
                      <IconLoader2 className="size-3.5 animate-spin" />
                    ) : (
                      <IconX className="size-3.5" />
                    )}
                  </button>
                </td>
              ) : onCancel ? (
                <td />
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-fg-subtle border-border/40 border-t px-3 py-1.5 text-[10px]">
        Sizes are lots for FX/gold and coins for crypto. Trigger is the limit/stop price.{' '}
        {fmtNumber(orders.length, 0)} rows
      </p>
    </div>
  );
}
