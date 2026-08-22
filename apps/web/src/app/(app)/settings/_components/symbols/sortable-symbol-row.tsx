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
        'flex items-center justify-between rounded-sm border p-3 transition-all',
        isDragging
          ? 'border-border bg-bg-elev-2 z-10 opacity-90 shadow-lg'
          : isSelected
            ? 'bg-bg-elev-1 border-border shadow-sm'
            : 'bg-bg-elev-1 border-border hover:border-fg-subtle/30',
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 -ml-1 flex size-[44px] shrink-0 cursor-grab touch-none items-center justify-center rounded-sm active:cursor-grabbing"
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
            className="border-border bg-bg-elev-1 text-fg focus:ring-fg size-4 cursor-pointer rounded-sm"
          />
        </label>
        <div className="flex min-w-0 flex-col">
          <div className="flex items-baseline gap-2">
            <span className="text-fg font-mono text-sm font-semibold">{item.symbol}</span>
            <span className="bg-bg-elev-2 text-fg-subtle border-border shrink-0 rounded-sm border px-1 font-mono text-xs uppercase">
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
            <span className="text-fg-muted text-xs tracking-wider uppercase">Live</span>
          )}
        </div>

        {/* Arrow buttons — keyboard-only fallback, visually hidden on small screens */}
        <div className="border-border bg-bg-elev-1 hidden h-11 items-center rounded-sm border sm:flex">
          <button
            type="button"
            onClick={() => onMove(index, 'up')}
            disabled={index === 0}
            aria-label="Move symbol up"
            className="text-fg-subtle hover:text-fg disabled:hover:text-fg-subtle flex h-full w-11 items-center justify-center disabled:opacity-30"
          >
            <IconArrowUp className="size-3.5" />
          </button>
          <div className="bg-divider/60 h-5 w-px" />
          <button
            type="button"
            onClick={() => onMove(index, 'down')}
            disabled={index === totalItems - 1}
            aria-label="Move symbol down"
            className="text-fg-subtle hover:text-fg disabled:hover:text-fg-subtle flex h-full w-11 items-center justify-center disabled:opacity-30"
          >
            <IconArrowDown className="size-3.5" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => onRemove(item.symbol)}
          aria-label={`Remove ${item.symbol} from watchlist`}
          className="text-fg-subtle hover:text-danger hover:bg-danger/10 flex size-[44px] items-center justify-center rounded-sm transition-colors"
        >
          <IconTrash className="size-4" />
        </button>
      </div>
    </div>
  );
}
