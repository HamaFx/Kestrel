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

// Desk switch for the paper-trading page. The three live books used to
// stack vertically (positions → orders → strategies → accounts →
// closes → ledger); switching views keeps the order ticket visible next
// to whichever book the trader is watching.
import { IconLoader2, IconRefresh } from '@tabler/icons-react';

export type PaperDeskTab = 'positions' | 'strategies' | 'accounts';

const TABS: ReadonlyArray<{ id: PaperDeskTab; label: string }> = [
  { id: 'positions', label: 'Positions & Orders' },
  { id: 'strategies', label: 'Deployed Strategies' },
  { id: 'accounts', label: 'Accounts & History' },
];

export function DeskTabs({
  active,
  onSelect,
  loading,
  onRefresh,
  openCount,
  strategyCount,
}: {
  active: PaperDeskTab;
  onSelect: (tab: PaperDeskTab) => void;
  loading: boolean;
  onRefresh: () => void;
  /** Open positions + pending orders shown on the positions tab. */
  openCount: number;
  strategyCount: number;
}) {
  const counts: Record<PaperDeskTab, number> = {
    positions: openCount,
    strategies: strategyCount,
    accounts: 0,
  };

  return (
    <div
      role="tablist"
      aria-label="Paper trading desk sections"
      className="border-border/60 flex flex-wrap items-center gap-1 border-b pb-1"
    >
      {TABS.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            id={`paper-desk-${tab.id}-tab`}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`paper-desk-${tab.id}`}
            onClick={() => onSelect(tab.id)}
            className={
              isActive
                ? 'bg-bg-elev-2 text-fg border-brand/40 rounded-md border px-3 py-1.5 text-xs font-semibold'
                : 'text-fg-subtle hover:text-fg rounded-md border border-transparent px-3 py-1.5 text-xs font-semibold'
            }
          >
            {tab.label}
            {counts[tab.id] > 0 ? (
              <span className="text-fg-subtle ml-1 font-mono text-[10px]">{counts[tab.id]}</span>
            ) : null}
          </button>
        );
      })}
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        className="text-fg-subtle hover:text-fg ml-auto inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-semibold disabled:opacity-50"
      >
        {loading ? (
          <IconLoader2 className="size-3.5 animate-spin" />
        ) : (
          <IconRefresh className="size-3.5" />
        )}
        Refresh
      </button>
    </div>
  );
}
