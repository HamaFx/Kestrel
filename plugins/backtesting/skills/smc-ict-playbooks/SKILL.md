---
name: smc-ict-playbooks
description: Institutional Smart Money (ICT/SMC) playbooks for liquidity sweeps, fair value gaps, order blocks and killzone timing.
---

# SMC / ICT Playbooks

These are implementation notes, not dogma. Every playbook below can be expressed
with `ctx.smc`, `ctx.session` and the TA series — no external data is needed.

## Core ideas

1. **Liquidity rests beyond obvious highs/lows.** Stops cluster above swing
   highs and below swing lows. A wick through them that closes back inside is a
   sweep (`ctx.smc.sweep`).
2. **Displacement leaves imbalances.** A three-bar fair value gap
   (`ctx.smc.fvg`) marks a price area the market may revisit.
3. **The last opposing candle before displacement is an order block**
   (`ctx.smc.orderBlock`). It is a reference for entries and stops.
4. **Structure tells you the regime.** BOS = continuation; CHoCH = possible
   reversal (`ctx.smc.structure`).
5. **Time matters.** The same pattern behaves differently in the Asian range,
   London open and New York open (`ctx.session`).

## Available playbooks

- `references/silver-bullet.md` — time-boxed FVG continuation after a sweep.
- `references/judas-swing.md` — London-open false move and reversal.
- `references/fvg-ob-confluence.md` — FVG + order block + structure alignment.
- `references/turtle-soup.md` — failed breakout of a prior range extreme.

## Universal rules

- **Always wait for a close.** A wick through a level is not a sweep until the
  bar closes back inside.
- **Stop goes beyond the invalidation**, not at a round number: beyond the sweep
  wick, the far edge of the order block, or the FVG's far side plus a small ATR
  buffer.
- **Target the opposite liquidity**, not an arbitrary 2R. If the nearest swing
  high is only 1R away, skip the trade.
- **Session filter:** most SMC setups are London or New York. Asian-session
  breakouts are lower quality for gold/FX.
- **Avoid the first minutes of an open.** Let the opening range print; our
  bar-close model already helps.
- **One setup per leg.** Do not re-enter the same sweep repeatedly.

## Minimal sweep-reversal skeleton

```js
function getSignal(ctx) {
  const atr = ctx.atr();
  if (atr === null) return null;
  const sweep = ctx.smc.sweep;
  if (!sweep || sweep.age > 3) return null;
  if (!ctx.session.londonOpenKillzone && !ctx.session.newYorkOpenKillzone) return null;

  // Sweep of a low that closes back above it → bullish reversal.
  if (sweep.side === 'low' && ctx.close > sweep.level) {
    const stop = Math.min(ctx.low, sweep.wick) - atr * 0.25;
    const risk = ctx.close - stop;
    if (risk <= 0) return null;
    const target =
      ctx.smc.swingHigh && ctx.smc.swingHigh > ctx.close + risk * 1.5
        ? ctx.smc.swingHigh
        : ctx.close + risk * 2;
    return { side: 'long', stop, target, reason: 'Liquidity sweep reversal', tags: ['smc'] };
  }
  return null;
}
```
