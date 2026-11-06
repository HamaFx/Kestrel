-- 0118 — Drop orphaned ai_shadow_comparisons and ai_quality_results tables (Decision 1A).
--
-- Neither table has a production writer: the shadow-comparison experiment and
-- the legacy quality-gate results were retired with the Mastra v2 cutover.
-- Only retention cleanup and account deletion still referenced them, and both
-- references are removed in the same change. CASCADE covers their indexes,
-- RLS policies, and any dependent FKs.

DROP TABLE IF EXISTS "ai_shadow_comparisons" CASCADE;
DROP TABLE IF EXISTS "ai_quality_results" CASCADE;
