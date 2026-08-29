-- 0092: Index diagnostic trace retention and health-window scans.
--
-- Retention cleanup and admin health aggregates filter by created_at. Keep the
-- existing started_at index because trace lists order by that lifecycle field.

CREATE INDEX IF NOT EXISTS "diagnostic_traces_created_at_idx"
  ON "diagnostic_traces" ("created_at");
