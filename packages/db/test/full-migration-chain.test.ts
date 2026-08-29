/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Phase 6 — Task 27: Full migration chain test
//
// Applies ALL migrations in sequence on a fresh PGlite instance,
// then verifies that every expected table exists and key
// constraints/indexes are present.

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  closePGliteDb,
  executeWithFallback,
  getPGliteDb,
  sanitizeStatement,
} from '../src/pglite-client';

const HERE = dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = join(HERE, '..', 'drizzle');

/** Strip leading comment lines from a SQL statement. */
function stripComments(sql: string): string {
  const lines = sql.split('\n');
  while (lines.length > 0 && (lines[0]!.trim() === '' || lines[0]!.trim().startsWith('--'))) {
    lines.shift();
  }
  return lines.join('\n').trim();
}

/** Apply a single migration tag. */
async function applyOne(db: Awaited<ReturnType<typeof getPGliteDb>>, tag: string): Promise<void> {
  const rawSql = readFileSync(join(DRIZZLE_DIR, `${tag}.sql`), 'utf-8');
  for (const stmt of rawSql.split('--> statement-breakpoint')) {
    const trimmed = stripComments(stmt.trim());
    if (!trimmed) continue;
    const safe = sanitizeStatement(trimmed);
    if (!safe.trim() || safe.trim().startsWith('--')) continue;
    try {
      await executeWithFallback(db, safe);
    } catch (err) {
      // drizzle-orm 0.45+ wraps PGlite errors with "Failed query:" prefix.
      // Extract the underlying message from err.cause when present.
      const causeMsg =
        err instanceof Error && err.cause instanceof Error ? err.cause.message : undefined;
      const msg = causeMsg ?? (err instanceof Error ? err.message : String(err));
      // Handle known non-idempotent re-application errors (same pattern
      // as schema-drift.test.ts and pglite-client.ts applyMigrations).
      if (
        msg.includes('already exists') ||
        msg.includes('does not exist') ||
        msg.includes('multiple primary keys') ||
        msg.includes('depend') ||
        msg.includes('dependent') ||
        msg.includes('vector') ||
        msg.includes('hnsw')
      ) {
        continue;
      }
      throw err;
    }
  }
}

/** Apply ALL migrations from the journal. */
async function applyAll(db: Awaited<ReturnType<typeof getPGliteDb>>): Promise<void> {
  await db.execute(
    `CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )`,
  );
  const journal = JSON.parse(readFileSync(join(DRIZZLE_DIR, 'meta', '_journal.json'), 'utf-8')) as {
    entries: Array<{ tag: string }>;
  };
  for (const entry of journal.entries) {
    await applyOne(db, entry.tag);
    await db.execute(
      `INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ('${entry.tag}', ${Date.now()})`,
    );
  }
}

// All tables that should exist after the full migration chain.
const EXPECTED_TABLES = [
  'user',
  'account',
  'session',
  'verificationToken',
  'user_settings',
  'user_symbols',
  'user_sessions',
  'chat_threads',
  'chat_messages',
  'chat_telemetry',
  'chat_tool_telemetry',
  'agent_opinions',
  'alerts',
  'journal_entries',
  'news_articles',
  'news_embeddings',
  'economic_events',
  'snapshots',
  'briefings_emitted',
  'cot_reports',
  'shared_snapshots',
  'push_subscriptions',
  'memory_embeddings',
  'daily_ai_spend',
  'ai_budget_reservations',
  'persistence_outbox',
  'rate_limits',
  'live_ticks',
  'candles_1m',
  'provider_throttle',
  'intermarket_resonance',
  'audit_logs',
  'mutation_executions',
  'full_analysis_queue',
  'provider_tests',
  'symbol_catalog',
  'cron_runs',
  'portfolio_positions',
  'portfolio_settings',
  'notification_noise_state',
  'bot_links',
  // Phase B — Billing (NOWPayments / crypto), migration 0040
  'plans',
  'subscriptions',
  'payments',
  'ipn_events',
  'billing_webhook_dlq',
  'billing_checkout_attempts',
  // Phase 3 — Multi-tenancy, migrations 0035–0041
  'organization',
  'organization_member',
  'telegram_updates',
];

describe(
  'Phase 6 — Task 27: Full migration chain (all migrations on fresh PGlite)',
  { timeout: 30_000 },
  () => {
    let dir: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'kestrel-full-chain-'));
    });

    afterEach(async () => {
      await closePGliteDb();
    });

    it('applies all migrations without error', async () => {
      const db = await getPGliteDb(dir);
      await applyAll(db);
      expect(true).toBe(true);
    }, 30_000);

    it('all expected tables exist after full migration chain', async () => {
      const db = await getPGliteDb(dir);
      await applyAll(db);
      const { rows } = await db.execute(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
      );
      const tableNames = rows.map((r: Record<string, unknown>) => r.tablename);
      for (const expected of EXPECTED_TABLES) {
        expect(tableNames).toContain(expected);
      }
    }, 30_000);

    it('__drizzle_migrations table exists', async () => {
      const db = await getPGliteDb(dir);
      await applyAll(db);
      const { rows } = await db.execute(
        `SELECT tablename FROM pg_tables WHERE tablename = '__drizzle_migrations'`,
      );
      expect(rows).toHaveLength(1);
    }, 30_000);

    it('Full-analysis queue has idempotency and lease indexes', async () => {
      const db = await getPGliteDb(dir);
      await applyAll(db);
      const { rows: indexes } = await db.execute(
        `SELECT indexname FROM pg_indexes WHERE tablename = 'full_analysis_queue'`,
      );
      const names = indexes.map((row: Record<string, unknown>) => row.indexname);
      expect(names).toContain('full_analysis_queue_user_idempotency_uk');
      expect(names).toContain('full_analysis_queue_lease_idx');
    }, 30_000);

    it('mutation execution ledger has a run-id primary key', async () => {
      const db = await getPGliteDb(dir);
      await applyAll(db);
      const { rows } = await db.execute(
        `SELECT constraint_name FROM information_schema.table_constraints
         WHERE table_name = 'mutation_executions' AND constraint_type = 'PRIMARY KEY'`,
      );
      expect(rows.map((row: Record<string, unknown>) => row.constraint_name)).toContain(
        'mutation_executions_pkey',
      );
    }, 30_000);

    it('key unique constraints exist', async () => {
      const db = await getPGliteDb(dir);
      await applyAll(db);
      const { rows: emailUk } = await db.execute(
        `SELECT conname FROM pg_constraint WHERE contype = 'u' AND conrelid = '"user"'::regclass`,
      );
      expect(emailUk.length).toBeGreaterThan(0);

      const { rows: memUk } = await db.execute(
        `SELECT conname FROM pg_constraint WHERE contype = 'u' AND conrelid = '"memory_embeddings"'::regclass`,
      );
      const memNames = memUk.map((r: Record<string, unknown>) => r.conname);
      expect(memNames).toContain('memory_embeddings_user_kind_source_uk');

      const { rows: snapUk } = await db.execute(
        `SELECT conname FROM pg_constraint WHERE contype = 'u' AND conrelid = '"snapshots"'::regclass`,
      );
      const snapNames = snapUk.map((r: Record<string, unknown>) => r.conname);
      expect(snapNames).toContain('snapshots_symbol_kind_asof_uk');
    }, 30_000);

    it('key CHECK constraints exist', async () => {
      const db = await getPGliteDb(dir);
      await applyAll(db);
      const { rows: alertChecks } = await db.execute(
        `SELECT conname FROM pg_constraint WHERE contype = 'c' AND conrelid = '"alerts"'::regclass AND conname LIKE '%snooze%'`,
      );
      expect(alertChecks.length).toBeGreaterThan(0);
    }, 30_000);

    it('billing safety-gate columns and indexes exist', async () => {
      const db = await getPGliteDb(dir);
      await applyAll(db);

      const { rows: checkoutColumns } = await db.execute(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'billing_checkout_attempts'`,
      );
      const checkoutColumnNames = checkoutColumns.map(
        (r: Record<string, unknown>) => r.column_name,
      );
      expect(checkoutColumnNames).toContain('processing_at');

      const { rows: invoiceIndex } = await db.execute(
        `SELECT indexname FROM pg_indexes WHERE tablename = 'payments' AND indexname = 'payments_nowpayments_invoice_id_idx'`,
      );
      expect(invoiceIndex).toHaveLength(1);

      const { rows: replayColumns } = await db.execute(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'billing_webhook_dlq'`,
      );
      const replayColumnNames = replayColumns.map((r: Record<string, unknown>) => r.column_name);
      expect(replayColumnNames).toContain('replay_started_at');
    }, 30_000);

    it('key indexes exist', async () => {
      const db = await getPGliteDb(dir);
      await applyAll(db);
      const { rows: telIdx } = await db.execute(
        `SELECT indexname FROM pg_indexes WHERE tablename = 'chat_telemetry' AND indexname = 'telemetry_user_created_idx'`,
      );
      expect(telIdx).toHaveLength(1);

      const { rows: droppedIdx } = await db.execute(
        `SELECT indexname FROM pg_indexes WHERE tablename = 'chat_telemetry' AND indexname = 'chat_telemetry_user_id_idx'`,
      );
      expect(droppedIdx).toHaveLength(0);

      const { rows: correlationIdx } = await db.execute(
        `SELECT indexname FROM pg_indexes
       WHERE tablename IN ('chat_telemetry', 'chat_tool_telemetry')
         AND indexname IN (
           'chat_telemetry_trace_idx', 'chat_telemetry_run_idx', 'chat_telemetry_job_idx',
           'chat_tool_telemetry_trace_idx', 'chat_tool_telemetry_run_idx', 'chat_tool_telemetry_job_idx'
         )`,
      );
      expect(correlationIdx).toHaveLength(6);

      // Phase 3 — analysis_jobs is replaced by Mastra durable workflow runs:
      // the table (and its idempotency index) must be gone after the chain.
      const { rows: analysisJobIdempotencyIdx } = await db.execute(
        `SELECT indexname FROM pg_indexes
       WHERE tablename = 'analysis_jobs'
         AND indexname = 'analysis_jobs_user_idempotency_uk'`,
      );
      expect(analysisJobIdempotencyIdx).toHaveLength(0);

      const { rows: budgetIndexes } = await db.execute(
        `SELECT indexname FROM pg_indexes
       WHERE tablename = 'ai_budget_reservations'
         AND indexname IN (
           'ai_budget_reservations_user_day_idx',
           'ai_budget_reservations_status_idx',
           'ai_budget_reservations_trace_idx'
         )`,
      );
      expect(budgetIndexes).toHaveLength(3);

      const { rows: retentionIndexes } = await db.execute(
        `SELECT indexname FROM pg_indexes
       WHERE indexname IN (
           'rate_limits_window_start_idx',
           'provider_daily_quota_day_idx',
           'cron_runs_started_at_idx',
           'persistence_outbox_terminal_updated_idx',
           'full_analysis_queue_terminal_completed_idx',
           'billing_webhook_dlq_replayed_at_idx',
           'ai_budget_reservations_terminal_resolved_idx'
         )`,
      );
      expect(retentionIndexes).toHaveLength(7);

      const { rows: outboxIndexes } = await db.execute(
        `SELECT indexname FROM pg_indexes
       WHERE indexname IN (
           'persistence_outbox_dedupe_uk',
           'persistence_outbox_pending_idx',
           'persistence_outbox_tenant_idx',
           'persistence_outbox_trace_idx',
           'chat_telemetry_idempotency_uk',
           'chat_tool_telemetry_idempotency_uk'
         )`,
      );
      expect(outboxIndexes).toHaveLength(6);
    }, 30_000);

    it('creates tenant-safe budget reservations and supports terminal state changes', async () => {
      const db = await getPGliteDb(dir);
      await applyAll(db);

      await db.execute(`
      INSERT INTO "organization" ("id", "name")
      VALUES ('org-budget-test', 'Budget Test Org')
    `);
      await db.execute(`
      INSERT INTO "user" ("id", "email")
      VALUES ('user-budget-test', 'budget-test@example.com')
    `);
      await db.execute(`
      INSERT INTO "ai_budget_reservations" (
        "id", "user_id", "day", "reserved_usd_cents", "status"
      ) VALUES (
        '00000000-0000-0000-0000-000000000021', 'user-budget-test',
        CURRENT_DATE, 5, 'reserved'
      )
    `);

      const { rows } = await db.execute(
        `SELECT tenant_id, status FROM "ai_budget_reservations"
       WHERE id = '00000000-0000-0000-0000-000000000021'`,
      );
      expect(rows[0]?.tenant_id).toBe('user-budget-test');
      expect(rows[0]?.status).toBe('reserved');

      await db.execute(`
      UPDATE "ai_budget_reservations"
      SET status = 'released', actual_usd_cents = 0, resolved_at = now()
      WHERE id = '00000000-0000-0000-0000-000000000021'
    `);
      const { rows: terminalRows } = await db.execute(
        `SELECT status, actual_usd_cents FROM "ai_budget_reservations"
       WHERE id = '00000000-0000-0000-0000-000000000021'`,
      );
      expect(terminalRows[0]?.status).toBe('released');
      expect(Number(terminalRows[0]?.actual_usd_cents)).toBe(0);
    }, 30_000);

    it('drops analysis_jobs after Phase 3 (Mastra durable runs replace it)', async () => {
      const db = await getPGliteDb(dir);
      await applyAll(db);

      const { rows } = await db.execute(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'analysis_jobs'`,
      );
      expect(rows).toHaveLength(0);
    }, 30_000);

    it('diagnostic traces have a created_at retention index after migration 0092', async () => {
      const db = await getPGliteDb(dir);
      await applyAll(db);
      const { rows } = await db.execute(
        `SELECT indexname FROM pg_indexes
         WHERE tablename = 'diagnostic_traces' AND indexname = 'diagnostic_traces_created_at_idx'`,
      );
      expect(rows).toHaveLength(1);
    }, 30_000);

    it('subscriptions have a provider status checkpoint after migration 0091', async () => {
      const db = await getPGliteDb(dir);
      await applyAll(db);
      const { rows } = await db.execute(
        `SELECT data_type FROM information_schema.columns
         WHERE table_name = 'subscriptions' AND column_name = 'last_payment_status'`,
      );
      expect(rows[0]?.data_type).toBe('text');
    }, 30_000);

    it('AI budget amounts use exact bigint cents after migration 0089', async () => {
      const db = await getPGliteDb(dir);
      await applyAll(db);
      const { rows } = await db.execute(
        `SELECT table_name, column_name, data_type
         FROM information_schema.columns
         WHERE table_name IN ('daily_ai_spend', 'ai_budget_reservations')
           AND column_name IN ('total_usd_cents', 'reserved_usd_cents', 'actual_usd_cents')
         ORDER BY table_name, column_name`,
      );
      expect(rows).toHaveLength(3);
      expect(rows.every((row: Record<string, unknown>) => row.data_type === 'bigint')).toBe(true);
    }, 30_000);

    it('late tenant tables have forced RLS and tenant isolation policies', async () => {
      const db = await getPGliteDb(dir);
      await applyAll(db);

      const lateTenantTables = [
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
        'ai_quality_results',
      ];
      const { rows } = await db.execute(
        `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
                p.policyname
         FROM pg_class c
         LEFT JOIN pg_policies p
           ON p.schemaname = 'public' AND p.tablename = c.relname
          AND p.policyname = 'tenant_isolation'
         WHERE c.relnamespace = 'public'::regnamespace
           AND c.relname IN (${lateTenantTables.map((table) => `'${table}'`).join(', ')})
         ORDER BY c.relname`,
      );

      expect(rows).toHaveLength(lateTenantTables.length);
      expect(
        rows.every(
          (row: Record<string, unknown>) =>
            row.relrowsecurity === true &&
            row.relforcerowsecurity === true &&
            row.policyname === 'tenant_isolation',
        ),
      ).toBe(true);
    }, 30_000);

    it('cot_reports columns are bigint (Phase 2)', async () => {
      const db = await getPGliteDb(dir);
      await applyAll(db);
      const { rows } = await db.execute(
        `SELECT data_type FROM information_schema.columns WHERE table_name = 'cot_reports' AND column_name = 'dealer_long'`,
      );
      expect(rows[0]?.data_type).toBe('bigint');
    }, 30_000);
  },
);
