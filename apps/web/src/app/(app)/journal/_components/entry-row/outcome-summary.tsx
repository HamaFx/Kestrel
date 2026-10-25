'use client';

// SPDX-License-Identifier: Apache-2.0

// Outcome realization display: live R/cash metrics for open trades, or the
// settled outcome badge and R-multiple for closed ones.
import type { JournalEntry } from '@kestrel/shared';
import { IconArrowDownRight, IconArrowUpRight, IconPlayerPlay } from '@tabler/icons-react';

import { cn } from '@/lib/formatters/cn';

import type { LiveEntryStats } from './use-entry-metrics';

interface OutcomeSummaryProps {
  entry: JournalEntry;
  liveStats: LiveEntryStats | null;
  outcomeColor: string;
}

export function OutcomeSummary({ entry, liveStats, outcomeColor }: OutcomeSummaryProps) {
  return (
    <>
      {/* Outcome realization display */}
      {entry.outcome === 'open' ? (
        liveStats ? (
          <div className="flex flex-col items-end gap-0.5">
            {/* Live R Multiple */}
            {entry.stop !== null && (
              <span
                className={cn(
                  'flex items-center gap-0.5 text-sm font-extrabold tabular-nums',
                  outcomeColor,
                )}
              >
                {liveStats.rMultiple >= 0 ? (
                  <IconArrowUpRight className="size-4" />
                ) : (
                  <IconArrowDownRight className="size-4" />
                )}
                {liveStats.rMultiple >= 0 ? '+' : ''}
                {liveStats.rMultiple.toFixed(2)}R
              </span>
            )}
            {/* Live cash value or Pip distance */}
            <span className="text-caption text-fg-muted font-bold tracking-wide tabular-nums">
              {entry.size !== null
                ? `${liveStats.cashPnl >= 0 ? '+' : ''}$${liveStats.cashPnl.toFixed(2)}`
                : `${liveStats.pips >= 0 ? '+' : ''}${liveStats.pips.toFixed(1)} Pips`}
            </span>
          </div>
        ) : (
          <div className="text-fg flex animate-pulse items-center gap-1.5 text-xs font-bold">
            <IconPlayerPlay className="fill-brand size-3" />
            <span>Live polling...</span>
          </div>
        )
      ) : (
        <div className="flex flex-col items-end">
          <span
            className={cn(
              'bg-bg-elev-3 border-border/40 rounded-md border px-2 py-0.5 text-xs font-black tracking-wider uppercase',
              outcomeColor,
            )}
          >
            {entry.outcome}
          </span>
          {entry.rMultiple !== null && (
            <span className={cn('mt-1 text-sm font-extrabold tabular-nums', outcomeColor)}>
              {entry.rMultiple >= 0 ? '+' : ''}
              {entry.rMultiple.toFixed(2)}R
            </span>
          )}
        </div>
      )}
    </>
  );
}
