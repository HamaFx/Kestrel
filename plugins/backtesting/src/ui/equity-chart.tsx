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
import { useEffect, useMemo, useRef, useState } from 'react';
import type uPlot from 'uplot';

export interface EquityChartPoint {
  t: number;
  equity: number;
}

const DEFAULT_HEIGHT = 190;
const AXIS_COLOR = '#8b93a1';
const GRID_COLOR = 'rgba(255,255,255,0.06)';
const BASELINE_COLOR = 'rgba(255,255,255,0.18)';

/**
 * Interactive equity curve (uPlot).
 *
 * uPlot is 48KB with zero dependencies and gives the run page zoom, drag and a
 * crosshair without pulling a full charting framework into the plugin bundle.
 * The library is imported inside `useEffect`, so SSR only renders the frame.
 */
export function EquityChart({
  points,
  baseline,
  height = DEFAULT_HEIGHT,
  label = 'Equity curve',
}: {
  points: readonly EquityChartPoint[];
  baseline?: number;
  height?: number;
  label?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  const data = useMemo<[number[], number[]] | null>(() => {
    if (points.length < 2) return null;
    const times: number[] = [];
    const equity: number[] = [];
    for (const point of points) {
      times.push(Math.floor(point.t / 1000));
      equity.push(point.equity);
    }
    return [times, equity];
  }, [points]);

  const positive = useMemo(() => {
    const last = points[points.length - 1]?.equity;
    const first = points[0]?.equity;
    if (typeof last !== 'number' || typeof first !== 'number') return true;
    return last >= first;
  }, [points]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => {
      const next = container.clientWidth;
      if (next > 0) setWidth(next);
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!data || width <= 0) return;
    const container = containerRef.current;
    if (!container) return;

    let chart: uPlot | null = null;
    let cancelled = false;

    void import('uplot').then(({ default: UPlot }) => {
      if (cancelled || !container) return;

      const accent = positive ? '#22c55e' : '#ef4444';
      const fill = positive ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)';

      const options: uPlot.Options = {
        width,
        height,
        padding: [8, 8, 0, 0],
        legend: { show: false },
        cursor: {
          show: true,
          drag: { x: true, y: false, setScale: true },
        },
        scales: {
          x: { time: true },
          y: { auto: true },
        },
        axes: [
          {
            stroke: AXIS_COLOR,
            grid: { stroke: GRID_COLOR, width: 1 },
            ticks: { stroke: 'rgba(255,255,255,0.12)', width: 1 },
            font: '10px ui-monospace, SFMono-Regular, monospace',
          },
          {
            stroke: AXIS_COLOR,
            grid: { stroke: GRID_COLOR, width: 1 },
            ticks: { stroke: 'rgba(255,255,255,0.12)', width: 1 },
            font: '10px ui-monospace, SFMono-Regular, monospace',
            size: 64,
          },
        ],
        series: [
          {},
          {
            stroke: accent,
            width: 2,
            fill,
            points: { show: false },
          },
        ],
        hooks: {
          draw: [
            (u) => {
              if (baseline === undefined) return;
              const y = u.valToPos(baseline, 'y', true);
              if (!Number.isFinite(y)) return;
              if (y < u.bbox.top || y > u.bbox.top + u.bbox.height) return;
              const ctx = u.ctx;
              ctx.save();
              ctx.strokeStyle = BASELINE_COLOR;
              ctx.lineWidth = 1;
              ctx.setLineDash([4, 4]);
              ctx.beginPath();
              ctx.moveTo(u.bbox.left, y);
              ctx.lineTo(u.bbox.left + u.bbox.width, y);
              ctx.stroke();
              ctx.restore();
            },
          ],
        },
      };

      chart = new UPlot(options, data, container);
    });

    return () => {
      cancelled = true;
      chart?.destroy();
      if (container) container.replaceChildren();
    };
  }, [data, width, height, positive, baseline]);

  if (!data) {
    return (
      <div
        className="border-border/50 bg-bg-elev-1/40 flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed p-6 text-center"
        style={{ height }}
      >
        <p className="text-fg text-xs font-semibold">Not enough data to plot</p>
        <p className="text-fg-subtle text-[11px]">A run needs at least two equity points.</p>
      </div>
    );
  }

  return (
    <figure className="flex flex-col gap-1" aria-label={label}>
      <div ref={containerRef} className="w-full" style={{ height }} />
      <figcaption className="text-fg-subtle flex justify-between font-mono text-[10px]">
        <span>drag to zoom · double-click to reset</span>
        <span>{points.length} points</span>
      </figcaption>
    </figure>
  );
}
