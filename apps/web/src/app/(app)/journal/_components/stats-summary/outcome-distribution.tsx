'use client';

// SPDX-License-Identifier: Apache-2.0

// Segmented outcome distribution bar (wins / open / breakeven / losses).
import type { JournalEntry } from '@kestrel/shared';
import { useMemo } from 'react';

export function OutcomeDistribution({ entries }: { entries: readonly JournalEntry[] }) {
  const distribution = useMemo(() => {
    const total = entries.length;
    if (total === 0) {
      return {
        win: 0,
        loss: 0,
        be: 0,
        open: 0,
        raw: { win: 0, loss: 0, be: 0, open: 0 },
      };
    }

    const win = entries.filter((e) => e.outcome === 'win').length;
    const loss = entries.filter((e) => e.outcome === 'loss').length;
    const be = entries.filter((e) => e.outcome === 'breakeven').length;
    const open = entries.filter((e) => e.outcome === 'open').length;

    return {
      win: (win / total) * 100,
      loss: (loss / total) * 100,
      be: (be / total) * 100,
      open: (open / total) * 100,
      raw: { win, loss, be, open },
    };
  }, [entries]);

  return (
    <div className="border-border bg-bg-elev-1 flex flex-col gap-2.5 rounded-sm border p-4">
      <div className="text-fg-subtle flex items-center justify-between text-xs font-semibold">
        <span className="tracking-wider uppercase">Outcome Distribution</span>
        <span className="text-fg-muted tabular-nums">{entries.length} Total Trades logged</span>
      </div>

      <div className="bg-bg-elev-3 flex h-3 w-full overflow-hidden rounded-sm">
        {distribution.win > 0 && (
          <div
            style={{ width: `${distribution.win}%` }}
            className="bg-bull h-full transition-all duration-300"
            title={`Wins: ${distribution.raw.win}`}
          />
        )}
        {distribution.open > 0 && (
          <div
            style={{ width: `${distribution.open}%` }}
            className="bg-fg h-full animate-pulse transition-all duration-300"
            title={`Open: ${distribution.raw.open}`}
          />
        )}
        {distribution.be > 0 && (
          <div
            style={{ width: `${distribution.be}%` }}
            className="bg-fg-muted/65 h-full transition-all duration-300"
            title={`Breakeven: ${distribution.raw.be}`}
          />
        )}
        {distribution.loss > 0 && (
          <div
            style={{ width: `${distribution.loss}%` }}
            className="bg-bear h-full transition-all duration-300"
            title={`Losses: ${distribution.raw.loss}`}
          />
        )}
      </div>

      <div className="text-caption text-fg-subtle mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-semibold">
        <div className="flex items-center gap-1.5">
          <span className="bg-bull size-2 rounded-sm" />
          <span>Wins ({distribution.raw.win})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="bg-fg size-2 rounded-sm" />
          <span>Open ({distribution.raw.open})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="bg-fg-muted/65 size-2 rounded-sm" />
          <span>Breakeven ({distribution.raw.be})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="bg-bear size-2 rounded-sm" />
          <span>Losses ({distribution.raw.loss})</span>
        </div>
      </div>
    </div>
  );
}
