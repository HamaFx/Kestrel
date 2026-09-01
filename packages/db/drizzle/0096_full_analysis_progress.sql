-- Persisted workflow progress for durable Full-analysis polling.
ALTER TABLE "full_analysis_queue"
  ADD COLUMN IF NOT EXISTS "progress" jsonb NOT NULL DEFAULT '[]'::jsonb;
