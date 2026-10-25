'use client';

// SPDX-License-Identifier: Apache-2.0

// Phase B extended stats: streak tiles, average hold time, and the weekday
// chart. Only rendered when the server computed the optional fields.
import type { JournalStats } from '@kestrel/shared';
import { IconCalendarEvent, IconClock, IconFlame } from '@tabler/icons-react';

import { DayOfWeekChart } from './day-of-week-chart';
import { formatHoldTime, hasExtendedStats } from './stats-format';

export function ExtendedStats({ stats }: { stats: JournalStats }) {
  if (!hasExtendedStats(stats)) return null;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="border-border bg-bg-elev-1 flex flex-col gap-1 rounded-sm border p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-caption text-fg-subtle font-bold tracking-wider uppercase">
              Win Streak
            </span>
            <IconFlame className="text-bull/70 size-3.5" />
          </div>
          <p className="text-bull mt-1.5 text-lg font-bold tracking-tight tabular-nums">
            {stats.longestWinStreak}
          </p>
          <span className="text-fg-muted text-xs font-medium">
            Longest consecutive wins (across breakevens)
          </span>
        </div>

        <div className="border-border bg-bg-elev-1 flex flex-col gap-1 rounded-sm border p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-caption text-fg-subtle font-bold tracking-wider uppercase">
              Loss Streak
            </span>
            <IconFlame className="text-bear/70 size-3.5" />
          </div>
          <p className="text-bear/80 mt-1.5 text-lg font-bold tracking-tight tabular-nums">
            {stats.longestLossStreak}
          </p>
          <span className="text-fg-muted text-xs font-medium">Longest consecutive losses</span>
        </div>

        <div className="border-border bg-bg-elev-1 flex flex-col gap-1 rounded-sm border p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-caption text-fg-subtle font-bold tracking-wider uppercase">
              Avg Hold
            </span>
            <IconClock className="text-info/70 size-3.5" />
          </div>
          <p className="text-fg mt-1.5 text-lg font-bold tracking-tight tabular-nums">
            {(stats.avgHoldMs ?? 0) > 0 ? formatHoldTime(stats.avgHoldMs!) : '—'}
          </p>
          <span className="text-fg-muted text-xs font-medium">Average trade duration (closed)</span>
        </div>
      </div>

      {stats.perDayOfWeek ? (
        <div className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-sm border p-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <IconCalendarEvent className="text-fg-muted size-3.5" />
              <span className="text-caption text-fg-subtle font-bold tracking-wider uppercase">
                Closed by day of week
              </span>
            </div>
            <span className="text-caption text-fg-subtle tabular-nums">
              {Object.values(stats.perDayOfWeek).reduce((a, b) => a + b, 0)} trades
            </span>
          </div>
          <DayOfWeekChart perDayOfWeek={stats.perDayOfWeek} />
        </div>
      ) : null}
    </>
  );
}
