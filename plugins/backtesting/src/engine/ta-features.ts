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

// Point-in-time technical-indicator series (trading-signals, closed bars only).

import type { Candle } from '@kestrel/shared';
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

import { finite, result, type FeatureMatrix } from './feature-types';

export function applyTaFeatures(matrix: FeatureMatrix, candles: readonly Candle[]): void {
  const n = candles.length;
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
}
