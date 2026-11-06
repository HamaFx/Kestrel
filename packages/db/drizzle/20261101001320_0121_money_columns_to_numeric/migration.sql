-- 0121 — Exact money: move cost, balance, P&L, fee, size and journal-level
-- columns from IEEE-754 floats to `numeric(20, 8)`.
--
-- Audit 2026-10-31 (R2). Every money-like column in this schema was
-- `double precision` (or `real` for `agent_opinions.cost_usd`, ~7 significant
-- digits). Warehousing prices as floats is industry-standard and stays that
-- way (`candles_1m`, `live_ticks`, indicators); *accumulating* them is not.
-- `balance = balance + $1`, `SUM(est_cost_usd)` and lifetime P&L drift under
-- binary floating point and cannot be compared exactly. The project already
-- proved the right pattern with the integer-cent AI budget ledger
-- (0057 -> 0089); this applies the same principle to the money columns that
-- were left behind.
--
-- Columns converted, by area:
--   * AI cost     — chat_telemetry.est_cost_usd (summed in SQL for the usage
--                   report and the monthly BYOK spend), agent_opinions.cost_usd
--                   (was `real`), plg_custom_agents_runs.cost_usd
--   * Paper trade — plg_paper_trading_accounts (initial_balance, balance,
--                   leverage, risk_per_trade_pct), _positions (quantity,
--                   initial_quantity, entry_price, all protection levels,
--                   initial_risk_amount, unrealized_pnl, realized_pnl,
--                   entry_fee, exit_fee, close_price), _orders (quantity,
--                   risk_pct, trigger/bracket prices, filled_price), _fills
--                   (price, quantity, pnl, fees), _strategy_runs (risk_pct)
--   * Journal     — journal_entries.entry/stop/target/exit/size/r_multiple
--   * Backtesting — plg_backtesting_runs.initial_balance/final_equity,
--                   plg_backtesting_sweeps.initial_balance/risk_pct/best_score
--
-- Precision: `numeric(20, 8)` throughout — 12 digits of dollars/lots and 8 of
-- fraction (max 999 999 999 999.99999999), matching the published convention
-- for accumulated money. The dimensionless ratio columns (leverage,
-- risk_per_trade_pct, risk_pct, break_even_at_r, best_score) deliberately
-- share the type so there is exactly one money-adjacent convention to reason
-- about; none of them needs a different scale.
--
-- Existing rows are preserved: every conversion is an explicit
-- `USING <col>::numeric(20, 8)` assignment cast, which for `float8`/`real`
-- goes through PostgreSQL's shortest-round-trip text form (0.1 stays 0.1).
-- Column defaults and CHECK constraints are carried over by `ALTER COLUMN
-- TYPE`; nothing is dropped.
--
-- JS-facing note: the Drizzle schema declares these columns as
-- `numeric(20, 8, { mode: 'number' })` (drizzle-orm >= 0.45), so reads still
-- map to JS `number` and no application call site changed shape. Exactness is
-- a property of the column inside PostgreSQL: arithmetic that accumulates
-- must keep happening in SQL (`balance = balance + $1`, `SUM(...)`), as the
-- paper broker already does after the R6 fix. A JS `number` at the boundary
-- is a lossy view of the exact stored value, which is fine for display and
-- decisions and is why no accumulating arithmetic may move back to JS.
--
-- Also adds `plg_paper_trading_accounts_balance_nonnegative_check`
-- (`balance >= 0`), the floor that `incrementAccountBalance`'s `GREATEST`
-- already implements in the R6 fix. It is added `NOT VALID` so an upgrade
-- cannot fail on a pre-R6 row that was driven negative; it is enforced for
-- every new insert/update immediately. An operator who confirms no such row
-- exists can `ALTER TABLE ... VALIDATE CONSTRAINT` it.
--
-- Rollback. First drop the floor, then mirror every ALTER COLUMN TYPE with
-- `TYPE double precision USING <col>::double precision` (and
-- `agent_opinions.cost_usd` back to `TYPE real`), and finally remove this
-- migration's ledger row so the migrator would consider it unapplied:
--
--   ALTER TABLE "plg_paper_trading_accounts"
--     DROP CONSTRAINT "plg_paper_trading_accounts_balance_nonnegative_check";
--   -- per column, e.g.:
--   ALTER TABLE "chat_telemetry"
--     ALTER COLUMN "est_cost_usd" TYPE double precision USING "est_cost_usd"::double precision;
--   DELETE FROM drizzle."__drizzle_migrations" WHERE created_at = 1793492000000;
--
-- The rollback is schema-only and lossy: a value that needs more than float8's
-- ~15 significant digits cannot round-trip, which is the point of the change.
-- Reverting the code (Drizzle schema + this file + journal entry) is the
-- operator's responsibility; leaving the columns numeric while the schema
-- says float is harmless at runtime but wrong by convention.

-- ── AI cost ───────────────────────────────────────────────────────────────

ALTER TABLE "chat_telemetry"
  ALTER COLUMN "est_cost_usd" TYPE numeric(20, 8) USING "est_cost_usd"::numeric(20, 8);
--> statement-breakpoint

ALTER TABLE "agent_opinions"
  ALTER COLUMN "cost_usd" TYPE numeric(20, 8) USING "cost_usd"::numeric(20, 8);
--> statement-breakpoint

ALTER TABLE "plg_custom_agents_runs"
  ALTER COLUMN "cost_usd" TYPE numeric(20, 8) USING "cost_usd"::numeric(20, 8);
--> statement-breakpoint

-- ── Paper trading: accounts ───────────────────────────────────────────────

ALTER TABLE "plg_paper_trading_accounts"
  ALTER COLUMN "initial_balance" TYPE numeric(20, 8) USING "initial_balance"::numeric(20, 8),
  ALTER COLUMN "balance" TYPE numeric(20, 8) USING "balance"::numeric(20, 8),
  ALTER COLUMN "leverage" TYPE numeric(20, 8) USING "leverage"::numeric(20, 8),
  ALTER COLUMN "risk_per_trade_pct" TYPE numeric(20, 8) USING "risk_per_trade_pct"::numeric(20, 8);
--> statement-breakpoint

ALTER TABLE "plg_paper_trading_accounts"
  ADD CONSTRAINT "plg_paper_trading_accounts_balance_nonnegative_check"
  CHECK ("balance" >= 0) NOT VALID;
--> statement-breakpoint

-- ── Paper trading: positions ──────────────────────────────────────────────

ALTER TABLE "plg_paper_trading_positions"
  ALTER COLUMN "quantity" TYPE numeric(20, 8) USING "quantity"::numeric(20, 8),
  ALTER COLUMN "initial_quantity" TYPE numeric(20, 8) USING "initial_quantity"::numeric(20, 8),
  ALTER COLUMN "entry_price" TYPE numeric(20, 8) USING "entry_price"::numeric(20, 8),
  ALTER COLUMN "stop_loss" TYPE numeric(20, 8) USING "stop_loss"::numeric(20, 8),
  ALTER COLUMN "take_profit" TYPE numeric(20, 8) USING "take_profit"::numeric(20, 8),
  ALTER COLUMN "trailing_stop_distance" TYPE numeric(20, 8) USING "trailing_stop_distance"::numeric(20, 8),
  ALTER COLUMN "trailing_stop_price" TYPE numeric(20, 8) USING "trailing_stop_price"::numeric(20, 8),
  ALTER COLUMN "break_even_at_r" TYPE numeric(20, 8) USING "break_even_at_r"::numeric(20, 8),
  ALTER COLUMN "initial_risk_amount" TYPE numeric(20, 8) USING "initial_risk_amount"::numeric(20, 8),
  ALTER COLUMN "unrealized_pnl" TYPE numeric(20, 8) USING "unrealized_pnl"::numeric(20, 8),
  ALTER COLUMN "realized_pnl" TYPE numeric(20, 8) USING "realized_pnl"::numeric(20, 8),
  ALTER COLUMN "entry_fee" TYPE numeric(20, 8) USING "entry_fee"::numeric(20, 8),
  ALTER COLUMN "exit_fee" TYPE numeric(20, 8) USING "exit_fee"::numeric(20, 8),
  ALTER COLUMN "close_price" TYPE numeric(20, 8) USING "close_price"::numeric(20, 8);
--> statement-breakpoint

-- ── Paper trading: orders ─────────────────────────────────────────────────

ALTER TABLE "plg_paper_trading_orders"
  ALTER COLUMN "quantity" TYPE numeric(20, 8) USING "quantity"::numeric(20, 8),
  ALTER COLUMN "risk_pct" TYPE numeric(20, 8) USING "risk_pct"::numeric(20, 8),
  ALTER COLUMN "limit_price" TYPE numeric(20, 8) USING "limit_price"::numeric(20, 8),
  ALTER COLUMN "stop_price" TYPE numeric(20, 8) USING "stop_price"::numeric(20, 8),
  ALTER COLUMN "stop_loss" TYPE numeric(20, 8) USING "stop_loss"::numeric(20, 8),
  ALTER COLUMN "take_profit" TYPE numeric(20, 8) USING "take_profit"::numeric(20, 8),
  ALTER COLUMN "trailing_stop_distance" TYPE numeric(20, 8) USING "trailing_stop_distance"::numeric(20, 8),
  ALTER COLUMN "break_even_at_r" TYPE numeric(20, 8) USING "break_even_at_r"::numeric(20, 8),
  ALTER COLUMN "filled_price" TYPE numeric(20, 8) USING "filled_price"::numeric(20, 8);
--> statement-breakpoint

-- ── Paper trading: fills ──────────────────────────────────────────────────

ALTER TABLE "plg_paper_trading_fills"
  ALTER COLUMN "price" TYPE numeric(20, 8) USING "price"::numeric(20, 8),
  ALTER COLUMN "quantity" TYPE numeric(20, 8) USING "quantity"::numeric(20, 8),
  ALTER COLUMN "pnl" TYPE numeric(20, 8) USING "pnl"::numeric(20, 8),
  ALTER COLUMN "fees" TYPE numeric(20, 8) USING "fees"::numeric(20, 8);
--> statement-breakpoint

-- ── Paper trading: deployed strategy runs ─────────────────────────────────

ALTER TABLE "plg_paper_trading_strategy_runs"
  ALTER COLUMN "risk_pct" TYPE numeric(20, 8) USING "risk_pct"::numeric(20, 8);
--> statement-breakpoint

-- ── Trade journal ─────────────────────────────────────────────────────────

ALTER TABLE "journal_entries"
  ALTER COLUMN "entry" TYPE numeric(20, 8) USING "entry"::numeric(20, 8),
  ALTER COLUMN "stop" TYPE numeric(20, 8) USING "stop"::numeric(20, 8),
  ALTER COLUMN "target" TYPE numeric(20, 8) USING "target"::numeric(20, 8),
  ALTER COLUMN "exit" TYPE numeric(20, 8) USING "exit"::numeric(20, 8),
  ALTER COLUMN "size" TYPE numeric(20, 8) USING "size"::numeric(20, 8),
  ALTER COLUMN "r_multiple" TYPE numeric(20, 8) USING "r_multiple"::numeric(20, 8);
--> statement-breakpoint

-- ── Backtesting ───────────────────────────────────────────────────────────

ALTER TABLE "plg_backtesting_runs"
  ALTER COLUMN "initial_balance" TYPE numeric(20, 8) USING "initial_balance"::numeric(20, 8),
  ALTER COLUMN "final_equity" TYPE numeric(20, 8) USING "final_equity"::numeric(20, 8);
--> statement-breakpoint

ALTER TABLE "plg_backtesting_sweeps"
  ALTER COLUMN "initial_balance" TYPE numeric(20, 8) USING "initial_balance"::numeric(20, 8),
  ALTER COLUMN "risk_pct" TYPE numeric(20, 8) USING "risk_pct"::numeric(20, 8),
  ALTER COLUMN "best_score" TYPE numeric(20, 8) USING "best_score"::numeric(20, 8);
