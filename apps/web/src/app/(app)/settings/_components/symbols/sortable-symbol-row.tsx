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
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconArrowDown, IconArrowUp, IconGripVertical, IconTrash } from '@tabler/icons-react';

import { cn } from '@/lib/cn';

export interface SymbolItem {
  symbol: string;
  name?: string;
  category?: string;
  displayOrder: number;
}

interface SortableSymbolRowProps {
  item: SymbolItem;
  index: number;
  priceMap: Map<string, number>;
  isSelected: boolean;
  onToggleSelect: (symbol: string) => void;
  onRemove: (symbol: string) => void;
  onMove: (index: number, direction: 'up' | 'down') => void;
  totalItems: number;
}

export function SortableSymbolRow({
  item,
  index,
  priceMap,
  isSelected,
  onToggleSelect,
  onRemove,
  onMove,
  totalItems,
}: SortableSymbolRowProps) {
  const price = priceMap.get(item.symbol);
  const decimals = item.symbol === 'XAUUSD' ? 2 : 5;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.symbol,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center justify-between rounded-xl border p-3 transition-all',
        isDragging
          ? 'surface-panel border-cyan-500/50 z-20 opacity-95 shadow-xl scale-[1.01]'
          : isSelected
            ? 'surface-panel border-cyan-500/30 bg-cyan-500/5 shadow-sm'
            : 'surface-well border-white/5 hover:border-white/15',
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          className="text-fg-muted hover:text-fg hover:bg-white/5 -ml-1 flex size-[44px] shrink-0 cursor-grab touch-none items-center justify-center rounded-lg active:cursor-grabbing"
          aria-label={`Drag to reorder ${item.symbol}`}
          {...attributes}
          {...listeners}
        >
          <IconGripVertical className="size-4" />
        </button>
        <label
          htmlFor={`select-${item.symbol}`}
          className="flex size-[44px] shrink-0 cursor-pointer items-center justify-center"
        >
          <input
            id={`select-${item.symbol}`}
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(item.symbol)}
            aria-label={`Select ${item.symbol}`}
            className="border-white/15 bg-bg-elev-2 text-cyan-400 focus:ring-cyan-500/20 size-4 cursor-pointer rounded-md"
          />
        </label>
        <div className="flex min-w-0 flex-col">
          <div className="flex items-baseline gap-2">
            <span className="text-fg font-mono text-sm font-semibold">{item.symbol}</span>
            <span className="surface-chip text-fg-subtle shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase">
              {item.category}
            </span>
          </div>
          <span className="text-caption text-fg-subtle truncate">{item.name}</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <div className="flex flex-col items-end">
          <span className="text-fg font-mono text-xs font-semibold">
            {price !== undefined ? price.toFixed(decimals) : '\u2014'}
          </span>
          {price !== undefined && (
            <span className="text-cyan-400 text-[10px] font-mono tracking-wider uppercase">Live</span>
          )}
        </div>

        {/* Arrow buttons — keyboard-only fallback, visually hidden on small screens */}
        <div className="surface-chip hidden h-10 items-center rounded-lg border border-white/10 sm:flex">
          <button
            type="button"
            onClick={() => onMove(index, 'up')}
            disabled={index === 0}
            aria-label="Move symbol up"
            className="text-fg-subtle hover:text-fg disabled:hover:text-fg-subtle flex h-full w-10 items-center justify-center disabled:opacity-30"
          >
            <IconArrowUp className="size-3.5" />
          </button>
          <div className="bg-white/10 h-5 w-px" />
          <button
            type="button"
            onClick={() => onMove(index, 'down')}
            disabled={index === totalItems - 1}
            aria-label="Move symbol down"
            className="text-fg-subtle hover:text-fg disabled:hover:text-fg-subtle flex h-full w-10 items-center justify-center disabled:opacity-30"
          >
            <IconArrowDown className="size-3.5" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => onRemove(item.symbol)}
          aria-label={`Remove ${item.symbol} from watchlist`}
          className="text-fg-subtle hover:text-danger hover:bg-danger/10 flex size-[44px] items-center justify-center rounded-lg transition-colors tactile-press"
        >
          <IconTrash className="size-4" />
        </button>
      </div>
    </div>

  );
}
