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

// Objective market-structure compute orchestrator.
//
// Single entry point used by the AI tools and the backtester, mirroring the
// `computeIndicator` pattern. The only structure read is swing pivots:
// exact, reproducible price extremes that support and resistance levels are
// derived from. Heuristic zone/break detectors are intentionally absent.

import type { Candle, StructureResult, Symbol, Timeframe } from '@kestrel/shared';

import { defaultSwingLookback } from './defaults';
import { findSwings, type FindSwingsOptions } from './swings';

export { findSwings } from './swings';
export { defaultSwingLookback } from './defaults';

export interface ComputeStructureArgs {
  symbol: Symbol;
  tf: Timeframe;
  candles: Candle[];
  swings?: FindSwingsOptions;
}

export function computeStructure(args: ComputeStructureArgs): StructureResult {
  const { symbol, tf, candles } = args;
  const swings = findSwings(candles, {
    lookback: args.swings?.lookback ?? defaultSwingLookback(tf),
  });

  return {
    symbol,
    tf,
    bars: candles.length,
    swings,
    fetchedAt: Date.now(),
  };
}
