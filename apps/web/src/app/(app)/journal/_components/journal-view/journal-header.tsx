'use client';

// SPDX-License-Identifier: Apache-2.0

// Sticky journal header: title, import/refresh actions, and the log-trade CTA.
import { IconBook, IconPlus, IconRefresh, IconUpload } from '@tabler/icons-react';

import { StaleIndicator } from '@/components/ui/stale-indicator';
import { cn } from '@/lib/formatters/cn';

interface JournalHeaderProps {
  isFetching: boolean;
  isLoading: boolean;
  onRefresh: () => void;
  onImport: () => void;
  onLogTrade: () => void;
}

export function JournalHeader({
  isFetching,
  isLoading,
  onRefresh,
  onImport,
  onLogTrade,
}: JournalHeaderProps) {
  return (
    <header className="border-border bg-bg-elev-1 flex flex-wrap items-center justify-between gap-4 rounded-sm border p-4">
      <div className="flex items-center gap-3">
        <div className="bg-bg-elev-2 text-fg rounded-sm p-3">
          <IconBook className="size-5" />
        </div>
        <div>
          <h2 className="text-fg text-lg font-black tracking-tight">Trading Journal</h2>
          <p className="text-body-sm text-fg-subtle mt-0.5">
            Track, analyze, and optimize your trading performance
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <StaleIndicator isFetching={isFetching && !isLoading} />

        <button
          onClick={onImport}
          aria-label="Import trades"
          className="bg-bg-elev-1 border-border text-fg-muted hover:text-fg focus-visible:ring-brand flex size-10 cursor-pointer items-center justify-center rounded-sm border transition-all focus-visible:ring-2 focus-visible:outline-none"
        >
          <IconUpload aria-hidden="true" className="size-4" />
        </button>

        <button
          onClick={onRefresh}
          aria-label="Refresh logs"
          className="bg-bg-elev-1 border-border text-fg-muted hover:text-fg focus-visible:ring-brand flex size-10 cursor-pointer items-center justify-center rounded-sm border transition-all focus-visible:ring-2 focus-visible:outline-none"
        >
          <IconRefresh aria-hidden="true" className={cn('size-4', isFetching && 'animate-spin')} />
        </button>

        <button
          onClick={onLogTrade}
          className="bg-fg inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-sm px-4 text-xs font-bold text-black shadow-sm transition-all hover:opacity-90"
        >
          <IconPlus className="size-4" />
          <span>Log Trade</span>
        </button>
      </div>
    </header>
  );
}
