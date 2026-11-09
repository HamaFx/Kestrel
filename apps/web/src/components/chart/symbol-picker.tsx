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

// Symbol picker with typeahead search. Shows the user's watchlist first,
// then all available symbols from @kestrel/shared. The search input filters
// across ALL symbols so users can navigate to a symbol not in their watchlist.
import { BUILTIN_SYMBOLS, type Symbol } from '@kestrel/shared';
import { IconSearch } from '@tabler/icons-react';
import { Link } from 'next-view-transitions';
import { useMemo, useState } from 'react';

import { Segmented } from '@/components/ui/segmented';
import { useTimeframe } from '@/hooks/use-tf';
import { cn } from '@/lib/formatters/cn';

export function SymbolPicker({ active, watchlist }: { active: Symbol; watchlist: string[] }) {
  const [tf] = useTimeframe();
  const [query, setQuery] = useState('');

  const filteredAll = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return BUILTIN_SYMBOLS.filter(
      (s) =>
        !watchlist.includes(s.internal) &&
        (s.internal.toLowerCase().includes(q) || s.display.toLowerCase().includes(q)),
    ).map((s) => s.internal);
  }, [query, watchlist]);

  const showSearch = watchlist.length > 0 || query.length > 0;
  const noMatches =
    Boolean(query) &&
    filteredAll.length === 0 &&
    watchlist.every((s) => !s.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="relative flex flex-wrap items-center gap-2">
      <Segmented<Symbol>
        as="link"
        label="Symbol"
        srLabel
        value={active}
        role="tablist"
        variant="accent"
        size="sm"
        groupId="symbol-indicator"
        hrefFor={(s) => `/chart/${s}?tf=${tf}`}
        options={watchlist.map((s) => ({ value: s as Symbol, label: s }))}
      />

      {showSearch ? (
        <div className="relative">
          <IconSearch
            aria-hidden="true"
            className="text-fg-subtle pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search symbols…"
            className="bg-bg-elev-1/80 text-fg placeholder:text-fg-subtle focus:border-brand/50 border-border h-9 w-36 rounded-lg border pr-2.5 pl-8 font-mono text-xs focus:outline-none sm:w-44"
          />

          {query && (filteredAll.length > 0 || noMatches) ? (
            <div className="border-border bg-bg-elev-1 absolute top-full left-0 z-30 mt-1.5 min-w-[14rem] rounded-xl border p-2 shadow-xl">
              {filteredAll.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {filteredAll.map((s) => (
                    <Link
                      key={s}
                      href={`/chart/${s}?tf=${tf}`}
                      onClick={() => setQuery('')}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-mono text-xs font-semibold tabular-nums transition-colors',
                        'text-fg-muted hover:text-fg hover:bg-bg-elev-2',
                      )}
                    >
                      {s}
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-fg-subtle px-2 py-1.5 text-center text-xs">No symbols match.</p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
