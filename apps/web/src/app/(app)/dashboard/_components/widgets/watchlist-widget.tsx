// SPDX-License-Identifier: Apache-2.0

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

// Phase 1.6 — Watchlist widget.
//
// Live tickers for the user's database-backed watchlist (`user_symbols`, the
// same list `/settings/symbols` edits). Adds and removes persist through the
// settings symbols API with an optimistic list, so the widget and the settings
// page can never disagree again.
//
// Prices come from `useWatchlistTicks`, which pools through the shared 3s cache
// (no per-widget polls).
import { DEFAULT_WATCHLIST_SYMBOLS, SYMBOLS, type Symbol } from '@kestrel/shared';
import { IconAlertTriangle, IconEye, IconPlus, IconRefresh } from '@tabler/icons-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { apiMutate } from '@/lib/http/api-client';

import { useWatchlistTicks } from './watchlist-widget/use-watchlist-ticks';
import { WatchRow } from './watchlist-widget/watch-row';

const DEFAULT_WATCHLIST: readonly Symbol[] = DEFAULT_WATCHLIST_SYMBOLS;

interface WatchlistWidgetProps {
  /** Database watchlist from the dashboard RSC; defaults apply when empty. */
  initialSymbols?: readonly Symbol[];
}

export function WatchlistWidget({ initialSymbols = [] }: WatchlistWidgetProps) {
  const [symbols, setSymbols] = useState<Symbol[]>(() =>
    initialSymbols.length > 0 ? [...initialSymbols] : [...DEFAULT_WATCHLIST],
  );
  const [showAddMenu, setShowAddMenu] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError, error, refetch, buffersRef, tickVersion } =
    useWatchlistTicks(symbols);

  // Close add menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false);
      }
    }
    if (showAddMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showAddMenu]);

  async function addSymbol(sym: Symbol) {
    setShowAddMenu(false);
    if (symbols.includes(sym)) return;

    const previous = symbols;
    setSymbols([...symbols, sym]);
    try {
      await apiMutate('/api/settings/symbols', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ symbol: sym }),
      });
    } catch (err) {
      setSymbols(previous);
      toast.error(`Could not add ${sym} to your watchlist`, {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  async function removeSymbol(sym: Symbol) {
    if (symbols.length <= 1) return;

    const previous = symbols;
    setSymbols(symbols.filter((s) => s !== sym));
    try {
      await apiMutate(`/api/settings/symbols/${encodeURIComponent(sym)}`, { method: 'DELETE' });
    } catch (err) {
      setSymbols(previous);
      toast.error(`Could not remove ${sym} from your watchlist`, {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  const availableToAdd = (SYMBOLS as readonly Symbol[]).filter((s) => !symbols.includes(s));

  return (
    <Card as="section" aria-label="Market overview">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconEye className="text-fg-subtle size-4" />
          <span className="text-fg text-sm font-semibold">Market overview</span>
          <Badge tone="brand" className="hidden sm:inline-flex">
            Live
          </Badge>
        </div>
        <div className="relative flex items-center gap-1.5" ref={addMenuRef}>
          {availableToAdd.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAddMenu((v) => !v)}
              className="text-fg-subtle hover:text-fg hover:bg-bg-elev-2 flex min-h-[30px] items-center gap-1 rounded-md px-2.5 py-1 font-mono text-xs font-medium transition-colors active:translate-y-[0.5px]"
              title="Add symbol to watchlist"
            >
              <IconPlus className="text-brand size-3.5" />
              <span>Add</span>
            </button>
          )}

          {showAddMenu && (
            <div className="surface-panel absolute top-full right-0 z-30 mt-1.5 flex max-h-48 min-w-[150px] flex-col gap-0.5 overflow-y-auto rounded-xl border border-white/15 bg-[#141516]/98 p-1.5 shadow-2xl backdrop-blur-xl">
              {availableToAdd.map((sym) => (
                <button
                  key={sym}
                  type="button"
                  onClick={() => void addSymbol(sym)}
                  className="text-fg-muted hover:text-fg w-full rounded-lg px-2.5 py-1.5 text-left font-mono text-xs font-medium transition-colors hover:bg-white/5 active:translate-y-[0.5px]"
                >
                  {sym}
                </button>
              ))}
            </div>
          )}

          <Link
            href={`/chart/${symbols[0] ?? 'XAUUSD'}`}
            className="text-fg-subtle hover:text-fg ml-1 text-xs font-medium"
          >
            Open chart
          </Link>
        </div>
      </header>

      <ul className="scrollbar-hide flex flex-col overflow-x-auto">
        {(() => {
          if (isError) {
            return (
              <li role="alert" className="flex flex-col items-center gap-2 py-4 text-center">
                <IconAlertTriangle className="text-danger size-5" aria-hidden="true" />
                <p className="text-danger text-xs">
                  {error instanceof Error ? error.message : 'Failed to load prices'}
                </p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="border-border text-fg-subtle hover:text-fg text-caption inline-flex min-h-10 items-center gap-1 rounded-sm border px-3"
                >
                  <IconRefresh className="size-3" aria-hidden="true" />
                  Retry
                </button>
              </li>
            );
          }
          if (isLoading && (!data || data.length === 0)) {
            return Array.from({ length: symbols.length }).map((_, i) => (
              <li
                key={i}
                className="border-divider flex items-center justify-between border-b py-2 last:border-0"
              >
                <Skeleton decorative className="h-3 w-16" />
                <Skeleton decorative className="h-3 w-12" />
              </li>
            ));
          }
          return data?.map((t) => (
            <WatchRow
              key={t.symbol}
              tick={t}
              tickVersion={tickVersion}
              buffersRef={buffersRef}
              canRemove={symbols.length > 1}
              onRemove={() => void removeSymbol(t.symbol)}
            />
          ));
        })()}
      </ul>
    </Card>
  );
}
