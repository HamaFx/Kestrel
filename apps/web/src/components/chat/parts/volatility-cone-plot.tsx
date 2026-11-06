'use client';

// SPDX-License-Identifier: Apache-2.0

// Forward ATR cone for the `forecast_volatility` tool part built on
// `bklit-tanstack-charts` (`LineChart` + `ReferenceArea` + `LineSeriesTerminalMarker`
// + `ChartMarkers` for high-impact economic events).
import { IconChartLine } from '@tabler/icons-react';
import {
  ChartMarkers,
  ChartTooltip,
  Grid,
  Line,
  LineChart,
  LineSeriesTerminalMarker,
  ReferenceArea,
  TooltipContent,
  XAxis,
  YAxis,
  type ChartMarker,
} from 'bklit-tanstack-charts';
import { useMemo } from 'react';

import { ChartLegend } from '@/components/chart/chart-ui';
import { cn } from '@/lib/formatters/cn';

const STEPS = 24;

interface VolatilityConePlotProps {
  symbol: string;
  horizonHours: number;
  range: { low: number; mid: number; high: number };
  asOf: number;
  event: { title: string; whenIso: string; currency: string | null } | null;
  className?: string;
}

interface ConeRow extends Record<string, unknown> {
  date: Date;
  hourOffset: number;
  upper: number;
  mid: number;
  lower: number;
}

function formatPrice(value: number): string {
  const decimals = value >= 100 ? 2 : value >= 1 ? 4 : 5;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function VolatilityConePlot({
  symbol,
  horizonHours,
  range,
  asOf,
  event,
  className,
}: VolatilityConePlotProps) {
  const upperMove = Math.max(range.high - range.mid, 0);
  const lowerMove = Math.max(range.mid - range.low, 0);
  const horizonMs = Math.max(1, horizonHours) * 3_600_000;

  const rows = useMemo<ConeRow[]>(() => {
    return Array.from({ length: STEPS + 1 }, (_, index) => {
      const t = index / STEPS;
      const rootT = Math.sqrt(t);
      return {
        date: new Date(asOf + t * horizonMs),
        hourOffset: Math.round(t * horizonHours * 10) / 10,
        upper: range.mid + upperMove * rootT,
        mid: range.mid,
        lower: range.mid - lowerMove * rootT,
      };
    });
  }, [asOf, horizonHours, horizonMs, lowerMove, range.mid, upperMove]);

  const markers = useMemo<ChartMarker[]>(() => {
    if (!event) return [];
    const eventMs = Date.parse(event.whenIso);
    if (!Number.isFinite(eventMs) || eventMs < asOf || eventMs > asOf + horizonMs) {
      return [];
    }
    return [
      {
        date: new Date(eventMs),
        icon: '!',
        title: event.title,
        description: event.currency
          ? `${event.currency} high-impact catalyst`
          : 'High-impact catalyst',
        color: 'var(--color-warn)',
      },
    ];
  }, [asOf, event, horizonMs]);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ChartLegend
          items={[
            { label: 'ATR cone', tone: 'brand' },
            { label: 'Live mid', tone: 'muted' },
            ...(event ? [{ label: 'High-impact', tone: 'warn' as const }] : []),
          ]}
        />
        <span className="text-fg-subtle font-mono text-[9px] tabular-nums">
          {formatPrice(range.low)} – {formatPrice(range.high)}
        </span>
      </div>

      <div className="surface-well relative h-56 overflow-hidden rounded-xl border border-white/[0.05]">
        <LineChart
          data={rows}
          xDataKey="date"
          aspectRatio="unset"
          style={{ height: '100%', aspectRatio: 'unset' }}
          margin={{ top: 18, right: 64, bottom: 28, left: 14 }}
          ariaLabel={`${symbol} ${horizonHours}h volatility cone: ${formatPrice(range.low)} to ${formatPrice(range.high)} around ${formatPrice(range.mid)}`}
        >
          <Grid
            horizontal
            vertical
            numTicksRows={4}
            numTicksColumns={4}
            highlightRowValues={[range.mid]}
            highlightRowStroke="var(--color-fg-subtle)"
            highlightRowStrokeOpacity={0.5}
          />
          <ReferenceArea
            y1={range.low}
            y2={range.high}
            fill="var(--chart-line-primary)"
            fillOpacity={0.09}
            stroke="var(--chart-line-primary)"
            strokeStyle="dashed"
          />
          <Line
            dataKey="upper"
            stroke="var(--chart-line-primary)"
            strokeWidth={2}
            dashFromIndex={0}
            dashArray="4,3"
            fadeEdges={false}
          />
          <Line
            dataKey="mid"
            stroke="var(--color-fg-subtle)"
            strokeWidth={1.5}
            dashFromIndex={0}
            dashArray="2,4"
            fadeEdges={false}
          />
          <Line
            dataKey="lower"
            stroke="var(--chart-line-primary)"
            strokeWidth={2}
            dashFromIndex={0}
            dashArray="4,3"
            fadeEdges={false}
          />
          <LineSeriesTerminalMarker
            dataKey="upper"
            stroke="var(--chart-line-primary)"
            fill="var(--chart-line-primary)"
            radius={3.5}
          />
          <LineSeriesTerminalMarker
            dataKey="lower"
            stroke="var(--chart-line-primary)"
            fill="var(--chart-line-primary)"
            radius={3.5}
          />
          <XAxis
            numTicks={5}
            tickMode="domain"
            formatValue={(date) => {
              const elapsedHours = Math.round((date.getTime() - asOf) / 3_600_000);
              return elapsedHours <= 0 ? 'Now' : `+${elapsedHours}h`;
            }}
          />
          <YAxis
            orientation="right"
            numTicks={4}
            formatLargeNumbers={false}
            formatValue={(v) => formatPrice(v)}
          />
          <ChartTooltip
            showDatePill={false}
            content={({ point }) => {
              const row = point as ConeRow;
              const hours = typeof row.hourOffset === 'number' ? row.hourOffset : 0;
              return (
                <TooltipContent
                  title={hours <= 0 ? 'Now (Anchor)' : `+${hours}h Horizon`}
                  rows={[
                    {
                      color: 'var(--chart-positive)',
                      label: 'Upper (+1σ)',
                      value: formatPrice(row.upper),
                    },
                    {
                      color: 'var(--color-fg-subtle)',
                      label: 'Live Mid',
                      value: formatPrice(row.mid),
                    },
                    {
                      color: 'var(--chart-negative)',
                      label: 'Lower (-1σ)',
                      value: formatPrice(row.lower),
                    },
                  ]}
                />
              );
            }}
          />
          {markers.length > 0 ? <ChartMarkers items={markers} size={22} /> : null}
        </LineChart>
      </div>
    </div>
  );
}

export function VolatilityConeUnavailable({ note }: { note?: string }) {
  return (
    <div className="surface-well flex h-52 flex-col items-center justify-center gap-2 rounded-xl p-4 text-center">
      <IconChartLine className="text-fg-subtle size-6" strokeWidth={1.5} aria-hidden="true" />
      <p className="text-fg text-xs font-medium">Projected range unavailable</p>
      <p className="text-fg-subtle max-w-xs text-[11px] leading-relaxed">
        No fresh live mid to anchor the cone. ATR and expected move are still shown above.
      </p>
      {note ? <p className="text-fg-subtle max-w-xs text-[10px]">{note}</p> : null}
    </div>
  );
}
