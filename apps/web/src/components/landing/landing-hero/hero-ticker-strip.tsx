'use client';

// SPDX-License-Identifier: Apache-2.0

// Live market-pulse marquee strip at the top of the landing hero.
import { cn } from '@/lib/formatters/cn';

import { TICKER_ITEMS } from './telemetry';

export function HeroTickerStrip() {
  // Seamless duplication for infinite marquee feel
  const doubledTicker = [...TICKER_ITEMS, ...TICKER_ITEMS];

  return (
    <div className="mb-10 flex items-center justify-between overflow-hidden rounded-full border border-white/10 bg-[#141516]/80 px-4 py-2 shadow-sm backdrop-blur-md">
      <div className="z-10 flex shrink-0 items-center gap-2 border-r border-white/10 bg-[#141516]/90 pr-4">
        <span className="bg-bull size-2 animate-pulse rounded-full shadow-[0_0_6px_#3f9e3d]" />
        <span className="text-fg font-mono text-[11px] font-bold tracking-wider uppercase">
          LIVE MARKET PULSE
        </span>
      </div>

      <div className="mask-fade-x relative flex-1 overflow-hidden">
        <div className="ticker-track flex items-center gap-8 font-mono text-xs whitespace-nowrap">
          {doubledTicker.map((item, idx) => (
            <div key={`${item.symbol}-${idx}`} className="flex shrink-0 items-center gap-2">
              <span className="text-fg-subtle">{item.symbol}</span>
              <span className="text-fg font-semibold tabular-nums">{item.price}</span>
              <span
                className={cn(
                  'py-0.2 rounded px-1 text-[11px] font-medium tabular-nums',
                  item.up ? 'text-bull bg-bull/10' : 'text-bear bg-bear/10',
                )}
              >
                {item.change}
              </span>
              <span className="ml-2 text-white/10 select-none">/</span>
            </div>
          ))}
        </div>
      </div>

      <div className="text-fg-subtle z-10 hidden shrink-0 items-center gap-2 border-l border-white/10 bg-[#141516]/90 pl-4 font-mono text-[11px] lg:flex">
        <span>ANALYST DESKS:</span>
        <span className="text-bull flex items-center gap-1.5 font-bold tabular-nums">
          <span className="bg-bull size-1.5 animate-ping rounded-full" />4 ACTIVE
        </span>
      </div>
    </div>
  );
}
