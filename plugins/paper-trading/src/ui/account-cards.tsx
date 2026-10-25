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
import { IconRefresh, IconRobot, IconShieldCheck } from '@tabler/icons-react';
import type { z } from 'zod';

import type { AccountSchema } from '../schemas';
import { fmtMoney, fmtMoneyPlain, fmtNumber, fmtPct, toneClass } from './format';

type Account = z.infer<typeof AccountSchema>;

export function AccountCards({
  accounts,
  busyId,
  onReset,
}: {
  accounts: readonly Account[];
  busyId?: string | null;
  onReset?: (account: Account) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {accounts.map((account) => {
        const sandbox = account.mode === 'autonomous_sandbox';
        return (
          <article
            key={account.id}
            className="surface-panel flex flex-col gap-3 rounded-xl border border-white/10 p-4 shadow-[var(--shadow-chip)]"
          >
            <header className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2.5">
                <span
                  className={
                    sandbox
                      ? 'bg-success/10 text-success flex size-9 items-center justify-center rounded-md'
                      : 'bg-brand/10 text-brand flex size-9 items-center justify-center rounded-md'
                  }
                >
                  {sandbox ? (
                    <IconRobot className="size-4" />
                  ) : (
                    <IconShieldCheck className="size-4" />
                  )}
                </span>
                <div className="flex flex-col gap-0.5">
                  <h3 className="text-fg text-sm font-semibold">{account.name}</h3>
                  <span className="text-fg-subtle font-mono text-[10px] uppercase">
                    {sandbox ? 'autonomous sandbox' : 'confirm every order'}
                  </span>
                </div>
              </div>
              {onReset ? (
                <button
                  type="button"
                  onClick={() => onReset(account)}
                  disabled={busyId === account.id}
                  className="text-fg-subtle hover:text-fg border-border/60 inline-flex size-8 items-center justify-center rounded-md border disabled:opacity-40"
                  aria-label={`Reset ${account.name}`}
                  title="Reset account"
                >
                  <IconRefresh
                    className={`size-3.5 ${busyId === account.id ? 'animate-spin' : ''}`}
                  />
                </button>
              ) : null}
            </header>

            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="text-fg-subtle text-[10px] font-semibold tracking-wider uppercase">
                  Equity
                </p>
                <p className="text-fg font-mono text-xl font-semibold tabular-nums">
                  {fmtMoneyPlain(account.equity)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-fg-subtle text-[10px] font-semibold tracking-wider uppercase">
                  Open P&L
                </p>
                <p
                  className={`font-mono text-sm font-semibold tabular-nums ${toneClass(
                    account.unrealizedPnl,
                  )}`}
                >
                  {fmtMoney(account.unrealizedPnl)}
                </p>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
              <Cell label="Balance" value={fmtMoneyPlain(account.balance)} />
              <Cell label="Margin" value={fmtMoneyPlain(account.marginUsed)} />
              <Cell label="Utilisation" value={`${fmtNumber(account.marginUtilisationPct, 1)}%`} />
              <Cell label="Open" value={String(account.openPositions)} />
              <Cell label="Risk / trade" value={`${fmtNumber(account.riskPerTradePct, 2)}%`} />
              <Cell label="Leverage" value={`${fmtNumber(account.leverage, 0)}×`} />
              <Cell label="Free margin" value={fmtMoneyPlain(account.freeMargin)} />
              <Cell
                label="Return"
                value={fmtPct(
                  ((account.equity - account.initialBalance) / account.initialBalance) * 100,
                  1,
                )}
              />
            </dl>
          </article>
        );
      })}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg-elev-1/60 border-border/40 flex flex-col gap-0.5 rounded-md border p-2">
      <dt className="text-fg-subtle text-[10px] font-semibold tracking-wider uppercase">{label}</dt>
      <dd className="text-fg font-mono text-xs font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
