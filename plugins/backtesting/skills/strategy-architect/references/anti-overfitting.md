# Iterating without fooling yourself

A backtest is an experiment, not a result. The fastest way to produce a
beautiful, useless curve is to tweak parameters until the past looks good.

## Rules

1. **One change per run.** Change entry logic, stop logic, or filters — not all
   three. Otherwise you cannot attribute the difference.
2. **Hold out data.** If the user is iterating on 2025–2026, keep the last
   20–30% of bars untouched until the logic is stable. Run the final version on
   the holdout once.
3. **Prefer few parameters.** A strategy with 2–3 tunables is robust; one with
   12 is a curve-fit.
4. **Test neighbouring symbols/timeframes.** A gold 15m edge that disappears on
   30m or EURUSD is probably noise.
5. **Costs up, not down.** If an edge only survives at zero spread, it is not
   an edge.
6. **Report the bad runs.** If three variants failed, say so. The user is
   paying for judgement, not a sales pitch.
7. **Do not optimise on drawdown alone.** Cutting risk to 0.1% makes every
   curve smooth and every strategy meaningless.

## Red flags in a result

- 90%+ win rate with tiny average wins and one huge loss.
- Most trades exit at `max_bars` or `end_of_data`.
- Performance concentrated in one week or one session.
- Identical results before and after costs (costs were not applied).
- A strategy that only works with the stop at an exact 1.37 ATR.

## A good iteration note

> Base version: London sweep + FVG, 812 trades, PF 1.18, maxDD 22%. Removing the
> Asian-session filter improved PF to 1.31 but doubled drawdown to 31%; I kept
> the filter. Raising the target from 2R to 2.5R reduced trades by 18% and
> improved expectancy from 0.08R to 0.14R. This is still a small edge and the
> 2026 window is only ~4 months of data.
