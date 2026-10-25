'use client';

// SPDX-License-Identifier: Apache-2.0

// Candle chart panel for the setup replay: loading/error placeholders, the
// chart container, and the EMA/target/stop legend overlay.
import { IconActivity } from '@tabler/icons-react';

import type { TradeSetupReplayDTO } from '@/lib/services/journal';

import { useReplayChart } from './use-replay-chart';

interface ReplayChartProps {
  replay: TradeSetupReplayDTO | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}

export function ReplayChart({ replay, isLoading, isError, error }: ReplayChartProps) {
  const chartContainerRef = useReplayChart(replay);

  return (
    <div className="border-border bg-bg-elev-1 relative min-h-[280px] w-full overflow-hidden rounded-sm border">
      {isLoading ? (
        <div className="flex h-[280px] flex-col items-center justify-center gap-2">
          <IconActivity className="text-fg-subtle size-6 animate-pulse" />
          <span className="text-fg-subtle text-xs">Loading market candles...</span>
        </div>
      ) : isError ? (
        <div className="flex h-[280px] flex-col items-center justify-center gap-2 p-6 text-center">
          <span className="text-sm font-semibold text-rose-400">
            Failed to load historical candles
          </span>
          <span className="text-fg-subtle text-xs">
            {(error as Error)?.message || 'Market data provider unavailable'}
          </span>
        </div>
      ) : (
        <div ref={chartContainerRef} className="h-[280px] w-full" />
      )}

      {/* Legend Overlay */}
      <div className="text-caption pointer-events-none absolute top-2 left-2 flex items-center gap-3 rounded-xs bg-black/60 px-2 py-1 backdrop-blur-xs">
        <div className="flex items-center gap-1">
          <span className="bg-warn size-2 rounded-full" />
          <span className="text-fg-muted">EMA 20</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="bg-info size-2 rounded-full" />
          <span className="text-fg-muted">EMA 50</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="bg-bull size-2 rounded-full" />
          <span className="text-fg-muted">Target</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="bg-bear size-2 rounded-full" />
          <span className="text-fg-muted">Stop</span>
        </div>
      </div>
    </div>
  );
}
