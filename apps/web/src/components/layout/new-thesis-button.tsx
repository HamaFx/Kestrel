'use client';

// SPDX-License-Identifier: Apache-2.0

// The one primary action in the shell: start a new research thread.
// Shared by the desktop rail and the mobile drawer so the treatment cannot
// drift between them. No shortcut badge — ⌘N is reserved by browsers for a new
// window, so advertising it was a promise the app could not keep.
import { IconPlus } from '@tabler/icons-react';
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
        'group border-brand/40 relative flex items-center rounded-lg border select-none',
        'from-brand/[0.16] to-brand/[0.04] bg-gradient-to-b',
        'hover:border-brand/70 hover:from-brand/[0.24] hover:shadow-[0_0_18px_rgba(255,54,22,0.18)]',
        'transition-all active:translate-y-[0.5px] active:scale-[0.99]',
        collapsed ? 'mx-auto size-10 justify-center' : 'min-h-9 gap-2.5 px-2.5 py-1.5',
      )}
    >
      <IconPlus className="text-brand size-4 shrink-0 transition-transform duration-200 group-hover:rotate-90" />
      {!collapsed ? (
        <span className="text-fg font-sans text-[12px] font-medium tracking-wide">New thesis</span>
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
