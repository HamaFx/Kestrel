-- 0127: Index foreign keys that cascade on parent delete.
--
-- Audit F-10. A child table whose FK is `ON DELETE CASCADE` is scanned once
-- per deleted parent row unless the referencing column is indexed:
--
--   * account.userId           — deleting a user scans every OAuth link.
--   * session.userId           — deleting a user scans every DB session.
--   * briefings_emitted.message_id — every chat_messages delete (thread
--     deletion, retention cleanup) scans the whole briefings table.
--
-- The indexes are additive and idempotent; CREATE INDEX takes a brief
-- ACCESS EXCLUSIVE lock, so run during a maintenance window on large tables.

CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("userId");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("userId");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "briefings_emitted_message_id_idx" ON "briefings_emitted" ("message_id");
