'use client';

// SPDX-License-Identifier: Apache-2.0

// Instrument catalog panel: category tabs, search, bulk add, and paged list.
import { IconPlus, IconSearch } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { cn } from '@/lib/formatters/cn';

import { CATALOG_PAGE_SIZE, CATEGORIES } from './constants';
import type { SymbolsFormController } from './use-symbols-form';

export function CatalogSection({ controller }: { controller: SymbolsFormController }) {
  const {
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
    handleAdd,
  } = controller;

  return (
    <div className="surface-panel flex flex-col gap-4 rounded-xl border border-white/10 p-5 shadow-[var(--shadow-chip)]">
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div>
          <h3 className="text-fg text-sm font-semibold tracking-tight">Instrument Catalog</h3>
          <p className="text-fg-subtle text-xs">
            Subscribe to global forex pairs, commodities, and digital assets
          </p>
        </div>
        <span className="surface-chip text-fg-subtle rounded-md px-2 py-0.5 font-mono text-[11px] font-medium tracking-wider uppercase">
          Available
        </span>
      </div>

      {/* Category Tabs */}
      <Segmented
        value={activeCategory}
        onChange={(next) => setActiveCategory(next)}
        options={CATEGORIES}
        role="radiogroup"
        label="Filter catalog by category"
        srLabel
        size="sm"
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
            className="surface-well h-10 rounded-lg border-white/10 pl-9 text-sm"
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
            placeholder="EURUSD, GBPUSD..."
            className="surface-well h-10 w-44 rounded-lg border-white/10 font-mono text-sm uppercase"
          />
          <Button
            type="button"
            onClick={handleBulkAdd}
            disabled={isBulkAdding || !bulkInput.trim()}
            className="tactile-press h-10 cursor-pointer gap-1 rounded-lg px-3 text-xs"
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
              'surface-well flex items-center justify-between rounded-xl border border-white/5 p-3 transition-all',
              'hover:border-white/15',
            )}
          >
            <div className="flex flex-col">
              <div className="flex items-baseline gap-2">
                <span className="text-fg font-mono text-sm font-semibold">{item.symbol}</span>
                <span className="surface-chip text-fg-subtle rounded-md px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase">
                  {item.category}
                </span>
              </div>
              <span className="text-caption text-fg-subtle line-clamp-1">{item.name}</span>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleAdd(item.symbol)}
              className="text-fg-subtle surface-chip tactile-press h-9 w-9 rounded-lg border border-white/10 p-0 hover:border-cyan-500/30 hover:text-cyan-400"
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
        <div className="flex items-center justify-between border-t border-white/5 pt-3">
          <span className="text-caption text-fg-muted font-mono">
            {filteredCatalog.length} symbols
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCatalogPage((p) => Math.max(0, p - 1))}
              disabled={catalogPage === 0}
              className={cn(
                'surface-chip h-9 rounded-lg border border-white/10 px-3 font-mono text-xs font-medium',
                'text-fg-subtle hover:text-fg hover:border-white/20',
                'tactile-press cursor-pointer disabled:cursor-not-allowed disabled:opacity-30',
              )}
            >
              Previous
            </button>
            <span className="text-caption text-fg-muted font-mono tabular-nums">
              Page {catalogPage + 1} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCatalogPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={catalogPage >= totalPages - 1}
              className={cn(
                'surface-chip h-9 rounded-lg border border-white/10 px-3 font-mono text-xs font-medium',
                'text-fg-subtle hover:text-fg hover:border-white/20',
                'tactile-press cursor-pointer disabled:cursor-not-allowed disabled:opacity-30',
              )}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
