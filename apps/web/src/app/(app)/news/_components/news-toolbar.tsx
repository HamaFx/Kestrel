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

// News page toolbar — search + sentiment filter + symbol filter, all
// sticky under the page header. Mobile-first: chip rails scroll
// horizontally so we never wrap onto two rows on narrow screens.
import type { NewsSentiment, SymbolOrCurrencyTag } from '@kestrel/shared';
import { IconSearch, IconX } from '@tabler/icons-react';

import { cn } from '@/lib/cn';
import { handleRadioKeyDown } from '@/lib/datetime';

export type SentimentFilter = NewsSentiment | 'all';
export type SymbolFilter = SymbolOrCurrencyTag | 'all';

interface NewsToolbarProps {
  query: string;
  onQuery: (q: string) => void;
  sentiment: SentimentFilter;
  onSentiment: (s: SentimentFilter) => void;
  symbol: SymbolFilter;
  onSymbol: (s: SymbolFilter) => void;
  /** Distinct symbol/currency tags present in the loaded set. */
  symbolOptions: readonly SymbolOrCurrencyTag[];
  /** Count of articles passing the current filter (for the empty-state pill). */
  visibleCount: number;
  totalCount: number;
}

const SENTIMENTS: Array<{ value: SentimentFilter; label: string; tone: string }> = [
  { value: 'all', label: 'All', tone: 'text-fg' },
  { value: 'positive', label: 'Bullish', tone: 'text-bull' },
  { value: 'negative', label: 'Bearish', tone: 'text-bear' },
  { value: 'neutral', label: 'Neutral', tone: 'text-fg-muted' },
];

export function NewsToolbar({
  query,
  onQuery,
  sentiment,
  onSentiment,
  symbol,
  onSymbol,
  symbolOptions,
  visibleCount,
  totalCount,
}: NewsToolbarProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* IconSearch */}
      <div className="relative">
        <IconSearch
          aria-hidden="true"
          className="text-fg-subtle absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search headlines…"
          aria-label="Search headlines"
          className="surface-well border-white/10 focus:border-white/20 text-fg placeholder:text-fg-subtle h-11 w-full rounded-xl border pr-10 pl-10 text-sm shadow-inner transition-all focus:outline-none"
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onQuery('')}
            className="text-fg-subtle hover:text-fg focus-visible:ring-fg absolute top-1/2 right-1.5 inline-flex size-10 min-h-10 min-w-10 -translate-y-1/2 items-center justify-center rounded-lg transition-all focus-visible:ring-2 focus-visible:outline-none tactile-press"
          >
            <IconX className="size-4" />
          </button>
        ) : null}
      </div>

      {/* Sentiment chips */}
      <div
        role="radiogroup"
        aria-label="Filter by sentiment"
        onKeyDown={handleRadioKeyDown}
        className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4"
      >
        {SENTIMENTS.map((s) => {
          const active = s.value === sentiment;
          return (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onSentiment(s.value)}
              className={cn(
                'focus-visible:ring-fg inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-all active:translate-y-[0.5px] focus-visible:ring-2 focus-visible:outline-none',
                active
                  ? 'bg-fg border-transparent text-black font-bold shadow-sm'
                  : 'surface-chip border-white/10 text-fg-muted hover:text-fg hover:border-white/20',
              )}
            >
              <span aria-hidden="true" className={cn(active ? '' : s.tone)}>
                {s.label === 'Bullish' ? '▲' : s.label === 'Bearish' ? '▼' : '·'}
              </span>
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Symbol chips — only render when we have at least one tag */}
      {symbolOptions.length > 0 ? (
        <div
          role="radiogroup"
          aria-label="Filter by symbol"
          onKeyDown={handleRadioKeyDown}
          className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4"
        >
          <SymbolChip
            label="All"
            active={symbol === 'all'}
            tabIndex={symbol === 'all' ? 0 : -1}
            onClick={() => onSymbol('all')}
          />
          {symbolOptions.map((s) => (
            <SymbolChip
              key={s}
              label={s}
              active={symbol === s}
              tabIndex={symbol === s ? 0 : -1}
              onClick={() => onSymbol(s)}
            />
          ))}
        </div>
      ) : null}

      {/* Result count strip — polite live region so filter changes are announced */}
      <p aria-live="polite" className="text-fg-subtle text-body-sm tabular-nums">
        Showing <span className="text-fg-muted font-semibold">{visibleCount}</span> of {totalCount}
      </p>
    </div>
  );
}

function SymbolChip({
  label,
  active,
  tabIndex,
  onClick,
}: {
  label: string;
  active: boolean;
  tabIndex?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      tabIndex={tabIndex ?? -1}
      onClick={onClick}
      className={cn(
        'text-body-sm focus-visible:ring-fg inline-flex h-10 shrink-0 items-center rounded-lg border px-3 font-semibold uppercase tabular-nums transition-all active:translate-y-[0.5px] focus-visible:ring-2 focus-visible:outline-none',
        active
          ? 'bg-fg border-transparent text-black font-bold shadow-sm'
          : 'surface-chip border-white/10 text-fg-muted hover:text-fg hover:border-white/20',
      )}
    >
      {label}
    </button>
  );
}
