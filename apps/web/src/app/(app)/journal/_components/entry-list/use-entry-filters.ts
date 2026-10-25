// SPDX-License-Identifier: Apache-2.0

// Tab/filter state and derived entry subsets for the journal trade list.
import type { JournalEntry, Symbol, TradeSide } from '@kestrel/shared';
import { useMemo, useState } from 'react';

export type EntryTab = 'active' | 'closed' | 'all';

export function useEntryFilters(entries: JournalEntry[]) {
  // State for Tabs & Filters
  const [tab, setTab] = useState<EntryTab>('active');
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

  const activeCount = entries.filter((e) => e.outcome === 'open').length;
  const closedCount = entries.filter((e) => e.outcome !== 'open').length;
  const isFiltered =
    search || symbolFilter !== 'ALL' || sideFilter !== 'ALL' || tagFilter !== 'ALL';

  return {
    tab,
    setTab,
    symbolFilter,
    setSymbolFilter,
    sideFilter,
    setSideFilter,
    tagFilter,
    setTagFilter,
    search,
    setSearch,
    showFilters,
    setShowFilters,
    availableSymbols,
    availableTags,
    filteredEntries,
    activeCount,
    closedCount,
    isFiltered,
  };
}
