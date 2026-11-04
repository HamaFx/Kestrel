'use client';

// SPDX-License-Identifier: Apache-2.0

// Forward ATR cone for the `forecast_volatility` tool part. The live mid is
// the cone anchor and the band widens with the square root of elapsed time.
// A real price axis, time axis, legend and event marker make it feel like a
// chart rather than an illustration.
import { IconChartLine } from '@tabler/icons-react';
import { useId } from 'react';

import { niceTicks } from '@/components/chart/chart-geometry';
import { ChartLegend } from '@/components/chart/chart-ui';
import { cn } from '@/lib/formatters/cn';

const STEPS = 24;
const X_START = 4;
const X_END = 94;
const Y_TOP = 10;
const Y_BOTTOM = 88;

interface VolatilityConePlotProps {
  symbol: string;
  horizonHours: number;
  range: { low: number; mid: number; high: number };
  asOf: number;
  event: { title: string; whenIso: string; currency: string | null } | null;
  className?: string;
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
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const span = Math.max(range.high - range.low, Number.EPSILON);
  const upperMove = Math.max(range.high - range.mid, 0);
  const lowerMove = Math.max(range.mid - range.low, 0);
  const yFor = (price: number) => Y_BOTTOM - ((price - range.low) / span) * (Y_BOTTOM - Y_TOP);
  const xFor = (t: number) => X_START + (X_END - X_START) * t;
  const ticks = niceTicks(range.low, range.high, 4);

  const upper = Array.from({ length: STEPS + 1 }, (_, index) => {
    const t = index / STEPS;
    return [xFor(t), yFor(range.mid + upperMove * Math.sqrt(t))] as const;
  });
  const lower = Array.from({ length: STEPS + 1 }, (_, index) => {
    const t = 1 - index / STEPS;
    return [xFor(t), yFor(range.mid - lowerMove * Math.sqrt(t))] as const;
  });
  const toPath = (points: ReadonlyArray<readonly [number, number]>) =>
    points
      .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
      .join(' ');
  const band = [...upper, ...lower].map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const midY = yFor(range.mid);
  const eventT = event ? (Date.parse(event.whenIso) - asOf) / (horizonHours * 60 * 60 * 1000) : NaN;
  const eventX = Number.isFinite(eventT) && eventT >= 0 && eventT <= 1 ? xFor(eventT) : null;
  const midLabelY = Math.min(Y_BOTTOM - 1, Math.max(Y_TOP + 1, midY));

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

      <div
        className="surface-well relative h-52 overflow-hidden rounded-xl"
        role="img"
        aria-label={`${symbol} ${horizonHours}h volatility cone: ${formatPrice(range.low)} to ${formatPrice(range.high)} around ${formatPrice(range.mid)}`}
      >
        <div className="absolute inset-y-0 right-16 left-0">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={`${rawId}-cone`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-line-primary)" stopOpacity="0.2" />
                <stop offset="100%" stopColor="var(--chart-line-primary)" stopOpacity="0.05" />
              </linearGradient>
            </defs>

            {ticks.map((tick) => (
              <line
                key={`tick-${tick}`}
                x1="0"
                x2="100"
                y1={yFor(tick)}
                y2={yFor(tick)}
                stroke="var(--chart-grid)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {[0, 25, 50, 75, 100].map((pct) => (
              <line
                key={`x-${pct}`}
                x1={pct}
                x2={pct}
                y1={Y_TOP}
                y2={Y_BOTTOM}
                stroke="var(--chart-grid)"
                strokeWidth="1"
                strokeDasharray="1 4"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            <polygon points={band} fill={`url(#${rawId}-cone)`} />

            <path
              d={toPath(upper)}
              fill="none"
              stroke="var(--chart-line-primary)"
              strokeOpacity={0.65}
              strokeWidth="1"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={toPath(lower)}
              fill="none"
              stroke="var(--chart-line-primary)"
              strokeOpacity={0.65}
              strokeWidth="1"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />

            <line
              x1={X_START}
              x2={X_END}
              y1={midY}
              y2={midY}
              stroke="var(--color-fg-subtle)"
              strokeOpacity={0.5}
              strokeWidth="1"
              strokeDasharray="2 3"
              vectorEffect="non-scaling-stroke"
            />

            <line
              x1={X_END}
              x2={X_END}
              y1={Y_TOP - 5}
              y2={Y_BOTTOM + 5}
              stroke="var(--chart-line-primary)"
              strokeOpacity={0.6}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />

            {eventX !== null ? (
              <line
                x1={eventX}
                x2={eventX}
                y1={Y_TOP - 2}
                y2={Y_BOTTOM + 2}
                stroke="var(--color-warn)"
                strokeOpacity={0.8}
                strokeWidth="1"
                strokeDasharray="2 2"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </svg>

          <span className="text-fg-subtle absolute top-1.5 left-1.5 font-mono text-[9px] tracking-wider uppercase">
            Now
          </span>
          <span className="text-fg-subtle absolute top-1.5 right-1.5 font-mono text-[9px] tracking-wider uppercase">
            +{horizonHours}h
          </span>

          <span
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${X_END}%`, top: `${midY}%` }}
            aria-hidden="true"
          >
            <span className="bg-brand/35 motion-reduce:animate-none absolute inset-0 animate-ping rounded-full" />
            <span className="bg-brand relative block size-1.5 rounded-full" />
          </span>

          {eventX !== null ? (
            <span
              className="bg-warn absolute size-1.5 -translate-x-1/2 rounded-full"
              style={{ left: `${eventX}%`, top: `${Y_TOP - 7}%` }}
              aria-hidden="true"
            />
          ) : null}
        </div>

        <div className="absolute inset-y-0 right-0 w-16" aria-hidden="true">
          {ticks.map((tick) => (
            <span
              key={`price-${tick}`}
              className="text-fg-subtle absolute right-1.5 -translate-y-1/2 font-mono text-[9px] tabular-nums"
              style={{ top: `${yFor(tick)}%` }}
            >
              {formatPrice(tick)}
            </span>
          ))}
          <span
            className="text-brand absolute right-1.5 -translate-y-1/2 rounded bg-black/40 px-1 font-mono text-[9px] font-semibold tabular-nums"
            style={{ top: `${midLabelY}%` }}
          >
            {formatPrice(range.mid)}
          </span>
        </div>
      </div>

      <div className="text-fg-subtle flex justify-between font-mono text-[9px]">
        <span>Now</span>
        <span>+{Math.round(horizonHours / 4)}h</span>
        <span>+{Math.round(horizonHours / 2)}h</span>
        <span>+{Math.round((horizonHours * 3) / 4)}h</span>
        <span>+{horizonHours}h</span>
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
