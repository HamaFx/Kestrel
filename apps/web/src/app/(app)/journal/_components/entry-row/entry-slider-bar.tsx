'use client';

// SPDX-License-Identifier: Apache-2.0

// Real-time visual SL-to-TP wave ruler with live price positioning for open trades.
import type { JournalEntry } from '@kestrel/shared';

import { RangeMeter } from '@/components/ui/range-meter';
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

      <RangeMeter
        value={livePrice}
        min={entry.stop}
        max={entry.target}
        marker={entry.entry}
        markerLabel={`Entry: ${entry.entry}`}
        tone={isWin ? 'bull' : isLoss ? 'bear' : 'brand'}
        ariaLabel={`${entry.symbol} live position between stop ${entry.stop} and target ${entry.target}`}
      />

      <div className="text-fg-muted mt-0.5 flex items-center justify-between text-xs font-semibold">
        <span className={sliderPosition < 0 ? 'text-bear font-bold' : ''}>
          {sliderPosition < 0 ? '✦ Beyond stop' : 'Stop Loss boundary'}
        </span>
        <span className={cn('font-bold tabular-nums', outcomeColor)}>Live Price: {livePrice}</span>
        <span className={sliderPosition > 100 ? 'text-bull font-bold' : ''}>
          {sliderPosition > 100 ? '✦ Beyond target' : 'Target boundary'}
        </span>
      </div>
    </div>
  );
}
