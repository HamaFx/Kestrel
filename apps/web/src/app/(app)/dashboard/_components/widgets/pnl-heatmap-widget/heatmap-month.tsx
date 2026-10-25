'use client';

// SPDX-License-Identifier: Apache-2.0

// One visible month of the P&L heatmap: weekday header plus the month's day
// grid, coloured by daily realized R.
import type { CSSProperties } from 'react';

import { cn } from '@/lib/formatters/cn';

import { localDayKey, type DayBucket, type HeatmapMonthData } from './heatmap-days';

const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Map totalR to a semantic background style (bull/bear + alpha).
 * Uses CSS custom properties with opacity for wide browser support. */
function heatCellStyle(totalR: number): CSSProperties {
  if (totalR === 0) return { backgroundColor: 'var(--color-bg-elev-2)' };
  const alpha = Math.max(0.15, Math.min(0.85, Math.abs(totalR) / 5));
  const colorVar = totalR > 0 ? 'var(--color-bull)' : 'var(--color-bear)';
  return { backgroundColor: colorVar, opacity: alpha };
}

export function HeatmapMonth({
  month,
  onSelectDay,
}: {
  month: HeatmapMonthData;
  onSelectDay: (day: DayBucket) => void;
}) {
  return (
    <div className="scrollbar-hide flex flex-col gap-1.5 overflow-x-auto sm:gap-2">
      <span className="text-fg text-sm font-semibold">{month.label}</span>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 gap-1 text-center sm:gap-1.5">
        {DOW_LABELS.map((d) => (
          <span key={d} className="text-fg-subtle text-xs font-semibold tracking-wider uppercase">
            {d}
          </span>
        ))}
      </div>

      {/* Calendar grid with fluid aspect-square cells */}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {month.weeks.flat().map((cell, idx) => {
          if (!cell) {
            return <div key={idx} aria-hidden="true" className="aspect-square w-full" />;
          }
          const sign = cell.totalR > 0 ? '+' : '';
          const isToday = cell.key === localDayKey(Date.now());
          return (
            <button
              key={cell.key}
              type="button"
              onClick={() => onSelectDay(cell)}
              title={`${cell.key}: ${sign}${cell.totalR.toFixed(1)}R (${cell.count} trades)${isToday ? ' · today' : ''}`}
              aria-label={`${cell.key}: ${sign}${cell.totalR.toFixed(1)}R, ${cell.count} trades${isToday ? ', today' : ''}`}
              className={cn(
                'flex aspect-square min-h-[28px] w-full touch-manipulation items-center justify-center rounded-md tabular-nums sm:min-h-[34px] md:min-h-[38px]',
                'font-mono text-xs font-medium',
                cell.totalR > 0 && 'text-bull font-bold',
                cell.totalR < 0 && 'text-bear font-bold',
                cell.totalR === 0 && 'text-fg-muted',
                'transition-transform active:scale-95',
                isToday && 'ring-brand ring-offset-bg-elev-1 ring-2 ring-offset-1',
              )}
              style={heatCellStyle(cell.totalR)}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
