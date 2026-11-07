'use client';

// SPDX-License-Identifier: Apache-2.0

// Left rail of the landing desks section: four flush selector cells inside the
// shared instrument frame, with gliding active indicators and the auto-cycle
// countdown strip.
import { m } from 'motion/react';

import { cn } from '@/lib/formatters/cn';

import { CYCLE_DURATION_MS, DESKS } from './desks';

interface DeskTabsProps {
  selectedId: string;
  isPaused: boolean;
  onSelect: (id: string) => void;
}

export function DeskTabs({ selectedId, isPaused, onSelect }: DeskTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Specialist Desks"
      className="grid grid-cols-2 divide-x divide-y divide-white/[0.06] lg:col-span-5 lg:flex lg:flex-col lg:justify-between lg:divide-x-0"
    >
      {DESKS.map((desk) => {
        const isSelected = desk.id === selectedId;
        return (
          <button
            key={desk.id}
            id={`desk-tab-${desk.id}`}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-controls={`desk-panel-${desk.id}`}
            onClick={() => onSelect(desk.id)}
            className={cn(
              'group relative flex flex-1 flex-col justify-center overflow-hidden p-3.5 text-left transition-colors duration-200 active:translate-y-[0.5px] sm:p-4',
              isSelected ? 'bg-[#18191a]' : 'bg-[#121315] hover:bg-white/[0.03]',
            )}
          >
            {/* Active indicator: right rail on desktop, bottom rail on mobile */}
            {isSelected && (
              <>
                <m.div
                  layoutId="active-desk-tab-indicator-desktop"
                  className="bg-brand absolute inset-y-2.5 right-0 hidden w-[3px] rounded-full shadow-[0_0_10px_#ff3616] lg:block"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
                <div
                  aria-hidden="true"
                  className="absolute top-1/2 -right-1.5 z-20 hidden size-3 -translate-y-1/2 rotate-45 border-t border-r border-white/20 bg-[#18191a] lg:block"
                />
                <m.div
                  layoutId="active-desk-tab-indicator-mobile"
                  className="bg-brand absolute inset-x-3 bottom-0 h-[2px] rounded-full shadow-[0_0_8px_#ff3616] lg:hidden"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              </>
            )}

            {/* Tab Countdown Progress Strip */}
            {isSelected && !isPaused && (
              <div className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden bg-white/5">
                <div
                  key={desk.id}
                  className="bg-brand/80 landing-cycle-progress h-full origin-left transition-all"
                  style={{ animationDuration: `${CYCLE_DURATION_MS}ms` }}
                />
              </div>
            )}

            {/* Responsive Tab Content: compact stack on mobile, row on desktop */}
            <div className="flex w-full flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between lg:gap-3">
              <div className="flex min-w-0 items-center justify-between lg:justify-start lg:gap-3">
                <div
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors sm:size-9 lg:size-10',
                    isSelected
                      ? 'border-white/20 bg-black/60 shadow-inner'
                      : 'border-white/10 bg-black/40',
                  )}
                >
                  {desk.sprite}
                </div>
                {/* Mobile Conviction Pill */}
                <span
                  className={cn(
                    'shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold transition-colors lg:hidden',
                    isSelected
                      ? 'bg-brand/10 border-brand/30 text-brand'
                      : 'text-fg-subtle border-white/5 bg-white/5',
                  )}
                >
                  {desk.verdict.conviction}%
                </span>
              </div>

              <div className="min-w-0 text-left lg:flex-1">
                <h3 className="font-display text-fg truncate text-xs font-normal tracking-tight group-hover:text-white sm:text-sm lg:text-base">
                  {desk.name}
                </h3>
                <p className="text-fg-muted truncate font-sans text-[10px] sm:text-[11px] lg:text-xs">
                  {desk.role}
                </p>
              </div>

              {/* Desktop Conviction Pill */}
              <span
                className={cn(
                  'hidden shrink-0 rounded-full border px-2 py-0.5 font-mono text-[11px] font-bold transition-colors lg:inline-flex',
                  isSelected
                    ? 'bg-brand/10 border-brand/30 text-brand'
                    : 'text-fg-subtle border-white/5 bg-white/5',
                )}
              >
                {desk.verdict.conviction}%
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
