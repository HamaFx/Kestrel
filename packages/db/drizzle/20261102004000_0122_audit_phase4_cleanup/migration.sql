-- 0122 — Audit 2026-10-31 Phase 4: index cleanup, dead schema, and the
-- per-row information_schema lookup in update_updated_at().
--
-- Five independent cleanups. Every object below was verified against the live
-- schema before this file was written: each dropped index exists and its
-- leading columns are covered by another index on the same table, each dropped
-- enum type has no `pg_attribute` reference anywhere, each dropped column has
-- no constraint/index/view/function reading it, and the dropped trigger
-- function has no attached trigger.
--
-- 1. Add the two indexes the audit named.
--      * `verificationToken(expires)` — the cleanup-tokens cron deletes
--        `WHERE expires < now()` and there is no index on that column, so
--        every purge scans the whole table.
--      * `alerts(user_id, created_at DESC)` — `listAlerts()` filters by user
--        and orders by `created_at DESC`. The existing composite
--        `alerts_user_active_created_idx` is `(user_id, active, created_at
--        DESC)`; `active` sits between the filter and the sort, so it cannot
--        serve that range.
--
-- 2. Drop eight redundant btree indexes whose leading columns are already
--    provided by a unique or composite index on the same table:
--
--      dropped                                  covered by
--      ------------------------------------------------------------------
--      plg_paper_trading_accounts_user_mode_idx plg_paper_trading_accounts_user_mode_key
--                                               (UNIQUE (user_id, mode))
--      chat_threads_user_id_idx                 chat_threads_user_updated_id_idx
--                                               (user_id, updated_at DESC, id DESC)
--      chat_threads_updated_at_idx              chat_threads_user_updated_id_idx
--                                               for every per-user read; no caller
--                                               orders all users' threads by updated_at
--      alerts_user_id_idx                       alerts_user_active_created_idx
--                                               (user_id, active, created_at DESC)
--      journal_entries_user_id_idx              journal_entries_user_opened_idx
--                                               (user_id, opened_at DESC)
--      chat_tool_telemetry_user_id_idx          tool_telemetry_user_created_idx
--                                               (user_id, created_at DESC)
--      memory_kind_idx                          memory_source_idx (kind, source_id)
--      memory_embeddings_tenant_id_idx          memory_embeddings_user_kind_occurred_idx
--                                               (tenant_id, user_id, kind, occurred_at DESC)
--
--    `full_analysis_queue_pending_idx` was audited too but deliberately kept:
--    its claim query is global (`WHERE status = 'pending' ORDER BY created_at`)
--    and the tenant composite `(tenant_id, status, created_at)` leads with
--    tenant_id, so it cannot serve that scan.
--
-- 3. Drop eight enum types that early migrations created and never applied to
--    a column: `user_role`, `journal_outcome`, `briefing_kind`, `bot_platform`,
--    `portfolio_status`, `payment_status`, `plan_interval`, `subscription_status`.
--    Every column that would have used one is plain `text` by convention (see
--    the "kept as text to avoid a coupling enum" comments throughout the
--    schema), so these types are pure leftovers.
--
-- 4. Drop dead columns that the credit/subscription stack left behind and no
--    writer maintains (the write path was removed with that stack; the read
--    path is removed in the same change):
--      * `chat_telemetry.credits_charged`      — always 0, was read by
--                                                `computeUsage()`.
--      * `chat_telemetry.wallet_balance_after` — always NULL, never read.
--      * `organization.plan`                   — no plans table exists; the
--                                                only read (`getUserWithSettings`)
--                                                is removed in this change.
--
-- 5. Drop the dead function `hamafx_set_decision_signal_outcome_tenant_id()`.
--    0117 re-created it while it still referenced `decision_signals`, a table
--    dropped in 0052; nothing calls it and no trigger is attached.
--
-- 6. Replace `update_updated_at()`. Its body selected from
--    `information_schema.columns` on every row of every `user`,
--    `user_settings`, `chat_threads` and `journal_entries` update to discover
--    which updated column the table has. The replacement assigns the column
--    directly and guards the assignment with `to_jsonb(NEW) ?`, which checks
--    the row's own field set instead of querying the catalog. Both spellings
--    are handled (`updated_at` for the three snake_case tables, `updatedAt`
--    for `"user"`), and a table with neither column is still a silent no-op,
--    so the one function can keep serving every trigger. Measured on the
--    scratch database with 20 000 row updates: ~712 ms before, ~124 ms after.
--    The four existing triggers are untouched and keep resolving to this
--    function by name.
--
-- 7. Drop the `feature_flags` table. `readFeatureFlag` is env-only (see
--    packages/shared/src/feature-flags.ts); the admin UI wrote rows that
--    nothing ever consulted. The table, its queries and its admin surface are
--    all removed in this change. Flags stay environment variables.
--
-- Rollback. The change is schema-only and destructive for the dropped objects,
-- so roll back in reverse order. Recreate the dropped indexes (the paper
-- trading one was not unique):
--
--   CREATE INDEX "plg_paper_trading_accounts_user_mode_idx"
--     ON "public"."plg_paper_trading_accounts" ("user_id", "mode");
--   CREATE INDEX "chat_threads_user_id_idx" ON "public"."chat_threads" ("user_id");
--   CREATE INDEX "chat_threads_updated_at_idx" ON "public"."chat_threads" ("updated_at");
--   CREATE INDEX "alerts_user_id_idx" ON "public"."alerts" ("user_id");
--   CREATE INDEX "journal_entries_user_id_idx" ON "public"."journal_entries" ("user_id");
--   CREATE INDEX "chat_tool_telemetry_user_id_idx"
--     ON "public"."chat_tool_telemetry" ("user_id");
--   CREATE INDEX "memory_kind_idx" ON "public"."memory_embeddings" ("kind");
--   CREATE INDEX "memory_embeddings_tenant_id_idx"
--     ON "public"."memory_embeddings" ("tenant_id");
--
-- Drop the two indexes this migration added:
--
--   DROP INDEX IF EXISTS "verificationToken_expires_idx";
--   DROP INDEX IF EXISTS "alerts_user_created_idx";
--
-- Recreate the eight enum types (labels from the applied schema, so a data
-- restore round-trips):
--
--   CREATE TYPE "user_role" AS ENUM ('user', 'admin');
--   CREATE TYPE "journal_outcome" AS ENUM ('open', 'win', 'loss', 'breakeven');
--   CREATE TYPE "briefing_kind" AS ENUM ('pre', 'post', 'weekly_review');
--   CREATE TYPE "bot_platform" AS ENUM ('telegram', 'discord', 'slack');
--   CREATE TYPE "portfolio_status" AS ENUM ('open', 'closed');
--   CREATE TYPE "payment_status" AS ENUM ('waiting', 'confirming', 'confirmed',
--     'sending', 'finished', 'failed', 'expired', 'refunded');
--   CREATE TYPE "plan_interval" AS ENUM ('monthly', 'quarterly', 'yearly');
--   CREATE TYPE "subscription_status" AS ENUM ('trialing', 'active', 'past_due',
--     'canceled', 'expired');
--
-- Re-add the dead columns. Their historical values are gone (the credit stack's
-- writer never ran, so there was nothing meaningful to keep):
--
--   ALTER TABLE "chat_telemetry" ADD COLUMN "credits_charged" bigint NOT NULL DEFAULT 0;
--   ALTER TABLE "chat_telemetry" ADD COLUMN "wallet_balance_after" bigint;
--   ALTER TABLE "organization" ADD COLUMN "plan" text NOT NULL DEFAULT 'free';
--
-- Restore the previous trigger-function body (0041, the information_schema
-- version) if an older trigger is ever attached to a table with neither column:
--
--   CREATE OR REPLACE FUNCTION "public"."update_updated_at"()
--   RETURNS trigger AS $$
--   DECLARE col_name text;
--   BEGIN
--     SELECT column_name INTO col_name
--     FROM information_schema.columns
--     WHERE table_schema = TG_TABLE_SCHEMA AND table_name = TG_TABLE_NAME
--       AND column_name IN ('updated_at', 'updatedAt') LIMIT 1;
--     IF col_name = 'updated_at' THEN NEW.updated_at = now();
--     ELSIF col_name = 'updatedAt' THEN NEW."updatedAt" = now();
--     END IF;
--     RETURN NEW;
--   END; $$ LANGUAGE plpgsql;
--
-- `hamafx_set_decision_signal_outcome_tenant_id()` is intentionally not
-- recreated: its body queries `decision_signals`, which no longer exists, so
-- the only faithful rollback is the dead function itself. Recreate
-- `feature_flags` and its queries from git history if the admin surface is
-- wanted again. Finally remove this migration's ledger row so the migrator
-- would consider it unapplied:
--
--   DELETE FROM drizzle."__drizzle_migrations" WHERE created_at = 1793580000000;

-- ── 1. Indexes the audit asked for ──────────────────────────────────────────

CREATE INDEX "verificationToken_expires_idx" ON "verificationToken" ("expires");
--> statement-breakpoint

CREATE INDEX "alerts_user_created_idx" ON "alerts" ("user_id", "created_at" DESC);
--> statement-breakpoint

-- ── 2. Redundant indexes ────────────────────────────────────────────────────

DROP INDEX IF EXISTS "plg_paper_trading_accounts_user_mode_idx";
--> statement-breakpoint

DROP INDEX IF EXISTS "chat_threads_user_id_idx";
--> statement-breakpoint

DROP INDEX IF EXISTS "chat_threads_updated_at_idx";
--> statement-breakpoint

DROP INDEX IF EXISTS "alerts_user_id_idx";
--> statement-breakpoint

DROP INDEX IF EXISTS "journal_entries_user_id_idx";
--> statement-breakpoint

DROP INDEX IF EXISTS "chat_tool_telemetry_user_id_idx";
--> statement-breakpoint

DROP INDEX IF EXISTS "memory_kind_idx";
--> statement-breakpoint

DROP INDEX IF EXISTS "memory_embeddings_tenant_id_idx";
--> statement-breakpoint

-- ── 3. Unused enum types ────────────────────────────────────────────────────

DROP TYPE IF EXISTS "user_role";
--> statement-breakpoint

DROP TYPE IF EXISTS "journal_outcome";
--> statement-breakpoint

DROP TYPE IF EXISTS "briefing_kind";
--> statement-breakpoint

DROP TYPE IF EXISTS "bot_platform";
--> statement-breakpoint

DROP TYPE IF EXISTS "portfolio_status";
--> statement-breakpoint

DROP TYPE IF EXISTS "payment_status";
--> statement-breakpoint

DROP TYPE IF EXISTS "plan_interval";
--> statement-breakpoint

DROP TYPE IF EXISTS "subscription_status";
--> statement-breakpoint

-- ── 4. Dead columns ─────────────────────────────────────────────────────────

ALTER TABLE "chat_telemetry" DROP COLUMN IF EXISTS "credits_charged";
--> statement-breakpoint

ALTER TABLE "chat_telemetry" DROP COLUMN IF EXISTS "wallet_balance_after";
--> statement-breakpoint

ALTER TABLE "organization" DROP COLUMN IF EXISTS "plan";
--> statement-breakpoint

-- ── 5. Dead trigger function ────────────────────────────────────────────────

DROP FUNCTION IF EXISTS "public"."hamafx_set_decision_signal_outcome_tenant_id"();
--> statement-breakpoint

-- ── 6. update_updated_at() without the per-row catalog lookup ───────────────

CREATE OR REPLACE FUNCTION "public"."update_updated_at"()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF to_jsonb(NEW) ? 'updated_at' THEN
    NEW.updated_at = now();
  ELSIF to_jsonb(NEW) ? 'updatedAt' THEN
    NEW."updatedAt" = now();
  END IF;
  RETURN NEW;
END;
$function$;
--> statement-breakpoint

-- ── 7. Env-only feature flags ───────────────────────────────────────────────

DROP TABLE IF EXISTS "feature_flags" CASCADE;
