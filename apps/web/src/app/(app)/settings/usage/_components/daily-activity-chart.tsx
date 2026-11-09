'use client';

// SPDX-License-Identifier: Apache-2.0

// Daily research activity bar chart for the last 7 days on the usage page,
// powered by `bklit-tanstack-charts` BarChart.
import type { DayBucket } from '@kestrel/ai';
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

export function DailyActivityChart({ daily7 }: { daily7: DayBucket[] }) {
  const gradId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const activeDays = daily7.filter((d) => d.turns > 0);

  const rows = useMemo(
    () =>
      daily7.map((d) => ({
        day: shortDate(d.date),
        Analyses: d.turns,
      })),
    [daily7],
  );

  if (activeDays.length === 0) {
    return null;
  }

  const totalTurns = daily7.reduce((sum, d) => sum + d.turns, 0);

  return (
    <section
      aria-labelledby="usage-daily-heading"
      className="surface-panel flex flex-col gap-4 rounded-xl border border-white/10 p-5 shadow-[var(--shadow-chip)]"
    >
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div>
          <h2 id="usage-daily-heading" className="text-fg text-sm font-semibold tracking-tight">
            Daily Research Activity (Last 7 Days)
          </h2>
          <p className="text-fg-subtle mt-0.5 font-mono text-[11px] tabular-nums">
            {totalTurns} total {totalTurns === 1 ? 'analysis' : 'analyses'} across{' '}
            {activeDays.length} active {activeDays.length === 1 ? 'day' : 'days'}
          </p>
        </div>
        <span className="surface-chip text-fg-subtle rounded-md px-2 py-0.5 font-mono text-[11px] font-medium uppercase">
          7-Day History
        </span>
      </div>

      <div className="surface-well relative h-44 overflow-hidden rounded-xl border border-white/[0.05]">
        <BarChart
          data={rows}
          xDataKey="day"
          barGap={0.34}
          aspectRatio="unset"
          style={{ height: '100%', aspectRatio: 'unset' }}
          margin={{ top: 16, right: 16, bottom: 28, left: 32 }}
          ariaLabel="Daily research activity over the last 7 days"
        >
          <LinearGradient
            id={`${gradId}-brand`}
            from="var(--chart-line-primary)"
            to="var(--chart-line-primary)"
            fromOpacity={0.95}
            toOpacity={0.3}
          />
          <Grid horizontal numTicksRows={3} />
          <BarColumnTrack />
          <Bar
            dataKey="Analyses"
            fill={`url(#${gradId}-brand)`}
            stroke="var(--chart-line-primary)"
            lineCap="round"
          />
          <BarXAxis showAllLabels />
          <BarYAxis numTicks={3} formatLargeNumbers={false} />
          <ChartTooltip />
        </BarChart>
      </div>
    </section>
  );
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
}
