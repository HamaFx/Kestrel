'use client';

// SPDX-License-Identifier: Apache-2.0

// Compact top selector strip for the 4-Desk Bento Grid, allowing users to
// highlight any desk while keeping all four schematics visible at once.
import { m } from 'motion/react';

import { cn } from '@/lib/formatters/cn';

import { DESKS } from './desks';

interface DeskTabsProps {
  activeDesk: number;
  onSelectDesk: (index: number) => void;
}

export function DeskTabs({ activeDesk, onSelectDesk }: DeskTabsProps) {
  return (
    <div
      className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-[#141517]/90 p-2"
      role="tablist"
      aria-label="Highlight specialist desk"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {DESKS.map((desk, idx) => {
          const isSelected = activeDesk === idx;
          return (
            <button
              key={desk.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => onSelectDesk(idx)}
              className={cn(
                'relative flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-xs transition-colors duration-200',
                isSelected ? 'text-fg font-semibold' : 'text-fg-subtle hover:text-fg hover:bg-white/[0.04]',
              )}
            >
              {isSelected && (
                <m.div
                  layoutId="desk-bento-active-pill"
                  className="border-brand/40 bg-brand/15 absolute inset-0 rounded-lg border"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                />
              )}
              <span className={cn('relative z-10', isSelected ? 'text-brand' : 'text-fg-subtle')}>
                {desk.index}
              </span>
              <span className="relative z-10">{desk.code}</span>
            </button>
          );
        })}
      </div>

      <div className="text-fg-subtle hidden items-center gap-2 pr-2 font-mono text-[11px] sm:flex">
        <span className="bg-bull size-1.5 rounded-full" />
        <span>PARALLEL EXECUTION · 4/4 NUMERIC VERIFIER</span>
      </div>
    </div>
  );
}
