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
import type { PluginToolPartProps } from '@kestrel/plugin-sdk/ui';
import { IconArrowUpRight, IconCheck, IconLoader2 } from '@tabler/icons-react';

import { ClosePositionOutputSchema } from '../schemas';
import { fmtDate, fmtMoney, fmtNumber, fmtPrice, fmtQty, fmtR, toneClass } from './format';

export function ClosePositionCard({ output, state, errorMessage }: PluginToolPartProps) {
  if (state === 'loading') {
    return (
      <div className="surface-panel flex items-center gap-2 rounded-xl border border-white/10 p-3 text-xs">
        <IconLoader2 className="text-brand size-3.5 animate-spin" />
        <span className="text-fg-muted">Closing paper position…</span>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div className="border-danger/30 bg-danger/5 text-danger rounded-xl border p-3 text-xs">
        {errorMessage ?? 'Could not close position.'}
      </div>
    );
  }

  const parsed = ClosePositionOutputSchema.safeParse(output);
  if (!parsed.success) {
    return (
      <div className="border-warn/30 bg-warn/5 text-warn rounded-xl border p-3 text-xs">
        Unexpected close result.
      </div>
    );
  }

  const result = parsed.data;
  const { position, fill } = result;
  return (
    <section className="surface-panel flex flex-col gap-3 rounded-xl border border-white/10 p-4 shadow-[var(--shadow-chip)]">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-success/10 text-success flex size-8 items-center justify-center rounded-md">
            <IconCheck className="size-4" />
          </span>
          <div>
            <h3 className="text-fg text-sm font-semibold">
              {position.symbol} {position.status === 'closed' ? 'closed' : 'partially closed'}
            </h3>
            <p className="text-fg-subtle font-mono text-[10px]">
              {position.accountName} · {fmtDate(position.closeTime ?? position.entryTime)}
            </p>
          </div>
        </div>
        <span className={`font-mono text-sm font-bold ${toneClass(position.pnl)}`}>
          {fmtMoney(position.pnl)}
        </span>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Cell label="Entry" value={fmtPrice(position.entryPrice)} />
        <Cell label="Exit" value={fmtPrice(position.closePrice)} />
        <Cell label="Size" value={`${fmtQty(position.initialQuantity)} ${position.side}`} />
        <Cell label="R" value={fmtR(position.rMultiple)} tone={toneClass(position.rMultiple)} />
        <Cell label="Reason" value={position.closeReason ?? 'manual'} />
        <Cell label="Fees" value={fmtMoney(-Math.abs((fill?.fees ?? 0) + position.exitFee))} />
        <Cell label="Strategy note" value={position.notes ?? '—'} />
        <Cell
          label="Account equity"
          value={fmtMoney(
            position.status === 'closed' ? result.account.equity : result.account.equity,
          )}
        />
      </div>

      {fill ? (
        <p className="text-fg-subtle font-mono text-[10px]">
          Fill {fmtNumber(fill.quantity, 4)} @ {fmtNumber(fill.price, 4)} · fee{' '}
          {fmtMoney(-Math.abs(fill.fees))}
        </p>
      ) : null}

      <a
        href="/plugins/paper-trading"
        className="text-brand inline-flex items-center gap-1 self-end text-xs font-semibold hover:underline"
      >
        Open paper desk
        <IconArrowUpRight className="size-3.5" />
      </a>
    </section>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-bg-elev-1/60 border-border/40 flex flex-col gap-0.5 rounded-md border p-2">
      <span className="text-fg-subtle text-[10px] font-semibold tracking-wider uppercase">
        {label}
      </span>
      <span
        className={`truncate font-mono text-xs font-semibold tabular-nums ${tone ?? 'text-fg'}`}
      >
        {value}
      </span>
    </div>
  );
}
