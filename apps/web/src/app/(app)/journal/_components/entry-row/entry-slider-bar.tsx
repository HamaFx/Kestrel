'use client';

// SPDX-License-Identifier: Apache-2.0

// Real-time visual SL-to-TP slider with live price positioning for open trades.
import type { JournalEntry } from '@kestrel/shared';

import { cn } from '@/lib/formatters/cn';

interface EntrySliderBarProps {
  entry: JournalEntry;
  livePrice: number | undefined;
  sliderPosition: number | null;
  isWin: boolean | null;
  isLoss: boolean | null;
  outcomeColor: string;
}

export function EntrySliderBar({
  entry,
  livePrice,
  sliderPosition,
  isWin,
  isLoss,
  outcomeColor,
}: EntrySliderBarProps) {
  if (
    entry.outcome !== 'open' ||
    entry.stop === null ||
    entry.target === null ||
    !livePrice ||
    sliderPosition === null
  ) {
    return null;
  }

  return (
    <div className="animate-in fade-in flex flex-col gap-1.5 border-t border-white/10 pt-3 duration-200">
      <div className="text-fg-subtle flex items-center justify-between text-xs font-bold tracking-wider uppercase">
        <span className="text-bear">SL: {entry.stop}</span>
        <span className="text-fg-muted">Entry: {entry.entry}</span>
        <span className="text-bull">Target: {entry.target}</span>
      </div>

      <div className="surface-well relative mt-1 flex h-2 w-full items-center overflow-visible rounded-full border border-white/10">
        {/* Entry Line Indicator */}
        <div
          style={{
            left:
              entry.side === 'long'
                ? `${((entry.entry - entry.stop) / (entry.target - entry.stop)) * 100}%`
                : `${((entry.stop - entry.entry) / (entry.stop - entry.target)) * 100}%`,
          }}
          className="bg-warn/80 absolute z-10 h-4 w-0.5"
          title="Entry Price Level"
        />

        {/* Glowing Live Dot */}
        <div
          style={{ left: `${sliderPosition}%` }}
          className={cn(
            'border-fg absolute z-20 size-3 -translate-x-1/2 rounded-full border shadow-md transition-all duration-300',
            isWin
              ? 'bg-bull animate-pulse shadow-md'
              : isLoss
                ? 'bg-bear shadow-md'
                : 'bg-fg-muted',
          )}
          title={`Live Price: ${livePrice}`}
        />

        {/* Profitable Region Shade */}
        {(() => {
          const entryPct =
            entry.side === 'long'
              ? ((entry.entry - entry.stop) / (entry.target - entry.stop)) * 100
              : ((entry.stop - entry.entry) / (entry.stop - entry.target)) * 100;
          const width =
            entry.side === 'long' ? sliderPosition - entryPct : entryPct - sliderPosition;
          const shadeLeft = entry.side === 'long' ? entryPct : sliderPosition;
          return (
            <div
              style={{
                left: `${Math.max(shadeLeft, 0)}%`,
                width: `${Math.abs(Math.max(width, 0))}%`,
              }}
              className="bg-bull/10 absolute h-full rounded-full"
            />
          );
        })()}
      </div>
      <div className="text-fg-muted mt-0.5 flex items-center justify-between text-xs font-semibold">
        <span className={sliderPosition < 0 ? 'text-bear font-bold' : ''}>
          {sliderPosition < 0 ? '✦ Beyond stop' : 'Stop Loss boundary'}
        </span>
        <span className={cn('font-bold', outcomeColor)}>Live Price: {livePrice}</span>
        <span className={sliderPosition > 100 ? 'text-bull font-bold' : ''}>
          {sliderPosition > 100 ? '✦ Beyond target' : 'Target boundary'}
        </span>
      </div>
    </div>
  );
}
