'use client';

// SPDX-License-Identifier: Apache-2.0

// Replay analytics grid: realized R, MFE, MAE, and execution efficiency.
import { IconGauge, IconTarget, IconTrendingDown, IconTrendingUp } from '@tabler/icons-react';

import { cn } from '@/lib/formatters/cn';
import type { TradeSetupReplayDTO } from '@/lib/services/journal';

export function ReplayStatsGrid({ replay }: { replay: TradeSetupReplayDTO }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="border-border bg-bg-elev-1 flex flex-col gap-1 rounded-sm border p-3">
        <div className="text-fg-subtle text-caption flex items-center gap-1 font-semibold tracking-wider uppercase">
          <IconTarget className="size-3.5" />
          <span>Realized R</span>
        </div>
        <div
          className={cn(
            'text-base font-black tabular-nums',
            (replay.stats.realizedRR ?? 0) > 0 ? 'text-bull' : 'text-bear',
          )}
        >
          {replay.stats.realizedRR !== null
            ? `${replay.stats.realizedRR >= 0 ? '+' : ''}${replay.stats.realizedRR.toFixed(2)} R`
            : 'N/A'}
        </div>
        <span className="text-fg-subtle text-caption tabular-nums">
          Planned: {replay.stats.plannedRR ? `${replay.stats.plannedRR.toFixed(2)} R` : '—'}
        </span>
      </div>

      <div className="border-border bg-bg-elev-1 flex flex-col gap-1 rounded-sm border p-3">
        <div className="text-fg-subtle text-caption flex items-center gap-1 font-semibold tracking-wider uppercase">
          <IconTrendingUp className="text-bull size-3.5" />
          <span>Max Runup (MFE)</span>
        </div>
        <div className="text-bull text-base font-black tabular-nums">
          {replay.mfe.r !== null ? `+${replay.mfe.r.toFixed(2)} R` : '—'}
        </div>
        <span className="text-fg-subtle text-caption tabular-nums">
          +{replay.mfe.pips.toFixed(1)} pips peak
        </span>
      </div>

      <div className="border-border bg-bg-elev-1 flex flex-col gap-1 rounded-sm border p-3">
        <div className="text-fg-subtle text-caption flex items-center gap-1 font-semibold tracking-wider uppercase">
          <IconTrendingDown className="text-bear size-3.5" />
          <span>Max Drawdown (MAE)</span>
        </div>
        <div className="text-bear text-base font-black tabular-nums">
          {replay.mae.r !== null ? `-${replay.mae.r.toFixed(2)} R` : '—'}
        </div>
        <span className="text-fg-subtle text-caption tabular-nums">
          -{replay.mae.pips.toFixed(1)} pips adverse
        </span>
      </div>

      <div className="border-border bg-bg-elev-1 flex flex-col gap-1 rounded-sm border p-3">
        <div className="text-fg-subtle text-caption flex items-center gap-1 font-semibold tracking-wider uppercase">
          <IconGauge className="text-info size-3.5" />
          <span>Efficiency</span>
        </div>
        <div className="text-info text-base font-black tabular-nums">
          {replay.stats.executionEfficiencyPct !== null
            ? `${replay.stats.executionEfficiencyPct.toFixed(0)}%`
            : '—'}
        </div>
        <span className="text-fg-subtle text-caption">
          {replay.stats.durationMs
            ? `${Math.round(replay.stats.durationMs / 60000)}m hold time`
            : 'Open position'}
        </span>
      </div>
    </div>
  );
}
