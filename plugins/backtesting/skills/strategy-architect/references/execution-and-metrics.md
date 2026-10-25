# Execution semantics and scorecard

## Fills and costs

- A signal is produced at a bar **close**. A market entry fills at the next
  bar's open. Nothing fills on the bar that produced it.
- A limit entry fills when the next bars trade through the limit. If the bar
  opens beyond the limit, the open is used (better fill). If it never trades
  there within `validBars`, the signal is rejected as expired.
- Long entry pays `+halfSpread + slippage`; long exit receives
  `-halfSpread - slippage`. Shorts are symmetric.
- Commission is charged per unit on both entry and exit.
- On a bar that touches both stop and target, the stop is assumed first. This
  is deliberately pessimistic.
- A gap through the stop fills at the open, not the stop level.
- Trailing/breakeven updates happen at the bar close and apply to the next bar.
- One position at a time. Pending entries block new signals.

## Position sizing

```
riskBudget = equity * riskPct / 100
quantity   = riskBudget / (|entry - stop| * contractSize)
maxQty     = equity * leverage / (entry * contractSize)
quantity   = min(quantity, maxQty)
```

`quantity` is lots for FX/gold and coins for crypto. `contractSize` comes from
the Kestrel symbol catalog (FX 100,000; gold 100; crypto 1).

## Metrics

| Metric                           | Meaning                                            |
| -------------------------------- | -------------------------------------------------- |
| `trades`                         | Closed trades                                      |
| `winRate`                        | Winners ÷ trades, %                                |
| `profitFactor`                   | Gross profit ÷ gross loss                          |
| `netPnl` / `returnPct`           | Account-currency and % return                      |
| `expectancy` / `expectancyR`     | Average P&L and average R per trade                |
| `averageWinR` / `averageLossR`   | Mean R of winners / losers                         |
| `maxDrawdown` / `maxDrawdownPct` | Peak-to-trough on mark-to-market equity            |
| `maxDrawdownBars`                | Longest peak-to-trough duration                    |
| `sharpeRatio` / `sortinoRatio`   | Per-trade scores × √trades; not annualised         |
| `exposurePct`                    | Bars with an open position ÷ total bars            |
| `mfe` / `mae`                    | Best/worst excursion in R while the trade was open |
| `consecutiveWins/Losses`         | Longest streaks                                    |

The equity curve is mark-to-market at every bar, so drawdown includes open
positions, not just closed P&L.

## Reading a result

- **< 20 trades:** anecdotal. Do not claim an edge.
- **Profit factor < 1.2** at realistic costs: not compelling.
- **Max drawdown > 20–25%** on a 1% risk model usually means the stop logic is
  too tight or the strategy is over-leveraged.
- **Win rate alone is meaningless.** A 35% win rate with 2.5R winners is fine.
- **Check exit reasons.** If most exits are `end_of_data`/`max_bars`, the
  target/trailing logic is not doing the work.
- **Long/short asymmetry** may be a regime artifact. Test the other side of the
  window before concluding.
- **Fees** matter. If `feesPaid` is a large share of gross profit, reduce trade
  frequency.
