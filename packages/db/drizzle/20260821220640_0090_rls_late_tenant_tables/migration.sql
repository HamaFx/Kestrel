-- 0090: Extend tenant isolation to tables introduced after the Phase 3 RLS cutover.
--
-- Migration 0038 predates the billing, AI quality, durable queue, and memory
-- coordination tables below. They all carry tenant_id populated from the
-- request tenant GUC and therefore must have the same database-enforced
-- isolation as the original tenant tables.
--
-- The policy is created through a guarded DO block so this migration is safe
-- to rerun during migration verification or recovery. Global webhook/event
-- registries, evaluation datasets, and diagnostic traces remain outside this
-- migration because they do not carry a request tenant_id contract.

DO $$
DECLARE
  table_name text;
  tenant_tables text[] := ARRAY[
    'subscriptions',
    'payments',
    'billing_checkout_attempts',
    'ai_budget_reservations',
    'persistence_outbox',
    'ai_message_feedback',
    'ai_shadow_comparisons',
    'ai_regression_cases',
    'mutation_executions',
    'full_analysis_queue',
    'memory_backfill_state',
    'memory_projection_state',
    'ai_quality_results'
  ];
BEGIN
  FOREACH table_name IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND policyname = 'tenant_isolation'
    ) THEN
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON %I
         FOR ALL
         USING (tenant_id = current_setting(''app.current_tenant'', true))
         WITH CHECK (tenant_id = current_setting(''app.current_tenant'', true))',
        table_name
      );
    END IF;
  END LOOP;
END $$;
