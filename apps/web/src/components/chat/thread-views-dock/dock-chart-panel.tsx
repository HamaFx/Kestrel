'use client';

// SPDX-License-Identifier: Apache-2.0

// Chart tab: live TradingView widget with timeframe switcher.
import type { Symbol, Timeframe } from '@kestrel/shared';
import { IconArrowUpRight } from '@tabler/icons-react';
import { Link } from 'next-view-transitions';

import { TradingViewWidget } from '@/components/chart';
import { Segmented } from '@/components/ui/segmented';

export function DockChartPanel({
  symbol,
  activeTf,
  onTimeframeChange,
}: {
  symbol: Symbol;
  activeTf: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-border bg-bg-elev-1/60 flex items-center justify-between gap-2 border-b px-3 py-2 text-xs">
        <div className="flex min-w-0 items-center gap-2 font-mono">
          <span className="text-fg font-bold tracking-tight">{symbol}</span>
          <span className="text-fg-subtle hidden truncate text-xs sm:inline">Live Chart</span>
          {/* Replaces the removed CONTEXT tab's foot-of-panel link. */}
          <Link
            href={`/chart/${symbol}?tf=${activeTf}`}
            className="text-brand hover:text-brand-soft inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold transition-colors hover:underline"
          >
            <span>Pro Chart</span>
            <IconArrowUpRight className="size-3" aria-hidden="true" />
          </Link>
        </div>
        <Segmented
          size="sm"
          value={activeTf}
          options={[
            { value: '5m', label: '5M' },
            { value: '15m', label: '15M' },
            { value: '1h', label: '1H' },
            { value: '4h', label: '4H' },
            { value: '1d', label: '1D' },
          ]}
          onChange={(tf) => onTimeframeChange(tf as Timeframe)}
        />
      </div>
      <div className="relative min-h-0 w-full flex-1">
        <TradingViewWidget symbol={symbol} tf={activeTf} theme="dark" />
      </div>
    </div>
  );
}
