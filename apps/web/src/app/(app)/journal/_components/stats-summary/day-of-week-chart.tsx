'use client';

// SPDX-License-Identifier: Apache-2.0

// Seven-bar weekday chart with true-aspect rounded caps, a recessed instrument
// well, and animated growth. The busiest day carries the full brand tone.
import type { JournalStatsWithNulls } from '@kestrel/shared';
import { m } from 'motion/react';

import { cn } from '@/lib/formatters/cn';

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const DOW_KEYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

export function DayOfWeekChart({
  perDayOfWeek,
}: {
  perDayOfWeek: NonNullable<JournalStatsWithNulls['perDayOfWeek']>;
}) {
  const counts = DOW_KEYS.map((key) => perDayOfWeek[key] ?? 0);
  const max = Math.max(1, ...counts);

  return (
    <div
      role="img"
      aria-label={`Closed trades by day of week: ${counts
        .map((count, index) => `${DOW_LABELS[index]} ${count}`)
        .join(', ')}`}
      className="surface-well flex flex-col gap-2 rounded-xl px-3 pt-3 pb-2.5"
    >
      <div className="grid h-24 grid-cols-7 items-end gap-2 border-b border-white/[0.06] pb-1.5">
        {counts.map((count, index) => {
          const pct = max > 0 ? (count / max) * 100 : 0;
          const isPeak = count > 0 && count === max;
          return (
            <div
              key={DOW_KEYS[index]}
              className="flex h-full flex-col items-center justify-end gap-1"
            >
              <span
                className={cn(
                  'font-mono text-[9px] leading-none tabular-nums',
                  isPeak ? 'text-brand font-semibold' : 'text-fg-subtle',
                )}
              >
                {count}
              </span>
              <div className="flex h-16 w-full items-end justify-center">
                <m.div
                  initial={{ height: 0 }}
                  animate={{ height: count > 0 ? `${Math.max(8, pct)}%` : '2px' }}
                  transition={{ duration: 0.45, delay: index * 0.035, ease: [0.32, 0.72, 0, 1] }}
                  className={cn(
                    'w-full max-w-[22px] rounded-t-[3px]',
                    count === 0
                      ? 'bg-white/[0.06]'
                      : isPeak
                        ? 'bg-gradient-to-b from-brand/90 to-brand/35 shadow-[0_0_10px_rgba(255,54,22,0.18)]'
                        : 'bg-gradient-to-b from-fg-subtle/55 to-fg-subtle/20',
                  )}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {DOW_LABELS.map((label, index) => {
          const count = counts[index] ?? 0;
          const isPeak = count > 0 && count === max;
          return (
            <span
              key={label}
              className={cn(
                'text-center font-mono text-[8px] tracking-wider uppercase',
                isPeak ? 'text-fg font-semibold' : 'text-fg-subtle',
              )}
            >
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
