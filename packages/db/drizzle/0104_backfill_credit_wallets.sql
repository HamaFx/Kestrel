-- 0104: Backfill one wallet per existing user.
--
-- Idempotent: safe to rerun after a partial rollout. Users without a
-- membership row are skipped rather than failing the migration; the lazy
-- `ensureWallet()` path will create their row on first billing read.

INSERT INTO "credit_wallets" ("user_id", "tenant_id", "available_credits")
SELECT
  u."id",
  om."org_id",
  0
FROM "user" u
INNER JOIN LATERAL (
  SELECT m."org_id"
  FROM "organization_member" m
  INNER JOIN "organization" o ON o."id" = m."org_id" AND o."deleted_at" IS NULL
  WHERE m."user_id" = u."id"
  ORDER BY m."added_at" ASC
  LIMIT 1
) om ON TRUE
WHERE u."deletedAt" IS NULL
ON CONFLICT ("user_id") DO NOTHING;
