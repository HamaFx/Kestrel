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

// Execution state types for the deterministic bar-by-bar simulator.

import type { Candle } from '@kestrel/shared';

import type {
  BacktestOptions,
  BacktestTrade,
  EquityPoint,
  GeneratedSignal,
  RejectedSignal,
  TradeSide,
} from '../types';

interface OpenPosition {
  signal: GeneratedSignal;
  side: TradeSide;
  entryType: 'market' | 'limit';
  entryIndex: number;
  entryTime: number;
  entryPrice: number;
  rawEntryPrice: number;
  stop: number;
  target: number | null;
  quantity: number;
  riskAmount: number;
  initialRiskDistance: number;
  entryFee: number;
  breakEvenAtR: number | null;
  maxBars: number;
  trailingValue: number | null;
  trailingType: 'atr' | 'percent' | 'fixed' | null;
  mfeR: number;
  maeR: number;
  breakEvenApplied: boolean;
}

interface PendingEntry {
  signal: GeneratedSignal;
  expiresIndex: number;
  limitPrice: number;
}

export interface SimulateArgs {
  candles: readonly Candle[];
  signals: readonly GeneratedSignal[];
  options: BacktestOptions;
  /** ATR series used by `trailing: { type: 'atr' }`. */
  atr: readonly (number | null)[];
}

export interface SimulatorState {
  readonly candles: readonly Candle[];
  readonly options: BacktestOptions;
  /** ATR series used by `trailing: { type: 'atr' }`. */
  readonly atr: readonly (number | null)[];
  readonly trades: BacktestTrade[];
  readonly rejectedSignals: RejectedSignal[];
  readonly equityCurve: EquityPoint[];
  readonly warnings: string[];
  readonly halfSpread: number;
  readonly slippage: number;
  cash: number;
  peakEquity: number;
  barsWithPosition: number;
  position: OpenPosition | null;
  pending: PendingEntry | null;
  marketIntent: GeneratedSignal | null;
  nextTradeId: number;
}
