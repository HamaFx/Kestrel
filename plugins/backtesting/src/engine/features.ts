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

// Per-bar feature matrix for agent-authored strategies.
//
// Everything here is point-in-time: a bar's feature row only contains values
// that were knowable when that bar closed. SMC zones become visible on the
// bar that confirms them, and mitigation is evaluated bar by bar.

import type { Candle, Symbol, Timeframe } from '@kestrel/shared';

import { emptyMatrix, type FeatureMatrix } from './feature-types';
import { applySessionLevels } from './session-features';
import { applySmc } from './smc-features';
import { applyTaFeatures } from './ta-features';

export * from './feature-types';

/**
 * Build the point-in-time feature matrix.
 *
 * `candles` must be oldest-first and closed bars only. The function never
 * mutates the input.
 */
export function buildFeatureMatrix(args: {
  symbol: Symbol;
  timeframe: Timeframe;
  candles: readonly Candle[];
}): FeatureMatrix {
  const candles = [...args.candles].sort((a, b) => a.t - b.t);
  const n = candles.length;
  const matrix = emptyMatrix(n);
  if (n === 0) return matrix;

  matrix.bars.t = candles.map((c) => c.t);
  matrix.bars.o = candles.map((c) => c.o);
  matrix.bars.h = candles.map((c) => c.h);
  matrix.bars.l = candles.map((c) => c.l);
  matrix.bars.c = candles.map((c) => c.c);
  matrix.bars.v = candles.map((c) => c.v);

  applyTaFeatures(matrix, candles);
  applySmc(matrix, candles, args.symbol, args.timeframe);
  applySessionLevels(matrix);
  return matrix;
}
