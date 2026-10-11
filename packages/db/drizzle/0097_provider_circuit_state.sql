-- Audit plan §1.6 (P1-4): shared LLM provider circuit state.
-- The in-memory circuit breaker stays as a per-instance L1 cache; this table
-- is the cross-instance source of truth for consecutive model failures.
CREATE TABLE IF NOT EXISTS "provider_circuit_state" (
  "model_id" text PRIMARY KEY NOT NULL,
  "consecutive_failures" integer DEFAULT 0 NOT NULL,
  "opened_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
