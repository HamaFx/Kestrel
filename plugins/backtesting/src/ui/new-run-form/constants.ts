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

// Static options, visual strategy templates, starter strategy source and prefill shape for the new-run form.

interface StrategyParamSpec {
  key: string;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
}

export interface StrategyTemplate {
  id: string;
  name: string;
  summary: string;
  params: readonly StrategyParamSpec[];
  buildSource: (params: Record<string, number>) => string;
}

export const STRATEGY_TEMPLATES: readonly StrategyTemplate[] = [
  {
    id: 'ma-crossover',
    name: 'Moving Average Crossover',
    summary:
      'Buys when the fast moving average rises above the slow moving average with price above trend, and sells when it crosses below.',
    params: [
      {
        key: 'fastPeriod',
        label: 'Fast MA Period',
        hint: 'Short-term moving average bars',
        min: 2,
        max: 100,
        step: 1,
        defaultValue: 20,
      },
      {
        key: 'slowPeriod',
        label: 'Slow MA Period',
        hint: 'Long-term moving average bars',
        min: 5,
        max: 250,
        step: 1,
        defaultValue: 50,
      },
      {
        key: 'stopLossAtr',
        label: 'Stop-Loss (ATR ×)',
        hint: 'Protective stop distance in ATR',
        min: 0.5,
        max: 5,
        step: 0.1,
        defaultValue: 1.5,
      },
      {
        key: 'takeProfitRR',
        label: 'Take-Profit (R:R)',
        hint: 'Profit target reward-to-risk ratio',
        min: 0.5,
        max: 10,
        step: 0.25,
        defaultValue: 2,
      },
    ],
    buildSource: (p) => `function getSignal(ctx) {
  const fastPeriod = Number(ctx.params.fastPeriod ?? ${p.fastPeriod ?? 20});
  const slowPeriod = Number(ctx.params.slowPeriod ?? ${p.slowPeriod ?? 50});
  const stopAtr = Number(ctx.params.stopLossAtr ?? ${p.stopLossAtr ?? 1.5});
  const rewardRatio = Number(ctx.params.takeProfitRR ?? ${p.takeProfitRR ?? 2});
  const atr = ctx.atr();
  if (atr === null) return null;

  let fast = fastPeriod === 20 ? ctx.series('ema20') : null;
  let slow = slowPeriod === 50 ? ctx.series('ema50') : null;
  if (fast === null) {
    let sum = 0;
    for (let k = 0; k < fastPeriod; k += 1) {
      const bar = ctx.price(-k);
      if (!bar) return null;
      sum += bar.close;
    }
    fast = sum / fastPeriod;
  }
  if (slow === null) {
    let sum = 0;
    for (let k = 0; k < slowPeriod; k += 1) {
      const bar = ctx.price(-k);
      if (!bar) return null;
      sum += bar.close;
    }
    slow = sum / slowPeriod;
  }

  if (fast > slow && ctx.close > fast) {
    const stop = ctx.close - atr * stopAtr;
    const risk = ctx.close - stop;
    return {
      side: 'long',
      stop,
      target: ctx.close + risk * rewardRatio,
      maxBars: 40,
      trailing: { type: 'atr', value: 2 },
      reason: 'Moving average bullish crossover',
    };
  }
  if (fast < slow && ctx.close < fast) {
    const stop = ctx.close + atr * stopAtr;
    const risk = stop - ctx.close;
    return {
      side: 'short',
      stop,
      target: ctx.close - risk * rewardRatio,
      maxBars: 40,
      trailing: { type: 'atr', value: 2 },
      reason: 'Moving average bearish crossover',
    };
  }
  return null;
}`,
  },
  {
    id: 'rsi-pullback',
    name: 'RSI Pullback',
    summary:
      'Buys oversold dips when RSI drops below the oversold threshold in an uptrend, and sells overbought rallies in a downtrend.',
    params: [
      {
        key: 'rsiPeriod',
        label: 'RSI Period',
        hint: 'Momentum lookback window',
        min: 5,
        max: 50,
        step: 1,
        defaultValue: 14,
      },
      {
        key: 'oversold',
        label: 'Oversold Level',
        hint: 'Buy pullback below this RSI',
        min: 10,
        max: 45,
        step: 1,
        defaultValue: 30,
      },
      {
        key: 'overbought',
        label: 'Overbought Level',
        hint: 'Sell rally above this RSI',
        min: 55,
        max: 90,
        step: 1,
        defaultValue: 70,
      },
      {
        key: 'stopLossAtr',
        label: 'Stop-Loss (ATR ×)',
        hint: 'Protective stop distance in ATR',
        min: 0.5,
        max: 5,
        step: 0.1,
        defaultValue: 1.5,
      },
      {
        key: 'takeProfitRR',
        label: 'Take-Profit (R:R)',
        hint: 'Profit target reward-to-risk ratio',
        min: 0.5,
        max: 10,
        step: 0.25,
        defaultValue: 2,
      },
    ],
    buildSource: (p) => `function getSignal(ctx) {
  const oversold = Number(ctx.params.oversold ?? ${p.oversold ?? 30});
  const overbought = Number(ctx.params.overbought ?? ${p.overbought ?? 70});
  const stopAtr = Number(ctx.params.stopLossAtr ?? ${p.stopLossAtr ?? 1.5});
  const rewardRatio = Number(ctx.params.takeProfitRR ?? ${p.takeProfitRR ?? 2});
  const rsi = ctx.series('rsi14');
  const trend = ctx.series('ema200');
  const atr = ctx.atr();
  if (rsi === null || trend === null || atr === null) return null;

  if (ctx.close > trend && rsi <= oversold) {
    const stop = ctx.close - atr * stopAtr;
    const risk = ctx.close - stop;
    return {
      side: 'long',
      stop,
      target: ctx.close + risk * rewardRatio,
      maxBars: 36,
      reason: 'Oversold RSI pullback in uptrend',
    };
  }
  if (ctx.close < trend && rsi >= overbought) {
    const stop = ctx.close + atr * stopAtr;
    const risk = stop - ctx.close;
    return {
      side: 'short',
      stop,
      target: ctx.close - risk * rewardRatio,
      maxBars: 36,
      reason: 'Overbought RSI rally in downtrend',
    };
  }
  return null;
}`,
  },
  {
    id: 'bollinger-breakout',
    name: 'Bollinger Breakout',
    summary:
      'Buys when price closes above the upper Bollinger Band with expanding volatility, and sells when price breaks below the lower band.',
    params: [
      {
        key: 'stopLossAtr',
        label: 'Stop-Loss (ATR ×)',
        hint: 'Protective stop distance in ATR',
        min: 0.5,
        max: 5,
        step: 0.1,
        defaultValue: 1.5,
      },
      {
        key: 'takeProfitRR',
        label: 'Take-Profit (R:R)',
        hint: 'Profit target reward-to-risk ratio',
        min: 0.5,
        max: 10,
        step: 0.25,
        defaultValue: 2.5,
      },
      {
        key: 'maxHoldBars',
        label: 'Max Hold (Bars)',
        hint: 'Maximum bars before time exit',
        min: 5,
        max: 200,
        step: 5,
        defaultValue: 30,
      },
    ],
    buildSource: (p) => `function getSignal(ctx) {
  const stopAtr = Number(ctx.params.stopLossAtr ?? ${p.stopLossAtr ?? 1.5});
  const rewardRatio = Number(ctx.params.takeProfitRR ?? ${p.takeProfitRR ?? 2.5});
  const maxHoldBars = Number(ctx.params.maxHoldBars ?? ${p.maxHoldBars ?? 30});
  const upper = ctx.series('bbUpper');
  const lower = ctx.series('bbLower');
  const atr = ctx.atr();
  if (upper === null || lower === null || atr === null) return null;

  if (ctx.close > upper) {
    const stop = ctx.close - atr * stopAtr;
    const risk = ctx.close - stop;
    return {
      side: 'long',
      stop,
      target: ctx.close + risk * rewardRatio,
      maxBars: maxHoldBars,
      reason: 'Upper Bollinger Band breakout',
    };
  }
  if (ctx.close < lower) {
    const stop = ctx.close + atr * stopAtr;
    const risk = stop - ctx.close;
    return {
      side: 'short',
      stop,
      target: ctx.close - risk * rewardRatio,
      maxBars: maxHoldBars,
      reason: 'Lower Bollinger Band breakdown',
    };
  }
  return null;
}`,
  },
  {
    id: 'momentum-trend',
    name: 'Momentum Trend',
    summary:
      'Buys when MACD momentum turns positive with strong ADX trend strength, and sells when momentum turns negative.',
    params: [
      {
        key: 'minAdx',
        label: 'Min ADX Strength',
        hint: 'Minimum trend strength filter',
        min: 10,
        max: 50,
        step: 1,
        defaultValue: 22,
      },
      {
        key: 'stopLossAtr',
        label: 'Stop-Loss (ATR ×)',
        hint: 'Protective stop distance in ATR',
        min: 0.5,
        max: 5,
        step: 0.1,
        defaultValue: 1.5,
      },
      {
        key: 'takeProfitRR',
        label: 'Take-Profit (R:R)',
        hint: 'Profit target reward-to-risk ratio',
        min: 0.5,
        max: 10,
        step: 0.25,
        defaultValue: 2,
      },
    ],
    buildSource: (p) => `function getSignal(ctx) {
  const minAdx = Number(ctx.params.minAdx ?? ${p.minAdx ?? 22});
  const stopAtr = Number(ctx.params.stopLossAtr ?? ${p.stopLossAtr ?? 1.5});
  const rewardRatio = Number(ctx.params.takeProfitRR ?? ${p.takeProfitRR ?? 2});
  const hist = ctx.series('macdHistogram');
  const prevHist = ctx.series('macdHistogram', -1);
  const adx = ctx.series('adx14');
  const ema50 = ctx.series('ema50');
  const atr = ctx.atr();
  if (hist === null || prevHist === null || adx === null || ema50 === null || atr === null) {
    return null;
  }
  if (adx < minAdx) return null;

  if (hist > 0 && prevHist <= 0 && ctx.close > ema50) {
    const stop = ctx.close - atr * stopAtr;
    const risk = ctx.close - stop;
    return {
      side: 'long',
      stop,
      target: ctx.close + risk * rewardRatio,
      maxBars: 40,
      reason: 'MACD bullish momentum cross with strong ADX',
    };
  }
  if (hist < 0 && prevHist >= 0 && ctx.close < ema50) {
    const stop = ctx.close + atr * stopAtr;
    const risk = stop - ctx.close;
    return {
      side: 'short',
      stop,
      target: ctx.close - risk * rewardRatio,
      maxBars: 40,
      reason: 'MACD bearish momentum cross with strong ADX',
    };
  }
  return null;
}`,
  },
];

export function buildDefaultParams(template: StrategyTemplate): Record<string, number> {
  const out: Record<string, number> = {};
  for (const param of template.params) {
    out[param.key] = param.defaultValue;
  }
  return out;
}

export const DEFAULT_TEMPLATE = STRATEGY_TEMPLATES[0]!;

export const STARTER_SOURCE = DEFAULT_TEMPLATE.buildSource(buildDefaultParams(DEFAULT_TEMPLATE));

export const SYMBOLS = [
  'XAUUSD',
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  'AUDUSD',
  'USDCAD',
  'BTCUSDT',
  'ETHUSDT',
];

export const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];

export const inputClass =
  'border-border bg-[#0e0f11]/90 text-fg placeholder:text-fg-subtle focus:border-brand/60 h-10 rounded-lg border px-3 font-mono text-xs outline-none';

export type Prefill = {
  name: string;
  source: string;
  params: Record<string, unknown>;
  symbol?: string;
  timeframe?: string;
};
