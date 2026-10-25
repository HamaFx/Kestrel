'use client';

// SPDX-License-Identifier: Apache-2.0

// Analytics tab: AI coach/review cards plus the breakdown and streak widgets.
import type { JournalEntry, JournalStats } from '@kestrel/shared';

import { AiCoachCard } from '../ai-coach-card';
import { AiReviewPanel } from '../ai-review-panel';
import { BreakdownTable } from '../analytics/breakdown-table';
import { DrawdownChart } from '../analytics/drawdown-chart';
import { RDistribution } from '../analytics/r-distribution';
import { StreakDisplay } from '../analytics/streak-display';

export function JournalAnalyticsTab({
  entries,
  stats,
}: {
  entries: JournalEntry[];
  stats: JournalStats;
}) {
  const latestClosed = entries.find((e) => e.outcome !== 'open');

  return (
    <div className="flex flex-col gap-4">
      <AiCoachCard stats={stats} />
      {latestClosed ? <AiReviewPanel entry={latestClosed} /> : null}
      <DrawdownChart entries={entries} stats={stats} />
      <RDistribution stats={stats} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <BreakdownTable
          title="By Symbol"
          data={(stats.bySymbol ?? []).map((s) => ({
            label: s.symbol,
            trades: s.trades,
            winRate: s.winRate,
            totalR: s.totalR,
            expectancy: s.expectancy,
          }))}
        />
        <BreakdownTable
          title="By Session"
          data={(stats.bySession ?? []).map((s) => ({
            label: s.session,
            trades: s.trades,
            winRate: s.winRate,
            totalR: s.totalR,
          }))}
        />
        <BreakdownTable
          title="By Day of Week"
          data={(stats.byDayOfWeek ?? []).map((s) => ({
            label: s.day,
            trades: s.trades,
            winRate: s.winRate,
            totalR: s.totalR,
          }))}
        />
        <BreakdownTable
          title="By Hour (UTC)"
          data={(stats.byHour ?? []).map((s) => ({
            label: `${s.hour.toString().padStart(2, '0')}:00`,
            trades: s.trades,
            winRate: s.winRate,
            totalR: s.totalR,
          }))}
        />
      </div>
      <BreakdownTable
        title="By Tag"
        data={(stats.byTag ?? []).map((s) => ({
          label: s.tag,
          trades: s.trades,
          winRate: s.winRate,
          totalR: s.totalR,
          expectancy: s.expectancy,
        }))}
        sortBy="totalR"
      />
      <StreakDisplay stats={stats} />
    </div>
  );
}
