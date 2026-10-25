# Judas Swing (London Open False Move)

The London open often produces a sharp move that fakes out the Asian range
before reversing. The "Judas swing" is that false move.

## Setup

1. Mark the Asian range (`ctx.smc.asianHigh` / `asianLow`).
2. In the first 1–2 hours of London (07:00–09:00 UTC), price wicks beyond one
   side of the range.
3. The bar closes back inside the range (failed breakout).
4. Enter in the opposite direction on the next bar or on a retest of the range
   edge.
5. Stop beyond the false-move wick plus 0.25 ATR.
6. Target the opposite side of the Asian range, then PDH/PDL.

## Long variant

- Sweep below `asianLow`, close back above it.
- Prefer confluence: bullish FVG left by the reversal, or a bullish order block
  at the range low.
- Skip if the sweep happens after 10:00 UTC (the move is no longer "open").

## Short variant

- Sweep above `asianHigh`, close back below it.
- Add a bearish FVG / order block for confluence.

## Skeleton

```js
function getSignal(ctx) {
  const atr = ctx.atr();
  const { asianHigh, asianLow, sweep } = ctx.smc;
  if (atr === null || !asianHigh || !asianLow || !sweep) return null;
  const h = ctx.session.hourUtc;
  if (h < 7 || h > 10) return null;
  if (sweep.age > 2) return null;

  if (sweep.side === 'low' && ctx.close > asianLow) {
    const stop = sweep.wick - atr * 0.25;
    const risk = ctx.close - stop;
    if (risk <= 0) return null;
    return { side: 'long', stop, target: asianHigh, maxBars: 30, reason: 'Judas swing long' };
  }
  if (sweep.side === 'high' && ctx.close < asianHigh) {
    const stop = sweep.wick + atr * 0.25;
    const risk = stop - ctx.close;
    if (risk <= 0) return null;
    return { side: 'short', stop, target: asianLow, maxBars: 30, reason: 'Judas swing short' };
  }
  return null;
}
```

## Filters and pitfalls

- Asian range should be at least 0.5 ATR wide; a 10-pip range produces noise.
- Do not trade a sweep that closes outside the range — that is a real breakout,
  not a Judas move.
- Friday and news-heavy days (CPI/FOMC/NFP) invalidate the pattern; if the user
  has an economic-calendar view, check it.
- The reversal often takes 2–4 bars to develop; a time stop of 20–40 bars is
  reasonable.
