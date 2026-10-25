'use client';

// SPDX-License-Identifier: Apache-2.0

// Left column of a journal row: side badge, symbol, sizing, timestamps,
// tags, screenshot thumbnail, and notes.
import type { JournalEntry } from '@kestrel/shared';

import { cn } from '@/lib/formatters/cn';

import { ScreenshotPreview } from './screenshot-preview';
import { TagList } from './tag-list';

interface EntrySummaryProps {
  entry: JournalEntry;
  openedAtLabel: string;
  closedAtLabel?: string;
}

export function EntrySummary({ entry, openedAtLabel, closedAtLabel }: EntrySummaryProps) {
  const sideColor = entry.side === 'long' ? 'text-bull' : 'text-bear';
  const sideBg = entry.side === 'long' ? 'bg-bull/10 border-bull/20' : 'bg-bear/10 border-bear/20';

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      {/* Header Row */}
      <div className="flex flex-wrap items-center gap-2 text-sm font-bold tabular-nums">
        <span
          className={cn(
            'text-caption rounded-md border px-2 py-0.5 font-black tracking-wider uppercase',
            sideBg,
            sideColor,
          )}
        >
          {entry.side}
        </span>
        <span className="text-fg font-display text-base tracking-tight">{entry.symbol}</span>
        <span className="text-fg-muted text-xs font-medium">at</span>
        <span className="text-fg font-extrabold">{entry.entry}</span>

        {/* Sizing lot indicator */}
        {entry.size !== null && (
          <span className="text-caption text-fg-subtle bg-bg-elev-3 border-border/40 rounded-md border px-1.5 py-0.5 font-medium">
            {entry.size} Lots
          </span>
        )}
      </div>

      {/* Opened & Closed Dates */}
      <p className="text-fg-subtle flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold">
        <span>Opened {openedAtLabel}</span>
        {entry.closedAt && closedAtLabel && (
          <>
            <span className="text-fg-muted/50">·</span>
            <span>Closed {closedAtLabel}</span>
          </>
        )}
      </p>

      {/* Tags Strip */}
      {entry.tags && entry.tags.length > 0 && <TagList tags={entry.tags} />}

      {/* Screenshot thumbnail */}
      {entry.screenshotUrl && <ScreenshotPreview url={entry.screenshotUrl} />}

      {/* Notes display */}
      {entry.notes && (
        <p className="text-fg-muted mt-1.5 border-l-2 border-white/15 py-0.5 pl-2.5 text-xs leading-[1.4]">
          {entry.notes}
        </p>
      )}
    </div>
  );
}
