'use client';

// SPDX-License-Identifier: Apache-2.0

// Seven-bar weekday chart with rounded caps, a shared baseline and animated
// growth. The busiest day carries the full brand tone.
import type { JournalStatsWithNulls } from '@kestrel/shared';
import { m } from 'motion/react';
import { useId } from 'react';

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

const Y_TOP = 10;
const Y_BOTTOM = 82;

export function DayOfWeekChart({
  perDayOfWeek,
}: {
  perDayOfWeek: NonNullable<JournalStatsWithNulls['perDayOfWeek']>;
}) {
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const counts = DOW_KEYS.map((key) => perDayOfWeek[key] ?? 0);
  const max = Math.max(1, ...counts);
  const slot = 100 / counts.length;
  const yFor = (count: number) => Y_BOTTOM - (count / max) * (Y_BOTTOM - Y_TOP);

  return (
    <div className="relative h-28">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label={`Closed trades by day of week: ${counts
          .map((count, index) => `${DOW_LABELS[index]} ${count}`)
          .join(', ')}`}
      >
        <defs>
          <linearGradient id={`${rawId}-day`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-line-primary)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="var(--chart-line-primary)" stopOpacity="0.35" />
          </linearGradient>
          <linearGradient id={`${rawId}-day-muted`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-fg-subtle)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--color-fg-subtle)" stopOpacity="0.15" />
          </linearGradient>
        </defs>

        <line
          x1="0"
          x2="100"
          y1={Y_BOTTOM}
          y2={Y_BOTTOM}
          stroke="var(--chart-grid)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />

        {counts.map((count, index) => {
          const top = yFor(count);
          const height = Math.max(Y_BOTTOM - top, count > 0 ? 1 : 0);
          const width = slot * 0.52;
          return (
            <m.rect
              key={DOW_KEYS[index]}
              x={index * slot + slot / 2 - width / 2}
              y={top}
              width={width}
              height={height}
              rx={0.8}
              fill={count === max ? `url(#${rawId}-day)` : `url(#${rawId}-day-muted)`}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.45, delay: index * 0.035, ease: [0.32, 0.72, 0, 1] }}
              style={{ transformBox: 'fill-box', transformOrigin: 'bottom' }}
            />
          );
        })}
      </svg>

      <div className="pointer-events-none absolute inset-0">
        {counts.map((count, index) => (
          <span
            key={`count-${DOW_KEYS[index]}`}
            className="text-fg-subtle absolute -translate-x-1/2 -translate-y-full pb-0.5 font-mono text-[9px] tabular-nums"
            style={{ left: `${index * slot + slot / 2}%`, top: `${yFor(count)}%` }}
          >
            {count}
          </span>
        ))}
      </div>

      <div className="absolute inset-x-0 bottom-0 flex">
        {DOW_LABELS.map((label) => (
          <span
            key={label}
            className="text-fg-subtle flex-1 text-center font-mono text-[8px] tracking-wider uppercase"
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
