// SPDX-License-Identifier: Apache-2.0

// Derived live metrics for a journal row: pip/cash/R values plus the
// stop-to-target slider position used by the visual bar.
import { getSymbolDefinition, pipSize, type JournalEntry } from '@kestrel/shared';
import { useMemo } from 'react';

export interface LiveEntryStats {
  pips: number;
  cashPnl: number;
  rMultiple: number;
}

export function useEntryMetrics(entry: JournalEntry, livePrice: number | undefined) {
  // Calculate Real-Time Live Profit / Loss Metrics
  const liveStats = useMemo(() => {
    if (entry.outcome !== 'open' || !livePrice) return null;

    const diff = entry.side === 'long' ? livePrice - entry.entry : entry.entry - livePrice;

    // Pip calculations: use symbol definition pipSize for correct multiplier
    const pipMultiplier = 1 / pipSize(entry.symbol);
    const pips = diff * pipMultiplier;

    // USD Cash calculations (size = lots)
    // Contract sizes: Gold = 100, Forex = 100000
    let cashPnl = 0;
    if (entry.size !== null) {
      const def = getSymbolDefinition(entry.symbol);
      const isCommodity = def?.currencies?.includes('XAU') ?? false;
      const contractSize = isCommodity ? 100 : 100000;
      cashPnl = entry.size * contractSize * diff;
    }

    // R-multiple calculations
    let rMultiple = 0;
    if (entry.stop !== null) {
      const risk = entry.side === 'long' ? entry.entry - entry.stop : entry.stop - entry.entry;
      rMultiple = risk > 0 ? diff / risk : 0;
    }

    return { pips, cashPnl, rMultiple };
  }, [entry, livePrice]);

  // Compute horizontal slider positioning for Stop Loss and IconTarget
  const sliderPosition = useMemo(() => {
    if (!livePrice || entry.stop === null || entry.target === null) return null;

    const stopPrice = entry.stop;
    const targetPrice = entry.target;

    let percentage: number;

    if (entry.side === 'long') {
      const range = targetPrice - stopPrice;
      percentage = range > 0 ? ((livePrice - stopPrice) / range) * 100 : 50;
    } else {
      // Short
      const range = stopPrice - targetPrice;
      percentage = range > 0 ? ((stopPrice - livePrice) / range) * 100 : 50;
    }

    // Allow beyond-range values for "beyond stop/target" states
    return Math.min(Math.max(percentage, -20), 120);
  }, [entry, livePrice]);

  const isWin = entry.outcome === 'win' || (liveStats && liveStats.rMultiple > 0);
  const isLoss = entry.outcome === 'loss' || (liveStats && liveStats.rMultiple < 0);

  const outcomeColor = isWin ? 'text-bull' : isLoss ? 'text-bear' : 'text-fg-muted';

  return { liveStats, sliderPosition, isWin, isLoss, outcomeColor };
}
