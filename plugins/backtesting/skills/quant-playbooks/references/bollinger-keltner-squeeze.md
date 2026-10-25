# Bollinger / Keltner Squeeze

When Bollinger Bands contract inside Keltner Channels, volatility is compressed.
The subsequent expansion often produces a directional move.

## Detection

```js
const squeeze =
  ctx.series('bbUpper') < ctx.series('keltnerUpper') &&
  ctx.series('bbLower') > ctx.series('keltnerLower');
```

A squeeze is a **state**, not a signal. Wait for expansion.

## Setup

1. At least 6 consecutive squeeze bars (volatility compression).
2. Price closes outside the Bollinger Band in the direction of the trend.
3. Enter in the breakout direction.
4. Stop at the opposite band or 1.2 ATR, whichever is closer to price.
5. Target 2R, or trail with ATR once 1R is reached.
6. Exit if price closes back inside the bands.

## Long skeleton

```js
function getSignal(ctx) {
  const atr = ctx.atr();
  const upper = ctx.series('bbUpper');
  const lower = ctx.series('bbLower');
  const kcUpper = ctx.series('keltnerUpper');
  const kcLower = ctx.series('keltnerLower');
  const trend = ctx.series('supertrendDirection');
  if ([atr, upper, lower, kcUpper, kcLower].some((v) => v === null)) return null;

  // Previous bar was in a squeeze, current bar breaks out upward.
  const prevSqueeze =
    ctx.series('bbUpper', -1) < ctx.series('keltnerUpper', -1) &&
    ctx.series('bbLower', -1) > ctx.series('keltnerLower', -1);
  if (!prevSqueeze || trend !== 1) return null;
  if (ctx.close <= upper) return null;

  const stop = Math.min(ctx.close - atr * 1.2, lower);
  const risk = ctx.close - stop;
  if (risk <= 0) return null;
  return {
    side: 'long',
    stop,
    target: ctx.close + risk * 2,
    maxBars: 40,
    reason: 'Squeeze breakout',
  };
}
```

## Filters

- ADX is usually low during the squeeze and rising after expansion. Requiring
  `adx14 > 18` on the breakout bar filters chop.
- Avoid squeezes that occur directly before a major scheduled release unless the
  user wants a news strategy.
- On gold, the 15m/1h squeeze is more reliable than 1m.

## Pitfalls

- Buying every close above the upper band in a range is a losing strategy. The
  squeeze state is what makes the breakout special.
- Keltner and Bollinger periods must match (20) for the comparison to be
  meaningful; the engine uses 20 for both.
