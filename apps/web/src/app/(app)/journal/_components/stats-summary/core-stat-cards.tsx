'use client';

// SPDX-License-Identifier: Apache-2.0

// Headline stat cards with rolling sparklines: trades, win-rate, avg R, total R.
import type { JournalStatsWithNulls } from '@kestrel/shared';
import { IconActivity, IconCalculator, IconTarget, IconTrendingUp } from '@tabler/icons-react';

import { StatCard, type StatTone } from '@/components/ui/stat-card';

import type { StatSparks } from './use-stat-sparks';

export function CoreStatCards({
  stats,
  winRatePct,
  sparks,
}: {
  stats: JournalStatsWithNulls;
  /** Pre-formatted ("62%" or "—" when unmeasured). */
  winRatePct: string;
  sparks: StatSparks;
}) {
  // Null metrics were not measured, so they read as muted rather than "bad".
  const avgRTone: StatTone =
    stats.avgR == null
      ? 'muted'
      : stats.avgR > 0.05
        ? 'bull'
        : stats.avgR < -0.05
          ? 'bear'
          : 'muted';
  const winTone: StatTone =
    stats.winRate == null
      ? 'muted'
      : stats.winRate >= 0.5
        ? 'bull'
        : stats.winRate > 0
          ? 'muted'
          : 'bear';
  const totalTone: StatTone =
    stats.totalR == null
      ? 'muted'
      : stats.totalR > 0
        ? 'bull'
        : stats.totalR < 0
          ? 'bear'
          : 'muted';

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
        value={winRatePct}
        tone={winTone}
        sparkline={sparks.winRate}
        {...(stats.winRate !== null
          ? {
              meter: {
                value: stats.winRate * 100,
                max: 100,
                tone: winTone,
              },
            }
          : {})}
      />
      <StatCard
        icon={<IconTrendingUp className="size-3.5" strokeWidth={2} />}
        label="avg R"
        value={stats.avgR == null ? '—' : stats.avgR.toFixed(2)}
        tone={avgRTone}
        sparkline={sparks.avgR}
      />
      <StatCard
        icon={<IconCalculator className="size-3.5" strokeWidth={2} />}
        label="total R"
        value={stats.totalR == null ? '—' : stats.totalR.toFixed(2)}
        tone={totalTone}
        sparkline={sparks.cumR}
      />
    </dl>
  );
}
