'use client';

// SPDX-License-Identifier: Apache-2.0

// Active-watchlist panel: search, select-all/bulk delete, DnD ordering, and
// CSV import/export controls.
import { closestCenter, DndContext } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { IconDownload, IconSearch, IconTrash, IconUpload } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { SortableSymbolRow } from '../sortable-symbol-row';
import type { SymbolsFormController } from './use-symbols-form';

export function WatchlistSection({ controller }: { controller: SymbolsFormController }) {
  const {
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
    handleRemove,
    handleBulkDelete,
    handleDragEnd,
    handleExport,
    handleImport,
  } = controller;

  return (
    <div className="surface-panel flex flex-col gap-4 rounded-xl border border-white/10 p-5 shadow-[var(--shadow-chip)]">
      <div className="flex flex-col justify-between gap-3 border-b border-white/5 pb-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <h3 className="text-fg text-sm font-semibold tracking-tight">Active Watchlist</h3>
          <span className="surface-chip text-fg-subtle rounded-md px-2 py-0.5 font-mono text-[11px] font-medium">
            {watchlist.length} {watchlist.length === 1 ? 'asset' : 'assets'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExport}
            className="text-fg-subtle hover:text-fg tactile-press h-9 cursor-pointer gap-1.5 rounded-lg text-xs"
          >
            <IconDownload className="size-3.5" /> Export CSV
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="text-fg-subtle hover:text-fg tactile-press h-9 cursor-pointer gap-1.5 rounded-lg text-xs"
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
          placeholder="Filter active watchlist symbols..."
          className="surface-well h-10 rounded-lg border-white/10 pl-9 text-sm"
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
  );
}
