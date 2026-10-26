'use client';

// SPDX-License-Identifier: Apache-2.0

// Compact "Recent Executions" preview for the journal Overview tab: the newest
// few rows plus a jump into the full, filterable Trades tab.
//
// Overview deliberately does not mount the virtualized <EntryList>; search,
// filters, and mass actions belong to the Trades tab so the two tabs are not
// two copies of the same table.
import type { JournalEntry } from '@kestrel/shared';
import { IconArrowRight, IconHistory } from '@tabler/icons-react';

import { cn } from '@/lib/formatters/cn';
import { formatRelative } from '@/lib/formatters/format';

interface RecentExecutionsProps {
  entries: readonly JournalEntry[];
  limit?: number;
  onViewAll: () => void;
}

export function RecentExecutions({ entries, limit = 5, onViewAll }: RecentExecutionsProps) {
  const recent = [...entries]
    .sort((a, b) => (b.closedAt ?? b.openedAt) - (a.closedAt ?? a.openedAt))
    .slice(0, limit);

  return (
    <section
      aria-label="Recent executions"
      className="surface-panel rounded-xl border border-white/10 p-4"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2">
          <IconHistory className="text-fg-subtle size-4" aria-hidden="true" />
          <h2 className="text-fg text-sm font-semibold">Recent Executions</h2>
          {recent.length > 0 ? (
            <span className="text-fg-subtle font-mono text-xs">last {recent.length}</span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onViewAll}
          className="text-brand inline-flex items-center gap-1 text-xs font-semibold transition-colors hover:underline"
        >
          View &amp; Filter All Trades
          <IconArrowRight className="size-3.5" aria-hidden="true" />
        </button>
      </header>

      {recent.length === 0 ? (
        <p className="text-fg-subtle text-xs">No trades logged yet.</p>
      ) : (
        <ul className="divide-divider divide-y">
          {recent.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-fg font-mono text-xs font-bold">{entry.symbol}</span>
                <span
                  className={cn(
                    'rounded-2xs border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase',
                    entry.side === 'long'
                      ? 'border-bull/30 bg-bull/10 text-bull'
                      : 'border-bear/30 bg-bear/10 text-bear',
                  )}
                >
                  {entry.side}
                </span>
                {entry.outcome === 'open' ? (
                  <span className="text-fg-subtle font-mono text-[10px] tracking-wider uppercase">
                    open
                  </span>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-3 font-mono text-xs tabular-nums">
                <span className="text-fg-subtle">
                  {formatRelative(entry.closedAt ?? entry.openedAt)}
                </span>
                <span
                  className={cn(
                    'w-14 text-right font-bold',
                    entry.rMultiple === null
                      ? 'text-fg-muted'
                      : entry.rMultiple > 0
                        ? 'text-bull'
                        : entry.rMultiple < 0
                          ? 'text-bear'
                          : 'text-fg-muted',
                  )}
                >
                  {entry.rMultiple === null
                    ? '—'
                    : `${entry.rMultiple > 0 ? '+' : ''}${entry.rMultiple.toFixed(2)}R`}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
