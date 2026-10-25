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
import { fmtMoney, fmtMoneyPlain, toneClass } from '../format';
import type { Summary } from './use-paper-page';

export function AccountSummary({ summary }: { summary: Summary | null }) {
  return (
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
