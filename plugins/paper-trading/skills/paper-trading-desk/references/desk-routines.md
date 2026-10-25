# Paper desk routines

## Morning brief

1. `paper_get_accounts` — equity, open P&L, margin.
2. `paper_list_positions({ status:'open' })` — per-symbol exposure and R.
3. `paper_list_orders({ status:'pending' })` — resting triggers.
4. `get_price` for each open symbol (or `get_candles` if the user wants context).
5. Summarise: total equity, open risk, positions that are near their stop or
   target, and any order that is likely to trigger today.

## Position review

For each open position:

- Is the original thesis still valid?
- Is the stop beyond structure (not just an arbitrary distance)?
- Has the trade reached 1R? If so, consider breakeven.
- Is there a nearby opposing level that justifies a partial?
- Is the position size still appropriate relative to equity?

## Deploying a backtest idea

1. Run the strategy in the Backtesting Lab first.
2. If the scorecard is acceptable, ask the user whether to trade it in the
   **Sandbox** (autonomous) or **Personal** (approve each order).
3. Place the first order with a structural stop and a defined target.
4. Never deploy a strategy that only survives at zero costs.

## End-of-day

- Close or cancel anything the user does not want to hold overnight.
- Reconcile open positions with the Journal.
- Report realised P&L, open P&L and the largest risk still on the book.
