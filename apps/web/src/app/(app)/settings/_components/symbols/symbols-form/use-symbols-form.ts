'use client';

// SPDX-License-Identifier: Apache-2.0

// State + actions for the symbols settings form: watchlist mutations,
// catalog filtering/pagination, bulk add, and CSV import/export.
import { KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { usePrices } from '@/hooks/use-prices';
import { apiMutate } from '@/lib/http/api-client';

import type { SymbolItem } from '../sortable-symbol-row';
import { CATALOG_PAGE_SIZE, type SymbolsFormProps } from './constants';
import { downloadWatchlistCsv, parseSymbolTokens } from './symbol-csv';
import { useWatchlistActions } from './use-watchlist-actions';

export function useSymbolsForm({ initialSymbols, catalog }: SymbolsFormProps) {
  const [watchlist, setWatchlist] = useState<SymbolItem[]>(initialSymbols);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [watchlistSearch, setWatchlistSearch] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [bulkInput, setBulkInput] = useState('');
  const [isBulkAdding, setIsBulkAdding] = useState(false);
  const [catalogPage, setCatalogPage] = useState(0);
  const [isEditing, setIsEditing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const { moveItem, handleAdd, handleRemove, handleBulkDelete, handleDragEnd } =
    useWatchlistActions({
      watchlist,
      setWatchlist,
      selected,
      setSelected,
      setIsEditing,
      catalog,
    });

  // Poll prices for all items in the watchlist — paused during edits to reduce API calls
  const watchlistSymbols = useMemo(() => watchlist.map((w) => w.symbol), [watchlist]);
  const { data: ticks } = usePrices(watchlistSymbols, { enabled: !isEditing });

  const priceMap = useMemo(() => {
    const map = new Map<string, number>();
    if (ticks) {
      for (const t of ticks) {
        map.set(t.symbol, t.mid);
      }
    }
    return map;
  }, [ticks]);

  // Filtered watchlist symbols
  const filteredWatchlist = useMemo(() => {
    return watchlist.filter((item) => {
      const q = watchlistSearch.toLowerCase().trim();
      if (!q) return true;
      return (
        item.symbol.toLowerCase().includes(q) || (item.name && item.name.toLowerCase().includes(q))
      );
    });
  }, [watchlist, watchlistSearch]);

  // Catalog items not in the watchlist
  const availableCatalog = useMemo(() => {
    const watchlistSet = new Set(watchlist.map((w) => w.symbol));
    return catalog.filter((item) => !watchlistSet.has(item.symbol) && item.isActive);
  }, [catalog, watchlist]);

  // Filtered catalog items
  const filteredCatalog = useMemo(() => {
    return availableCatalog.filter((item) => {
      if (activeCategory !== 'all' && item.category !== activeCategory) {
        return false;
      }
      const q = catalogSearch.toLowerCase().trim();
      if (!q) return true;
      return item.symbol.toLowerCase().includes(q) || item.name.toLowerCase().includes(q);
    });
  }, [availableCatalog, activeCategory, catalogSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredCatalog.length / CATALOG_PAGE_SIZE));
  const paginatedCatalog = useMemo(() => {
    const start = catalogPage * CATALOG_PAGE_SIZE;
    return filteredCatalog.slice(start, start + CATALOG_PAGE_SIZE);
  }, [filteredCatalog, catalogPage]);

  // Reset to first page when filters change
  useEffect(() => {
    setCatalogPage(0);
  }, [activeCategory, catalogSearch]);

  const handleToggleSelect = (symbol: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        next.add(symbol);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selected.size === filteredWatchlist.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredWatchlist.map((w) => w.symbol)));
    }
  };

  /**
   * Sequentially POST each new symbol and append it to the watchlist.
   * Per-symbol failures are intentionally non-blocking; the caller reports
   * the final success count.
   */
  const addSymbolsSequentially = async (symbols: string[]): Promise<number> => {
    let successCount = 0;
    for (const sym of symbols) {
      const catalogItem = catalog.find((c) => c.symbol === sym);
      if (catalogItem && !watchlist.some((w) => w.symbol === sym)) {
        try {
          await apiMutate('/api/settings/symbols', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol: sym }),
          });
          setWatchlist((prev) => [
            ...prev,
            {
              symbol: sym,
              name: catalogItem.name,
              category: catalogItem.category,
              displayOrder: prev.length,
            },
          ]);
          successCount++;
        } catch {
          // Bulk-add failures are surfaced in the final toast count.
          // Individual symbol errors are intentionally non-blocking.
        }
      }
    }
    return successCount;
  };

  const handleBulkAdd = async () => {
    const symbols = parseSymbolTokens(bulkInput);
    if (symbols.length === 0) return;

    setIsBulkAdding(true);
    const successCount = await addSymbolsSequentially(symbols);

    toast.success(`Bulk added ${successCount} symbols to watchlist`);
    setBulkInput('');
    setIsBulkAdding(false);
  };

  const handleExport = () => {
    if (watchlist.length === 0) {
      toast.error('Watchlist is empty');
      return;
    }
    downloadWatchlistCsv(watchlist.map((e) => e.symbol));
    toast.success('Watchlist exported successfully');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      const symbols = parseSymbolTokens(content);

      if (symbols.length === 0) {
        toast.error('No valid symbols found in CSV');
        return;
      }

      const successCount = await addSymbolsSequentially(symbols);
      toast.success(`Imported ${successCount} symbols successfully`);
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  return {
    // watchlist
    watchlist,
    filteredWatchlist,
    selected,
    watchlistSearch,
    setWatchlistSearch,
    priceMap,
    sensors,
    fileInputRef,
    handleToggleSelect,
    handleToggleSelectAll,
    moveItem,
    handleAdd,
    handleRemove,
    handleBulkDelete,
    handleDragEnd,
    handleExport,
    handleImport,
    // catalog
    activeCategory,
    setActiveCategory,
    catalogSearch,
    setCatalogSearch,
    bulkInput,
    setBulkInput,
    isBulkAdding,
    catalogPage,
    setCatalogPage,
    paginatedCatalog,
    filteredCatalog,
    totalPages,
    handleBulkAdd,
  };
}

export type SymbolsFormController = ReturnType<typeof useSymbolsForm>;
