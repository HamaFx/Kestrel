'use client';

// SPDX-License-Identifier: Apache-2.0

// Advanced filter panel for the journal list: symbols, direction, and tags.
import type { Symbol, TradeSide } from '@kestrel/shared';

import { cn } from '@/lib/formatters/cn';

interface EntryFilterPanelProps {
  availableSymbols: Symbol[];
  availableTags: string[];
  symbolFilter: 'ALL' | Symbol;
  onSymbolFilter: (symbol: 'ALL' | Symbol) => void;
  sideFilter: 'ALL' | TradeSide;
  onSideFilter: (side: 'ALL' | TradeSide) => void;
  tagFilter: 'ALL' | string;
  onTagFilter: (tag: 'ALL' | string) => void;
}

export function EntryFilterPanel({
  availableSymbols,
  availableTags,
  symbolFilter,
  onSymbolFilter,
  sideFilter,
  onSideFilter,
  tagFilter,
  onTagFilter,
}: EntryFilterPanelProps) {
  return (
    <div
      id="entry-filter-panel"
      className="surface-panel animate-in slide-in-from-top-2 grid grid-cols-2 gap-4 rounded-xl border border-white/10 p-4 shadow-[var(--shadow-chip)] duration-200"
    >
      <div className="flex flex-col gap-1.5">
        <span className="text-caption text-fg-subtle font-bold tracking-wider uppercase">
          Asset Class
        </span>
        <div className="flex flex-wrap gap-1">
          {(['ALL', ...availableSymbols] as const).map((sym) => (
            <button
              key={sym}
              onClick={() => onSymbolFilter(sym)}
              aria-pressed={symbolFilter === sym}
              className={cn(
                'surface-chip cursor-pointer rounded-lg border border-white/10 px-2.5 py-1 text-xs font-semibold transition-all hover:border-white/20 active:translate-y-[0.5px]',
                symbolFilter === sym && 'bg-fg border-transparent font-bold text-black shadow-sm',
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
              onClick={() => onSideFilter(side)}
              aria-pressed={sideFilter === side}
              className={cn(
                'surface-chip cursor-pointer rounded-lg border border-white/10 px-2.5 py-1 text-xs font-semibold transition-all hover:border-white/20 active:translate-y-[0.5px]',
                sideFilter === side && 'bg-fg border-transparent font-bold text-black shadow-sm',
              )}
            >
              {side === 'ALL' ? 'ALL' : side === 'long' ? 'Buy ↑' : 'Sell ↓'}
            </button>
          ))}
        </div>
      </div>

      <div className="col-span-2 flex flex-col gap-1.5">
        <span className="text-caption text-fg-subtle font-bold tracking-wider uppercase">Tag</span>
        <div className="flex flex-wrap gap-1">
          {(['ALL', ...availableTags] as const).map((tag) => (
            <button
              key={tag}
              onClick={() => onTagFilter(tag)}
              aria-pressed={tagFilter === tag}
              className={cn(
                'surface-chip cursor-pointer rounded-lg border border-white/10 px-2.5 py-1 text-xs font-semibold transition-all hover:border-white/20 active:translate-y-[0.5px]',
                tagFilter === tag && 'bg-fg border-transparent font-bold text-black shadow-sm',
              )}
            >
              {tag === 'ALL' ? 'ALL' : `#${tag}`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
