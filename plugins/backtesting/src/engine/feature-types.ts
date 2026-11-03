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

// Feature-matrix shape, series names, and null-safe numeric helpers.

export const SERIES_NAMES = [
  'ema20',
  'ema50',
  'ema200',
  'sma20',
  'sma50',
  'rsi14',
  'atr14',
  'adx14',
  'macd',
  'macdSignal',
  'macdHistogram',
  'bbUpper',
  'bbMiddle',
  'bbLower',
  'bbWidth',
  'stochK',
  'stochD',
  'stochRsi',
  'supertrend',
  'supertrendDirection',
  'vwap',
  'obv',
  'cci20',
  'williamsR14',
  'psar',
  'keltnerUpper',
  'keltnerLower',
  'donchianUpper',
  'donchianLower',
  'mfi14',
  'roc12',
  'volumeSma20',
  'atrPercent',
] as const;

export type SeriesName = (typeof SERIES_NAMES)[number];

export interface BarMatrix {
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: (number | null)[];
}

export interface LevelsMatrix {
  swingHigh: number[];
  swingLow: number[];
  pdh: number[];
  pdl: number[];
  asianHigh: number[];
  asianLow: number[];
}

export interface FeatureMatrix {
  bars: BarMatrix;
  series: Record<SeriesName, (number | null)[]>;
  levels: LevelsMatrix;
}

export function emptyMatrix(n: number): FeatureMatrix {
  const series = {} as Record<SeriesName, (number | null)[]>;
  for (const name of SERIES_NAMES) series[name] = new Array<number | null>(n).fill(null);
  return {
    bars: {
      t: [],
      o: [],
      h: [],
      l: [],
      c: [],
      v: [],
    },
    series,
    levels: {
      swingHigh: new Array<number>(n).fill(0),
      swingLow: new Array<number>(n).fill(0),
      pdh: new Array<number>(n).fill(0),
      pdl: new Array<number>(n).fill(0),
      asianHigh: new Array<number>(n).fill(0),
      asianLow: new Array<number>(n).fill(0),
    },
  };
}

export function result<T>(read: () => T): T | null {
  try {
    return read();
  } catch {
    // trading-signals throws NotEnoughDataError until the warm-up window is
    // complete; a null feature is the honest representation of "unknown".
    return null;
  }
}

export function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
