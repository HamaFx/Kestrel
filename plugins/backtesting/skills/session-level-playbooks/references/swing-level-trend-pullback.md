# Swing-Level Trend Pullback

Trend continuation, located at a confirmed swing pivot. This is the classic
"buy the dip" structure, made mechanical by using only levels the engine can
prove.

## Setup (long)

1. Regime: `ema20 > ema50 > ema200` and `adx14 > 18`.
2. Location: `ctx.levels.swingLow` is set and sits within 1 ATR14 of the current
   close.
3. Trigger: a bullish close (close in the top third of the bar's range) while
   the low holds above `swingLow`.
4. Stop below `swingLow` minus 0.5 ATR.
5. Target the most recent `swingHigh` when it offers at least 1.5R, otherwise
   2R.
6. Time stop after 20–40 bars.

Short is symmetric with `ema20 < ema50 < ema200` and `swingHigh` overhead.

## Filters

- Skip when `swingLow` is stale: if the level has not updated in more than 50
  bars, the structure is no longer fresh.
- Skip when RSI14 is above 75 on the trigger bar; late entries into stretched
  moves have poor expectancy.
- One attempt per swing pivot.

## Notes

The pivot waits for its right-hand lookback before appearing, so entries are
always slightly late. That lag is the price of not repainting, and it keeps
the backtest honest.
