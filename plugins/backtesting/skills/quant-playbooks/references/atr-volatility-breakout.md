# ATR Volatility Breakout

Buy strength above a rolling high in an uptrend, or sell weakness below a
rolling low in a downtrend. ATR sizes the stop; a trailing stop captures trends.

## Setup

1. Trend filter: `ema50 > ema200` for longs, reverse for shorts. Alternative:
   `supertrendDirection === 1`.
2. Breakout: close above the prior 20-bar high (`donchianUpper`, shifted one
   bar) for longs; below the prior 20-bar low for shorts.
3. Stop: 1.5 × ATR(14) below entry (long).
4. Target: none; trail with `{ type: 'atr', value: 2 }` and `breakEvenAtR: 1`.
5. Time stop: 80–120 bars, depending on timeframe.

## Skeleton

```js
function getSignal(ctx) {
  const atr = ctx.atr();
  const ema50 = ctx.series('ema50');
  const ema200 = ctx.series('ema200');
  const priorHigh = ctx.series('donchianUpper', -1);
  const priorLow = ctx.series('donchianLower', -1);
  if ([atr, ema50, ema200, priorHigh, priorLow].some((v) => v === null)) return null;

  if (ema50 > ema200 && ctx.close > priorHigh) {
    const stop = ctx.close - atr * 1.5;
    return {
      side: 'long',
      stop,
      trailing: { type: 'atr', value: 2 },
      breakEvenAtR: 1,
      maxBars: 100,
      reason: '20-bar ATR breakout',
    };
  }
  if (ema50 < ema200 && ctx.close < priorLow) {
    const stop = ctx.close + atr * 1.5;
    return {
      side: 'short',
      stop,
      trailing: { type: 'atr', value: 2 },
      breakEvenAtR: 1,
      maxBars: 100,
      reason: '20-bar ATR breakout',
    };
  }
  return null;
}
```

## Filters

- Skip if ATR is below the 20-bar average (dead market) or above 2× average
  (exhaustion).
- Avoid the Asian session for FX/gold breakouts; the London open has the
  follow-through.
- Require the breakout bar to close in the top 30% of its range for longs.

## Pitfalls

- Breakouts fail frequently in ranges. The trend filter is not optional.
- A trailing ATR stop with a 1.5 ATR initial stop is too tight; use 2 ATR for
  the trail.
- On crypto 24/7 data, session filters do not apply; rely on volatility regime
  instead.
