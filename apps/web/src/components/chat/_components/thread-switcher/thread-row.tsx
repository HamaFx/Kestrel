'use client';

// SPDX-License-Identifier: Apache-2.0

// Single conversation row (or bulk-select checkbox row).
import { IconCheck } from '@tabler/icons-react';

import { cn } from '@/lib/formatters/cn';
import { formatRelative } from '@/lib/formatters/format';

import type { ThreadSummary } from '../../chat-top-bar';

interface ThreadRowProps {
  thread: ThreadSummary;
  isActive: boolean;
  selectMode: boolean;
  isSelected: boolean;
  now: number;
  onPick: () => void;
  onToggleSelected: () => void;
}

export function ThreadRow({
  thread: t,
  isActive,
  selectMode,
  isSelected,
  now,
  onPick,
  onToggleSelected,
}: ThreadRowProps) {
  return (
    <button
      type="button"
      onClick={() => {
        if (selectMode) {
          onToggleSelected();
          return;
        }
        onPick();
      }}
      aria-checked={selectMode ? isSelected : undefined}
      role={selectMode ? 'checkbox' : undefined}
      className={cn(
        'focus-visible:ring-brand flex min-h-14 w-full items-center gap-3 rounded-sm px-3 py-3 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none',
        isActive && !selectMode
          ? 'bg-bg-elev-3 text-fg'
          : 'text-fg-muted hover:bg-bg-elev-2 hover:text-fg',
        isSelected && 'ring-border bg-bg-elev-2 text-fg ring-1',
      )}
    >
      {selectMode ? (
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex size-11 shrink-0 items-center justify-center rounded-sm border',
            isSelected ? 'bg-fg border-border text-black' : 'border-border/80 bg-bg-elev-1',
          )}
        >
          <span className="border-border/80 bg-bg-elev-1 inline-flex size-5 items-center justify-center rounded-sm border">
            {isSelected ? <IconCheck className="size-3" strokeWidth={3} /> : null}
          </span>
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{t.title ?? 'New conversation'}</span>
        <span className="text-fg-subtle text-body-sm mt-0.5 block tabular-nums">
          {formatRelative(t.updatedAt, now)}
        </span>
      </div>
      {t.pinnedSymbol ? (
        <span className="bg-bg-elev-3 text-fg ring-border text-caption shrink-0 rounded-sm px-2 py-0.5 font-bold tabular-nums ring-1">
          {t.pinnedSymbol}
        </span>
      ) : null}
    </button>
  );
}
