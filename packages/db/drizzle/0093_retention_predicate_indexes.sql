-- 0093: Index retention predicates on operational tables.
--
-- These partial/time indexes keep the daily bounded cleanup scans index-backed
-- as operational tables grow, without indexing active or retryable rows that
-- retention must preserve.

CREATE INDEX IF NOT EXISTS "rate_limits_window_start_idx"
  ON "rate_limits" ("window_start");

CREATE INDEX IF NOT EXISTS "provider_daily_quota_day_idx"
  ON "provider_daily_quota" ("day");

CREATE INDEX IF NOT EXISTS "cron_runs_started_at_idx"
  ON "cron_runs" ("started_at");

CREATE INDEX IF NOT EXISTS "persistence_outbox_terminal_updated_idx"
  ON "persistence_outbox" ("updated_at")
  WHERE "status" IN ('completed', 'dead');

CREATE INDEX IF NOT EXISTS "full_analysis_queue_terminal_completed_idx"
  ON "full_analysis_queue" ("completed_at")
  WHERE "status" IN ('succeeded', 'failed', 'cancelled', 'blocked')
    AND "completed_at" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "billing_webhook_dlq_replayed_at_idx"
  ON "billing_webhook_dlq" ("replayed_at")
  WHERE "status" = 'replayed' AND "replayed_at" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "ai_budget_reservations_terminal_resolved_idx"
  ON "ai_budget_reservations" ("resolved_at")
  WHERE "status" IN ('reconciled', 'released') AND "resolved_at" IS NOT NULL;
