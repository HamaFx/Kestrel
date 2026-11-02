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

// Bounds and structural checks for trade levels supplied by a user, an
// import file, or a model.
//
// The old journal importer capped every price at 5,000. That silently
// rejected every BTCUSDT trade (BTC trades in the tens of thousands). The
// ceiling here is an absolute sanity bound, not a per-instrument band: live
// plausibility belongs to `checkLevelsAgainstMarket` in `@kestrel/ai`, which
// has market data.

import type { TradeSide } from '../schemas/journal';

/**
 * Absolute upper bound for any price-like value. Wide enough for a
 * six-figure BTC quote plus volatility; narrow enough to reject a
 * mistyped or hallucinated magnitude.
 */
export const MAX_PRICE_VALUE = 1_000_000;

export interface TradeLevels {
  side: TradeSide;
  entry: number;
  stop?: number | null;
  target?: number | null;
  exit?: number | null;
}

function checkLevel(label: string, value: number): string | null {
  if (!Number.isFinite(value)) return `${label} must be a finite number`;
  if (value <= 0) return `${label} must be greater than zero`;
  if (value > MAX_PRICE_VALUE) return `${label} must be at most ${MAX_PRICE_VALUE}`;
  return null;
}

/**
 * Validate trade levels, returning the first problem as a user-facing
 * message, or `null` when the levels are coherent.
 *
 * `stop` must sit on the losing side of `entry` and `target` on the winning
 * side, so a caller can never persist a trade whose risk distance is
 * negative or whose reward is backwards.
 */
export function validateTradeLevels(levels: TradeLevels): string | null {
  const entryError = checkLevel('Entry', levels.entry);
  if (entryError) return entryError;

  for (const [label, value] of [
    ['Stop', levels.stop],
    ['Target', levels.target],
    ['Exit', levels.exit],
  ] as const) {
    if (value === null || value === undefined) continue;
    const error = checkLevel(label, value);
    if (error) return error;
  }

  if (levels.stop !== null && levels.stop !== undefined) {
    const wrongSide =
      levels.side === 'long' ? levels.stop >= levels.entry : levels.stop <= levels.entry;
    if (wrongSide) {
      return `Stop must be ${levels.side === 'long' ? 'below' : 'above'} entry`;
    }
  }

  if (levels.target !== null && levels.target !== undefined) {
    const wrongSide =
      levels.side === 'long' ? levels.target <= levels.entry : levels.target >= levels.entry;
    if (wrongSide) {
      return `Target must be ${levels.side === 'long' ? 'above' : 'below'} entry`;
    }
  }

  return null;
}

/** Throw when {@link validateTradeLevels} rejects the levels. */
export function assertValidTradeLevels(levels: TradeLevels): void {
  const error = validateTradeLevels(levels);
  if (error) throw new RangeError(error);
}
