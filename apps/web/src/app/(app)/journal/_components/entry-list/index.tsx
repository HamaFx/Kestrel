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

import { useConfirm } from '@/components/ui/confirm-drawer';

import { EntryFilterPanel } from './entry-filter-panel';
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

export type ConfirmFn = ReturnType<typeof useConfirm>[1];

export function EntryList({ entries, onClosed, onDeleted }: EntryListProps) {
  const [confirmEl, confirm] = useConfirm();
  const filters = useEntryFilters(entries);
  const { timeLabels, priceMap } = useEntryListData(entries);

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

      {/* Entries IconList */}
      {filters.filteredEntries.length === 0 ? (
        <EntryListEmpty isFiltered={Boolean(filters.isFiltered)} />
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
