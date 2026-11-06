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

// Serialised shapes for the backtesting plugin's JSONB payloads.
//
// These live in @kestrel/shared rather than the plugin package because
// @kestrel/db declares the `plg_backtesting_*` tables (so Drizzle Kit and the
// migration reconciler can see them) and must type their JSONB columns
// without importing a plugin. The engine keeps re-exporting them, so plugin
// consumers are unaffected.

import type { TradeSide } from '../schemas/journal';

export type EntryType = 'market' | 'limit';

export type TradeExitReason =
  | 'stop_loss'
  | 'take_profit'
  | 'trailing_stop'
  | 'max_bars'
  | 'end_of_data'
  | 'manual';

export interface BacktestTrade {
  id: number;
  side: TradeSide;
  entryType: EntryType;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  stop: number;
  target: number | null;
  /** Position size in lots (FX/gold) or coins (crypto). */
  quantity: number;
  riskAmount: number;
  pnl: number;
  fees: number;
  rMultiple: number;
  barsHeld: number;
  exitReason: TradeExitReason;
  mfe: number;
  mae: number;
  reason?: string;
  tags?: string[];
}

export interface RejectedSignal {
  signalIndex: number;
  signalTime: number;
  reason: string;
}

export interface EquityPoint {
  t: number;
  equity: number;
  drawdown: number;
  drawdownPct: number;
}

export interface BacktestMetrics {
  trades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  profitFactor: number;
  netPnl: number;
  returnPct: number;
  grossProfit: number;
  grossLoss: number;
  feesPaid: number;
  expectancy: number;
  expectancyR: number;
  averageR: number;
  averageWinR: number;
  averageLossR: number;
  totalR: number;
  largestWin: number;
  largestLoss: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  maxDrawdownBars: number;
  sharpeRatio: number;
  sortinoRatio: number;
  /** System Quality Number: trade-scaled t-stat (avg trade return / std) * sqrt(N). */
  sqn: number;
  averageBarsHeld: number;
  exposurePct: number;
  longTrades: number;
  shortTrades: number;
  longWinRate: number;
  shortWinRate: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  bestTradeR: number;
  worstTradeR: number;
  finalEquity: number;
}
