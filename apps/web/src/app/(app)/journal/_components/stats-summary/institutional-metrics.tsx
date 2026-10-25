'use client';

// SPDX-License-Identifier: Apache-2.0

// Institutional metrics grid: profit factor, max R drawdown, and the best /
// worst single trade, all derived from the closed trades.
import type { JournalEntry } from '@kestrel/shared';
import {
  IconAlertTriangle,
  IconAward,
  IconPercentage,
  IconTrendingDown,
} from '@tabler/icons-react';
import { useMemo } from 'react';

import { cn } from '@/lib/formatters/cn';

export function InstitutionalMetrics({ closedTrades }: { closedTrades: readonly JournalEntry[] }) {
  const grossProfit = useMemo(() => {
    return closedTrades.filter((e) => e.rMultiple! > 0).reduce((sum, e) => sum + e.rMultiple!, 0);
  }, [closedTrades]);

  const grossLoss = useMemo(() => {
    return Math.abs(
      closedTrades.filter((e) => e.rMultiple! < 0).reduce((sum, e) => sum + e.rMultiple!, 0),
    );
  }, [closedTrades]);

  const profitFactor = useMemo(() => {
    if (grossLoss === 0) return grossProfit > 0 ? Number.POSITIVE_INFINITY : 1.0;
    return grossProfit / grossLoss;
  }, [grossProfit, grossLoss]);

  const maxDrawdown = useMemo(() => {
    let peak = 0;
    let maxDD = 0;
    let currentSum = 0;

    // Process oldest to newest
    const sorted = [...closedTrades].sort((a, b) => a.openedAt - b.openedAt);
    sorted.forEach((e) => {
      currentSum += e.rMultiple ?? 0;
      if (currentSum > peak) {
        peak = currentSum;
      }
      const dd = peak - currentSum;
      if (dd > maxDD) {
        maxDD = dd;
      }
    });
    return maxDD;
  }, [closedTrades]);

  const extremes = useMemo(() => {
    const rValues = closedTrades.map((e) => e.rMultiple ?? 0);
    if (rValues.length === 0) return { best: 0, worst: 0 };
    return {
      best: Math.max(...rValues),
      worst: Math.min(...rValues),
    };
  }, [closedTrades]);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
      {/* Profit Factor */}
      <div className="border-border bg-bg-elev-1 group hover:border-border relative flex flex-col gap-1 overflow-hidden rounded-sm border p-3.5 transition-all">
        <div className="flex items-center justify-between">
          <span className="text-caption text-fg-subtle font-bold tracking-wider uppercase">
            Profit Factor
          </span>
          <IconPercentage className="text-fg/70 size-3.5" />
        </div>
        <p
          className={cn(
            'mt-1.5 text-lg font-bold tracking-tight tabular-nums',
            profitFactor >= 1.5 ? 'text-bull' : profitFactor >= 1.0 ? 'text-fg' : 'text-bear',
          )}
        >
          {Number.isFinite(profitFactor) ? profitFactor.toFixed(2) : '∞'}
        </p>
        <span className="text-fg-muted text-xs font-medium">Gross Wins vs. Gross Losses</span>
      </div>

      {/* Max Drawdown */}
      <div className="border-border bg-bg-elev-1 group hover:border-bear/40 relative flex flex-col gap-1 overflow-hidden rounded-sm border p-3.5 transition-all">
        <div className="flex items-center justify-between">
          <span className="text-caption text-fg-subtle font-bold tracking-wider uppercase">
            Max R DD
          </span>
          <IconAlertTriangle className="text-bear/70 size-3.5" />
        </div>
        <p className="text-bear mt-1.5 text-lg font-bold tracking-tight tabular-nums">
          -{maxDrawdown.toFixed(2)}R
        </p>
        <span className="text-fg-muted text-xs font-medium">Maximum peak-to-trough drop</span>
      </div>

      {/* Best Trade Win */}
      <div className="border-border bg-bg-elev-1 group hover:border-bull/40 relative flex flex-col gap-1 overflow-hidden rounded-sm border p-3.5 transition-all">
        <div className="flex items-center justify-between">
          <span className="text-caption text-fg-subtle font-bold tracking-wider uppercase">
            Best Trade
          </span>
          <IconAward className="text-bull/70 size-3.5" />
        </div>
        <p className="text-bull mt-1.5 text-lg font-bold tracking-tight tabular-nums">
          +{extremes.best.toFixed(2)}R
        </p>
        <span className="text-fg-muted text-xs font-medium">Single maximum R realized</span>
      </div>

      {/* Worst Trade Loss */}
      <div className="border-border bg-bg-elev-1 group hover:border-bear/30 relative flex flex-col gap-1 overflow-hidden rounded-sm border p-3.5 transition-all">
        <div className="flex items-center justify-between">
          <span className="text-caption text-fg-subtle font-bold tracking-wider uppercase">
            Worst Trade
          </span>
          <IconTrendingDown className="text-bear/70 size-3.5" />
        </div>
        <p className="text-bear/80 mt-1.5 text-lg font-bold tracking-tight tabular-nums">
          {extremes.worst.toFixed(2)}R
        </p>
        <span className="text-fg-muted text-xs font-medium">Single maximum R loss</span>
      </div>
    </div>
  );
}
