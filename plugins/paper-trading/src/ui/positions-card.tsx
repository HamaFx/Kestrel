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
import { IconArrowUpRight, IconLoader2, IconWallet } from '@tabler/icons-react';

import { GetAccountsOutputSchema, ListPositionsOutputSchema } from '../schemas';
import { AccountCards } from './account-cards';
import { PositionsTable } from './positions-table';

export function AccountsCard({ output, state, errorMessage }: PluginToolPartProps) {
  if (state === 'loading') {
    return (
      <div className="surface-panel flex items-center gap-2 rounded-xl border border-white/10 p-3 text-xs">
        <IconLoader2 className="text-brand size-3.5 animate-spin" />
        <span className="text-fg-muted">Loading paper accounts…</span>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div className="border-danger/30 bg-danger/5 text-danger rounded-xl border p-3 text-xs">
        {errorMessage ?? 'Could not load paper accounts.'}
      </div>
    );
  }

  const parsed = GetAccountsOutputSchema.safeParse(output);
  if (!parsed.success) {
    return (
      <div className="border-warn/30 bg-warn/5 text-warn rounded-xl border p-3 text-xs">
        Unexpected account summary shape.
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      <AccountCards accounts={parsed.data.accounts} />
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

export function PositionsCard({ output, state, errorMessage }: PluginToolPartProps) {
  if (state === 'loading') {
    return (
      <div className="surface-panel flex items-center gap-2 rounded-xl border border-white/10 p-3 text-xs">
        <IconWallet className="text-brand size-3.5" />
        <span className="text-fg-muted">Loading positions…</span>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div className="border-danger/30 bg-danger/5 text-danger rounded-xl border p-3 text-xs">
        {errorMessage ?? 'Could not load positions.'}
      </div>
    );
  }

  const parsed = ListPositionsOutputSchema.safeParse(output);
  if (!parsed.success) {
    return (
      <div className="border-warn/30 bg-warn/5 text-warn rounded-xl border p-3 text-xs">
        Unexpected position list shape.
      </div>
    );
  }

  return (
    <section className="surface-panel flex flex-col gap-2 rounded-xl border border-white/10 p-3">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconWallet className="text-brand size-4" />
          <h3 className="text-fg text-sm font-semibold">Paper positions</h3>
        </div>
        <span className="text-fg-subtle font-mono text-[10px]">{parsed.data.count}</span>
      </header>
      <PositionsTable positions={parsed.data.positions} compact />
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
