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

// Premium Cumulative R-Multiple Performance Chart using lightweight-charts.
// Visualizes equity growth over time with clean canvas styling.
//
// H-2 audit fix: removed the file-level `eslint-disable
// @typescript-eslint/no-explicit-any` — the chart instance and area
// series are now typed via the lightweight-charts v5 public APIs.
import type { JournalEntry } from '@kestrel/shared';
import { IconAward, IconTrendingUp } from '@tabler/icons-react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useEffect, useMemo, useRef } from 'react';

import { SERIES_BEAR_HEX, SERIES_BULL_HEX } from './chart-colors';
import { buildEquityCurve } from './performance-chart-data';

interface PerformanceChartProps {
  entries: JournalEntry[];
  theme?: 'slate' | 'navy' | 'black' | 'classic';
  height?: number;
}

const PERF_THEME_COLORS: Record<string, { text: string; grid: string }> = {
  black: { text: '#a1a8b3', grid: '#1f1f1f' },
  slate: { text: '#94a3b8', grid: '#1e293b' },
  navy: { text: '#64748b', grid: '#0f172a' },
  classic: { text: '#a1a8b3', grid: '#262a35' },
};

function getPerfChartColors(theme: string): { text: string; grid: string } {
  return PERF_THEME_COLORS[theme] ?? PERF_THEME_COLORS.black!;
}

export function PerformanceChart({
  entries,
  theme = 'black',
  height = 220,
}: PerformanceChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);

  // This component renders an area chart of cumulative R-multiple, which is
  // a standalone chart type. The shared logic is the pure data
  // transformation in `performance-chart-data.ts`.
  const { data: chartData, totalR } = useMemo(() => buildEquityCurve(entries), [entries]);

  // Handle Chart Lifecycle
  useEffect(() => {
    const el = containerRef.current;
    if (!el || chartData.length === 0) return;

    // Destroy existing chart instance before creating a new one
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      seriesRef.current = null;
    }

    let cancelled = false;

    void import('lightweight-charts').then((lc) => {
      if (cancelled || !containerRef.current) return;

      const colors = getPerfChartColors(theme);

      // Lightweight-charts v5 exposes `createChart` as a named export.
      // The `default` fallback covers CommonJS interop shims that assign
      // the module to `.default` instead of using named exports.
      // We avoid `'createChart' in lc` narrowing (which makes the false
      // branch `never` because TS knows the property always exists) by
      // using `??` instead — at the type level `lc.createChart` is
      // always defined, but at runtime a misconfigured bundler could
      // leave it undefined, so the fallback is defensive.
      const createChartFn =
        lc.createChart ??
        (lc as unknown as { default?: { createChart: typeof lc.createChart } }).default
          ?.createChart;
      if (!createChartFn) throw new Error('lightweight-charts createChart not found');

      const chart = createChartFn(containerRef.current, {
        height,
        layout: {
          background: { color: 'transparent' },
          textColor: colors.text,
          fontFamily:
            getComputedStyle(el).getPropertyValue('--font-mono') || 'ui-monospace, monospace',
        },
        grid: {
          vertLines: { color: 'transparent' },
          horzLines: { color: colors.grid, style: 2 /* Dotted */ },
        },
        rightPriceScale: {
          borderColor: 'transparent',
          visible: true,
        },
        timeScale: {
          borderColor: 'transparent',
          timeVisible: true,
          secondsVisible: false,
        },
        crosshair: {
          mode: 1,
          vertLine: { color: colors.text, style: 3 /* Dashed */ },
          horzLine: { color: colors.text, style: 3 },
        },
        autoSize: true,
        handleScroll: false,
        handleScale: false,
      });

      chartRef.current = chart;

      const areaSeries = chart.addSeries(lc.AreaSeries, {
        lineColor: totalR >= 0 ? SERIES_BULL_HEX : SERIES_BEAR_HEX,
        topColor: totalR >= 0 ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
        bottomColor: 'rgba(0, 0, 0, 0)',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
      });

      seriesRef.current = areaSeries;
      areaSeries.setData(chartData);
      chart.timeScale().fitContent();
    });

    return () => {
      cancelled = true;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
    };
  }, [chartData, height, theme, totalR]);

  // Keep colors updated when totalR changes
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    series.applyOptions({
      lineColor: totalR >= 0 ? SERIES_BULL_HEX : SERIES_BEAR_HEX,
      topColor: totalR >= 0 ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
    });
  }, [totalR]);

  // Keep colors updated when theme dynamically changes
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const colors = getPerfChartColors(theme);
    chart.applyOptions({
      layout: { textColor: colors.text },
      grid: { horzLines: { color: colors.grid } },
    });
  }, [theme]);

  if (chartData.length < 2) {
    return (
      <div className="surface-panel flex h-[220px] flex-col items-center justify-center gap-2 p-6 text-center">
        <div className="bg-bg-elev-2 text-fg rounded-sm p-3">
          <IconTrendingUp className="size-6 animate-pulse" />
        </div>
        <p className="text-fg text-sm font-semibold">Performance Curve Loading</p>
        <p className="text-fg-subtle max-w-[280px] text-xs">
          Close at least two trades to begin plotting your cumulative R-multiple performance curve.
        </p>
      </div>
    );
  }

  return (
    <div className="surface-panel relative flex flex-col gap-3 overflow-hidden p-4">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="bg-bg-elev-2 text-fg rounded-sm p-2">
            <IconAward className="size-4" />
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
            className={`text-xl font-bold tracking-tight tabular-nums ${totalR >= 0 ? 'text-bull' : 'text-bear'}`}
          >
            {totalR >= 0 ? '+' : ''}
            {totalR.toFixed(2)}R
          </p>
        </div>
      </div>

      <div className="relative mt-1 w-full overflow-hidden rounded-sm bg-black/10">
        <div ref={containerRef} className="w-full" />
      </div>
    </div>
  );
}
