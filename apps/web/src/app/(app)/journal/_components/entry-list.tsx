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
import type { JournalEntry, Symbol, TradeSide } from '@kestrel/shared';
import { IconAdjustmentsHorizontal, IconCompass, IconSearch } from '@tabler/icons-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef, useState } from 'react';

import { useConfirm } from '@/components/ui/confirm-drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { usePrices } from '@/hooks/use-prices';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';

import { EntryRow } from './entry-row';

interface EntryListProps {
  entries: JournalEntry[];
  onClosed: () => void;
  onDeleted: () => void;
}

export type ConfirmFn = ReturnType<typeof useConfirm>[1];

export function EntryList({ entries, onClosed, onDeleted }: EntryListProps) {
  const [confirmEl, confirm] = useConfirm();

  // State for Tabs & Filters
  const [tab, setTab] = useState<'active' | 'closed' | 'all'>('active');
  const [symbolFilter, setSymbolFilter] = useState<'ALL' | Symbol>('ALL');
  const [sideFilter, setSideFilter] = useState<'ALL' | TradeSide>('ALL');
  const [tagFilter, setTagFilter] = useState<'ALL' | string>('ALL');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Derive available symbols and tags from entries for the filter panel
  const availableSymbols = useMemo(() => {
    const symbolsSet = new Set<Symbol>();
    entries.forEach((e) => symbolsSet.add(e.symbol));
    return Array.from(symbolsSet).sort();
  }, [entries]);

  const availableTags = useMemo(() => {
    const tagsSet = new Set<string>();
    entries.forEach((e) => e.tags?.forEach((t) => tagsSet.add(t)));
    return Array.from(tagsSet).sort();
  }, [entries]);

  // Pre-compute relative time labels in the parent to avoid per-row recomputation
  const timeLabels = useMemo(() => {
    const map = new Map<string, { openedAt: string; closedAt: string | null }>();
    entries.forEach((e) => {
      map.set(e.id, {
        openedAt: formatRelative(e.openedAt),
        closedAt: e.closedAt ? formatRelative(e.closedAt) : null,
      });
    });
    return map;
  }, [entries]);

  // Extract all symbols from open/active trades to subscribe to the price feed
  const activeSymbols = useMemo(() => {
    const symbolsSet = new Set<Symbol>();
    entries.forEach((e) => {
      if (e.outcome === 'open') {
        symbolsSet.add(e.symbol);
      }
    });
    return Array.from(symbolsSet);
  }, [entries]);

  // Hook live prices (polls every 1.5s)
  const { data: ticks } = usePrices(activeSymbols);

  const priceMap = useMemo(() => {
    const map = new Map<Symbol, number>();
    ticks?.forEach((t) => map.set(t.symbol, t.mid));
    return map;
  }, [ticks]);

  // IconFilter entries based on active tab
  const tabEntries = useMemo(() => {
    return entries.filter((e) => {
      if (tab === 'active') return e.outcome === 'open';
      if (tab === 'closed') return e.outcome !== 'open';
      return true; // 'all'
    });
  }, [entries, tab]);

  // Apply symbol, side, tag and text search filters
  const filteredEntries = useMemo(() => {
    return tabEntries.filter((e) => {
      if (symbolFilter !== 'ALL' && e.symbol !== symbolFilter) return false;
      if (sideFilter !== 'ALL' && e.side !== sideFilter) return false;
      if (tagFilter !== 'ALL' && !e.tags?.includes(tagFilter)) return false;
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesNote = e.notes?.toLowerCase().includes(query) ?? false;
        const matchesTag = e.tags?.some((t) => t.toLowerCase().includes(query)) ?? false;
        const matchesSymbol = e.symbol.toLowerCase().includes(query);
        if (!matchesNote && !matchesTag && !matchesSymbol) return false;
      }
      return true;
    });
  }, [tabEntries, symbolFilter, sideFilter, tagFilter, search]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: filteredEntries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120,
    overscan: 5,
  });

  const activeCount = entries.filter((e) => e.outcome === 'open').length;
  const closedCount = entries.filter((e) => e.outcome !== 'open').length;

  return (
    <div className="flex flex-col gap-4">
      {/* Visual Tab Switcher */}
      <div className="border-border/40 flex flex-col justify-between gap-3 border-b pb-2 sm:flex-row sm:items-center">
        <div className="bg-bg-elev-2 border-border/40 flex self-start rounded-sm border p-0.5">
          <button
            onClick={() => setTab('active')}
            aria-pressed={tab === 'active'}
            className={cn(
              'focus-visible:ring-brand relative flex cursor-pointer items-center gap-1.5 rounded-sm px-3.5 py-1.5 text-xs font-semibold transition-all focus-visible:ring-2 focus-visible:outline-none',
              tab === 'active' ? 'bg-fg text-black shadow-sm' : 'text-fg-muted hover:text-fg',
            )}
          >
            Active Positions
            {activeCount > 0 && (
              <span
                aria-hidden="true"
                className={cn(
                  'size-2 rounded-sm',
                  tab === 'active' ? 'bg-fg animate-ping' : 'bg-fg animate-pulse',
                )}
              />
            )}
          </button>
          <button
            onClick={() => setTab('closed')}
            aria-pressed={tab === 'closed'}
            className={cn(
              'focus-visible:ring-brand cursor-pointer rounded-sm px-3.5 py-1.5 text-xs font-semibold transition-all focus-visible:ring-2 focus-visible:outline-none',
              tab === 'closed' ? 'bg-fg text-black shadow-sm' : 'text-fg-muted hover:text-fg',
            )}
          >
            Closed History
            <span className="text-caption ml-1 opacity-70">({closedCount})</span>
          </button>
          <button
            onClick={() => setTab('all')}
            aria-pressed={tab === 'all'}
            className={cn(
              'focus-visible:ring-brand cursor-pointer rounded-sm px-3.5 py-1.5 text-xs font-semibold transition-all focus-visible:ring-2 focus-visible:outline-none',
              tab === 'all' ? 'bg-fg text-black shadow-sm' : 'text-fg-muted hover:text-fg',
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
              onChange={(e) => setSearch(e.target.value)}
              className="bg-bg-elev-2/45 border-border/40 focus:border-border/70 text-fg w-full rounded-sm border py-2 pr-4 pl-9 text-xs transition-all focus:outline-none"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            aria-label="Toggle advanced filters"
            aria-expanded={showFilters}
            aria-controls="entry-filter-panel"
            className={cn(
              'border-border/40 bg-bg-elev-2/45 text-fg-muted hover:text-fg focus-visible:ring-brand cursor-pointer rounded-sm border p-2.5 transition-all focus-visible:ring-2 focus-visible:outline-none',
              showFilters && 'border-border text-fg bg-bg-elev-1',
            )}
          >
            <IconAdjustmentsHorizontal aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>

      {/* Advanced IconFilter Panel */}
      {showFilters && (
        <div
          id="entry-filter-panel"
          className="border-border bg-bg-elev-1 animate-in slide-in-from-top-2 grid grid-cols-2 gap-4 rounded-sm border p-4 duration-200"
        >
          <div className="flex flex-col gap-1.5">
            <span className="text-caption text-fg-subtle font-bold tracking-wider uppercase">
              Asset Class
            </span>
            <div className="flex flex-wrap gap-1">
              {(['ALL', ...availableSymbols] as const).map((sym) => (
                <button
                  key={sym}
                  onClick={() => setSymbolFilter(sym)}
                  aria-pressed={symbolFilter === sym}
                  className={cn(
                    'border-border bg-bg-elev-3/50 hover:bg-bg-elev-3 cursor-pointer rounded-sm border px-2.5 py-1 text-xs font-semibold',
                    symbolFilter === sym && 'border-border bg-bg-elev-2 text-fg',
                  )}
                >
                  {sym}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-caption text-fg-subtle font-bold tracking-wider uppercase">
              Direction
            </span>
            <div className="flex flex-wrap gap-1">
              {(['ALL', 'long', 'short'] as const).map((side) => (
                <button
                  key={side}
                  onClick={() => setSideFilter(side)}
                  aria-pressed={sideFilter === side}
                  className={cn(
                    'border-border bg-bg-elev-3/50 hover:bg-bg-elev-3 cursor-pointer rounded-sm border px-2.5 py-1 text-xs font-semibold',
                    sideFilter === side && 'border-border bg-bg-elev-2 text-fg',
                  )}
                >
                  {side === 'ALL' ? 'ALL' : side === 'long' ? 'Buy ↑' : 'Sell ↓'}
                </button>
              ))}
            </div>
          </div>

          <div className="col-span-2 flex flex-col gap-1.5">
            <span className="text-caption text-fg-subtle font-bold tracking-wider uppercase">
              Tag
            </span>
            <div className="flex flex-wrap gap-1">
              {(['ALL', ...availableTags] as const).map((tag) => (
                <button
                  key={tag}
                  onClick={() => setTagFilter(tag)}
                  aria-pressed={tagFilter === tag}
                  className={cn(
                    'border-border bg-bg-elev-3/50 hover:bg-bg-elev-3 cursor-pointer rounded-sm border px-2.5 py-1 text-xs font-semibold',
                    tagFilter === tag && 'border-border bg-bg-elev-2 text-fg',
                  )}
                >
                  {tag === 'ALL' ? 'ALL' : `#${tag}`}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Entries IconList */}
      {filteredEntries.length === 0 ? (
        (() => {
          const isFiltered =
            search || symbolFilter !== 'ALL' || sideFilter !== 'ALL' || tagFilter !== 'ALL';
          return (
            <EmptyState
              tone={isFiltered ? 'muted' : 'brand'}
              icon={<IconCompass className="size-5" />}
              title={isFiltered ? 'No entries match' : 'No entries yet'}
              description={
                isFiltered
                  ? 'Try widening your search or clearing a filter to see more trades.'
                  : 'Log your first trade to activate your portfolio analytics.'
              }
            />
          );
        })()
      ) : (
        <div
          ref={parentRef}
          className="scrollbar-thumb-divider scrollbar-thin overflow-y-auto pr-1"
          style={{ maxHeight: '750px' }}
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((item) => {
              const e = filteredEntries[item.index];
              if (!e) return null;
              const labels = timeLabels.get(e.id);
              return (
                <div
                  key={item.key}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${item.start}px)`,
                  }}
                  className="py-1.5"
                >
                  <EntryRow
                    entry={e}
                    openedAtLabel={labels?.openedAt ?? ''}
                    closedAtLabel={labels?.closedAt ?? ''}
                    livePrice={priceMap.get(e.symbol)}
                    onClosed={onClosed}
                    onDeleted={onDeleted}
                    confirm={confirm}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
      {confirmEl}
    </div>
  );
}
