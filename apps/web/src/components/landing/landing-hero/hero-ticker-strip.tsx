'use client';

// SPDX-License-Identifier: Apache-2.0

// Top capability marquee strip in the landing hero: highlights Kestrel's
// signature trader superpowers without listing raw ticker symbols.
import { TICKER_ITEMS } from './telemetry';

export function HeroTickerStrip() {
  const doubled = [...TICKER_ITEMS, ...TICKER_ITEMS];

  return (
    <div className="mb-10 flex items-center justify-between overflow-hidden rounded-full border border-white/10 bg-[#141516]/80 px-4 py-2 shadow-sm backdrop-blur-md">
      <div className="z-10 flex shrink-0 items-center gap-2 border-r border-white/10 bg-[#141516]/90 pr-4">
        <span className="bg-brand size-2 rounded-full shadow-[0_0_6px_#ff3616]" />
        <span className="text-fg font-mono text-[11px] font-bold tracking-wider uppercase">
          KESTREL SUPERPOWERS
        </span>
      </div>

      <div className="mask-fade-x relative flex-1 overflow-hidden">
        <div className="ticker-track flex items-center gap-8 font-mono text-xs whitespace-nowrap">
          {doubled.map((item, idx) => (
            <div key={`${item.label}-${idx}`} className="flex shrink-0 items-center gap-2">
              <span className="text-fg font-semibold">{item.label}</span>
              <span className="text-bull bg-bull/10 rounded px-1.5 py-0.5 text-[10px] font-semibold">
                {item.tag}
              </span>
              <span className="ml-2 text-white/10 select-none">/</span>
            </div>
          ))}
        </div>
      </div>

      <div className="text-fg-subtle z-10 hidden shrink-0 items-center gap-2 border-l border-white/10 bg-[#141516]/90 pl-4 font-mono text-[11px] lg:flex">
        <span>MODE:</span>
        <span className="text-bull flex items-center gap-1.5 font-bold">
          <span className="bg-bull size-1.5 rounded-full" />
          24/7 ACTIVE
        </span>
      </div>
    </div>
  );
}
