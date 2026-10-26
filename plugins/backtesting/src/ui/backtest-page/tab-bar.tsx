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

// Tab bar with live run/strategy counts and a refresh action.
import { IconLoader2, IconRefresh } from '@tabler/icons-react';

import { TABS } from './tabs';
import type { BacktestPageController } from './use-backtest-page';

export function TabBar({ page }: { page: BacktestPageController }) {
  return (
    <div
      role="tablist"
      aria-label="Backtesting Lab sections"
      className="border-border/60 flex flex-wrap items-center gap-1 border-b pb-1"
    >
      {TABS.map((entry) => {
        const isActive = page.tab === entry.id;
        return (
          <button
            key={entry.id}
            id={`backtest-${entry.id}-tab`}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`backtest-${entry.id}-panel`}
            onClick={() => page.setTab(entry.id)}
            className={
              isActive
                ? 'bg-bg-elev-2 text-fg border-brand/40 focus-visible:ring-brand/50 rounded-md border px-3 py-1.5 text-xs font-semibold focus-visible:ring-2 focus-visible:outline-none'
                : 'text-fg-subtle hover:text-fg focus-visible:ring-brand/50 rounded-md border border-transparent px-3 py-1.5 text-xs font-semibold focus-visible:ring-2 focus-visible:outline-none'
            }
          >
            {entry.label}
            {entry.id === 'runs' && page.runs.length > 0 ? (
              <span className="text-fg-subtle ml-1 font-mono text-[10px]">{page.runs.length}</span>
            ) : null}
            {entry.id === 'strategies' && page.strategies.length > 0 ? (
              <span className="text-fg-subtle ml-1 font-mono text-[10px]">
                {page.strategies.length}
              </span>
            ) : null}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => void page.load()}
        disabled={page.loading}
        className="text-fg-subtle hover:text-fg ml-auto inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-semibold disabled:opacity-50"
      >
        {page.loading ? (
          <IconLoader2 className="size-3.5 animate-spin" />
        ) : (
          <IconRefresh className="size-3.5" />
        )}
        Refresh
      </button>
    </div>
  );
}
