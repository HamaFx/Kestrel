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
// bar that confirms them (an order block is confirmed by its impulse bars, an
// FVG by its third bar, a swing by its right-hand lookback), and mitigation is
// evaluated bar by bar rather than from the full window.
//
// The output is a compact numeric matrix that is handed to the QuickJS
// sandbox once. Strategies read it through `ctx.series(name, offset)` and
// `ctx.smc`, both of which refuse to look forward.

import { computeStructure } from '@kestrel/indicators';
import type {
  Candle,
  FvgZone,
  LiquiditySweep,
  OrderBlock,
  StructureEvent,
  SwingPoint,
  Symbol,
  Timeframe,
} from '@kestrel/shared';
import {
  ADX,
  ATR,
  BollingerBands,
  CCI,
  DonchianChannels,
  EMA,
  KeltnerChannels,
  MACD,
  MFI,
  OBV,
  PSAR,
  ROC,
  RSI,
  SMA,
  StochasticOscillator,
  StochasticRSI,
  SuperTrend,
  VWAP,
  WilliamsR,
} from 'trading-signals';

/** Ordered list of TA series exposed to strategies. */
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

export interface SmcMatrix {
  fvgBullTop: number[];
  fvgBullBottom: number[];
  fvgBullAge: number[];
  fvgBearTop: number[];
  fvgBearBottom: number[];
  fvgBearAge: number[];
  obBullTop: number[];
  obBullBottom: number[];
  obBullAge: number[];
  obBullStrength: number[];
  obBearTop: number[];
  obBearBottom: number[];
  obBearAge: number[];
  obBearStrength: number[];
  sweepSide: number[];
  sweepLevel: number[];
  sweepWick: number[];
  sweepMagnitude: number[];
  sweepAge: number[];
  structureDirection: number[];
  structureKind: number[];
  structureLevel: number[];
  structureAge: number[];
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
  smc: SmcMatrix;
}

const MAX_ACTIVE_ZONES = 200;

function emptyMatrix(n: number): FeatureMatrix {
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
    smc: {
      fvgBullTop: new Array<number>(n).fill(0),
      fvgBullBottom: new Array<number>(n).fill(0),
      fvgBullAge: new Array<number>(n).fill(0),
      fvgBearTop: new Array<number>(n).fill(0),
      fvgBearBottom: new Array<number>(n).fill(0),
      fvgBearAge: new Array<number>(n).fill(0),
      obBullTop: new Array<number>(n).fill(0),
      obBullBottom: new Array<number>(n).fill(0),
      obBullAge: new Array<number>(n).fill(0),
      obBullStrength: new Array<number>(n).fill(0),
      obBearTop: new Array<number>(n).fill(0),
      obBearBottom: new Array<number>(n).fill(0),
      obBearAge: new Array<number>(n).fill(0),
      obBearStrength: new Array<number>(n).fill(0),
      sweepSide: new Array<number>(n).fill(0),
      sweepLevel: new Array<number>(n).fill(0),
      sweepWick: new Array<number>(n).fill(0),
      sweepMagnitude: new Array<number>(n).fill(0),
      sweepAge: new Array<number>(n).fill(0),
      structureDirection: new Array<number>(n).fill(0),
      structureKind: new Array<number>(n).fill(0),
      structureLevel: new Array<number>(n).fill(0),
      structureAge: new Array<number>(n).fill(0),
      swingHigh: new Array<number>(n).fill(0),
      swingLow: new Array<number>(n).fill(0),
      pdh: new Array<number>(n).fill(0),
      pdl: new Array<number>(n).fill(0),
      asianHigh: new Array<number>(n).fill(0),
      asianLow: new Array<number>(n).fill(0),
    },
  };
}

function result<T>(read: () => T): T | null {
  try {
    return read();
  } catch {
    // trading-signals throws NotEnoughDataError until the warm-up window is
    // complete; a null feature is the honest representation of "unknown".
    return null;
  }
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function utcDayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear().toString().padStart(4, '0')}-${(d.getUTCMonth() + 1)
    .toString()
    .padStart(2, '0')}-${d.getUTCDate().toString().padStart(2, '0')}`;
}

function nearestBullish<T>(
  zones: readonly T[],
  top: (zone: T) => number,
  bottom: (zone: T) => number,
  price: number,
): T | null {
  let best: T | null = null;
  let bestTop = Number.NEGATIVE_INFINITY;
  for (const zone of zones) {
    const topValue = top(zone);
    if (topValue <= price && topValue > bestTop && bottom(zone) <= price) {
      best = zone;
      bestTop = topValue;
    }
  }
  return best;
}

function nearestBearish<T>(
  zones: readonly T[],
  top: (zone: T) => number,
  bottom: (zone: T) => number,
  price: number,
): T | null {
  let best: T | null = null;
  let bestBottom = Number.POSITIVE_INFINITY;
  for (const zone of zones) {
    const bottomValue = bottom(zone);
    if (bottomValue >= price && bottomValue < bestBottom && top(zone) >= price) {
      best = zone;
      bestBottom = bottomValue;
    }
  }
  return best;
}

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

  const ema20 = new EMA(20);
  const ema50 = new EMA(50);
  const ema200 = new EMA(200);
  const sma20 = new SMA(20);
  const sma50 = new SMA(50);
  const volumeSma20 = new SMA(20);
  const rsi14 = new RSI(14);
  const atr14 = new ATR(14);
  const adx14 = new ADX(14);
  const macd = new MACD(new EMA(12), new EMA(26), new EMA(9));
  const bollinger = new BollingerBands(20, 2);
  const stochastic = new StochasticOscillator({ kPeriod: 14, dPeriod: 3, kSlowingPeriod: 3 });
  const stochRsi = new StochasticRSI(14);
  const superTrend = new SuperTrend({ interval: 10, multiplier: 3 });
  const vwap = new VWAP();
  const obv = new OBV(2);
  const cci = new CCI(20);
  const williamsR = new WilliamsR(14);
  const psar = new PSAR({ accelerationStep: 0.02, accelerationMax: 0.2 });
  const keltner = new KeltnerChannels({ emaInterval: 20, atrInterval: 20, multiplier: 2 });
  const donchian = new DonchianChannels(20);
  const mfi = new MFI(14);
  const roc = new ROC(12);

  for (let i = 0; i < n; i += 1) {
    const candle = candles[i]!;
    const hlc = { high: candle.h, low: candle.l, close: candle.c };
    const ohlcv = {
      open: candle.o,
      high: candle.h,
      low: candle.l,
      close: candle.c,
      // FX volume is synthetic; a missing volume must not erase the series.
      volume: candle.v ?? 0,
    };
    const hl = { high: candle.h, low: candle.l };

    ema20.update(candle.c, false);
    ema50.update(candle.c, false);
    ema200.update(candle.c, false);
    sma20.update(candle.c, false);
    sma50.update(candle.c, false);
    rsi14.update(candle.c, false);
    atr14.update(hlc, false);
    adx14.update(hlc, false);
    macd.update(candle.c, false);
    bollinger.update(candle.c, false);
    stochastic.update(hlc, false);
    stochRsi.update(candle.c, false);
    superTrend.update(hlc, false);
    vwap.update(ohlcv, false);
    obv.update(ohlcv, false);
    cci.update(hlc, false);
    williamsR.update(hlc, false);
    psar.update(hl, false);
    keltner.update(hlc, false);
    donchian.update(hlc, false);
    mfi.update(ohlcv, false);
    roc.update(candle.c, false);
    if (candle.v !== null) volumeSma20.update(candle.v, false);

    const s = matrix.series;
    s.ema20[i] = finite(result(() => ema20.getResult()));
    s.ema50[i] = finite(result(() => ema50.getResult()));
    s.ema200[i] = finite(result(() => ema200.getResult()));
    s.sma20[i] = finite(result(() => sma20.getResult()));
    s.sma50[i] = finite(result(() => sma50.getResult()));
    s.rsi14[i] = finite(result(() => rsi14.getResult()));
    s.atr14[i] = finite(result(() => atr14.getResult()));
    s.adx14[i] = finite(result(() => adx14.getResult()));

    const macdValue = result(() => macd.getResult());
    s.macd[i] = finite(macdValue?.macd);
    s.macdSignal[i] = finite(macdValue?.signal);
    s.macdHistogram[i] = finite(macdValue?.histogram);

    const bb = result(() => bollinger.getResult());
    s.bbUpper[i] = finite(bb?.upper);
    s.bbMiddle[i] = finite(bb?.middle);
    s.bbLower[i] = finite(bb?.lower);
    s.bbWidth[i] =
      bb && Number.isFinite(bb.upper) && Number.isFinite(bb.lower) && bb.middle
        ? (bb.upper - bb.lower) / bb.middle
        : null;

    const stoch = result(() => stochastic.getResult());
    s.stochK[i] = finite(stoch?.stochK);
    s.stochD[i] = finite(stoch?.stochD);
    s.stochRsi[i] = finite(result(() => stochRsi.getResult()));

    const trend = result(() => superTrend.getResult());
    s.supertrend[i] = finite(trend?.supertrend);
    s.supertrendDirection[i] = trend ? (trend.trend === 'BULLISH' ? 1 : -1) : null;

    s.vwap[i] = finite(result(() => vwap.getResult()));
    s.obv[i] = finite(result(() => obv.getResult()));
    s.cci20[i] = finite(result(() => cci.getResult()));
    s.williamsR14[i] = finite(result(() => williamsR.getResult()));
    s.psar[i] = finite(result(() => psar.getResult()));

    const kc = result(() => keltner.getResult());
    s.keltnerUpper[i] = finite(kc?.upper);
    s.keltnerLower[i] = finite(kc?.lower);

    const dc = result(() => donchian.getResult());
    s.donchianUpper[i] = finite(dc?.upper);
    s.donchianLower[i] = finite(dc?.lower);

    s.mfi14[i] = finite(result(() => mfi.getResult()));
    s.roc12[i] = finite(result(() => roc.getResult()));
    s.volumeSma20[i] = finite(result(() => volumeSma20.getResult()));

    const atrValue = s.atr14[i];
    s.atrPercent[i] =
      typeof atrValue === 'number' && candle.c !== 0 ? (atrValue / candle.c) * 100 : null;
  }

  applySmc(matrix, candles, args.symbol, args.timeframe);
  applySessionLevels(matrix);
  return matrix;
}

interface ActiveZone<T> {
  zone: T;
  visibleAt: number;
  strength: number;
}

function applySmc(
  matrix: FeatureMatrix,
  candles: readonly Candle[],
  symbol: Symbol,
  timeframe: Timeframe,
): void {
  const structure = computeStructure({
    symbol,
    tf: timeframe,
    candles: [...candles],
    kinds: ['swings', 'bos_choch', 'fvg', 'order_blocks', 'liquidity'],
  });

  const swings = structure.swings ?? [];
  const events = structure.events ?? [];
  const fvgs = structure.fvg ?? [];
  const blocks = structure.orderBlocks ?? [];
  const sweeps = structure.liquidity ?? [];

  const swingByBar = new Map<number, SwingPoint[]>();
  for (const swing of swings) {
    const visibleAt = Math.min(candles.length - 1, swing.index + swing.lookback);
    const list = swingByBar.get(visibleAt) ?? [];
    list.push(swing);
    swingByBar.set(visibleAt, list);
  }

  const eventByBar = new Map<number, StructureEvent[]>();
  for (const event of events) {
    const list = eventByBar.get(event.brokenAt) ?? [];
    list.push(event);
    eventByBar.set(event.brokenAt, list);
  }

  const fvgByBar = new Map<number, FvgZone[]>();
  for (const fvg of fvgs) {
    const list = fvgByBar.get(fvg.endIndex) ?? [];
    list.push(fvg);
    fvgByBar.set(fvg.endIndex, list);
  }

  const blockByBar = new Map<number, OrderBlock[]>();
  for (const block of blocks) {
    // An order block is only knowable after its impulse bars close.
    const visibleAt = Math.min(candles.length - 1, block.index + 2);
    const list = blockByBar.get(visibleAt) ?? [];
    list.push(block);
    blockByBar.set(visibleAt, list);
  }

  const sweepByBar = new Map<number, LiquiditySweep[]>();
  for (const sweep of sweeps) {
    const list = sweepByBar.get(sweep.index) ?? [];
    list.push(sweep);
    sweepByBar.set(sweep.index, list);
  }

  const activeBullFvg: ActiveZone<FvgZone>[] = [];
  const activeBearFvg: ActiveZone<FvgZone>[] = [];
  const activeBullOb: ActiveZone<OrderBlock>[] = [];
  const activeBearOb: ActiveZone<OrderBlock>[] = [];

  let lastSwingHigh: { price: number; visibleAt: number } | null = null;
  let lastSwingLow: { price: number; visibleAt: number } | null = null;
  let lastSweep: LiquiditySweep | null = null;
  let lastEvent: StructureEvent | null = null;

  const smc = matrix.smc;

  for (let i = 0; i < candles.length; i += 1) {
    const candle = candles[i]!;

    for (const swing of swingByBar.get(i) ?? []) {
      if (swing.type === 'high') lastSwingHigh = { price: swing.price, visibleAt: i };
      else lastSwingLow = { price: swing.price, visibleAt: i };
    }
    for (const event of eventByBar.get(i) ?? []) lastEvent = event;
    for (const sweep of sweepByBar.get(i) ?? []) lastSweep = sweep;

    for (const zone of fvgByBar.get(i) ?? []) {
      const entry = { zone, visibleAt: i, strength: 0 };
      if (zone.side === 'bullish') activeBullFvg.push(entry);
      else activeBearFvg.push(entry);
    }
    for (const block of blockByBar.get(i) ?? []) {
      const entry = { zone: block, visibleAt: i, strength: block.strength ?? 0 };
      if (block.side === 'bullish') activeBullOb.push(entry);
      else activeBearOb.push(entry);
    }

    // Full mitigation removes a zone. A wick into (but not through) a zone
    // keeps it alive, which is what ICT "mitigation" means in practice.
    pruneZones(activeBullFvg, (zone) => candle.l <= zone.bottom);
    pruneZones(activeBearFvg, (zone) => candle.h >= zone.top);
    pruneZones(activeBullOb, (zone) => candle.c < zone.bottom);
    pruneZones(activeBearOb, (zone) => candle.c > zone.top);

    capZones(activeBullFvg);
    capZones(activeBearFvg);
    capZones(activeBullOb);
    capZones(activeBearOb);

    const bullFvg = nearestBullish(
      activeBullFvg.map((entry) => entry.zone),
      (zone) => zone.top,
      (zone) => zone.bottom,
      candle.c,
    );
    const bearFvg = nearestBearish(
      activeBearFvg.map((entry) => entry.zone),
      (zone) => zone.top,
      (zone) => zone.bottom,
      candle.c,
    );
    const bullOb = nearestBullish(
      activeBullOb.map((entry) => entry.zone),
      (zone) => zone.top,
      (zone) => zone.bottom,
      candle.c,
    );
    const bearOb = nearestBearish(
      activeBearOb.map((entry) => entry.zone),
      (zone) => zone.top,
      (zone) => zone.bottom,
      candle.c,
    );

    if (bullFvg) {
      smc.fvgBullTop[i] = bullFvg.top;
      smc.fvgBullBottom[i] = bullFvg.bottom;
      smc.fvgBullAge[i] = i - bullFvg.endIndex;
    }
    if (bearFvg) {
      smc.fvgBearTop[i] = bearFvg.top;
      smc.fvgBearBottom[i] = bearFvg.bottom;
      smc.fvgBearAge[i] = i - bearFvg.endIndex;
    }
    if (bullOb) {
      smc.obBullTop[i] = bullOb.top;
      smc.obBullBottom[i] = bullOb.bottom;
      smc.obBullAge[i] = i - bullOb.index;
      smc.obBullStrength[i] = bullOb.strength ?? 0;
    }
    if (bearOb) {
      smc.obBearTop[i] = bearOb.top;
      smc.obBearBottom[i] = bearOb.bottom;
      smc.obBearAge[i] = i - bearOb.index;
      smc.obBearStrength[i] = bearOb.strength ?? 0;
    }

    if (lastSweep && i - lastSweep.index <= 100) {
      smc.sweepSide[i] = lastSweep.side === 'high' ? 1 : -1;
      smc.sweepLevel[i] = lastSweep.level;
      smc.sweepWick[i] = lastSweep.wick;
      smc.sweepMagnitude[i] = lastSweep.magnitude ?? 0;
      smc.sweepAge[i] = i - lastSweep.index;
    }
    if (lastEvent && i - lastEvent.brokenAt <= 200) {
      smc.structureDirection[i] = lastEvent.direction === 'bullish' ? 1 : -1;
      smc.structureKind[i] = lastEvent.kind === 'bos' ? 1 : 2;
      smc.structureLevel[i] = lastEvent.level;
      smc.structureAge[i] = i - lastEvent.brokenAt;
    }
    if (lastSwingHigh) smc.swingHigh[i] = lastSwingHigh.price;
    if (lastSwingLow) smc.swingLow[i] = lastSwingLow.price;
  }
}

function pruneZones<T>(zones: ActiveZone<T>[], isDead: (zone: T) => boolean): void {
  for (let i = zones.length - 1; i >= 0; i -= 1) {
    if (isDead(zones[i]!.zone)) zones.splice(i, 1);
  }
}

function capZones<T>(zones: ActiveZone<T>[]): void {
  if (zones.length > MAX_ACTIVE_ZONES) {
    zones.splice(0, zones.length - MAX_ACTIVE_ZONES);
  }
}

/**
 * Session levels (previous-day high/low, Asian range) computed incrementally.
 *
 * The shared `computePdhPdl` / `computeAsianRange` helpers are relative to the
 * *latest* bar in a window, so using them per bar would leak the future. This
 * walk only ever reads the current and prior UTC days.
 */
function applySessionLevels(matrix: FeatureMatrix): void {
  const { t } = matrix.bars;
  const { h, l } = matrix.bars;
  const { pdh, pdl, asianHigh, asianLow } = matrix.smc;

  let dayKey = '';
  let dayHigh = Number.NEGATIVE_INFINITY;
  let dayLow = Number.POSITIVE_INFINITY;
  let prevDayHigh = 0;
  let prevDayLow = 0;

  let asianSessionHigh = Number.NEGATIVE_INFINITY;
  let asianSessionLow = Number.POSITIVE_INFINITY;
  let prevAsianHigh = 0;
  let prevAsianLow = 0;
  let asianComplete = false;

  for (let i = 0; i < t.length; i += 1) {
    const ms = t[i]!;
    const key = utcDayKey(ms);
    const hour = new Date(ms).getUTCHours();

    if (key !== dayKey) {
      if (dayKey !== '') {
        prevDayHigh = dayHigh;
        prevDayLow = dayLow;
        prevAsianHigh = asianSessionHigh;
        prevAsianLow = asianSessionLow;
      }
      dayKey = key;
      dayHigh = h[i]!;
      dayLow = l[i]!;
      asianSessionHigh = Number.NEGATIVE_INFINITY;
      asianSessionLow = Number.POSITIVE_INFINITY;
      asianComplete = false;
    } else {
      if (h[i]! > dayHigh) dayHigh = h[i]!;
      if (l[i]! < dayLow) dayLow = l[i]!;
    }

    if (hour < 7) {
      if (h[i]! > asianSessionHigh) asianSessionHigh = h[i]!;
      if (l[i]! < asianSessionLow) asianSessionLow = l[i]!;
    } else if (!asianComplete && Number.isFinite(asianSessionHigh)) {
      asianComplete = true;
    }

    pdh[i] = prevDayHigh;
    pdl[i] = prevDayLow;
    if (asianComplete) {
      asianHigh[i] = asianSessionHigh;
      asianLow[i] = asianSessionLow;
    } else {
      asianHigh[i] = prevAsianHigh;
      asianLow[i] = prevAsianLow;
    }
  }
}
