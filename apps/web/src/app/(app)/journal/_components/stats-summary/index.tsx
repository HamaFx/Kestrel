'use client';

/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Upgraded Stats Summary Dashboard with advanced risk analytics.
// Displays core metrics, a horizontal segmented trade distribution gauge,
// and institutional stats (Profit Factor, Max Drawdown, Expectancy, and Extreme trade boundaries).
import type { JournalEntry, JournalStats } from '@kestrel/shared';
import { IconBook } from '@tabler/icons-react';
import { useMemo } from 'react';

import { EmptyState } from '@/components/ui/empty-state';

import { CoreStatCards } from './core-stat-cards';
import { ExtendedStats } from './extended-stats';
import { InstitutionalMetrics } from './institutional-metrics';
import { OutcomeDistribution } from './outcome-distribution';
import { useStatSparks } from './use-stat-sparks';

interface StatsSummaryProps {
  stats: JournalStats;
  entries?: readonly JournalEntry[];
}

export function StatsSummary({ stats, entries = [] }: StatsSummaryProps) {
  const winRatePct = (stats.winRate * 100).toFixed(0);

  // Calculate historical closed trades
  const closedTrades = useMemo(() => {
    return entries.filter(
      (e) => e.rMultiple !== null && e.rMultiple !== undefined && e.outcome !== 'open',
    );
  }, [entries]);

  const sparks = useStatSparks(entries);

  if (entries.length === 0) {
    return (
      <div className="border-border bg-bg-elev-1 rounded-sm border p-6">
        <EmptyState
          tone="muted"
          icon={<IconBook className="size-7" strokeWidth={1.75} />}
          title="No journal entries yet"
          description="Start logging your trades to see statistics here."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Visual Outcome Distribution Bar */}
      {entries.length > 0 && <OutcomeDistribution entries={entries} />}

      {/* Grid of Stat Cards */}
      <CoreStatCards stats={stats} winRatePct={winRatePct} sparks={sparks} />

      {/* Advanced Institutional Metrics Grid */}
      <InstitutionalMetrics closedTrades={closedTrades} />

      {/* Phase B — UX_UPGRADE_PLAN.md item 13. Extended stats
          surface. Three new tiles + a per-day-of-week bar chart.
          All values are pre-computed by the server-side
          summarize() so we don't have to re-derive them here. */}
      <ExtendedStats stats={stats} />
    </div>
  );
}
