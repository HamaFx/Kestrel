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

// Trade and equity accounting: rejection log, mark-to-market equity,
// drawdown tracking and position close-out.

import type { GeneratedSignal, TradeExitReason } from '../types';
import { round, signedPnl } from './math';
import type { SimulatorState } from './types';

export function reject(state: SimulatorState, signal: GeneratedSignal, reason: string): void {
  state.rejectedSignals.push({
    signalIndex: signal.signalIndex,
    signalTime: signal.signalTime,
    reason,
  });
}

export function markToMarket(state: SimulatorState, price: number): number {
  if (!state.position) return state.cash;
  const gross = signedPnl(
    state.position.side,
    state.position.entryPrice,
    price,
    state.position.quantity,
    state.options.contractSize,
  );
  return state.cash + gross - state.position.entryFee;
}

// Emit mark-to-market equity with the running drawdown, so the persisted
// curve is useful on its own (metrics recomputes the summary from it).
export function recordEquity(state: SimulatorState, index: number, price: number): void {
  const equity = markToMarket(state, price);
  if (equity > state.peakEquity) state.peakEquity = equity;
  const drawdown = state.peakEquity - equity;
  const drawdownPct = state.peakEquity > 0 ? (drawdown / state.peakEquity) * 100 : 0;
  state.equityCurve.push({
    t: state.candles[index]!.t,
    equity: round(equity, 2),
    drawdown: round(drawdown, 2),
    drawdownPct: round(drawdownPct, 3),
  });
}

export function closePosition(
  state: SimulatorState,
  index: number,
  rawExit: number,
  reason: TradeExitReason,
): void {
  if (!state.position) return;
  const current = state.position;
  const exitPrice =
    current.side === 'long'
      ? rawExit - state.halfSpread - state.slippage
      : rawExit + state.halfSpread + state.slippage;
  const exitFee = state.options.commissionPerUnit * current.quantity;
  const gross = signedPnl(
    current.side,
    current.entryPrice,
    exitPrice,
    current.quantity,
    state.options.contractSize,
  );
  const fees = current.entryFee + exitFee;
  const pnl = gross - fees;
  state.cash += pnl;

  const riskPerUnit = current.riskAmount;
  state.trades.push({
    id: state.nextTradeId++,
    side: current.side,
    entryType: current.entryType,
    entryTime: current.entryTime,
    exitTime: state.candles[index]!.t,
    entryPrice: round(current.entryPrice, 6),
    exitPrice: round(exitPrice, 6),
    stop: round(current.stop, 6),
    target: current.target === null ? null : round(current.target, 6),
    quantity: round(current.quantity, 6),
    riskAmount: round(riskPerUnit, 2),
    pnl: round(pnl, 2),
    fees: round(fees, 2),
    rMultiple: round(riskPerUnit > 0 ? pnl / riskPerUnit : 0, 4),
    barsHeld: index - current.entryIndex,
    exitReason: reason,
    mfe: round(current.mfeR, 4),
    mae: round(current.maeR, 4),
    ...(current.signal.reason ? { reason: current.signal.reason } : {}),
    ...(current.signal.tags?.length ? { tags: [...current.signal.tags] } : {}),
  });
  state.position = null;
}
