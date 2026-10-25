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

// Static options, starter strategy source and prefill shape for the new-run
// form.

export const STARTER_SOURCE = `function getSignal(ctx) {
  const fast = ctx.series('ema20');
  const slow = ctx.series('ema50');
  const atr = ctx.atr();
  if (fast === null || slow === null || atr === null) return null;

  if (fast > slow && ctx.close > fast) {
    const stop = ctx.close - atr * 1.5;
    const risk = ctx.close - stop;
    return {
      side: 'long',
      stop,
      target: ctx.close + risk * 2,
      maxBars: 40,
      trailing: { type: 'atr', value: 2 },
      reason: 'EMA trend continuation',
    };
  }
  if (fast < slow && ctx.close < fast) {
    const stop = ctx.close + atr * 1.5;
    const risk = stop - ctx.close;
    return {
      side: 'short',
      stop,
      target: ctx.close - risk * 2,
      maxBars: 40,
      trailing: { type: 'atr', value: 2 },
      reason: 'EMA trend continuation',
    };
  }
  return null;
}`;

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
  'border-border/60 bg-bg-elev-1 text-fg placeholder:text-fg-subtle focus:border-brand/60 h-9 rounded-md border px-2.5 font-mono text-xs outline-none';

export type Prefill = {
  name: string;
  source: string;
  params: Record<string, unknown>;
  symbol?: string;
  timeframe?: string;
};
