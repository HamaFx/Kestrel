// SPDX-License-Identifier: Apache-2.0

// Ambient ticker tape — continuous horizontal information flow streaming
// live market stats, agent status, and system telemetry under the global
// TopBar. Infinite CSS marquee, strictly monospaced, border-bottom divider.
//
//   [symbol mid ▲/▼  change%] · [symbol mid ▲/▼  change%] · …

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
import { priceDecimals, type Symbol, type Tick } from '@kestrel/shared';
import { useEffect, useReducer, useRef } from 'react';

import { usePrices } from '@/hooks/use-prices';
import { cn } from '@/lib/cn';

const TAPE_SYMBOLS: Symbol[] = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'BTCUSDT', 'ETHUSDT'];

function pctChange(prev: number, cur: number): string {
  const pct = ((cur - prev) / prev) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

export function TickerTape() {
  const tickQuery = usePrices(TAPE_SYMBOLS);
  const data = tickQuery.data;
  const currentPricesRef = useRef<Map<Symbol, number>>(new Map());
  const prevPricesRef = useRef<Map<Symbol, number>>(new Map());
  // Force re-render only when mid prices actually change.
  const [, bump] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    if (!data || data.length === 0) return;
    let changed = false;
    for (const t of data) {
      const current = currentPricesRef.current.get(t.symbol);
      if (current === undefined) {
        currentPricesRef.current.set(t.symbol, t.mid);
        prevPricesRef.current.set(t.symbol, t.mid);
        changed = true;
      } else if (current !== t.mid) {
        prevPricesRef.current.set(t.symbol, current);
        currentPricesRef.current.set(t.symbol, t.mid);
        changed = true;
      }
    }
    if (changed) bump();
  }, [data]);

  const ticks: Tick[] = data ?? [];

  // Build the ticker content — repeated twice for seamless looping.
  const items = ticks.map((t) => {
    const decimals = priceDecimals(t.symbol);
    const prev = prevPricesRef.current.get(t.symbol) ?? t.mid;
    const isBull = t.mid >= prev;
    const changeStr = pctChange(prev, t.mid);
    return { symbol: t.symbol, mid: t.mid.toFixed(decimals), isBull, changeStr };
  });

  // Fallback: show static symbols when live prices aren't available yet
  if (items.length === 0) {
    const fallbackSymbols = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'BTCUSDT', 'ETHUSDT'];
    const fallback = fallbackSymbols.flatMap((s) => [
      <span key={`${s}-label`} className="inline-flex shrink-0 items-center gap-1">
        <span className="text-fg font-semibold tracking-tight">{s}</span>
        <span className="text-fg-subtle tabular-nums">---.--</span>
        <span className="text-fg-subtle/40 mx-2 select-none">·</span>
      </span>,
    ]);
    return (
      <div
        className="border-border/60 bg-bg relative h-6 overflow-hidden border-b"
        aria-label="Market ticker tape — awaiting data"
        role="marquee"
      >
        <div className="ticker-track text-xs font-mono leading-6 whitespace-nowrap">
          {fallback}
          {fallback}
        </div>
      </div>
    );
  }

  // Duplicate so the scroll is seamless.
  const doubled = [...items, ...items];

  const content = doubled.map((item, i) => (
    <span key={`${item.symbol}-${i}`} className="inline-flex shrink-0 items-center gap-1.5">
      <span className="text-fg font-semibold tracking-tight">{item.symbol}</span>
      <span className="text-fg-subtle tabular-nums">{item.mid}</span>
      <span className={cn('text-xs font-semibold tabular-nums', item.isBull ? 'text-bull' : 'text-bear')}>
        {item.isBull ? '▲' : '▼'} {item.changeStr}
      </span>
      <span className="text-fg-subtle/30 mx-2 select-none">·</span>
    </span>
  ));

  return (
    <div
      className="border-border/60 bg-bg relative h-6 overflow-hidden border-b"
      aria-label="Market ticker tape"
      role="marquee"
    >
      <div className="ticker-track text-xs font-mono leading-6 whitespace-nowrap">
        {content}
      </div>
    </div>
  );
}
