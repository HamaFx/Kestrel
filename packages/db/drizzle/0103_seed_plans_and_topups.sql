-- 0103: Seed the credit-era plan catalogue + top-up packs.
--
-- Idempotent by name: existing rows are upgraded in place, missing rows are
-- inserted. Operator can later edit prices/credits in the admin UI; this is
-- only the launch baseline.
--
-- Plans: Free 1k, Starter $9 / 8k, Pro $29 / 30k, Scale $79 / 100k,
-- Enterprise custom. 1 credit = $0.001.

DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT * FROM (VALUES
      ('Free',       0,    'monthly',   1000::bigint,  '["chat_basic","chart_basic","journal_basic"]'::jsonb, 100000, true,  0),
      ('Starter',    900,  'monthly',   8000::bigint,  '["chat_basic","chat_single","chart_basic","chart_advanced","journal_basic","journal_unlimited","alerts_5","api_read"]'::jsonb, 1336000, true, 10),
      ('Pro',        2900, 'monthly',   30000::bigint, '["chat_basic","chat_single","chat_full","chart_basic","chart_advanced","journal_basic","journal_unlimited","alerts_20","web_search","telegram_bot","api_read"]'::jsonb, 5000000, true, 20),
      ('Scale',      7900, 'monthly',   100000::bigint,'["chat_basic","chat_single","chat_full","chat_full_unlimited","chart_basic","chart_advanced","journal_basic","journal_unlimited","alerts_100","web_search","telegram_bot","backtesting","priority","api_read"]'::jsonb, 16670000, true, 30),
      ('Enterprise', 0,    'yearly',    0::bigint,     '["chat_basic","chat_single","chat_full","chat_full_unlimited","chart_basic","chart_advanced","journal_basic","journal_unlimited","alerts_unlimited","web_search","telegram_bot","backtesting","priority","api_access","sso","sla"]'::jsonb, NULL, true, 40)
    ) AS seed(name, price_usd_cents, interval, monthly_credits, features, monthly_token_cap, visible, sort_order)
  LOOP
    IF EXISTS (SELECT 1 FROM "plans" WHERE "name" = p.name) THEN
      UPDATE "plans"
      SET "price_usd_cents" = p.price_usd_cents,
          "interval" = p.interval::plan_interval,
          "monthly_credits" = p.monthly_credits,
          "monthly_token_cap" = p.monthly_token_cap,
          "features" = p.features,
          "visible" = p.visible,
          "sort_order" = p.sort_order,
          "is_active" = true,
          "updated_at" = now()
      WHERE "name" = p.name;
    ELSE
      INSERT INTO "plans"
        ("name","price_usd_cents","interval","monthly_credits","monthly_token_cap",
         "features","visible","sort_order","is_active")
      VALUES
        (p.name,p.price_usd_cents,p.interval::plan_interval,p.monthly_credits,
         p.monthly_token_cap,p.features,p.visible,p.sort_order,true);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint

INSERT INTO "credit_topup_products" ("name","credits","price_usd_cents","sort_order","is_active")
SELECT * FROM (VALUES
  ('5,000 Credits',  5000::bigint,  499, 10, true),
  ('15,000 Credits', 15000::bigint, 1299, 20, true),
  ('50,000 Credits', 50000::bigint, 3999, 30, true)
) AS seed(name, credits, price_usd_cents, sort_order, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM "credit_topup_products" existing WHERE existing."name" = seed.name
);
