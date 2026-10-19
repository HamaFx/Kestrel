// SPDX-License-Identifier: Apache-2.0

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

import { IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { SkeletonCard } from '@/components/ui/skeleton';
import { apiFetch, apiMutate } from '@/lib/api-client';
import { toastApiError } from '@/lib/toast-api-error';

interface WalletResponse {
  userId: string;
  planName: string;
  status: string;
  monthlyCredits: number;
  wallet: {
    availableCredits: number;
    lifetimeGranted: number;
    lifetimeConsumed: number;
  };
  ledger: Array<{
    id: string;
    kind: string;
    amountCredits: number;
    balanceAfter: number | null;
    createdAt: string;
  }>;
}

export function AdminBilling() {
  const [userId, setUserId] = useState('');
  const [data, setData] = useState<WalletResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  async function lookup() {
    if (!userId.trim()) return;
    setLoading(true);
    try {
      const result = await apiFetch<WalletResponse>(
        `/api/admin/billing/wallet/${encodeURIComponent(userId.trim())}`,
      );
      setData(result);
    } catch (err) {
      toastApiError(err, 'Wallet lookup failed');
    } finally {
      setLoading(false);
    }
  }

  async function adjust() {
    const parsed = Number(amount);
    if (!data || !Number.isInteger(parsed) || parsed === 0 || reason.trim().length < 3) {
      toast.error('Enter a non-zero integer amount and a reason');
      return;
    }
    setAdjusting(true);
    try {
      await apiMutate('/api/admin/billing/adjustment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: data.userId, amountCredits: parsed, reason: reason.trim() }),
      });
      toast.success('Credit adjustment applied');
      setAmount('');
      setReason('');
      await lookup();
    } catch (err) {
      toastApiError(err, 'Adjustment failed');
    } finally {
      setAdjusting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-sm border p-4">
        <h2 className="text-fg text-sm font-semibold">Credit wallet lookup</h2>
        <div className="flex flex-wrap gap-2">
          <input
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            placeholder="User ID"
            className="border-border bg-bg-elev-2 text-fg min-w-60 flex-1 rounded-sm border px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void lookup()}
            disabled={loading}
            className="bg-fg inline-flex items-center gap-1.5 rounded-sm px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            <IconSearch className="size-4" /> Look up
          </button>
        </div>
      </div>

      {loading && <SkeletonCard lines={4} />}

      {data && (
        <>
          <div className="border-border bg-bg-elev-1 grid grid-cols-2 gap-3 rounded-sm border p-4 text-sm sm:grid-cols-4">
            <Metric label="Plan" value={`${data.planName} (${data.status})`} />
            <Metric label="Available" value={data.wallet.availableCredits.toLocaleString()} />
            <Metric label="Granted" value={data.wallet.lifetimeGranted.toLocaleString()} />
            <Metric label="Consumed" value={data.wallet.lifetimeConsumed.toLocaleString()} />
          </div>

          <div className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-sm border p-4">
            <h2 className="text-fg text-sm font-semibold">Manual adjustment</h2>
            <p className="text-fg-subtle text-xs">
              Positive grants or negative deductions. Every adjustment is written to the admin
              audit log.
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="numeric"
                placeholder="Credits (+/-)"
                className="border-border bg-bg-elev-2 text-fg w-40 rounded-sm border px-3 py-2 text-sm"
              />
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Reason"
                className="border-border bg-bg-elev-2 text-fg min-w-60 flex-1 rounded-sm border px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void adjust()}
                disabled={adjusting}
                className="border-border bg-bg-elev-2 text-fg hover:border-brand/40 rounded-sm border px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </div>

          <div className="border-border bg-bg-elev-1 overflow-x-auto rounded-sm border p-4">
            <h2 className="text-fg mb-3 text-sm font-semibold">Recent ledger</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border text-fg-subtle border-b text-left">
                  <th className="pb-2 pr-4 font-medium">Date</th>
                  <th className="pb-2 pr-4 font-medium">Kind</th>
                  <th className="pb-2 pr-4 text-right font-medium">Credits</th>
                  <th className="pb-2 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.ledger.map((row) => (
                  <tr key={row.id} className="border-border/50 border-b">
                    <td className="text-fg-subtle py-2 pr-4">
                      {new Date(row.createdAt).toLocaleString()}
                    </td>
                    <td className="text-fg py-2 pr-4">{row.kind.replace(/_/g, ' ')}</td>
                    <td
                      className={`py-2 pr-4 text-right font-mono ${
                        row.amountCredits >= 0 ? 'text-success' : 'text-fg'
                      }`}
                    >
                      {row.amountCredits > 0 ? '+' : ''}
                      {row.amountCredits.toLocaleString()}
                    </td>
                    <td className="text-fg-subtle py-2 text-right font-mono">
                      {row.balanceAfter?.toLocaleString() ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-fg-subtle text-[11px] tracking-wide uppercase">{label}</p>
      <p className="text-fg mt-0.5 font-mono text-sm font-semibold">{value}</p>
    </div>
  );
}
