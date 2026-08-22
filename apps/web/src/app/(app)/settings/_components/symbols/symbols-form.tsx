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
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { IconDownload, IconPlus, IconSearch, IconTrash, IconUpload } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { usePrices } from '@/hooks/use-prices';
import { apiMutate } from '@/lib/api-client';
import { cn } from '@/lib/cn';

import { SortableSymbolRow, type SymbolItem } from './sortable-symbol-row';

interface SymbolCatalogItem {
  symbol: string;
  name: string;
  category: string;
  isActive: boolean | null;
  sortOrder: number | null;
}

interface SymbolsFormProps {
  initialSymbols: SymbolItem[];
  catalog: SymbolCatalogItem[];
}

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'forex', label: 'Forex' },
  { value: 'gold', label: 'Gold' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'indices', label: 'Indices' },
];

export function SymbolsForm({ initialSymbols, catalog }: SymbolsFormProps) {
  const [watchlist, setWatchlist] = useState<SymbolItem[]>(initialSymbols);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [watchlistSearch, setWatchlistSearch] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [bulkInput, setBulkInput] = useState('');
  const [isBulkAdding, setIsBulkAdding] = useState(false);
  const [catalogPage, setCatalogPage] = useState(0);
  const CATALOG_PAGE_SIZE = 20;
  const [isEditing, setIsEditing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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

  const moveItem = async (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= watchlist.length) return;

    const newList = [...watchlist];
    const temp = newList[index]!;
    newList[index] = newList[newIndex]!;
    newList[newIndex] = temp;

    // Optimistic update
    setWatchlist(newList);
    setIsEditing(true);

    try {
      await apiMutate('/api/settings/symbols', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: newList.map((s) => s.symbol) }),
      });
      setIsEditing(false);
    } catch {
      toast.error('Failed to update symbol order');
      // Rollback
      setWatchlist(watchlist);
      setIsEditing(false);
    }
  };

  const handleAdd = async (symbol: string) => {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) return;

    if (watchlist.some((s) => s.symbol === normalized)) {
      toast.error(`${normalized} is already in your watchlist`);
      return;
    }

    const catalogItem = catalog.find((c) => c.symbol === normalized);
    if (!catalogItem) {
      toast.error(`${normalized} is not supported in the active catalog`);
      return;
    }

    const newItem: SymbolItem = {
      symbol: normalized,
      name: catalogItem.name,
      category: catalogItem.category,
      displayOrder: watchlist.length,
    };

    const originalList = [...watchlist];
    setWatchlist((prev) => [...prev, newItem]);
    setIsEditing(true);

    try {
      await apiMutate('/api/settings/symbols', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: normalized }),
      });
      toast.success(`${normalized} added to watchlist`);
      setIsEditing(false);
    } catch {
      toast.error(`Failed to add ${normalized}`);
      setWatchlist(originalList);
      setIsEditing(false);
    }
  };

  const handleRemove = async (symbol: string) => {
    const originalList = [...watchlist];
    setWatchlist((prev) => prev.filter((s) => s.symbol !== symbol));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(symbol);
      return next;
    });
    setIsEditing(true);

    try {
      await apiMutate(`/api/settings/symbols/${symbol}`, {
        method: 'DELETE',
      });
      toast.success(`${symbol} removed from watchlist`);
      setIsEditing(false);
    } catch {
      toast.error(`Failed to remove ${symbol}`);
      setWatchlist(originalList);
      setIsEditing(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    const toDelete = Array.from(selected);
    const originalList = [...watchlist];

    setWatchlist((prev) => prev.filter((s) => !selected.has(s.symbol)));
    setSelected(new Set());
    setIsEditing(true);

    try {
      await Promise.all(
        toDelete.map((sym) => apiMutate(`/api/settings/symbols/${sym}`, { method: 'DELETE' })),
      );
      toast.success(`Successfully removed ${toDelete.length} symbols`);
      setIsEditing(false);
    } catch {
      toast.error('Failed to complete some symbol removals');
      setWatchlist(originalList);
      setIsEditing(false);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = watchlist.findIndex((w) => w.symbol === active.id);
    const newIndex = watchlist.findIndex((w) => w.symbol === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newList = arrayMove(watchlist, oldIndex, newIndex);
    setWatchlist(newList);
    setIsEditing(true);

    apiMutate('/api/settings/symbols', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols: newList.map((s) => s.symbol) }),
    })
      .then(() => {
        setIsEditing(false);
      })
      .catch(() => {
        toast.error('Failed to update symbol order');
        setWatchlist(watchlist);
        setIsEditing(false);
      });
  };

  const handleBulkAdd = async () => {
    const symbols = bulkInput
      .split(/[\s,]+/)
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0);

    if (symbols.length === 0) return;

    setIsBulkAdding(true);
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

    toast.success(`Bulk added ${successCount} symbols to watchlist`);
    setBulkInput('');
    setIsBulkAdding(false);
  };

  const handleExport = () => {
    if (watchlist.length === 0) {
      toast.error('Watchlist is empty');
      return;
    }
    const csvContent = 'data:text/csv;charset=utf-8,' + watchlist.map((e) => e.symbol).join(',');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'kestrel_watchlist.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Watchlist exported successfully');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      const symbols = content
        .split(/[\s,]+/)
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length > 0);

      if (symbols.length === 0) {
        toast.error('No valid symbols found in CSV');
        return;
      }

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
            // Import failures are surfaced in the final toast count.
            // Individual symbol errors are intentionally non-blocking.
          }
        }
      }
      toast.success(`Imported ${successCount} symbols successfully`);
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Watchlist Section */}
      <div className="border-border bg-bg-elev-1 flex flex-col gap-4 rounded-sm border p-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <h3 className="text-fg text-sm font-semibold tracking-wider uppercase">Your Watchlist</h3>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExport}
              className="text-fg-subtle hover:text-fg h-11 cursor-pointer gap-1.5 text-xs"
            >
              <IconDownload className="size-3.5" /> Export
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="text-fg-subtle hover:text-fg h-11 cursor-pointer gap-1.5 text-xs"
            >
              <IconUpload className="size-3.5" /> Import
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImport}
              accept=".csv"
              className="hidden"
            />
          </div>
        </div>

        {/* Watchlist Search */}
        <div className="relative">
          <label htmlFor="watchlist-search" className="sr-only">
            Search watchlist symbols
          </label>
          <IconSearch className="text-fg-muted absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            id="watchlist-search"
            value={watchlistSearch}
            onChange={(e) => setWatchlistSearch(e.target.value)}
            placeholder="Search watchlist symbols..."
            className="bg-bg-elev-1 h-11 pl-9 text-sm"
          />
        </div>

        {/* Watchlist Table/List */}
        <div className="flex flex-col gap-2">
          {filteredWatchlist.length > 0 && (
            <div className="text-caption text-fg-subtle border-border flex items-center justify-between border-b px-3 py-1.5">
              <div className="flex items-center gap-2">
                <label
                  htmlFor="select-all"
                  className="inline-flex min-h-[44px] cursor-pointer items-center gap-2"
                >
                  <span className="flex size-[44px] items-center justify-center">
                    <input
                      id="select-all"
                      type="checkbox"
                      checked={
                        selected.size === filteredWatchlist.length && filteredWatchlist.length > 0
                      }
                      onChange={handleToggleSelectAll}
                      className="border-border bg-bg-elev-1 text-fg focus:ring-fg size-5 cursor-pointer rounded-sm"
                    />
                  </span>
                  <span className="text-sm">Select All</span>
                </label>
              </div>
              {selected.size > 0 && (
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  className="text-danger flex cursor-pointer items-center gap-1 font-semibold hover:underline"
                >
                  <IconTrash className="size-3" /> Remove Selected ({selected.size})
                </button>
              )}
            </div>
          )}

          <div className="flex max-h-96 flex-col gap-1.5 overflow-y-auto pr-1">
            {filteredWatchlist.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={filteredWatchlist.map((w) => w.symbol)}
                  strategy={verticalListSortingStrategy}
                >
                  {filteredWatchlist.map((item, index) => (
                    <SortableSymbolRow
                      key={item.symbol}
                      item={item}
                      index={index}
                      priceMap={priceMap}
                      isSelected={selected.has(item.symbol)}
                      onToggleSelect={handleToggleSelect}
                      onRemove={handleRemove}
                      onMove={moveItem}
                      totalItems={watchlist.length}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            ) : (
              <div className="text-fg-subtle p-8 text-center text-sm">
                {watchlistSearch
                  ? 'No symbols found matching your search.'
                  : 'Your watchlist is empty. Add symbols from the catalog below.'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Catalog / Suggestions Section */}
      <div className="border-border bg-bg-elev-1 flex flex-col gap-4 rounded-sm border p-4">
        <h3 className="text-fg text-sm font-semibold tracking-wider uppercase">
          Available Symbol Catalog
        </h3>

        {/* Category Tabs */}
        <Segmented
          value={activeCategory}
          onChange={(next) => setActiveCategory(next)}
          options={CATEGORIES}
          role="radiogroup"
          label="Filter catalog by category"
          srLabel
          size="md"
          className="w-full"
        />

        {/* Catalog Search & Bulk Add */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <label htmlFor="catalog-search" className="sr-only">
              Search catalog by symbol or name
            </label>
            <IconSearch className="text-fg-muted absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              id="catalog-search"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              placeholder="Search catalog by symbol or name..."
              className="bg-bg-elev-1 h-11 pl-9 text-sm"
            />
          </div>

          <div className="flex gap-2">
            <label htmlFor="bulk-symbols" className="sr-only">
              Bulk add symbols
            </label>
            <Input
              id="bulk-symbols"
              value={bulkInput}
              onChange={(e) => setBulkInput(e.target.value)}
              placeholder="Bulk symbols (comma separated)"
              className="bg-bg-elev-1 h-11 w-44 text-sm"
            />
            <Button
              type="button"
              onClick={handleBulkAdd}
              disabled={isBulkAdding || !bulkInput.trim()}
              className="h-11 cursor-pointer gap-1 px-3 text-xs"
            >
              <IconPlus className="size-3.5" /> Bulk Add
            </Button>
          </div>
        </div>

        {/* Available Symbols List */}
        <ul className="grid min-h-[120px] grid-cols-1 gap-2 pr-1 sm:grid-cols-2">
          {paginatedCatalog.map((item) => (
            <li
              key={item.symbol}
              className={cn(
                'border-border bg-bg-elev-1 flex items-center justify-between rounded-sm border p-3',
                'hover:border-fg-subtle/30',
              )}
            >
              <div className="flex flex-col">
                <div className="flex items-baseline gap-2">
                  <span className="text-fg font-mono text-sm font-semibold">{item.symbol}</span>
                  <span className="bg-bg-elev-2 text-fg-subtle border-border rounded-sm border px-1 font-mono text-xs uppercase">
                    {item.category}
                  </span>
                </div>
                <span className="text-caption text-fg-subtle line-clamp-1">{item.name}</span>
              </div>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleAdd(item.symbol)}
                className="text-fg-subtle hover:text-fg h-11 w-11 p-0"
                aria-label={`Add ${item.symbol} to watchlist`}
              >
                <IconPlus className="size-4" />
              </Button>
            </li>
          ))}

          {filteredCatalog.length === 0 && (
            <div className="text-fg-subtle col-span-full p-6 text-center text-sm">
              No matching available symbols found in the catalog.
            </div>
          )}
        </ul>

        {filteredCatalog.length > CATALOG_PAGE_SIZE && (
          <div className="border-border flex items-center justify-between border-t pt-2">
            <span className="text-caption text-fg-muted">{filteredCatalog.length} symbols</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCatalogPage((p) => Math.max(0, p - 1))}
                disabled={catalogPage === 0}
                className={cn(
                  'border-border bg-bg-elev-1 h-11 rounded-sm border px-3 text-xs font-medium',
                  'text-fg-subtle hover:text-fg hover:border-border',
                  'cursor-pointer disabled:cursor-not-allowed disabled:opacity-30',
                )}
              >
                Previous
              </button>
              <span className="text-caption text-fg-muted tabular-nums">
                Page {catalogPage + 1} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCatalogPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={catalogPage >= totalPages - 1}
                className={cn(
                  'border-border bg-bg-elev-1 h-11 rounded-sm border px-3 text-xs font-medium',
                  'text-fg-subtle hover:text-fg hover:border-border',
                  'cursor-pointer disabled:cursor-not-allowed disabled:opacity-30',
                )}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
