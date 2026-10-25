# Silver Bullet

A time-boxed continuation setup: liquidity is swept, displacement leaves a fair
value gap, and price retraces into the gap within the window.

## Time windows

ICT Silver Bullet windows are in **New York local time**:

- 10:00–11:00 ET
- 14:00–15:00 ET

UTC equivalents (our `ctx.session.hourUtc`):

| Season        | 10–11 ET        | 14–15 ET        |
| ------------- | --------------- | --------------- |
| EDT (Mar–Nov) | 14:00–15:00 UTC | 18:00–19:00 UTC |
| EST (Nov–Mar) | 15:00–16:00 UTC | 19:00–20:00 UTC |

Because Kestrel's session flags are UTC-based, use an explicit hour check and
tell the user which assumption you made. Do not rely on
`ctx.session.newYorkOpenKillzone` for the 10:00 window — it starts at 12:00 UTC.

## Setup (long)

1. Price sweeps a recent swing low (or the Asian low) and closes back above it.
2. A bullish FVG forms on the displacement leg (`ctx.smc.fvg.bullish`).
3. Price retraces into the FVG within the window.
4. Enter long at the FVG top (limit) or on a bullish close inside it (market).
5. Stop below the FVG bottom or the sweep wick, whichever is lower, plus 0.2 ATR.
6. Target the nearest opposing swing high / PDH; minimum 1.5R.

Short is symmetric with a swept high, bearish FVG and PDL.

## Filters

- ATR must be above its 20-bar average (displacement, not chop).
- Skip if the FVG is already more than 50% filled before entry.
- Skip if a BOS in the opposite direction happened within the last 5 bars.
- Only one trade per window.

## Skeleton

```js
function getSignal(ctx) {
  const atr = ctx.atr();
  const fvg = ctx.smc.fvg.bullish;
  if (atr === null || !fvg) return null;
  const h = ctx.session.hourUtc;
  const inWindow = h === 14 || h === 15 || h === 18 || h === 19;
  if (!inWindow) return null;
  if (ctx.smc.sweep?.side !== 'low' || ctx.smc.sweep.age > 5) return null;
  if (ctx.low > fvg.top || ctx.close < fvg.bottom) return null; // retracing into gap
  const stop = Math.min(fvg.bottom, ctx.smc.sweep.wick) - atr * 0.2;
  const risk = ctx.close - stop;
  if (risk <= 0 || risk > atr * 2.5) return null;
  return {
    side: 'long',
    stop,
    target: ctx.close + risk * 2,
    maxBars: 24,
    reason: 'Silver Bullet FVG',
  };
}
```

## Pitfalls

- Forcing the window on a low-volatility day produces small, noisy trades.
- Do not enter before the FVG exists; the sweep alone is not the setup.
- The 14:00 ET window overlaps the London/NY overlap and often has the cleaner
  displacement.
