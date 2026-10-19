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

'use client';

import { IconLoader2 } from '@tabler/icons-react';
import { useState } from 'react';

interface LedgerRow {
  id: string;
  kind: string;
  amountCredits: number;
  balanceAfter: number | null;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
}

const KIND_LABEL: Record<string, string> = {
  subscription_grant: 'Subscription grant',
  topup_grant: 'Top-up',
  promo_grant: 'Promo grant',
  admin_adjustment: 'Adjustment',
  consumption: 'Usage',
  refund: 'Refund',
  expiration: 'Expiration',
  reservation: 'Reserved',
  release: 'Released',
  reconcile: 'Settled',
};

function formatAmount(amount: number): string {
  return `${amount > 0 ? '+' : ''}${amount.toLocaleString()}`;
}

export function LedgerTable({
  initialRows,
  initialCursor,
}: {
  initialRows: LedgerRow[];
  initialCursor: string | null;
}) {
  const [rows, setRows] = useState(initialRows);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ cursor, limit: '25' });
      if (filter) params.set('kind', filter);
      const res = await fetch(`/api/billing/ledger?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setRows((prev) => [...prev, ...(data.rows ?? [])]);
        setCursor(data.nextCursor ?? null);
      }
    } finally {
      setLoading(false);
    }
  }

  async function applyFilter(kind: string) {
    setFilter(kind);
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '25' });
      if (kind) params.set('kind', kind);
      const res = await fetch(`/api/billing/ledger?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setRows(data.rows ?? []);
        setCursor(data.nextCursor ?? null);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-sm border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-fg text-sm font-semibold">Credit ledger</h3>
        <select
          value={filter}
          onChange={(event) => void applyFilter(event.target.value)}
          className="border-border bg-bg-elev-2 text-fg rounded-sm border px-2 py-1 text-xs"
          aria-label="Filter ledger by kind"
        >
          <option value="">All movements</option>
          {Object.entries(KIND_LABEL).map(([kind, label]) => (
            <option key={kind} value={kind}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {rows.length === 0 ? (
        <p className="text-fg-subtle text-sm">No credit movements yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border text-fg-subtle border-b text-left">
                <th className="pr-4 pb-2 font-medium">Date</th>
                <th className="pr-4 pb-2 font-medium">Type</th>
                <th className="pr-4 pb-2 text-right font-medium">Credits</th>
                <th className="pr-4 pb-2 text-right font-medium">Balance</th>
                <th className="pb-2 font-medium">Reference</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-border/50 border-b">
                  <td className="text-fg py-2 pr-4 whitespace-nowrap">
                    {new Date(row.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="text-fg-subtle py-2 pr-4">
                    {KIND_LABEL[row.kind] ?? row.kind.replace(/_/g, ' ')}
                  </td>
                  <td
                    className={`py-2 pr-4 text-right font-mono ${
                      row.amountCredits >= 0 ? 'text-success' : 'text-fg'
                    }`}
                  >
                    {formatAmount(row.amountCredits)}
                  </td>
                  <td className="text-fg-subtle py-2 pr-4 text-right font-mono">
                    {row.balanceAfter?.toLocaleString() ?? '—'}
                  </td>
                  <td className="text-fg-subtle max-w-[16rem] truncate py-2 font-mono text-xs">
                    {row.referenceType ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {cursor && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loading}
          className="text-brand inline-flex items-center gap-1.5 self-start text-xs font-semibold hover:underline disabled:opacity-50"
        >
          {loading && <IconLoader2 className="size-3.5 animate-spin" />}
          Load more
        </button>
      )}
    </section>
  );
}
