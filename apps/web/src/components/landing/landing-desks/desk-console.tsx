'use client';

// SPDX-License-Identifier: Apache-2.0

// Right console of the landing desks section: pairs a custom animated SVG
// motion graphic for each specialist with 3 scannable takeaway pills.
import { IconCheck } from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';

import { BlueprintPlate } from '@/components/brand/blueprint-plates';
import { cn } from '@/lib/formatters/cn';

import { DeskMotionScene } from './desk-motion-scene';
import type { DeskSpec } from './desks';

interface DeskConsoleProps {
  desk: DeskSpec;
}

export function DeskConsole({ desk }: DeskConsoleProps) {
  return (
    <AnimatePresence mode="wait">
      <m.div
        key={desk.id}
        id={`desk-panel-${desk.id}`}
        role="tabpanel"
        aria-labelledby={`desk-tab-${desk.id}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="relative flex h-full flex-col justify-between gap-4 overflow-hidden p-5 sm:p-7"
      >
        {/* Single ambient desk sculpture watermark anchored in the lower-right */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-0 bottom-0 z-0 size-[220px] opacity-16 mix-blend-screen sm:size-[260px] lg:opacity-20"
        >
          <BlueprintPlate id={desk.blueprintId} variant="watermark" className="h-full w-full" />
        </div>

        {/* Top Header */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3.5">
          <div>
            <span className="text-brand font-mono text-[10px] font-bold tracking-wider uppercase">
              {desk.badge}
            </span>
            <h3 className="font-display text-fg mt-0.5 text-xl font-normal tracking-tight sm:text-2xl">
              {desk.name}{' '}
              <span className="text-fg-muted font-sans text-sm font-normal">· {desk.role}</span>
            </h3>
          </div>

          <span
            className={cn(
              'rounded-full border px-3 py-1 font-mono text-xs font-bold',
              desk.borderColor,
              desk.color,
            )}
          >
            {desk.verdict.bias} · {desk.verdict.conviction}%
          </span>
        </div>

        {/* Custom Animated SVG Motion Graphic Stage */}
        <div className="surface-well relative z-10 overflow-hidden rounded-2xl border border-white/10 bg-[#08090b] p-3.5 sm:p-4">
          <DeskMotionScene deskId={desk.id} />
        </div>

        {/* 2-Column Scannable Highlights + Live Takeaway */}
        <div className="relative z-10 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {desk.features.slice(0, 4).map((feat, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-black/40 px-3 py-2.5"
            >
              <div className="bg-brand/15 border-brand/30 text-brand flex size-4 shrink-0 items-center justify-center rounded-full border">
                <IconCheck className="size-2.5" />
              </div>
              <span className="text-fg-muted font-sans text-xs leading-snug">{feat}</span>
            </div>
          ))}
        </div>
      </m.div>
    </AnimatePresence>
  );
}
