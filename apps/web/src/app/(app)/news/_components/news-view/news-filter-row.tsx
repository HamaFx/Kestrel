'use client';

// SPDX-License-Identifier: Apache-2.0

// Saved-only toggle + manual refresh row for the news view.
import { IconBookmark, IconRefresh } from '@tabler/icons-react';

import { cn } from '@/lib/formatters/cn';
import { formatRelative } from '@/lib/formatters/format';

export function NewsFilterRow({
  savedOnly,
  onToggleSaved,
  savedCount,
  pending,
  lastRefreshed,
  onRefresh,
}: {
  savedOnly: boolean;
  onToggleSaved: () => void;
  savedCount: number;
  pending: boolean;
  lastRefreshed: number;
  onRefresh: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={onToggleSaved}
        aria-pressed={savedOnly}
        disabled={savedCount === 0}
        className={cn(
          'focus-visible:ring-fg inline-flex min-h-11 items-center gap-1.5 rounded-sm border px-3 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40',
          savedOnly
            ? 'bg-fg border-border text-black'
            : 'border-border bg-bg-elev-1/60 text-fg-muted hover:text-fg',
        )}
      >
        <IconBookmark aria-hidden="true" className="size-3.5" />
        <span>Saved {savedCount > 0 ? `· ${savedCount}` : ''}</span>
      </button>

      <button
        type="button"
        onClick={onRefresh}
        disabled={pending}
        aria-label="Refresh now"
        className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 focus-visible:ring-fg inline-flex min-h-11 items-center gap-1.5 rounded-sm px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
      >
        <IconRefresh aria-hidden="true" className={cn('size-3.5', pending && 'animate-spin')} />
        {pending ? 'Refreshing…' : `Updated ${formatRelative(lastRefreshed)}`}
      </button>
    </div>
  );
}
