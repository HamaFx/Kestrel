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

interface Payment {
  id: string;
  nowpaymentsPaymentId: string;
  status: string;
  payAmount: string | null;
  payCurrency: string | null;
  usdAmountCents: number | null;
  txHash: string | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  waiting: 'text-warn',
  confirming: 'text-info',
  confirmed: 'text-info',
  sending: 'text-info',
  finished: 'text-success',
  failed: 'text-danger',
  expired: 'text-fg-subtle',
  refunded: 'text-info',
};

export function PaymentHistory({ payments }: { payments: Payment[] }) {
  if (payments.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <h3 className="text-fg text-sm font-semibold">Payment History</h3>
        <p className="text-fg-subtle text-sm">No payments yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-fg text-sm font-semibold">Payment History</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border text-fg-subtle border-b text-left">
              <th className="pr-4 pb-2 font-medium">Date</th>
              <th className="pr-4 pb-2 font-medium">Status</th>
              <th className="pr-4 pb-2 font-medium">Amount</th>
              <th className="pr-4 pb-2 font-medium">Currency</th>
              <th className="pb-2 font-medium">Tx Hash</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => {
              const date = new Date(payment.createdAt);
              const statusColor = STATUS_COLORS[payment.status] ?? 'text-fg-subtle';
              return (
                <tr key={payment.id} className="border-border/50 border-b">
                  <td className="text-fg py-2 pr-4">
                    {date.toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td className={`py-2 pr-4 capitalize ${statusColor}`}>{payment.status}</td>
                  <td className="text-fg py-2 pr-4">{payment.payAmount ?? '—'}</td>
                  <td className="text-fg py-2 pr-4 uppercase">{payment.payCurrency ?? '—'}</td>
                  <td className="text-fg-subtle py-2 font-mono text-xs">
                    {payment.txHash ? `${payment.txHash.slice(0, 12)}…` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
