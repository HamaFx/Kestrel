'use client';

// SPDX-License-Identifier: Apache-2.0

// Outcome distribution combining Bklit's concentric `RingChart` with a
// prominent win-rate readout and interactive legend chips.
import type { JournalEntry } from '@kestrel/shared';
import { Ring, RingChart } from 'bklit-tanstack-charts';
import { useMemo, useState } from 'react';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/formatters/cn';

interface Slice {
  key: string;
  label: string;
  count: number;
  pct: number;
  tone: string;
  color: string;
}

export function OutcomeDistribution({ entries }: { entries: readonly JournalEntry[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const { slices, total, winRate } = useMemo(() => {
    const total = entries.length;
    const win = entries.filter((entry) => entry.outcome === 'win').length;
    const loss = entries.filter((entry) => entry.outcome === 'loss').length;
    const breakeven = entries.filter((entry) => entry.outcome === 'breakeven').length;
    const open = entries.filter((entry) => entry.outcome === 'open').length;
    const pct = (count: number) => (total > 0 ? (count / total) * 100 : 0);
    return {
      total,
      winRate: total > 0 ? Math.round((win / total) * 100) : 0,
      slices: [
        {
          key: 'win',
          label: 'Wins',
          count: win,
          pct: pct(win),
          tone: 'bg-bull',
          color: 'var(--chart-positive)',
        },
        {
          key: 'loss',
          label: 'Losses',
          count: loss,
          pct: pct(loss),
          tone: 'bg-bear',
          color: 'var(--chart-negative)',
        },
        {
          key: 'be',
          label: 'Breakeven',
          count: breakeven,
          pct: pct(breakeven),
          tone: 'bg-fg-muted/65',
          color: 'var(--color-fg-subtle)',
        },
        {
          key: 'open',
          label: 'Open',
          count: open,
          pct: pct(open),
          tone: 'bg-brand',
          color: 'var(--chart-line-primary)',
        },
      ] satisfies Slice[],
    };
  }, [entries]);

  const ringData = useMemo(
    () =>
      slices.map((slice) => ({
        label: slice.label,
        value: slice.count,
        maxValue: Math.max(total, 1),
        color: slice.color,
      })),
    [slices, total],
  );

  const activeSlice = hoveredIndex !== null ? (slices[hoveredIndex] ?? null) : null;

  return (
    <Card as="section" aria-label="Outcome distribution" className="gap-3.5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-fg-subtle font-mono text-[10px] font-semibold tracking-wider uppercase">
              Outcome mix
            </span>
            <span className="text-fg-subtle font-mono text-[10px] tabular-nums">
              {total} {total === 1 ? 'trade' : 'trades'}
            </span>
          </div>

          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-fg font-mono text-2xl font-bold tracking-tight tabular-nums">
              {activeSlice ? `${Math.round(activeSlice.pct)}%` : `${winRate}%`}
            </span>
            <span className="text-fg-subtle text-[10px]">
              {activeSlice
                ? `${activeSlice.label.toLowerCase()} (${activeSlice.count})`
                : 'win rate'}
            </span>
          </div>

          <div className="mt-3 flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-black/35">
            {slices.map((slice, index) =>
              slice.count > 0 ? (
                <div
                  key={slice.key}
                  className={cn(
                    'h-full rounded-full transition-all duration-300',
                    slice.tone,
                    hoveredIndex !== null && hoveredIndex !== index && 'opacity-35',
                  )}
                  style={{ width: `${slice.pct}%` }}
                  title={`${slice.label}: ${slice.count} (${Math.round(slice.pct)}%)`}
                />
              ) : null,
            )}
          </div>
        </div>

        {total > 0 ? (
          <div className="shrink-0">
            <RingChart
              data={ringData}
              size={84}
              strokeWidth={6}
              ringGap={3}
              baseInnerRadius={14}
              hoveredIndex={hoveredIndex}
              onHoverChange={setHoveredIndex}
              ariaLabel={`Outcome ring chart: ${winRate}% win rate across ${total} trades`}
            >
              {ringData.map((item, index) => (
                <Ring key={item.label} index={index} color={item.color} lineCap="round" />
              ))}
            </RingChart>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {slices.map((slice, index) => (
          <button
            key={slice.key}
            type="button"
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
            onFocus={() => setHoveredIndex(index)}
            onBlur={() => setHoveredIndex(null)}
            className={cn(
              'text-fg-subtle flex items-center gap-1.5 text-[10px] transition-opacity focus-visible:outline-none',
              hoveredIndex !== null && hoveredIndex !== index && 'opacity-45',
            )}
          >
            <span className={cn('size-1.5 rounded-full', slice.tone)} aria-hidden="true" />
            <span>{slice.label}</span>
            <span className="text-fg-muted font-mono tabular-nums">{slice.count}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}
