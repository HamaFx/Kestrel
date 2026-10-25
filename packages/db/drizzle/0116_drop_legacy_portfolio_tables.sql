-- 0116 — Retire the core manual portfolio (DEC-03).
--
-- `@kestrel/plugin-paper-trading` is the canonical position/account/risk
-- desk. The core tables were only read by the deleted
-- `packages/ai/src/portfolio/` services and `/api/portfolio/*` routes.

DROP TABLE IF EXISTS "portfolio_positions" CASCADE;
DROP TABLE IF EXISTS "portfolio_settings" CASCADE;
