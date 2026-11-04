// SPDX-License-Identifier: Apache-2.0

// Small chart chrome primitives shared by the analytical surfaces: hover
// cards, legends and axis labels. The hover card is deliberately compact and
// only appears on charts, never on dense list sparklines.
import type { ReactNode } from 'react';

import { cn } from '@/lib/formatters/cn';

type ChartTone = 'bull' | 'bear' | 'brand' | 'muted' | 'warn' | 'neutral';

const DOT_TONE: Record<ChartTone, string> = {
  bull: 'bg-bull',
  bear: 'bg-bear',
  brand: 'bg-brand',
  muted: 'bg-fg-subtle',
  warn: 'bg-warn',
  neutral: 'bg-fg-subtle',
};

const TEXT_TONE: Record<ChartTone, string> = {
  bull: 'text-bull',
  bear: 'text-bear',
  brand: 'text-brand',
  muted: 'text-fg-muted',
  warn: 'text-warn',
  neutral: 'text-fg-muted',
};

export function ChartLegend({
  items,
  className,
  shape = 'line',
}: {
  items: ReadonlyArray<{ label: string; tone: ChartTone; dashed?: boolean }>;
  className?: string;
  shape?: 'line' | 'bar';
}) {
  return (
    <div
      className={cn(
        'text-fg-subtle flex flex-wrap items-center gap-x-3.5 gap-y-1 font-mono text-[9px] tracking-wider uppercase',
        className,
      )}
    >
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn(
              shape === 'line' ? 'h-[2px] w-3.5 rounded-full' : 'h-2 w-2 rounded-[2px]',
              DOT_TONE[item.tone],
              item.dashed && 'opacity-50',
            )}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function ChartTooltip({
  x,
  y,
  title,
  rows,
  className,
}: {
  x: number;
  y: number;
  title?: string;
  rows: ReadonlyArray<{ label: string; value: ReactNode; tone?: ChartTone }>;
  className?: string;
}) {
  const left = Math.min(86, Math.max(14, x));
  const top = y < 32 ? y + 6 : y - 6;
  return (
    <div
      className={cn(
        'pointer-events-none absolute z-30 min-w-[118px] rounded-lg border border-white/10 bg-[#141516]/95 p-2.5 shadow-2xl backdrop-blur-md',
        className,
      )}
      style={{
        left: `${left}%`,
        top: `${top}%`,
        transform: y < 32 ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
      }}
      role="status"
      aria-live="polite"
    >
      {title ? (
        <div className="text-fg-subtle mb-1.5 font-mono text-[9px] tracking-wider uppercase">
          {title}
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3">
            <span className="text-fg-subtle font-mono text-[10px]">{row.label}</span>
            <span
              className={cn(
                'font-mono text-[10px] font-semibold tabular-nums',
                row.tone ? TEXT_TONE[row.tone] : 'text-fg',
              )}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChartYAxis({
  ticks,
  yFor,
  format,
  className,
}: {
  ticks: readonly number[];
  yFor: (value: number) => number;
  format: (value: number) => string;
  className?: string;
}) {
  return (
    <div
      className={cn('pointer-events-none absolute inset-y-0 right-0 w-12', className)}
      aria-hidden="true"
    >
      {ticks.map((tick) => (
        <span
          key={`tick-${tick}`}
          className="text-fg-subtle absolute right-1 -translate-y-1/2 font-mono text-[9px] tabular-nums"
          style={{ top: `${yFor(tick)}%` }}
        >
          {format(tick)}
        </span>
      ))}
    </div>
  );
}
