'use client';

// SPDX-License-Identifier: Apache-2.0

// Phase B extended stats: streak tiles, average hold time, and the weekday
// chart. Only rendered when the server measured something to show.
import type { JournalStatsWithNulls } from '@kestrel/shared';
import { IconCalendarEvent, IconClock, IconFlame } from '@tabler/icons-react';

import { StatCard } from '@/components/ui/stat-card';

import { DayOfWeekChart } from './day-of-week-chart';
import { formatHoldTime, hasExtendedStats } from './stats-format';

export function ExtendedStats({ stats }: { stats: JournalStatsWithNulls }) {
  if (!hasExtendedStats(stats)) return null;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<IconFlame className="size-3.5" strokeWidth={2} />}
          label="Win streak"
          value={`${stats.longestWinStreak ?? 0}W`}
          tone="bull"
          hint="best run"
        />
        <StatCard
          icon={<IconFlame className="size-3.5" strokeWidth={2} />}
          label="Loss streak"
          value={`${stats.longestLossStreak ?? 0}L`}
          tone="bear"
          hint="worst run"
        />
        <StatCard
          icon={<IconClock className="size-3.5" strokeWidth={2} />}
          label="Avg hold"
          value={stats.avgHoldMs == null ? '—' : formatHoldTime(stats.avgHoldMs)}
          tone="fg"
          hint="duration"
        />
      </div>

      {stats.perDayOfWeek ? (
        <div className="surface-card flex flex-col gap-3 rounded-xl border border-white/[0.06] p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <IconCalendarEvent className="text-fg-subtle size-3.5" />
              <span className="text-fg-subtle font-mono text-[10px] font-semibold tracking-wider uppercase">
                Closed by day of week
              </span>
            </div>
            <span className="text-fg-subtle font-mono text-[10px] tabular-nums">
              {Object.values(stats.perDayOfWeek).reduce((a, b) => a + b, 0)} trades
            </span>
          </div>
          <DayOfWeekChart perDayOfWeek={stats.perDayOfWeek} />
        </div>
      ) : null}
    </>
  );
}
