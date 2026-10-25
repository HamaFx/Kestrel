# RSI Regime Pullback

Buy short-term weakness inside a longer-term uptrend; sell short-term strength
inside a downtrend. The regime filter is the edge; RSI is the timing tool.

## Setup (long)

1. Regime: `ema50 > ema200` and `ema200` rising over the last 20 bars.
2. Pullback: `rsi14` drops below 40.
3. Trigger: `rsi14` crosses back above 40 on a bullish close.
4. Stop: below the lowest low of the last 5 bars, or 1.2 ATR, whichever is
   farther.
5. Target: 2R or the prior swing high; trail after 1R.

Short is symmetric with RSI > 60 crossing back below 60.

## Skeleton

```js
function getSignal(ctx) {
  const atr = ctx.atr();
  const rsi = ctx.series('rsi14');
  const prevRsi = ctx.series('rsi14', -1);
  const ema50 = ctx.series('ema50');
  const ema200 = ctx.series('ema200');
  const ema200Prev = ctx.series('ema200', -20);
  if ([atr, rsi, prevRsi, ema50, ema200, ema200Prev].some((v) => v === null)) return null;

  if (ema50 > ema200 && ema200 > ema200Prev && prevRsi < 40 && rsi >= 40 && ctx.close > ctx.open) {
    let low = ctx.low;
    for (let k = 1; k <= 5; k += 1) low = Math.min(low, ctx.price(-k).low);
    const stop = Math.min(low, ctx.close - atr * 1.2);
    const risk = ctx.close - stop;
    if (risk <= 0) return null;
    return {
      side: 'long',
      stop,
      target: ctx.close + risk * 2,
      maxBars: 48,
      reason: 'RSI regime pullback',
    };
  }

  if (ema50 < ema200 && ema200 < ema200Prev && prevRsi > 60 && rsi <= 60 && ctx.close < ctx.open) {
    let high = ctx.high;
    for (let k = 1; k <= 5; k += 1) high = Math.max(high, ctx.price(-k).high);
    const stop = Math.max(high, ctx.close + atr * 1.2);
    const risk = stop - ctx.close;
    if (risk <= 0) return null;
    return {
      side: 'short',
      stop,
      target: ctx.close - risk * 2,
      maxBars: 48,
      reason: 'RSI regime pullback',
    };
  }
  return null;
}
```

## Filters

- Require `adx14 > 20`; RSI pullbacks in flat markets are noise.
- Do not buy the first RSI dip after a parabolic move; wait for a higher low.
- On gold, the 1h/4h version is more stable than 5m.

## Pitfalls

- RSI can stay below 40 for many bars in a real downtrend; the cross back above
  40 is the trigger, not the dip itself.
- Using RSI alone without a trend filter turns this into a mean-reversion
  strategy with a completely different risk profile.
- If the stop is more than 2.5 ATR away, the pullback is too deep; skip.
