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

// Shared candle mapper — single source of truth for raw-bar → Candle DTO.
// Replaces the four near-identical CandleSchema.parse blocks that were
// inlined in candles.ts and the old market-data-providers.ts (SRP-2).

import { CandleSchema, type Candle, type Symbol, type Timeframe } from '@kestrel/shared';

// ── Standard shape (binance, finnhub, candles-1m) ─────────────────────

export interface StandardBar {
  t: number; // ms epoch UTC
  o: number;
  h: number;
  l: number;
  c: number;
  v: number | null;
}

/**
 * Map a standard `{t,o,h,l,c,v}` bar (binance, finnhub, candles-1m) to a
 * normalised `Candle` DTO.
 */
export function toCandle(
  bar: StandardBar,
  opts: { symbol: Symbol; tf: Timeframe; source: string; fetchedAt: number },
): Candle {
  return CandleSchema.parse({
    symbol: opts.symbol,
    tf: opts.tf,
    t: bar.t,
    o: bar.o,
    h: bar.h,
    l: bar.l,
    c: bar.c,
    v: bar.v,
    source: opts.source,
    fetchedAt: opts.fetchedAt,
  });
}

// ── BiQuote shape ─────────────────────────────────────────────────────

export interface BiquoteOhlcBar {
  openTime: string; // ISO date string
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** Tick count for the bar (FX/Gold have no real volume — MT5 reports tick count instead). */
  tickVolume?: number;
}

/**
 * Map a BiQuote OHLC bar (with `openTime` string and `volume` number) to a
 * normalised `Candle` DTO. BiQuote returns 0 real volume for FX/Gold — in
 * that case we fall back to `tickVolume` so volume-based indicators
 * (`vwap`, `mfi14`, `obv`, `volumeSma20`) remain defined.
 */
export function toCandleFromBiquote(
  bar: BiquoteOhlcBar,
  opts: { symbol: Symbol; tf: Timeframe; fetchedAt: number },
): Candle {
  const tickVolume = bar.tickVolume ?? 0;
  const volume = bar.volume > 0 ? bar.volume : tickVolume > 0 ? tickVolume : null;
  return CandleSchema.parse({
    symbol: opts.symbol,
    tf: opts.tf,
    t: Date.parse(bar.openTime),
    o: bar.open,
    h: bar.high,
    l: bar.low,
    c: bar.close,
    v: volume,
    source: 'biquote',
    fetchedAt: opts.fetchedAt,
  });
}
