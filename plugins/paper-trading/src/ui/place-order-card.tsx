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
import {
  IconAlertTriangle,
  IconArrowUpRight,
  IconClock,
  IconLoader2,
  IconRobot,
  IconShieldCheck,
} from '@tabler/icons-react';

import { PlaceOrderOutputSchema } from '../schemas';
import { fmtMoney, fmtPrice, fmtQty, toneClass } from './format';

export function PlaceOrderCard({ output, state, errorMessage }: PluginToolPartProps) {
  if (state === 'loading') {
    return (
      <div className="surface-panel flex items-center gap-2 rounded-xl border border-white/10 p-3 text-xs">
        <IconLoader2 className="text-brand size-3.5 animate-spin" />
        <span className="text-fg-muted">Working the paper order…</span>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div className="border-danger/30 bg-danger/5 text-danger flex items-start gap-2 rounded-xl border p-3 text-xs">
        <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
        <span>{errorMessage ?? 'Paper order failed.'}</span>
      </div>
    );
  }

  const parsed = PlaceOrderOutputSchema.safeParse(output);
  if (!parsed.success) {
    return (
      <div className="border-warn/30 bg-warn/5 text-warn rounded-xl border p-3 text-xs">
        Unexpected paper order result.
      </div>
    );
  }

  const result = parsed.data;
  const sandbox = result.account.mode === 'autonomous_sandbox';
  const filled = result.position !== null;

  return (
    <section className="surface-panel flex flex-col gap-3 rounded-xl border border-white/10 p-4 shadow-[var(--shadow-chip)]">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <span
            className={
              sandbox
                ? 'bg-success/10 text-success flex size-9 items-center justify-center rounded-md'
                : 'bg-brand/10 text-brand flex size-9 items-center justify-center rounded-md'
            }
          >
            {sandbox ? <IconRobot className="size-4" /> : <IconShieldCheck className="size-4" />}
          </span>
          <div className="flex flex-col gap-0.5">
            <h3 className="text-fg text-sm font-semibold">{result.account.name}</h3>
            <p className="text-fg-subtle font-mono text-[10px] uppercase">
              {sandbox ? 'autonomous sandbox' : 'personal · approved'}
            </p>
          </div>
        </div>
        <span
          className={
            filled
              ? 'bg-success/10 text-success rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase'
              : 'bg-warn/10 text-warn rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase'
          }
        >
          {filled ? 'filled' : 'resting'}
        </span>
      </header>

      <p className="text-fg-muted text-xs">{result.message}</p>

      {result.position ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Cell label="Market" value={result.position.symbol} />
          <Cell label="Side" value={result.position.side.toUpperCase()} />
          <Cell label="Quantity" value={fmtQty(result.position.initialQuantity)} />
          <Cell label="Entry" value={fmtPrice(result.position.entryPrice)} />
          <Cell label="Stop" value={fmtPrice(result.position.stopLoss)} />
          <Cell label="Target" value={fmtPrice(result.position.takeProfit)} />
          <Cell label="Risk" value={fmtMoney(result.position.initialRiskAmount)} />
          <Cell
            label="Account equity"
            value={fmtMoney(result.account.equity)}
            tone={toneClass(result.account.unrealizedPnl)}
          />
        </div>
      ) : null}

      {result.order ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Cell label="Market" value={result.order.symbol} />
          <Cell label="Side" value={result.order.side.toUpperCase()} />
          <Cell label="Type" value={result.order.type.toUpperCase()} />
          <Cell label="Quantity" value={fmtQty(result.order.quantity)} />
          <Cell
            label="Trigger"
            value={fmtPrice(result.order.limitPrice ?? result.order.stopPrice)}
          />
          <Cell label="Stop" value={fmtPrice(result.order.stopLoss)} />
          <Cell label="Target" value={fmtPrice(result.order.takeProfit)} />
          <Cell label="Expires" value={result.order.expiresAt ? 'Day order' : 'GTC'} />
        </div>
      ) : null}

      {result.warnings.length > 0 ? (
        <ul className="text-warn flex flex-col gap-1 text-[11px]">
          {result.warnings.map((warning) => (
            <li key={warning} className="flex items-start gap-1.5">
              <IconAlertTriangle className="mt-0.5 size-3 shrink-0" />
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <footer className="flex items-center justify-between gap-2">
        <span className="text-fg-subtle flex items-center gap-1 font-mono text-[10px]">
          <IconClock className="size-3" />
          {filled ? 'Filled now' : 'Waiting for the tick bus'} · virtual money
        </span>
        <a
          href="/plugins/paper-trading"
          className="text-brand inline-flex items-center gap-1 text-xs font-semibold hover:underline"
        >
          Open paper desk
          <IconArrowUpRight className="size-3.5" />
        </a>
      </footer>
    </section>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-bg-elev-1/60 border-border/40 flex flex-col gap-0.5 rounded-md border p-2">
      <span className="text-fg-subtle text-[10px] font-semibold tracking-wider uppercase">
        {label}
      </span>
      <span className={`font-mono text-xs font-semibold tabular-nums ${tone ?? 'text-fg'}`}>
        {value}
      </span>
    </div>
  );
}
