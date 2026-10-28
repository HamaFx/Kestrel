'use client';

// SPDX-License-Identifier: Apache-2.0

// The one primary action in the shell: start a new research thread.
// Shared by the desktop rail and the mobile drawer so the treatment cannot
// drift between them. No shortcut badge — ⌘N is reserved by browsers for a new
// window, so advertising it was a promise the app could not keep.
import { IconArrowUpRight, IconPlus } from '@tabler/icons-react';
import { Link } from 'next-view-transitions';

import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/formatters/cn';

export function NewThesisButton({ collapsed = false }: { collapsed?: boolean }) {
  const button = (
    <Link
      href="/chat?new=1"
      prefetch={true}
      aria-label="New thesis"
      className={cn(
        'group tactile-press border-brand/45 relative flex items-center overflow-hidden rounded-lg border select-none',
        'from-brand/[0.18] via-brand/[0.08] to-brand/[0.03] bg-gradient-to-b',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_2px_10px_rgba(0,0,0,0.4)]',
        'hover:border-brand/75 hover:from-brand/[0.26] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_0_20px_rgba(255,54,22,0.22)]',
        collapsed
          ? 'mx-auto size-10 justify-center'
          : 'min-h-10 justify-between gap-2.5 px-2.5 py-1.5',
      )}
    >
      <span className="flex items-center gap-2.5">
        <span className="bg-brand/20 border-brand/40 text-brand inline-flex size-6 shrink-0 items-center justify-center rounded-md border shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] transition-transform duration-200 group-hover:rotate-90">
          <IconPlus className="size-3.5" strokeWidth={2.25} aria-hidden="true" />
        </span>
        {!collapsed ? (
          <span className="text-fg font-sans text-[12.5px] font-medium tracking-tight">
            New thesis
          </span>
        ) : null}
      </span>

      {!collapsed ? (
        <IconArrowUpRight
          className="text-brand/70 group-hover:text-brand size-3.5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          strokeWidth={1.75}
          aria-hidden="true"
        />
      ) : null}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip label="New thesis" side="right" className="w-full justify-center">
        {button}
      </Tooltip>
    );
  }

  return button;
}
