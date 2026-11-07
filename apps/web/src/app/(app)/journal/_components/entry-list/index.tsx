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

// Advanced trade list with real-time price tracking, dynamic PnL sliders,
// and powerful tabs/filters (Active, Closed, All, symbols, sides, text searches).
import type { JournalEntry } from '@kestrel/shared';
import { IconLayoutGrid, IconList } from '@tabler/icons-react';
import { useState } from 'react';

import { useConfirm } from '@/components/ui/confirm-drawer';
import { cn } from '@/lib/formatters/cn';

import { EntryFilterPanel } from './entry-filter-panel';
import { ExecutionLedger } from './execution-ledger';
import { EntryListEmpty } from './entry-list-empty';
import { EntryListTabs } from './entry-list-tabs';
import { useEntryFilters } from './use-entry-filters';
import { useEntryListData } from './use-entry-list-data';
import { VirtualEntryList } from './virtual-entry-list';

interface EntryListProps {
  entries: JournalEntry[];
  onClosed: () => void;
  onDeleted: () => void;
}

export function EntryList({ entries, onClosed, onDeleted }: EntryListProps) {
  const [confirmEl, confirm] = useConfirm();
  const filters = useEntryFilters(entries);
  const { timeLabels, priceMap } = useEntryListData(entries);
  const [view, setView] = useState<'ledger' | 'cards'>('ledger');

  return (
    <div className="flex flex-col gap-4">
      {/* Visual Tab Switcher */}
      <EntryListTabs
        tab={filters.tab}
        onTabChange={filters.setTab}
        activeCount={filters.activeCount}
        closedCount={filters.closedCount}
        search={filters.search}
        onSearchChange={filters.setSearch}
        showFilters={filters.showFilters}
        onToggleFilters={() => filters.setShowFilters(!filters.showFilters)}
      />

      {/* Advanced IconFilter Panel */}
      {filters.showFilters && (
        <EntryFilterPanel
          availableSymbols={filters.availableSymbols}
          availableTags={filters.availableTags}
          symbolFilter={filters.symbolFilter}
          onSymbolFilter={filters.setSymbolFilter}
          sideFilter={filters.sideFilter}
          onSideFilter={filters.setSideFilter}
          tagFilter={filters.tagFilter}
          onTagFilter={filters.setTagFilter}
        />
      )}

      {/* View mode: institutional ledger (default) vs detailed cards */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-fg-subtle font-mono text-[9px] tracking-[0.14em] uppercase">
          Execution view
        </span>
        <div
          role="group"
          aria-label="Journal view mode"
          className="border-border/60 flex items-center gap-0.5 rounded-lg border bg-white/[0.02] p-0.5"
        >
          {(
            [
              { id: 'ledger', label: 'Ledger', icon: IconList },
              { id: 'cards', label: 'Cards', icon: IconLayoutGrid },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => setView(id)}
              className={cn(
                'inline-flex min-h-11 items-center gap-1.5 rounded-md px-2.5 font-mono text-[10px] font-semibold tracking-wider uppercase transition-colors active:translate-y-[0.5px] sm:min-h-8',
                view === id ? 'bg-bg-elev-3 text-brand' : 'text-fg-subtle hover:text-fg',
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Entries */}
      {filters.filteredEntries.length === 0 ? (
        <EntryListEmpty isFiltered={Boolean(filters.isFiltered)} />
      ) : view === 'ledger' ? (
        <ExecutionLedger
          entries={filters.filteredEntries}
          timeLabels={timeLabels}
          priceMap={priceMap}
          onClosed={onClosed}
          onDeleted={onDeleted}
          confirm={confirm}
        />
      ) : (
        <VirtualEntryList
          entries={filters.filteredEntries}
          timeLabels={timeLabels}
          priceMap={priceMap}
          onClosed={onClosed}
          onDeleted={onDeleted}
          confirm={confirm}
        />
      )}
      {confirmEl}
    </div>
  );
}
