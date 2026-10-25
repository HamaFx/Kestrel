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

// Shared mapping helpers for the Backtesting Lab agent tools.

import type { BacktestStrategyRow } from '../db/tables';
import type { RunResult } from '../schemas';

export function strategySummary(row: BacktestStrategyRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    tags: row.tags,
    favorite: row.favorite,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function compactRunForModel(output: RunResult): Record<string, unknown> {
  const m = output.metrics;
  const sample = output.trades.slice(-10).map((trade) => ({
    side: trade.side,
    entryTime: trade.entryTime,
    exitTime: trade.exitTime,
    entryPrice: trade.entryPrice,
    exitPrice: trade.exitPrice,
    pnl: trade.pnl,
    rMultiple: trade.rMultiple,
    exitReason: trade.exitReason,
    reason: trade.reason,
  }));
  return {
    runId: output.runId,
    symbol: output.symbol,
    timeframe: output.timeframe,
    name: output.name,
    bars: output.bars,
    trades: m.trades,
    winRatePct: m.winRate,
    profitFactor: m.profitFactor,
    netPnl: m.netPnl,
    returnPct: m.returnPct,
    expectancyR: m.expectancyR,
    totalR: m.totalR,
    maxDrawdownPct: m.maxDrawdownPct,
    maxDrawdown: m.maxDrawdown,
    sharpeRatio: m.sharpeRatio,
    sortinoRatio: m.sortinoRatio,
    averageBarsHeld: m.averageBarsHeld,
    exposurePct: m.exposurePct,
    longTrades: m.longTrades,
    shortTrades: m.shortTrades,
    longWinRate: m.longWinRate,
    shortWinRate: m.shortWinRate,
    consecutiveWins: m.consecutiveWins,
    consecutiveLosses: m.consecutiveLosses,
    feesPaid: m.feesPaid,
    finalEquity: m.finalEquity,
    rejectedSignals: output.rejectedSignals.length,
    warnings: output.warnings,
    truncated: output.truncated,
    recentTrades: sample,
    note:
      m.trades < 20
        ? 'Fewer than 20 trades — treat these metrics as anecdotal, not statistically meaningful.'
        : 'Sharpe/Sortino are per-trade scores scaled by sqrt(trades), not annualised fund ratios.',
  };
}
