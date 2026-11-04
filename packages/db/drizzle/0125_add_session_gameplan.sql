-- 0125 — pre-session gameplan persisted for the AI risk context.
--
-- The dashboard previously kept the trader's daily R cap, mindset, and primary
-- execution rule in localStorage only, where the AI risk context and the AI
-- coach could not see them. The plan is a per-day document: consumers ignore a
-- row whose `date` is not the current UTC day.

ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "session_gameplan" jsonb;
