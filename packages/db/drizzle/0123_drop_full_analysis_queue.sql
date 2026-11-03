-- 0123 — Phase 2: retire the durable Full-analysis queue.
--
-- `full` committee mode now streams directly over SSE in the `/api/chat`
-- request (one parallel wave of four specialist desks + one fusion call), so
-- the async `full_analysis_queue` polling system has no writers or readers.
-- The web route, worker job, and query layer that owned this table are gone.
--
-- The table's indexes and its tenant trigger are dropped with it.

DROP TABLE IF EXISTS "full_analysis_queue";
