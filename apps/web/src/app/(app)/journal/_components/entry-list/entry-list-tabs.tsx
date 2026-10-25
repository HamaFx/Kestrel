'use client';

// SPDX-License-Identifier: Apache-2.0

// Journal list controls: mode tabs, text search, and the advanced-filter toggle.
import { IconAdjustmentsHorizontal, IconSearch } from '@tabler/icons-react';

import { cn } from '@/lib/formatters/cn';

import type { EntryTab } from './use-entry-filters';

interface EntryListTabsProps {
  tab: EntryTab;
  onTabChange: (tab: EntryTab) => void;
  activeCount: number;
  closedCount: number;
  search: string;
  onSearchChange: (value: string) => void;
  showFilters: boolean;
  onToggleFilters: () => void;
}

export function EntryListTabs({
  tab,
  onTabChange,
  activeCount,
  closedCount,
  search,
  onSearchChange,
  showFilters,
  onToggleFilters,
}: EntryListTabsProps) {
  return (
    <div className="flex flex-col justify-between gap-3 border-b border-white/10 pb-2 sm:flex-row sm:items-center">
      <div className="surface-well flex self-start rounded-xl border border-white/10 p-1 shadow-inner">
        <button
          onClick={() => onTabChange('active')}
          aria-pressed={tab === 'active'}
          className={cn(
            'focus-visible:ring-brand relative flex cursor-pointer items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all focus-visible:ring-2 focus-visible:outline-none active:translate-y-[0.5px]',
            tab === 'active'
              ? 'bg-fg font-bold text-black shadow-sm'
              : 'text-fg-muted hover:text-fg',
          )}
        >
          Active Positions
          {activeCount > 0 && (
            <span
              aria-hidden="true"
              className={cn(
                'size-2 rounded-full',
                tab === 'active' ? 'animate-ping bg-black' : 'bg-fg animate-pulse',
              )}
            />
          )}
        </button>
        <button
          onClick={() => onTabChange('closed')}
          aria-pressed={tab === 'closed'}
          className={cn(
            'focus-visible:ring-brand cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all focus-visible:ring-2 focus-visible:outline-none active:translate-y-[0.5px]',
            tab === 'closed'
              ? 'bg-fg font-bold text-black shadow-sm'
              : 'text-fg-muted hover:text-fg',
          )}
        >
          Closed History
          <span className="text-caption ml-1 opacity-70">({closedCount})</span>
        </button>
        <button
          onClick={() => onTabChange('all')}
          aria-pressed={tab === 'all'}
          className={cn(
            'focus-visible:ring-brand cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all focus-visible:ring-2 focus-visible:outline-none active:translate-y-[0.5px]',
            tab === 'all' ? 'bg-fg font-bold text-black shadow-sm' : 'text-fg-muted hover:text-fg',
          )}
        >
          All Logs
        </button>
      </div>

      {/* IconFilter Trigger & IconSearch Bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 sm:w-64">
          <IconSearch className="text-fg-muted absolute top-3 left-3.5 size-3.5" />
          <input
            type="text"
            placeholder="Search notes, tags, symbol..."
            aria-label="Search trades"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="surface-well text-fg w-full rounded-xl border border-white/10 py-2 pr-4 pl-9 text-xs shadow-inner transition-all focus:border-white/20 focus:outline-none"
          />
        </div>
        <button
          onClick={onToggleFilters}
          aria-label="Toggle advanced filters"
          aria-expanded={showFilters}
          aria-controls="entry-filter-panel"
          className={cn(
            'surface-chip text-fg-muted hover:text-fg focus-visible:ring-brand cursor-pointer rounded-xl border border-white/10 p-2.5 transition-all focus-visible:ring-2 focus-visible:outline-none active:translate-y-[0.5px]',
            showFilters && 'text-fg border-white/20 bg-[#1c1d1f]',
          )}
        >
          <IconAdjustmentsHorizontal aria-hidden="true" className="size-4" />
        </button>
      </div>
    </div>
  );
}
