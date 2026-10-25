# Order, sizing and risk reference

## Units

- FX and gold: `quantity` is **lots**. XAUUSD 1 lot = 100 oz; EURUSD 1 lot =
  100,000 EUR. `contractSize` comes from the Kestrel symbol catalog.
- Crypto: `quantity` is coins.
- P&L = price difference × quantity × contractSize × direction.

## Sizing

```
riskBudget = equity × riskPct / 100
quantity   = riskBudget / (|entry − stop| × contractSize)
margin     = quantity × entry × contractSize / leverage
```

Constraints:

- `riskPct` ≤ `maxRiskPct` (default 2%).
- `margin` ≤ freeMargin × maxMarginUtilisationPct (default 50%).
- open + pending trades ≤ `maxOpenPositions` (default 10).
- A stop is required unless `requireStopLoss` is disabled.

## Order types

| Type     | Behaviour                                                                                |
| -------- | ---------------------------------------------------------------------------------------- |
| `market` | Fills immediately at ask (buy) or bid (sell) + slippage.                                 |
| `limit`  | Buy fills when ask ≤ limit; sell when bid ≥ limit. Better gaps fill at the market price. |
| `stop`   | Buy fills when ask ≥ trigger; sell when bid ≤ trigger. Slippage is added.                |

`timeInForce: 'day'` expires at the next UTC midnight; `gtc` rests until filled
or cancelled.

## Protection

- `stopLoss` / `takeProfit` are absolute prices.
- `trailingStop` is a **price distance**. Long: stop = bid − distance, ratcheting
  up only. Short: stop = ask + distance, ratcheting down only.
- `breakEvenAtR` moves the stop to entry once the trade reaches that R.
- Intrabar stop-vs-target ambiguity is resolved in favour of the stop.

## Costs

- Synthetic spread is applied when the feed returns mid-only quotes
  (`spreadPips`, default 2).
- Slippage is applied to market and stop fills (`slippagePips`, default 0.5).
- Commission is charged per unit per side (`commissionPerUnit`, default 0).
- Entry fees are reflected in unrealised P&L; exit fees are charged on close.
