// SPDX-License-Identifier: Apache-2.0

// Live prices and precomputed relative-time labels for the journal list rows.
import type { JournalEntry, Symbol } from '@kestrel/shared';
import { useMemo } from 'react';

import { usePrices } from '@/hooks/use-prices';
import { formatRelative } from '@/lib/formatters/format';

export function useEntryListData(entries: JournalEntry[]) {
  // Pre-compute relative time labels in the parent to avoid per-row recomputation
  const timeLabels = useMemo(() => {
    const map = new Map<string, { openedAt: string; closedAt: string | null }>();
    entries.forEach((e) => {
      map.set(e.id, {
        openedAt: formatRelative(e.openedAt),
        closedAt: e.closedAt ? formatRelative(e.closedAt) : null,
      });
    });
    return map;
  }, [entries]);

  // Extract all symbols from open/active trades to subscribe to the price feed
  const activeSymbols = useMemo(() => {
    const symbolsSet = new Set<Symbol>();
    entries.forEach((e) => {
      if (e.outcome === 'open') {
        symbolsSet.add(e.symbol);
      }
    });
    return Array.from(symbolsSet);
  }, [entries]);

  // Hook live prices (polls every 1.5s)
  const { data: ticks } = usePrices(activeSymbols);

  const priceMap = useMemo(() => {
    const map = new Map<Symbol, number>();
    ticks?.forEach((t) => map.set(t.symbol, t.mid));
    return map;
  }, [ticks]);

  return { timeLabels, priceMap };
}
