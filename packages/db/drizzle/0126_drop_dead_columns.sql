-- 0126 — drop dead user_settings and symbol_catalog columns.
--
-- `monthlyBudgetLimit`, `providerSpendingThresholds`, `spendAlertsConfig`, and
-- `spendAlertsState` only fed the uncalled monthly spend-alert sweep. The
-- daily budget ledger (`daily_ai_spend`) and `maxDailyUsd` are the only spend
-- controls kestrel enforces, so the monthly/provider alert columns are removed
-- together with the admin field that wrote them.
--
-- `n_data_symbol` was a stale numeric-data vendor mapping; every adapter uses
-- the `biquote` / `binance` / `finnhub` catalog fields instead.

ALTER TABLE "user_settings"
  DROP COLUMN IF EXISTS "monthly_budget_limit",
  DROP COLUMN IF EXISTS "provider_spending_thresholds",
  DROP COLUMN IF EXISTS "spend_alerts_config",
  DROP COLUMN IF EXISTS "spend_alerts_state";

ALTER TABLE "symbol_catalog" DROP COLUMN IF EXISTS "n_data_symbol";
