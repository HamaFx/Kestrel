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

// Equity curve with the running peak shaded behind it. The peak-to-trough
// band is the drawdown; the shared ProfitLossLine supplies the sign-coloured
// curve, zero baseline, and drag-to-measure range HUD.
import type { JournalEntry, JournalStatsWithNulls } from '@kestrel/shared';
import { useMemo } from 'react';

import { ProfitLossLine } from '@/components/chart/profit-loss-line';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/formatters/cn';

interface DrawdownChartProps {
  entries: readonly JournalEntry[];
  stats: JournalStatsWithNulls;
  className?: string;
}

function formatDay(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(5, 10);
}

export function DrawdownChart({ entries, stats: _stats, className }: DrawdownChartProps) {
  const { curve, peaks, labels, maxDrawdown, recoveryFactor } = useMemo(() => {
    const closed = [...entries]
      .filter((entry) => entry.outcome !== 'open' && entry.rMultiple !== null)
      .sort((a, b) => a.openedAt - b.openedAt);

    const curve: number[] = [];
    const peaks: number[] = [];
    let cumulative = 0;
    let peak = 0;
    let maxDD = 0;

    for (const entry of closed) {
      cumulative += entry.rMultiple ?? 0;
      if (cumulative > peak) peak = cumulative;
      const drawdown = peak - cumulative;
      if (drawdown > maxDD) maxDD = drawdown;
      curve.push(cumulative);
      peaks.push(peak);
    }

    return {
      curve,
      peaks,
      labels: closed.map((entry) => formatDay(entry.openedAt)),
      maxDrawdown: maxDD,
      recoveryFactor: maxDD === 0 ? 0 : cumulative / maxDD,
    };
  }, [entries]);

  if (curve.length < 2) {
    return (
      <Card as="section" aria-label="Drawdown chart" className={cn('gap-3', className)}>
        <header className="flex items-center justify-between gap-2">
          <span className="text-fg-subtle font-mono text-[11px] font-semibold tracking-wider uppercase">
            Drawdown
          </span>
        </header>
        <div className="surface-well relative h-24 overflow-hidden rounded-xl">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full opacity-30"
            aria-hidden="true"
          >
            <path
              d="M0 78 C 14 70, 24 84, 40 58 S 70 48, 100 30"
              fill="none"
              stroke="var(--chart-negative)"
              strokeWidth="1.5"
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-4 text-center">
            <p className="text-fg text-xs font-medium">No drawdown path yet</p>
            <p className="text-fg-subtle max-w-xs text-[11px] leading-relaxed">
              Close two trades to plot the peak-to-trough curve.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card as="section" aria-label="Drawdown chart" className={cn('gap-3', className)}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-fg-subtle font-mono text-[11px] font-semibold tracking-wider uppercase">
          Drawdown
        </span>
        <span className="text-fg-muted font-mono text-[10px] tabular-nums">
          Max DD: -{maxDrawdown.toFixed(2)}R · Recovery: {recoveryFactor.toFixed(2)}
        </span>
      </header>

      <ProfitLossLine
        values={curve}
        ceilingValues={peaks}
        labels={labels}
        height={160}
        formatValue={(value) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}R`}
        ariaLabel={`Drawdown chart: max drawdown ${maxDrawdown.toFixed(2)}R, recovery factor ${recoveryFactor.toFixed(2)}`}
        measure
        measureUnit="trades"
      />
    </Card>
  );
}
