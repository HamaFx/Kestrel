// SPDX-License-Identifier: Apache-2.0

// Shared price query plus the rolling mid-price buffers and version counter
// that feed the watchlist sparklines.
import type { Symbol } from '@kestrel/shared';
import { useEffect, useReducer, useRef } from 'react';

import { usePrices } from '@/hooks/use-prices';

/** Number of mids kept per symbol for the sparkline. */
const BUFFER_SIZE = 10;

export function useWatchlistTicks(list: Symbol[]) {
  const tickQuery = usePrices(list);
  const data = tickQuery.data;
  const isLoading = tickQuery.isLoading;
  const isError = tickQuery.isError;
  const error = tickQuery.error;
  const refetch = tickQuery.refetch;
  const buffersRef = useRef<Map<Symbol, number[]>>(new Map());

  // Bump a counter each time new ticks arrive so the sparkline picks up
  // the buffer change without us storing React state per-symbol.
  const [tickVersion, bumpVersion] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!data) return;
    let changed = false;
    for (const t of data) {
      const buf = buffersRef.current.get(t.symbol) ?? [];
      buf.push(t.mid);
      if (buf.length > BUFFER_SIZE) buf.shift();
      buffersRef.current.set(t.symbol, buf);
      changed = true;
    }
    if (changed) bumpVersion();
  }, [data]);

  return { data, isLoading, isError, error, refetch, buffersRef, tickVersion };
}
