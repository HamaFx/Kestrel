-- 0116 — Retire the legacy shared-bot webhook dedup ledger (DEC-02).
--
-- Telegram updates are now deduplicated by `@kestrel/plugin-telegram-bot`
-- inside plugin_storage. The core `telegram_updates` table was only written
-- by `packages/ai/src/telegram/idempotency.ts`, which has been removed.

DROP TABLE IF EXISTS "telegram_updates" CASCADE;
