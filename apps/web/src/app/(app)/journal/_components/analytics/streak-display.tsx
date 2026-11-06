'use client';

// SPDX-License-Identifier: Apache-2.0

// Current and maximum win/loss streaks, using the shared KPI tile.
import type { JournalStatsWithNulls } from '@kestrel/shared';
import { IconFlame } from '@tabler/icons-react';

import { StatCard } from '@/components/ui/stat-card';
import { cn } from '@/lib/formatters/cn';

interface StreakDisplayProps {
  stats: JournalStatsWithNulls;
  className?: string;
}

export function StreakDisplay({ stats, className }: StreakDisplayProps) {
  const current = stats.currentStreak ?? { type: 'none', count: 0 };
  const maxWin = stats.maxWinStreak ?? 0;
  const maxLoss = stats.maxLossStreak ?? 0;
  const currentLabel = current.type === 'win' ? 'W' : current.type === 'loss' ? 'L' : '';
  const currentTone = current.type === 'win' ? 'bull' : current.type === 'loss' ? 'bear' : 'muted';

  return (
    <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-3', className)}>
      <StatCard
        icon={<IconFlame className="size-3.5" strokeWidth={2} />}
        label="Current streak"
        value={current.type === 'none' ? '0' : `${current.count}${currentLabel}`}
        tone={currentTone}
        hint={current.type === 'none' ? 'no active run' : `${current.type} run`}
      />
      <StatCard
        icon={<IconFlame className="size-3.5" strokeWidth={2} />}
        label="Best win streak"
        value={`${maxWin}W`}
        tone="bull"
        hint="consecutive"
        meter={{ value: maxWin, max: Math.max(maxWin, maxLoss, 1), tone: 'bull', showPct: false }}
      />
      <StatCard
        icon={<IconFlame className="size-3.5" strokeWidth={2} />}
        label="Worst loss streak"
        value={`${maxLoss}L`}
        tone="bear"
        hint="consecutive"
        meter={{ value: maxLoss, max: Math.max(maxWin, maxLoss, 1), tone: 'bear', showPct: false }}
      />
    </div>
  );
}
