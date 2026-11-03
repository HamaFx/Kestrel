---
name: session-level-playbooks
description: Session and swing-level playbooks built on objective price extremes — Asian range, previous-day high/low and confirmed swing pivots.
---

# Session Level Playbooks

These playbooks use only levels the engine can prove: confirmed swing pivots,
the previous UTC day's high/low, and the Asian session range. No zone
detectors, no subjective labels. Every rule maps to `ctx.levels`,
`ctx.session` and the TA series.

## Core ideas

1. **Session extremes are reference prices.** The Asian range (00:00–07:00
   UTC) sets a tight box; London and New York traders resolve it. PDH/PDL are
   the levels the previous day's auction left behind.
2. **Swing pivots are confirmed support/resistance.** `ctx.levels.swingHigh` and
   `ctx.levels.swingLow` only update after the confirmation bars close, so they
   are safe to trade against.
3. **Trend decides direction, the level decides location.** Use EMA stack and
   ADX for regime; use the level for entry and invalidation.
4. **Time matters.** The same breakout behaves differently in the Asian range,
   London open and New York open (`ctx.session`).

## Available playbooks

- `references/asian-range-breakout.md` — resolve the Asian box after 07:00 UTC.
- `references/previous-day-level-fade.md` — first touch of PDH/PDL in a range.
- `references/swing-level-trend-pullback.md` — buy the dip at a confirmed swing
  low inside an uptrend.

## Universal rules

- **Always wait for a close.** A wick through a level is not a break until the
  bar closes beyond it.
- **Stop goes beyond the invalidation**, not at a round number: beyond the
  session extreme or the swing pivot plus a small ATR buffer.
- **Target the next objective level**, not an arbitrary 2R. If the nearest swing
  high is only 1R away, skip the trade.
- **Session filter:** most level breakouts are London or New York. Asian-session
  breakouts are lower quality for gold/FX.
- **One setup per leg.** Do not re-enter the same level repeatedly.
- **Gate on warm-up.** `ctx.levels.pdh` is `0` until a full prior day has closed.

## Minimal session breakout skeleton

```js
function getSignal(ctx) {
  const atr = ctx.atr();
  if (atr === null) return null;
  const rangeHigh = ctx.levels.asianHigh;
  const rangeLow = ctx.levels.asianLow;
  if (!rangeHigh || !rangeLow) return null;
  if (!ctx.session.londonOpenKillzone) return null;
  if (ctx.close <= rangeHigh) return null;

  const stop = rangeLow - atr * 0.25;
  const risk = ctx.close - stop;
  if (risk <= 0) return null;

  return {
    side: 'long',
    stop,
    target:
      ctx.levels.pdh && ctx.levels.pdh > ctx.close + risk * 1.5
        ? ctx.levels.pdh
        : ctx.close + risk * 2,
    maxBars: 24,
    reason: 'London breakout of the Asian range',
    tags: ['session', 'breakout'],
  };
}
```
