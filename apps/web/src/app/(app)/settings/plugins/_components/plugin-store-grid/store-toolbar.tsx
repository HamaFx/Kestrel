'use client';

// SPDX-License-Identifier: Apache-2.0

// Search field + capability category chips for the plugin store.
import type { PluginCategory } from '@kestrel/plugin-sdk';
import { IconSearch } from '@tabler/icons-react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/formatters/cn';
import { PLUGIN_CATEGORY_LABELS } from '@/lib/plugins/types';

export function StoreToolbar({
  query,
  onQuery,
  category,
  onCategory,
  categories,
}: {
  query: string;
  onQuery: (value: string) => void;
  category: PluginCategory | 'all';
  onCategory: (value: PluginCategory | 'all') => void;
  categories: PluginCategory[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <IconSearch
          aria-hidden
          className="text-fg-subtle absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Search plugins, capabilities, or tools…"
          aria-label="Search plugins"
          className="pl-10"
        />
      </div>

      <div className="scrollbar-hide flex gap-1.5 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => onCategory('all')}
          aria-pressed={category === 'all'}
          className={cn(
            'min-h-9 shrink-0 rounded-lg px-3 text-xs font-semibold whitespace-nowrap transition-colors',
            category === 'all'
              ? 'bg-brand/12 text-brand ring-brand/30 ring-1'
              : 'text-fg-subtle bg-bg-elev-1/70 hover:text-fg border border-white/5',
          )}
        >
          All
        </button>
        {categories.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onCategory(value)}
            aria-pressed={category === value}
            className={cn(
              'min-h-9 shrink-0 rounded-lg px-3 text-xs font-semibold whitespace-nowrap transition-colors',
              category === value
                ? 'bg-brand/12 text-brand ring-brand/30 ring-1'
                : 'text-fg-subtle bg-bg-elev-1/70 hover:text-fg border border-white/5',
            )}
          >
            {PLUGIN_CATEGORY_LABELS[value]}
          </button>
        ))}
      </div>
    </div>
  );
}
