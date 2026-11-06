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

// Shared types for the deterministic backtesting engine.
//
// The engine is intentionally framework-free: candles in, trades/metrics out.
// It never reads the clock, so the exact same input always produces the exact
// same result (important for regression tests and agent iteration).

import type {
  BacktestMetrics,
  BacktestTrade,
  EquityPoint,
  RejectedSignal,
  Symbol,
  Timeframe,
  TradeSide,
} from '@kestrel/shared';

// Serialised payload shapes live in @kestrel/shared so @kestrel/db can type
// the `plg_backtesting_*` JSONB columns without importing this package.
// Re-exported here to keep the engine's public surface unchanged.
export type {
  BacktestMetrics,
  BacktestTrade,
  EntryType,
  EquityPoint,
  RejectedSignal,
  TradeExitReason,
  TradeSide,
} from '@kestrel/shared';

/** Trailing-stop modes available to an agent-authored strategy. */
export type TrailingMode = 'atr' | 'percent' | 'fixed';

export interface StrategyTrailing {
  type: TrailingMode;
  /** ATR multiple, percent of entry price (1 = 1%), or fixed price distance. */
  value: number;
}

/**
 * The signal contract returned by a sandboxed `getSignal(ctx)`.
 *
 * A signal describes *intent*, never execution: the engine decides when and
 * at what price it can be filled. `t` is assigned by the engine from the bar
 * that produced the signal, so a strategy cannot backdate or forward-date it.
 */
export interface StrategySignal {
  side: TradeSide;
  /** `market` fills at the next bar open; a number places a limit order. */
  entry?: number | 'market';
  stop: number;
  target?: number;
  /** Risk per trade as % of current equity. Defaults to the run option. */
  riskPct?: number;
  /** Hard exit after N bars in the trade. */
  maxBars?: number;
  /** How long a resting limit entry stays valid. Default 5 bars. */
  validBars?: number;
  trailing?: StrategyTrailing;
  /** Move the stop to entry once the trade reaches this many R. */
  breakEvenAtR?: number;
  /**
   * When an opposing position is open: close it at the next bar open and
   * reverse into this signal. Without `flip`, an open position rejects it.
   */
  flip?: boolean;
  /** Close an open position on the same side at the next bar open (manual exit). */
  exit?: boolean;
  reason?: string;
  tags?: string[];
}

/** A normalised signal with the engine-owned bar binding. */
export interface GeneratedSignal extends StrategySignal {
  /** Index of the bar whose close produced the signal. */
  signalIndex: number;
  signalTime: number;
}

export interface BacktestOptions {
  symbol: Symbol;
  timeframe: Timeframe;
  initialBalance: number;
  /** Default risk per trade, % of equity. */
  riskPct: number;
  /** Full bid/ask spread in price units (half applied per side). */
  spread: number;
  /** Adverse slippage per fill, in price units. */
  slippage: number;
  /** Commission per contract/coin unit, charged per side. */
  commissionPerUnit: number;
  /** Maximum notional exposure as a multiple of equity. */
  leverage: number;
  /** Units per lot: FX 100k, gold 100oz, crypto 1. */
  contractSize: number;
  allowShort: boolean;
  /** Default maximum bars in a trade when a signal omits `maxBars`. */
  maxBarsInTrade: number;
}

export interface BacktestResult {
  symbol: Symbol;
  timeframe: Timeframe;
  bars: number;
  from: number;
  to: number;
  initialBalance: number;
  finalEquity: number;
  metrics: BacktestMetrics;
  trades: BacktestTrade[];
  equityCurve: EquityPoint[];
  rejectedSignals: RejectedSignal[];
  warnings: string[];
  /** True when persisted arrays were capped for transport. */
  truncated: boolean;
}

export interface StrategySandboxResult {
  signals: GeneratedSignal[];
  logs: string[];
  bars: number;
}

export interface SandboxLimits {
  maxSignals: number;
  maxLogs: number;
  timeoutMs: number;
  memoryBytes: number;
  stackBytes: number;
}
