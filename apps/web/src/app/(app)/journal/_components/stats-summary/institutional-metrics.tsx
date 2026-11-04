'use client';

// SPDX-License-Identifier: Apache-2.0

// Institutional metrics grid: profit factor, max R drawdown, and the best /
// worst single trade, using the shared KPI tile so the journal reads as one
// instrument panel.
import type { JournalEntry } from '@kestrel/shared';
import {
  IconAlertTriangle,
  IconAward,
  IconPercentage,
  IconTrendingDown,
} from '@tabler/icons-react';
import { useMemo } from 'react';

import { StatCard, type StatTone } from '@/components/ui/stat-card';

export function InstitutionalMetrics({ closedTrades }: { closedTrades: readonly JournalEntry[] }) {
  const metrics = useMemo(() => {
    const grossProfit = closedTrades
      .filter((entry) => (entry.rMultiple ?? 0) > 0)
      .reduce((sum, entry) => sum + (entry.rMultiple ?? 0), 0);
    const grossLoss = Math.abs(
      closedTrades
        .filter((entry) => (entry.rMultiple ?? 0) < 0)
        .reduce((sum, entry) => sum + (entry.rMultiple ?? 0), 0),
    );
    const profitFactor =
      grossLoss === 0 ? (grossProfit > 0 ? Number.POSITIVE_INFINITY : 1) : grossProfit / grossLoss;

    let peak = 0;
    let maxDrawdown = 0;
    let cumulative = 0;
    for (const entry of [...closedTrades].sort((a, b) => a.openedAt - b.openedAt)) {
      cumulative += entry.rMultiple ?? 0;
      peak = Math.max(peak, cumulative);
      maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
    }

    const values = closedTrades.map((entry) => entry.rMultiple ?? 0);
    const best = values.length > 0 ? Math.max(...values) : 0;
    const worst = values.length > 0 ? Math.min(...values) : 0;
    return { profitFactor, maxDrawdown, best, worst };
  }, [closedTrades]);

  const pfTone: StatTone =
    metrics.profitFactor >= 1.5 ? 'bull' : metrics.profitFactor >= 1 ? 'fg' : 'bear';
  const extremeMax = Math.max(Math.abs(metrics.best), Math.abs(metrics.worst), 1);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
      <StatCard
        icon={<IconPercentage className="size-3.5" strokeWidth={2} />}
        label="Profit factor"
        value={Number.isFinite(metrics.profitFactor) ? metrics.profitFactor.toFixed(2) : '∞'}
        tone={pfTone}
        hint="win/loss"
        meter={{
          value: Number.isFinite(metrics.profitFactor) ? Math.min(metrics.profitFactor, 3) : 3,
          max: 3,
          tone: pfTone,
        }}
      />
      <StatCard
        icon={<IconAlertTriangle className="size-3.5" strokeWidth={2} />}
        label="Max R DD"
        value={`-${metrics.maxDrawdown.toFixed(2)}R`}
        tone="bear"
        hint="peak-trough"
      />
      <StatCard
        icon={<IconAward className="size-3.5" strokeWidth={2} />}
        label="Best trade"
        value={`+${metrics.best.toFixed(2)}R`}
        tone="bull"
        hint="max win"
        meter={{ value: Math.abs(metrics.best), max: extremeMax, tone: 'bull' }}
      />
      <StatCard
        icon={<IconTrendingDown className="size-3.5" strokeWidth={2} />}
        label="Worst trade"
        value={`${metrics.worst.toFixed(2)}R`}
        tone="bear"
        hint="max loss"
        meter={{ value: Math.abs(metrics.worst), max: extremeMax, tone: 'bear' }}
      />
    </div>
  );
}
