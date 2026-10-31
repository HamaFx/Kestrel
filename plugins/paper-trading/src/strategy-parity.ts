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

// Backtest-to-paper signal translation helpers.
//
// The deployed-strategy runner and the Backtesting Lab must interpret a
// `getSignal(ctx)` result identically. These pure helpers mirror the
// backtester's defaults (`maxBarsInTrade: 100`, `validBars: 5`), translate the
// three `signal.trailing` modes into a price distance, and tag orders and
// positions with the run id plus the effective `maxBars` time-stop.

import type { StrategySignal } from '@kestrel/plugin-backtesting/engine';

import type { PaperPositionRow, PaperStrategyRunRow } from './db/tables';

/** Matches the backtester's `maxBarsInTrade` default (engine/run.ts). */
export const DEFAULT_MAX_BARS_IN_TRADE = 100;
/** Matches the backtester's `validBars` default (simulator/loop.ts). */
export const DEFAULT_VALID_BARS = 5;
const MAX_VALID_BARS = 500;
const MAX_BARS_NOTE_RE = /\[maxBars:(\d+)\]/;

/** Clamp a signal's `maxBars` the way `openPosition` does. */
export function resolveMaxBars(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_MAX_BARS_IN_TRADE;
  return Math.max(1, Math.round(value));
}

/** Clamp a signal's `validBars` the way `tryFillPending` does. */
export function resolveValidBars(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_VALID_BARS;
  return Math.min(MAX_VALID_BARS, Math.max(1, Math.round(value)));
}

/** The effective time-stop recorded on a position, defaulting to 100 bars. */
export function maxBarsFromNotes(notes: string | null): number {
  const match = notes ? MAX_BARS_NOTE_RE.exec(notes) : null;
  const parsed = match ? Number.parseInt(match[1]!, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_BARS_IN_TRADE;
}

/** Order/position notes that bind a fill or resting order to one strategy run. */
export function strategyNotes(run: PaperStrategyRunRow, maxBars: number): string {
  const strategySuffix = run.strategyId ? ` (${run.strategyId})` : '';
  return `Deployed strategy: ${run.name}${strategySuffix} [run:${run.id}] [maxBars:${maxBars}]`;
}

/**
 * True when an order/position belongs to this run. New rows carry the
 * `[run:<id>]` tag; legacy rows fall back to the deployed-strategy name prefix.
 */
export function isStrategyOrderForRun(
  notes: string | null,
  run: Pick<PaperStrategyRunRow, 'id' | 'name'>,
): boolean {
  if (!notes) return false;
  if (notes.includes(`[run:${run.id}]`)) return true;
  return notes.includes(`Deployed strategy: ${run.name}`);
}

/**
 * Translate `signal.trailing` into a price distance the paper broker stores in
 * `trailingStopDistance` (`atr` uses the latest ATR, `percent` the latest
 * close, `fixed` the raw value).
 */
export function resolveTrailingDistance(
  signal: Pick<StrategySignal, 'trailing'>,
  latestAtr: number | null,
  latestClose: number,
): number | undefined {
  const trailing = signal.trailing;
  if (!trailing || !Number.isFinite(trailing.value) || trailing.value <= 0) return undefined;
  if (trailing.type === 'atr') {
    return latestAtr !== null && Number.isFinite(latestAtr) && latestAtr > 0
      ? trailing.value * latestAtr
      : undefined;
  }
  if (trailing.type === 'percent') return (latestClose * trailing.value) / 100;
  return trailing.value;
}

/** Find the strategy run's own open position after a resting limit fill. */
export function findRunPosition(
  positions: readonly PaperPositionRow[],
  run: Pick<PaperStrategyRunRow, 'id' | 'name'>,
): PaperPositionRow | undefined {
  return positions.find((position) => isStrategyOrderForRun(position.notes, run));
}
