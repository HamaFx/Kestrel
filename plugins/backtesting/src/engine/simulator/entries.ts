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

// Entry handling: sizing/opening positions, resting limit entries, exit
// checks and trailing-stop updates.

import type { GeneratedSignal } from '../types';
import { closePosition, reject } from './accounting';
import { clamp, finite } from './math';
import type { SimulatorState } from './types';

export function openPosition(
  state: SimulatorState,
  signal: GeneratedSignal,
  index: number,
  rawEntry: number,
  entryType: 'market' | 'limit',
): void {
  const side = signal.side;
  const entryPrice =
    side === 'long'
      ? rawEntry + state.halfSpread + state.slippage
      : rawEntry - state.halfSpread - state.slippage;

  const stopDistance = side === 'long' ? entryPrice - signal.stop : signal.stop - entryPrice;
  if (!(stopDistance > 0) || !Number.isFinite(stopDistance)) {
    reject(state, signal, 'Stop loss is on the wrong side of the entry price');
    return;
  }
  if (stopDistance <= state.halfSpread + state.slippage) {
    reject(state, signal, 'Stop loss is inside the spread/slippage buffer');
    return;
  }
  if (signal.target !== undefined && signal.target !== null) {
    const targetDistance =
      side === 'long' ? signal.target - entryPrice : entryPrice - signal.target;
    if (!(targetDistance > 0)) {
      reject(state, signal, 'Take profit is on the wrong side of the entry price');
      return;
    }
  }

  const riskPct = clamp(finite(signal.riskPct, state.options.riskPct), 0.01, 10);
  const riskBudget = (state.cash * riskPct) / 100;
  if (!(riskBudget > 0)) {
    reject(state, signal, 'Account equity is too small to size a position');
    return;
  }

  let quantity = riskBudget / (stopDistance * state.options.contractSize);
  const maxQuantity =
    (state.cash * Math.max(1, state.options.leverage)) / (entryPrice * state.options.contractSize);
  quantity = Math.min(quantity, maxQuantity);
  if (!(quantity > 0) || !Number.isFinite(quantity)) {
    reject(state, signal, 'Risk sizing produced a zero position');
    return;
  }

  const riskAmount = stopDistance * quantity * state.options.contractSize;
  if (riskAmount < 0.5) {
    reject(state, signal, 'Position risk is below the minimum tradable size');
    return;
  }

  const trailing = signal.trailing;
  const maxBars = clamp(
    Math.round(finite(signal.maxBars, state.options.maxBarsInTrade)),
    1,
    Math.max(1, state.candles.length),
  );

  state.position = {
    signal,
    side,
    entryType,
    entryIndex: index,
    entryTime: state.candles[index]!.t,
    entryPrice,
    rawEntryPrice: rawEntry,
    stop: signal.stop,
    target: signal.target ?? null,
    quantity,
    riskAmount,
    initialRiskDistance: stopDistance,
    entryFee: state.options.commissionPerUnit * quantity,
    breakEvenAtR:
      signal.breakEvenAtR !== undefined && Number.isFinite(signal.breakEvenAtR)
        ? Math.max(0, signal.breakEvenAtR)
        : null,
    maxBars,
    trailingValue:
      trailing && Number.isFinite(trailing.value) && trailing.value > 0 ? trailing.value : null,
    trailingType:
      trailing && Number.isFinite(trailing.value) && trailing.value > 0 ? trailing.type : null,
    mfeR: 0,
    maeR: 0,
    breakEvenApplied: false,
  };
}

export function checkExit(state: SimulatorState, index: number): void {
  if (!state.position) return;
  const candle = state.candles[index]!;
  const current = state.position;

  // Track excursions for the report.
  const favourable =
    current.side === 'long' ? candle.h - current.entryPrice : current.entryPrice - candle.l;
  const adverse =
    current.side === 'long' ? current.entryPrice - candle.l : candle.h - current.entryPrice;
  if (current.initialRiskDistance > 0) {
    current.mfeR = Math.max(current.mfeR, favourable / current.initialRiskDistance);
    current.maeR = Math.max(current.maeR, adverse / current.initialRiskDistance);
  }

  const stopHit = current.side === 'long' ? candle.l <= current.stop : candle.h >= current.stop;
  const gapThroughStop =
    current.side === 'long' ? candle.o <= current.stop : candle.o >= current.stop;

  if (gapThroughStop) {
    closePosition(state, index, candle.o, 'stop_loss');
    return;
  }
  if (stopHit) {
    closePosition(state, index, current.stop, 'stop_loss');
    return;
  }

  if (current.target !== null) {
    const gapThroughTarget =
      current.side === 'long' ? candle.o >= current.target : candle.o <= current.target;
    if (gapThroughTarget) {
      closePosition(state, index, candle.o, 'take_profit');
      return;
    }
    const targetHit =
      current.side === 'long' ? candle.h >= current.target : candle.l <= current.target;
    if (targetHit) {
      closePosition(state, index, current.target, 'take_profit');
      return;
    }
  }

  if (index - current.entryIndex >= current.maxBars) {
    closePosition(state, index, candle.c, 'max_bars');
  }
}

export function updateTrailing(state: SimulatorState, index: number): void {
  if (!state.position) return;
  const candle = state.candles[index]!;
  const current = state.position;

  if (
    current.breakEvenAtR !== null &&
    !current.breakEvenApplied &&
    current.mfeR >= current.breakEvenAtR
  ) {
    current.stop =
      current.side === 'long'
        ? Math.max(current.stop, current.entryPrice)
        : Math.min(current.stop, current.entryPrice);
    current.breakEvenApplied = true;
  }

  if (current.trailingType !== null && current.trailingValue !== null) {
    let distance: number | null = null;
    if (current.trailingType === 'atr') {
      const atr = state.atr[index];
      if (typeof atr === 'number' && Number.isFinite(atr) && atr > 0) {
        distance = atr * current.trailingValue;
      }
    } else if (current.trailingType === 'percent') {
      distance = (candle.c * current.trailingValue) / 100;
    } else {
      distance = current.trailingValue;
    }

    if (distance !== null && distance > 0) {
      if (current.side === 'long') {
        const candidate = candle.c - distance;
        if (candidate > current.stop) current.stop = candidate;
      } else {
        const candidate = candle.c + distance;
        if (candidate < current.stop) current.stop = candidate;
      }
    }
  }
}

export function tryFillPending(state: SimulatorState, index: number): void {
  if (!state.pending || state.position) return;
  const candle = state.candles[index]!;
  const signal = state.pending.signal;

  if (index > state.pending.expiresIndex) {
    reject(state, signal, 'Limit entry expired before price reached it');
    state.pending = null;
    return;
  }

  const limit = state.pending.limitPrice;
  if (signal.side === 'long') {
    if (candle.o <= limit) {
      state.pending = null;
      openPosition(state, signal, index, candle.o, 'limit');
      return;
    }
    if (candle.l <= limit) {
      state.pending = null;
      openPosition(state, signal, index, limit, 'limit');
    }
    return;
  }

  if (candle.o >= limit) {
    state.pending = null;
    openPosition(state, signal, index, candle.o, 'limit');
    return;
  }
  if (candle.h >= limit) {
    state.pending = null;
    openPosition(state, signal, index, limit, 'limit');
  }
}
