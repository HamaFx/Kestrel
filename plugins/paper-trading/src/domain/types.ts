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

// Pure paper-broker domain — shared types.
//
// No database, no network, no clock: every function takes the state it needs
// and returns a decision. The services in `src/services/` persist those
// decisions. This split lets the money math be unit-tested exhaustively.

export const ACCOUNT_MODES = ['confirm', 'autonomous_sandbox'] as const;
export type AccountMode = (typeof ACCOUNT_MODES)[number];

export type PositionSide = 'long' | 'short';
export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop';
export type OrderStatus = 'pending' | 'filled' | 'cancelled' | 'rejected' | 'expired';
export type PositionStatus = 'open' | 'closed';
export type PositionCloseReason =
  'manual' | 'stop_loss' | 'take_profit' | 'trailing_stop' | 'account_reset';

export interface MarketTick {
  symbol: string;
  bid: number;
  ask: number;
  mid: number;
  ts: number;
  source?: string;
}

export interface Quotes {
  bid: number;
  ask: number;
  mid: number;
}

export interface PaperPositionState {
  side: PositionSide;
  symbol: string;
  quantity: number;
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  trailingStopDistance: number | null;
  trailingStopPrice: number | null;
  breakEvenAtR: number | null;
  initialRiskAmount: number;
  entryFee: number;
}

export interface PaperOrderState {
  side: OrderSide;
  type: OrderType;
  quantity: number;
  limitPrice: number | null;
  stopPrice: number | null;
}

export interface SizingArgs {
  equity: number;
  freeMargin: number;
  leverage: number;
  contractSize: number;
  entryPrice: number;
  stopLoss: number | null;
  riskPct: number | null;
  requestedQuantity: number | null;
  maxRiskPct: number;
  maxMarginUtilisationPct: number;
}

export type SizingResult =
  | { ok: true; quantity: number; riskAmount: number; notional: number; margin: number }
  | { ok: false; reason: string };

export interface PositionEvaluation {
  close: { price: number; reason: PositionCloseReason } | null;
  /** New trailing/breakeven stop, or null when it should not change. */
  trailingStopPrice: number | null;
  unrealizedPnl: number;
  rMultiple: number;
}

export interface OrderMatch {
  triggered: boolean;
  price: number | null;
}

export interface AccountLike {
  balance: number;
  equity: number;
  marginUsed: number;
  initialBalance: number;
}

export interface PositionForAccount {
  side: PositionSide;
  symbol: string;
  quantity: number;
  entryPrice: number;
  unrealizedPnl: number;
  status: PositionStatus;
}

export interface AccountSnapshot {
  balance: number;
  equity: number;
  unrealizedPnl: number;
  marginUsed: number;
  freeMargin: number;
  marginUtilisationPct: number;
}
