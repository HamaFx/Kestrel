'use client';

// SPDX-License-Identifier: Apache-2.0

// Headline stat cards with rolling sparklines: trades, win-rate, avg R, total R.
import type { JournalStats } from '@kestrel/shared';
import { IconActivity, IconCalculator, IconTarget, IconTrendingUp } from '@tabler/icons-react';

import { StatCard, type StatTone } from '@/components/ui/stat-card';

import type { StatSparks } from './use-stat-sparks';

export function CoreStatCards({
  stats,
  winRatePct,
  sparks,
}: {
  stats: JournalStats;
  winRatePct: string;
  sparks: StatSparks;
}) {
  const avgRTone: StatTone = stats.avgR > 0.05 ? 'bull' : stats.avgR < -0.05 ? 'bear' : 'muted';
  const winTone: StatTone = stats.winRate >= 0.5 ? 'bull' : stats.winRate > 0 ? 'muted' : 'bear';
  const totalTone: StatTone = stats.totalR > 0 ? 'bull' : stats.totalR < 0 ? 'bear' : 'muted';

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
      <StatCard
        icon={<IconActivity className="size-3.5" strokeWidth={2} />}
        label="trades"
        value={stats.count}
        sparkline={sparks.trades}
      />
      <StatCard
        icon={<IconTarget className="size-3.5" strokeWidth={2} />}
        label="win-rate"
        value={`${winRatePct}%`}
        tone={winTone}
        sparkline={sparks.winRate}
      />
      <StatCard
        icon={<IconTrendingUp className="size-3.5" strokeWidth={2} />}
        label="avg R"
        value={stats.avgR.toFixed(2)}
        tone={avgRTone}
        sparkline={sparks.avgR}
      />
      <StatCard
        icon={<IconCalculator className="size-3.5" strokeWidth={2} />}
        label="total R"
        value={stats.totalR.toFixed(2)}
        tone={totalTone}
        sparkline={sparks.cumR}
      />
    </dl>
  );
}
