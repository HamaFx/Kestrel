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
import { OrdersTable } from '../orders-table';
import type { Summary } from './use-paper-page';

type Order = Summary['pendingOrders'][number];

export function OrdersSection({
  orders,
  busyId,
  onCancel,
}: {
  orders: readonly Order[];
  busyId: string | null;
  onCancel: (order: Order) => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className="text-fg text-sm font-semibold">Resting orders</h2>
        <span className="text-fg-subtle font-mono text-[10px]">{orders.length}</span>
      </div>
      <OrdersTable orders={orders} busyId={busyId} onCancel={onCancel} />
    </section>
  );
}
