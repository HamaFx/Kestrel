---
name: quant-playbooks
description: Classic quantitative playbooks — volatility squeeze, ATR breakout and trend pullback — implementable with the Backtesting Lab series.
---

# Quantitative Playbooks

These are robust, well-documented starting points. They are not guarantees; the
point is to test them on the user's symbol/timeframe with realistic costs.

## Available playbooks

- `references/bollinger-keltner-squeeze.md` — volatility compression, expansion
  breakout.
- `references/atr-volatility-breakout.md` — Donchian/ATR breakout with a trend
  filter.
- `references/rsi-regime-pullback.md` — buy dips in an uptrend, sell rallies in
  a downtrend.

## Universal rules

- **Trend filter first.** Most long-only breakout systems fail in a downtrend.
  Use `ema200` or `supertrendDirection`.
- **Stops from volatility.** ATR-based stops adapt to regime; fixed pip stops
  do not.
- **One entry per signal leg.** If a breakout fails, wait for the next range.
- **Costs are part of the strategy.** A 5-minute breakout with 2 pips spread
  needs a much larger edge than a 4-hour swing system.
- **Test two windows.** A strategy that only works on the last 300 bars is a
  curve-fit.

## Combining SMC and quant

SMC gives location (where), quant gives regime (when). A common high-quality
combination is:

- Regime: `ema50 > ema200` and `adx14 > 20`.
- Location: price retraces into a bullish FVG or order block.
- Trigger: bullish close / RSI cross back above 40.
- Stop: below the zone, ATR-buffered.
