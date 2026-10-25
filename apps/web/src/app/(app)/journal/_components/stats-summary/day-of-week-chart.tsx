'use client';

// SPDX-License-Identifier: Apache-2.0

// 7-bar monochrome weekday chart used by the extended stats section.
import type { JournalStats } from '@kestrel/shared';

/**
 * 7-bar monochrome bar chart. Height proportional to the max
 * weekday so the busiest day fills the row. Each bar is labelled
 * with the 3-letter day abbreviation and the count.
 */
const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
type DowKey = keyof JournalStats['perDayOfWeek'] extends never
  ? 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday'
  : NonNullable<JournalStats['perDayOfWeek']> extends Record<infer K, number>
    ? K & string
    : string;
const DOW_KEYS: DowKey[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

export function DayOfWeekChart({
  perDayOfWeek,
}: {
  perDayOfWeek: NonNullable<JournalStats['perDayOfWeek']>;
}) {
  const counts = DOW_KEYS.map((k) => perDayOfWeek[k] ?? 0);
  const max = Math.max(1, ...counts); // avoid div-by-zero
  return (
    <div className="flex h-16 items-end gap-2">
      {counts.map((n, i) => {
        const heightPct = (n / max) * 100;
        return (
          <div key={DOW_KEYS[i]} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-fg-subtle text-xs tabular-nums">{n}</span>
            <div className="bg-bg-elev-2 flex h-full w-full items-end overflow-hidden rounded-sm">
              <div
                className="bg-fg w-full"
                style={{ height: `${heightPct}%`, minHeight: n > 0 ? '4px' : '0' }}
                aria-label={`${DOW_LABELS[i]}: ${n}`}
              />
            </div>
            <span className="text-fg-muted text-xs tracking-wider uppercase">{DOW_LABELS[i]}</span>
          </div>
        );
      })}
    </div>
  );
}
