'use client';

// SPDX-License-Identifier: Apache-2.0

// Segmented outcome distribution with a prominent win-rate readout and
// labelled legend chips.
import type { JournalEntry } from '@kestrel/shared';
import { useMemo } from 'react';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/formatters/cn';

interface Slice {
  key: string;
  label: string;
  count: number;
  pct: number;
  tone: string;
}

export function OutcomeDistribution({ entries }: { entries: readonly JournalEntry[] }) {
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
        { key: 'win', label: 'Wins', count: win, pct: pct(win), tone: 'bg-bull' },
        { key: 'open', label: 'Open', count: open, pct: pct(open), tone: 'bg-fg' },
        {
          key: 'be',
          label: 'Breakeven',
          count: breakeven,
          pct: pct(breakeven),
          tone: 'bg-fg-muted/65',
        },
        { key: 'loss', label: 'Losses', count: loss, pct: pct(loss), tone: 'bg-bear' },
      ] satisfies Slice[],
    };
  }, [entries]);

  return (
    <Card as="section" aria-label="Outcome distribution" className="gap-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="text-fg-subtle font-mono text-[10px] font-semibold tracking-wider uppercase">
            Outcome mix
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-fg font-mono text-2xl font-bold tracking-tight tabular-nums">
              {winRate}%
            </span>
            <span className="text-fg-subtle text-[10px]">win rate</span>
          </div>
        </div>
        <span className="text-fg-subtle font-mono text-[10px] tabular-nums">
          {total} {total === 1 ? 'trade' : 'trades'}
        </span>
      </div>

      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-black/30">
        {slices.map((slice) =>
          slice.count > 0 ? (
            <div
              key={slice.key}
              className={cn('h-full rounded-full transition-all duration-500', slice.tone)}
              style={{ width: `${slice.pct}%` }}
              title={`${slice.label}: ${slice.count} (${Math.round(slice.pct)}%)`}
            />
          ) : null,
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {slices.map((slice) => (
          <span key={slice.key} className="text-fg-subtle flex items-center gap-1.5 text-[10px]">
            <span className={cn('size-1.5 rounded-full', slice.tone)} aria-hidden="true" />
            <span>{slice.label}</span>
            <span className="text-fg-muted font-mono tabular-nums">{slice.count}</span>
          </span>
        ))}
      </div>
    </Card>
  );
}
