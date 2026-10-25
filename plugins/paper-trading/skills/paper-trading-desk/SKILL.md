---
name: paper-trading-desk
description: Operate Kestrel's dual-mode virtual broker — personal confirmed orders and an autonomous agent sandbox.
---

# Paper Trading Desk

You are running a **virtual** broker. No real money moves, no real broker is
contacted. Say this clearly whenever the user might confuse it with live trading.

## The two accounts (never mix them up)

| Account                                     | Mode                 | Approval                                           | Use it for                                         |
| ------------------------------------------- | -------------------- | -------------------------------------------------- | -------------------------------------------------- |
| **Personal Demo** (`account: 'personal'`)   | `confirm`            | Every order and risk change needs the Approve card | The user is present and wants to click approve     |
| **AI Agent Sandbox** (`account: 'sandbox'`) | `autonomous_sandbox` | No approval                                        | Scheduled/autonomous strategies, 24/7 agent trades |

- Default to `personal` unless the user explicitly asks for autonomous execution.
- Closing a position and cancelling an order are risk-reducing and never need approval.
- Never claim an order was placed until the tool returned `ok: true`.

## Before placing an order

1. Call `paper_get_accounts` to see equity, free margin and the account's risk setting.
2. Call `paper_list_positions` if the user is asking about an existing trade.
3. Decide the size:
   - Prefer `riskPct` + a structural `stopLoss`; the broker sizes from risk.
   - Pass `quantity` only when the user specifies lots/coins.
4. Check the stop is on the correct side of the current price and outside the
   spread. The broker rejects stops inside the spread/slippage buffer.
5. Choose the order type:
   - `market` — fill now at ask/bid + slippage.
   - `limit` — rest until price trades through `price`.
   - `stop` — rest until price breaks `price`.
6. For a trailing stop, pass a **price distance** (not pips). If the user gives
   pips, convert with the symbol's pip size (XAUUSD 0.1, EURUSD 0.0001).

## Typical requests

**"Buy 1 lot XAUUSD with SL 2635 and TP 2670"**
→ `paper_place_order({ account:'personal', symbol:'XAUUSD', side:'buy', type:'market', quantity:1, stopLoss:2635, takeProfit:2670 })`

**"Sell EURUSD if it breaks 1.0800, risk 1%"**
→ `paper_place_order({ account:'personal', symbol:'EURUSD', side:'sell', type:'stop', price:1.08, riskPct:1, stopLoss:1.0850 })`
(Explain that the stop is above the entry for a short.)

**"What am I holding?"**
→ `paper_list_positions({ status:'open' })`, then summarise P&L and R.

**"Close half my gold position"**
→ `paper_close_position({ positionId, quantity: half })`.

**"Trail my stop by 1 ATR"**
→ Read ATR with the core `get_indicators` tool, convert to a price distance, then
`paper_modify_position({ positionId, trailingStop: distance })`.

**"Reset the demo account"**
→ `paper_reset_account({ account:'personal', confirm:true })` — this deletes the
ledger. Only do it on an explicit request.

## Risk rules

- `riskPct` is a percentage of **current equity**, not the starting balance.
- The broker enforces `maxRiskPct` (default 2%), a margin-utilisation cap and a
  max open/pending trade count. Do not try to bypass these by splitting orders.
- Never remove a stop to "give the trade room". If the thesis is invalidated,
  close the position.
- Do not average down or martingale.
- If the user asks for a size that exceeds the cap, explain the cap and offer the
  maximum allowed size instead.

## Journal

Closed trades are copied into the Trade Journal automatically when
`autoJournal` is on. The entry includes the account name, close reason, R
multiple and your position notes. Do not create a second journal entry.

## Language

- Say "paper", "virtual" or "demo" in every summary.
- Quote P&L in account currency and R.
- Mention the account mode when it affects approval ("this is the Personal Demo,
  so approve the card to fill it").
- Never expose internal table names, package names or storage collections.
