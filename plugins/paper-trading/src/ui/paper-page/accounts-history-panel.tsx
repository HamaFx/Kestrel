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

// Accounts & history view of the paper-trading desk: the virtual account
// cards plus the recent-closes and execution-ledger feeds.
import type { z } from 'zod';

import type { AccountSchema } from '../../schemas';
import { AccountCards } from '../account-cards';
import { fmtDate, fmtMoney, fmtNumber, fmtQty, toneClass } from '../format';
import type { Summary } from './use-paper-page';

type Account = z.infer<typeof AccountSchema>;

export function AccountsHistoryPanel({
  summary,
  busyId,
  onReset,
}: {
  summary: Summary | null;
  busyId: string | null;
  onReset: (account: Account) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <h2 className="text-fg text-sm font-semibold">Virtual accounts</h2>
        <AccountCards accounts={summary?.accounts ?? []} busyId={busyId} onReset={onReset} />
      </section>

      <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
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
    </div>
  );
}
