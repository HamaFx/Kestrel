'use client';

// SPDX-License-Identifier: Apache-2.0

// Seven-bar weekday chart built on `bklit-tanstack-charts` BarChart with
// column tracks, rounded gradient caps, and hover tooltips.
import type { JournalStatsWithNulls } from '@kestrel/shared';
import {
  Bar,
  BarChart,
  BarColumnTrack,
  BarXAxis,
  BarYAxis,
  ChartTooltip,
  Grid,
  LinearGradient,
} from 'bklit-tanstack-charts';
import { useId, useMemo } from 'react';

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
  const gradId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const rows = useMemo(
    () =>
      DOW_KEYS.map((key, index) => ({
        day: DOW_LABELS[index]!,
        Trades: perDayOfWeek[key] ?? 0,
      })),
    [perDayOfWeek],
  );

  const ariaSummary = rows.map((row) => `${row.day} ${row.Trades}`).join(', ');

  return (
    <div className="surface-well relative h-36 overflow-hidden rounded-xl border border-white/[0.05]">
      <BarChart
        data={rows}
        xDataKey="day"
        barGap={0.32}
        aspectRatio="unset"
        style={{ height: '100%', aspectRatio: 'unset' }}
        margin={{ top: 14, right: 12, bottom: 26, left: 28 }}
        ariaLabel={`Closed trades by day of week: ${ariaSummary}`}
      >
        <LinearGradient
          id={`${gradId}-brand`}
          from="var(--chart-line-primary)"
          to="var(--chart-line-primary)"
          fromOpacity={0.95}
          toOpacity={0.32}
        />
        <Grid horizontal numTicksRows={3} />
        <BarColumnTrack />
        <Bar
          dataKey="Trades"
          fill={`url(#${gradId}-brand)`}
          stroke="var(--chart-line-primary)"
          lineCap="round"
        />
        <BarXAxis showAllLabels />
        <BarYAxis numTicks={3} formatLargeNumbers={false} />
        <ChartTooltip />
      </BarChart>
    </div>
  );
}
