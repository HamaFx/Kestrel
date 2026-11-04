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

// Cumulative R-multiple performance curve. Uses the shared ProfitLossLine
// engine so the zero baseline, sign colours, hover readout and drag-to-measure
// HUD match the drawdown chart instead of a separate chart library.
import type { JournalEntry } from '@kestrel/shared';
import { IconAward } from '@tabler/icons-react';
import { useMemo } from 'react';

import { buildEquityCurve } from './performance-chart-data';
import { ProfitLossLine } from './profit-loss-line';

interface PerformanceChartProps {
  entries: JournalEntry[];
  height?: number;
  /**
   * Render only the plot area — no outer `surface-panel` and no
   * "Performance Curve / Net R-Score" header. Used by hosts that already
   * provide their own card chrome (e.g. the dashboard equity widget).
   */
  bare?: boolean;
}

function formatDay(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(5, 10);
}

function EquityEmpty({ height }: { height: number }) {
  return (
    <div className="surface-well relative overflow-hidden rounded-xl" style={{ height }}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full opacity-30"
        aria-hidden="true"
      >
        <path
          d="M0 80 C 12 74, 22 88, 38 62 S 66 52, 100 26"
          fill="none"
          stroke="var(--chart-line-primary)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-4 text-center">
        <p className="text-fg text-xs font-medium">No equity path yet</p>
        <p className="text-fg-subtle max-w-xs text-[11px] leading-relaxed">
          Close at least two trades to plot your cumulative R curve.
        </p>
      </div>
    </div>
  );
}

export function PerformanceChart({ entries, height = 220, bare = false }: PerformanceChartProps) {
  const { values, labels, totalR } = useMemo(() => {
    const curve = buildEquityCurve(entries);
    return {
      values: curve.data.map((point) => point.value),
      labels: curve.data.map((point) => formatDay(point.time)),
      totalR: curve.totalR,
    };
  }, [entries]);

  if (values.length < 2) {
    if (bare) return <EquityEmpty height={height} />;
    return (
      <div className="surface-panel flex flex-col gap-3 overflow-hidden p-4">
        <div className="flex items-center gap-2 px-1">
          <div className="surface-well text-brand rounded-lg p-2">
            <IconAward className="size-4" aria-hidden="true" />
          </div>
          <div>
            <h4 className="text-fg-subtle text-xs font-bold tracking-wider uppercase">
              Performance Curve
            </h4>
            <p className="text-fg-muted mt-0.5 text-xs">Cumulative R-Multiple Growth</p>
          </div>
        </div>
        <EquityEmpty height={height} />
      </div>
    );
  }

  const chart = (
    <ProfitLossLine
      values={values}
      labels={labels}
      height={height}
      formatValue={(value) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}R`}
      formatAxis={(value) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}R`}
      ariaLabel={`Cumulative R-multiple equity curve, net ${totalR.toFixed(2)}R`}
      measure
      measureUnit="trades"
      seriesLabel="Equity"
    />
  );

  if (bare) return chart;

  return (
    <div className="surface-panel relative flex flex-col gap-3 overflow-hidden p-4">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="surface-well text-brand rounded-lg p-2">
            <IconAward className="size-4" aria-hidden="true" />
          </div>
          <div>
            <h4 className="text-fg-subtle text-xs font-bold tracking-wider uppercase">
              Performance Curve
            </h4>
            <p className="text-fg-muted mt-0.5 text-xs">Cumulative R-Multiple Growth</p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-fg-muted text-xs font-medium tracking-wide uppercase">
            Net R-Score
          </span>
          <p
            className={`text-xl font-bold tracking-tight tabular-nums ${
              totalR >= 0 ? 'text-bull' : 'text-bear'
            }`}
          >
            {totalR >= 0 ? '+' : ''}
            {totalR.toFixed(2)}R
          </p>
        </div>
      </div>

      {chart}
    </div>
  );
}
