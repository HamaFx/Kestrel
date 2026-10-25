# FVG + Order Block Confluence

The highest-quality SMC entries happen when an order block, a fair value gap and
the prevailing structure all point the same way.

## Confluence checklist (long)

- [ ] `ctx.smc.structure.direction === 'bullish'` or a fresh bullish CHoCH.
- [ ] `ctx.smc.orderBlock.bullish` exists below price and is unmitigated.
- [ ] `ctx.smc.fvg.bullish` overlaps or sits just above the order block.
- [ ] Price is retracing into the zone, not chasing above it.
- [ ] Session is London or New York.
- [ ] Stop below the order block bottom; target the prior swing high/PDH.

Short is symmetric.

## Entry styles

1. **Limit at the FVG top** (long) with `validBars: 6–10`. Best fill, but some
   setups never trigger.
2. **Market on a bullish close inside the zone.** More confirmations, worse
   price. Use when the FVG is large.
3. **Break of the zone's midpoint** for momentum entries. Lower R, higher win
   rate.

## Skeleton

```js
function getSignal(ctx) {
  const atr = ctx.atr();
  const ob = ctx.smc.orderBlock.bullish;
  const fvg = ctx.smc.fvg.bullish;
  const structure = ctx.smc.structure;
  if (atr === null || !ob || !fvg) return null;
  if (!structure || structure.direction !== 'bullish') return null;
  if (!ctx.session.london && !ctx.session.newYork) return null;

  const zoneTop = Math.min(ob.top, fvg.top);
  const zoneBottom = Math.max(ob.bottom, fvg.bottom);
  if (zoneTop <= zoneBottom) return null; // no overlap
  if (ctx.close > zoneTop || ctx.close < zoneBottom) return null;

  const stop = Math.min(ob.bottom, fvg.bottom) - atr * 0.2;
  const risk = ctx.close - stop;
  if (risk <= 0 || risk > atr * 3) return null;

  return {
    side: 'long',
    stop,
    target: ctx.smc.swingHigh || ctx.close + risk * 2,
    maxBars: 36,
    reason: 'FVG + OB confluence',
    tags: ['smc', 'confluence'],
  };
}
```

## Invalidation

- A close below the order block bottom invalidates the bullish idea. The engine
  already removes mitigated blocks from `ctx.smc`, but your stop should still be
  beyond the block.
- If the FVG fills completely before entry, the confluence is gone.
- If structure flips bearish (CHoCH) while price is in the zone, skip.

## Pitfalls

- Overlapping every FVG with every order block produces too many signals. Demand
  that the zone is near the current price (within ~1 ATR).
- Do not use the order block's high as the stop for a long; use its low.
- A confluence entry with a 0.3 ATR stop will be stopped by noise. Minimum stop
  is usually 1 ATR.
