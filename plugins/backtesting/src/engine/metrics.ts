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

// Backtest scorecard.
//
// Ratios are computed on per-trade returns and scaled by sqrt(trades) — this
// is a comparability score between runs, not an annualised fund Sharpe. The
// UI labels it "Trade Sharpe" for that reason.

import { round } from './simulator';
import type { BacktestMetrics, BacktestTrade, EquityPoint, TradeSide } from './types';

export interface ComputeMetricsArgs {
  trades: readonly BacktestTrade[];
  equityCurve: readonly EquityPoint[];
  initialBalance: number;
  finalEquity: number;
  bars: number;
  barsWithPosition: number;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function streak(trades: readonly BacktestTrade[], side: 'win' | 'loss'): number {
  let best = 0;
  let current = 0;
  for (const trade of trades) {
    const matches = side === 'win' ? trade.pnl > 0.0001 : trade.pnl < -0.0001;
    if (matches) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }
  return best;
}

function sideStats(
  trades: readonly BacktestTrade[],
  side: TradeSide,
): {
  count: number;
  winRate: number;
} {
  const subset = trades.filter((trade) => trade.side === side);
  if (subset.length === 0) return { count: 0, winRate: 0 };
  const wins = subset.filter((trade) => trade.pnl > 0.0001).length;
  return { count: subset.length, winRate: round((wins / subset.length) * 100, 2) };
}

function drawdownStats(equityCurve: readonly EquityPoint[]): {
  max: number;
  maxPct: number;
  bars: number;
} {
  let peak = equityCurve[0]?.equity ?? 0;
  let peakIndex = 0;
  let max = 0;
  let maxPct = 0;
  let bars = 0;

  for (let index = 0; index < equityCurve.length; index += 1) {
    const point = equityCurve[index]!;
    if (point.equity >= peak) {
      peak = point.equity;
      peakIndex = index;
      continue;
    }
    const drawdown = peak - point.equity;
    const pct = peak > 0 ? (drawdown / peak) * 100 : 0;
    if (drawdown > max) {
      max = drawdown;
      maxPct = pct;
      bars = index - peakIndex;
    }
  }

  return { max: round(max, 2), maxPct: round(maxPct, 3), bars };
}

export function computeMetrics(args: ComputeMetricsArgs): BacktestMetrics {
  const trades = args.trades;
  const winsList = trades.filter((trade) => trade.pnl > 0.0001);
  const lossesList = trades.filter((trade) => trade.pnl < -0.0001);
  const breakeven = trades.length - winsList.length - lossesList.length;

  const grossProfit = winsList.reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = Math.abs(lossesList.reduce((sum, trade) => sum + trade.pnl, 0));
  const netPnl = trades.reduce((sum, trade) => sum + trade.pnl, 0);
  const feesPaid = trades.reduce((sum, trade) => sum + trade.fees, 0);
  const totalR = trades.reduce((sum, trade) => sum + trade.rMultiple, 0);

  const winR = winsList.map((trade) => trade.rMultiple);
  const lossR = lossesList.map((trade) => trade.rMultiple);
  const bestTradeR = trades.length === 0 ? 0 : Math.max(...trades.map((trade) => trade.rMultiple));
  const worstTradeR = trades.length === 0 ? 0 : Math.min(...trades.map((trade) => trade.rMultiple));

  // Per-trade returns relative to the equity that produced each trade.
  const returns: number[] = [];
  let equityBefore = args.initialBalance;
  for (const trade of trades) {
    returns.push(equityBefore > 0 ? trade.pnl / equityBefore : 0);
    equityBefore += trade.pnl;
  }
  const avgReturn = mean(returns);
  const returnStd = standardDeviation(returns);
  const downside = returns.map((value) => Math.min(0, value));
  const downsideDev = Math.sqrt(mean(downside.map((value) => value ** 2)));
  const scale = Math.sqrt(Math.max(1, returns.length));
  const sharpe = returnStd > 0 ? (avgReturn / returnStd) * scale : 0;
  const sortino = downsideDev > 0 ? (avgReturn / downsideDev) * scale : 0;

  const drawdown = drawdownStats(args.equityCurve);
  const long = sideStats(trades, 'long');
  const short = sideStats(trades, 'short');
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

  return {
    trades: trades.length,
    wins: winsList.length,
    losses: lossesList.length,
    breakeven,
    winRate: trades.length === 0 ? 0 : round((winsList.length / trades.length) * 100, 2),
    profitFactor: round(profitFactor, 3),
    netPnl: round(netPnl, 2),
    returnPct:
      args.initialBalance > 0
        ? round(((args.finalEquity - args.initialBalance) / args.initialBalance) * 100, 2)
        : 0,
    grossProfit: round(grossProfit, 2),
    grossLoss: round(grossLoss, 2),
    feesPaid: round(feesPaid, 2),
    expectancy: trades.length === 0 ? 0 : round(netPnl / trades.length, 2),
    expectancyR: trades.length === 0 ? 0 : round(totalR / trades.length, 4),
    averageR: trades.length === 0 ? 0 : round(totalR / trades.length, 4),
    averageWinR: winR.length === 0 ? 0 : round(mean(winR), 4),
    averageLossR: lossR.length === 0 ? 0 : round(mean(lossR), 4),
    totalR: round(totalR, 4),
    largestWin: winsList.length === 0 ? 0 : round(Math.max(...winsList.map((t) => t.pnl)), 2),
    largestLoss: lossesList.length === 0 ? 0 : round(Math.min(...lossesList.map((t) => t.pnl)), 2),
    maxDrawdown: drawdown.max,
    maxDrawdownPct: drawdown.maxPct,
    maxDrawdownBars: drawdown.bars,
    sharpeRatio: round(sharpe, 3),
    sortinoRatio: round(sortino, 3),
    averageBarsHeld:
      trades.length === 0 ? 0 : round(mean(trades.map((trade) => trade.barsHeld)), 1),
    exposurePct: args.bars > 0 ? round((args.barsWithPosition / args.bars) * 100, 2) : 0,
    longTrades: long.count,
    shortTrades: short.count,
    longWinRate: long.winRate,
    shortWinRate: short.winRate,
    consecutiveWins: streak(trades, 'win'),
    consecutiveLosses: streak(trades, 'loss'),
    bestTradeR: round(bestTradeR, 4),
    worstTradeR: round(worstTradeR, 4),
    finalEquity: round(args.finalEquity, 2),
  };
}
