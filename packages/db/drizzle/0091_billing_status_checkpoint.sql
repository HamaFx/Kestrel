-- 0091: Persist the last accepted provider status for monotonic billing updates.
--
-- The webhook event ledger remains the immutable delivery history. This
-- projection checkpoint lets application updates reject stale deliveries
-- after a process restart or when provider events arrive out of order.

ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "last_payment_status" text;
