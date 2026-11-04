// SPDX-License-Identifier: Apache-2.0

// Forward ATR cone for the `forecast_volatility` tool part. The live mid is
// the cone anchor (the tool only returns a range when it has a fresh quote),
// and the band widens with the square root of elapsed time — the variance
// growth of a random walk, not a decorative triangle.
import { IconChartLine } from '@tabler/icons-react';

import { cn } from '@/lib/formatters/cn';

const STEPS = 20;
const X_START = 4;
const X_END = 96;
const Y_TOP = 12;
const Y_BOTTOM = 88;

interface VolatilityConePlotProps {
  symbol: string;
  horizonHours: number;
  range: { low: number; mid: number; high: number };
  /** Epoch-ms timestamp the forecast was computed at. */
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
  const span = Math.max(range.high - range.low, Number.EPSILON);
  const upperMove = Math.max(range.high - range.mid, 0);
  const lowerMove = Math.max(range.mid - range.low, 0);

  const yFor = (price: number) => Y_BOTTOM - ((price - range.low) / span) * (Y_BOTTOM - Y_TOP);
  const xFor = (t: number) => X_START + (X_END - X_START) * t;

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

  return (
    <div
      className={cn('surface-well relative h-44 overflow-hidden rounded-xl', className)}
      role="img"
      aria-label={`${symbol} ${horizonHours}h volatility cone: ${formatPrice(range.low)} to ${formatPrice(range.high)} around ${formatPrice(range.mid)}`}
    >
      <div className="absolute inset-y-0 right-20 left-0">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          {[Y_TOP, midY, Y_BOTTOM].map((y, index) => (
            <line
              key={`grid-${index}`}
              x1="0"
              x2="100"
              y1={y}
              y2={y}
              stroke="var(--chart-grid)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <polygon points={band} fill="var(--chart-band)" />

          <path
            d={toPath(upper)}
            fill="none"
            stroke="var(--chart-line-primary)"
            strokeOpacity={0.55}
            strokeWidth="1"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={toPath(lower)}
            fill="none"
            stroke="var(--chart-line-primary)"
            strokeOpacity={0.55}
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
            strokeOpacity={0.35}
            strokeWidth="1"
            strokeDasharray="2 4"
            vectorEffect="non-scaling-stroke"
          />

          <line
            x1={X_END}
            x2={X_END}
            y1={Y_TOP - 6}
            y2={Y_BOTTOM + 6}
            stroke="var(--chart-line-primary)"
            strokeOpacity={0.5}
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
              strokeOpacity={0.7}
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

        {/* Pulsing terminal ring at the expiry midpoint. */}
        <span
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${X_END}%`, top: `${midY}%` }}
          aria-hidden="true"
        >
          <span className="bg-brand/40 motion-reduce:animate-none absolute inset-0 animate-ping rounded-full" />
          <span className="bg-brand relative block size-1.5 rounded-full" />
        </span>

        {eventX !== null ? (
          <span
            className="bg-warn absolute size-1.5 -translate-x-1/2 rounded-full"
            style={{ left: `${eventX}%`, top: `${Y_TOP - 6}%` }}
            aria-hidden="true"
          />
        ) : null}
      </div>

      <div className="absolute inset-y-0 right-0 w-20">
        {(
          [
            ['High', range.high, Y_TOP],
            ['Mid', range.mid, midY],
            ['Low', range.low, Y_BOTTOM],
          ] as const
        ).map(([label, value, top]) => (
          <div
            key={label}
            className="absolute right-1.5 -translate-y-1/2 text-right font-mono tabular-nums"
            style={{ top: `${top}%` }}
          >
            <span className="text-fg-subtle block text-[9px] tracking-wider uppercase">
              {label}
            </span>
            <span className="text-fg block text-[10px]">{formatPrice(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function VolatilityConeUnavailable({ note }: { note?: string }) {
  return (
    <div className="surface-well flex h-44 flex-col items-center justify-center gap-2 rounded-xl p-4 text-center">
      <IconChartLine className="text-fg-subtle size-6" strokeWidth={1.5} aria-hidden="true" />
      <p className="text-fg text-xs font-medium">Projected range unavailable</p>
      <p className="text-fg-subtle max-w-xs text-[11px] leading-relaxed">
        No fresh live mid to anchor the cone. ATR and expected move are still shown above.
      </p>
      {note ? <p className="text-fg-subtle max-w-xs text-[10px]">{note}</p> : null}
    </div>
  );
}
