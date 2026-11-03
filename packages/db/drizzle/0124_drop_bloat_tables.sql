-- 0124 — Phase 4: drop enterprise bloat tables.
--
-- The runtime no longer has writers or readers for any of these tables:
--
--   persistence_outbox          transactional write-replay queue (Phase 4)
--   eval_datasets               nightly ML training-dataset registry (Phase 4)
--   ai_regression_cases         reviewed-failure ML corpus (Phase 4)
--   memory_projection_state     Drizzle → Mastra derived-memory checkpoint
--   notification_noise_state    cross-instance alert dedup/cooldown cache
--   full_analysis_queue         retired async committee queue (Phase 2)
--   plg_custom_agents(_runs)    removed custom-agents plugin storage (Phase 4)
--
-- Indexes, constraints, RLS policies, and tenant triggers are dropped with
-- each table. `full_analysis_queue` is listed again only so a database that
-- skipped 0123 still converges.

DROP TABLE IF EXISTS "plg_custom_agents_runs";
DROP TABLE IF EXISTS "plg_custom_agents";
DROP TABLE IF EXISTS "persistence_outbox";
DROP TABLE IF EXISTS "eval_datasets";
DROP TABLE IF EXISTS "ai_regression_cases";
DROP TABLE IF EXISTS "memory_projection_state";
DROP TABLE IF EXISTS "notification_noise_state";
DROP TABLE IF EXISTS "full_analysis_queue";
