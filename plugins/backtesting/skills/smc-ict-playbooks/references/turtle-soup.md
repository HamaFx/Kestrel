# Turtle Soup

A failed breakout of a well-known high or low. The crowd buys the break; the
market takes their stops and reverses. This is the SMC version of a false
breakout, applied to a rolling range extreme.

## Setup (short)

1. Price makes a new 20-bar high intrabar but closes back below the prior
   20-bar high.
2. The bar's wick is meaningful: at least 0.4 ATR beyond the level.
3. Enter short on the close (or on a retest of the level).
4. Stop above the wick plus 0.2 ATR.
5. Target the mid-range or the opposite 20-bar extreme; minimum 1.5R.

Long is symmetric at a 20-bar low.

## Why it works

The breakout triggers stops and breakout orders. When the bar closes back
inside, those traders are trapped; their exits fuel the reversal.

## Skeleton

```js
function getSignal(ctx) {
  const atr = ctx.atr();
  const upper = ctx.series('donchianUpper');
  const lower = ctx.series('donchianLower');
  if (atr === null || upper === null || lower === null) return null;

  // Donchian upper/lower include the current bar in trading-signals, so
  // compare against the previous bar's level.
  const priorUpper = ctx.series('donchianUpper', -1);
  const priorLower = ctx.series('donchianLower', -1);
  if (priorUpper === null || priorLower === null) return null;

  const wickUp = ctx.high - Math.max(ctx.open, ctx.close);
  if (ctx.high > priorUpper && ctx.close < priorUpper && wickUp > atr * 0.4) {
    const stop = ctx.high + atr * 0.2;
    const risk = stop - ctx.close;
    if (risk <= 0) return null;
    return {
      side: 'short',
      stop,
      target: ctx.close - risk * 2,
      maxBars: 24,
      reason: 'Turtle soup short',
    };
  }

  const wickDown = Math.min(ctx.open, ctx.close) - ctx.low;
  if (ctx.low < priorLower && ctx.close > priorLower && wickDown > atr * 0.4) {
    const stop = ctx.low - atr * 0.2;
    const risk = ctx.close - stop;
    if (risk <= 0) return null;
    return {
      side: 'long',
      stop,
      target: ctx.close + risk * 2,
      maxBars: 24,
      reason: 'Turtle soup long',
    };
  }
  return null;
}
```

## Filters

- Best after a trend has been running; failed breakouts in dead ranges are
  low quality.
- Require ADX > 20 or a recent BOS/CHoCH to confirm there are trapped traders.
- Avoid the first bar of a session; opening breakouts often follow through.
- If the bar closes beyond the level, it is a real breakout — do not fight it.

## Pitfalls

- "New high" must be a genuine range extreme. Using a 3-bar high produces
  constant false signals.
- The stop must be beyond the wick, not at the level, or the next wick takes you
  out.
