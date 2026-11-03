# Previous-Day Level Fade

PDH/PDL are the two prices every intraday desk watches. In a range regime the
first touch often produces a reaction; in a trend regime it gets broken. This
playbook only fades the touch when the regime is clearly mean-reverting.

## Setup (short at PDH)

1. Require `ctx.levels.pdh` to be set (a full prior UTC day has closed).
2. Require a range read: `ema50` is within 0.35 ATR14 of `ema200`, or
   `adx14 < 18`.
3. Wait for price to trade into `pdh` and then close back below it. Do not fade
   the first wick.
4. Stop above the rejection high plus 0.25 ATR.
5. Target the session midpoint, PDL for a full retrace, or 2R, whichever comes
   first.

Long at PDL is symmetric: close back above `pdl`, stop below the rejection low,
target PDH.

## Filters

- Skip when the day has already expanded more than 1.5× the 20-bar average
  range; late-day fades are poor.
- Skip if price broke the level with a wide-range close (trend signal).
- Require at least 1.5R to the chosen target.

## Why this survives

The level is objective and public, so the entry, stop and target are all
discoverable in advance. The regime filter is what keeps it from becoming a
"fade every breakout" system, which is the usual failure mode.
