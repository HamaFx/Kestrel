/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ClientModule from '../src/client';
import { applyMigrations, closePGliteDb, getPGliteDb } from '../src/pglite-client';
import { seedTwoTenantBillingAndTraceData, TWO_TENANT_IDS } from './fixtures/two-tenant';

let pglite: Awaited<ReturnType<typeof getPGliteDb>>;

vi.mock('../src/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ClientModule>();
  return { ...actual, getDb: () => pglite };
});

const UUID = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

async function sql(query: string): Promise<void> {
  await pglite.execute(query);
}

describe('ownership-scoped diagnostic and billing queries', { timeout: 60_000 }, () => {
  let dir: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'kestrel-ownership-isolation-'));
    await applyMigrations(dir);
    pglite = await getPGliteDb(dir);

    await seedTwoTenantBillingAndTraceData(sql);

  });

  afterEach(async () => {
    await closePGliteDb();
  });

  it('does not expose another user diagnostic trace by ID or list scope', async () => {
    const { getDiagnosticTrace, listDiagnosticTraces, listTraceExplorerEvents } =
      await import('../src/queries/diagnostic-traces');
    const { getTenantIdForUser, requireTenantIdForUser } = await import('../src/tenant');

    expect(await getTenantIdForUser(TWO_TENANT_IDS.userA)).toBe(TWO_TENANT_IDS.tenantA);
    await expect(requireTenantIdForUser('missing-user')).rejects.toThrow(/organization membership/i);

    expect(await getDiagnosticTrace('user-a', 'trace-b')).toBeNull();
    expect((await listDiagnosticTraces('user-a')).map((row) => row.id)).toEqual(['trace-a']);

    const events = await listTraceExplorerEvents({ userId: 'user-a', traceId: 'trace-b' });
    expect(events).toEqual([]);
  });

  it('derives canonical tenant ownership for user-owned writes', async () => {
    const { createAlert } = await import('../src/queries/alerts');
    const { createJournalEntry } = await import('../src/queries/journal');
    const { createPosition, getPortfolioSettings, upsertPortfolioSettings } =
      await import('../src/queries/portfolio');

    const alert = await createAlert({
      userId: TWO_TENANT_IDS.userA,
      rule: { kind: 'price', symbol: 'XAUUSD', operator: 'gt', value: 2500 },
    });
    expect(alert.tenantId).toBe(TWO_TENANT_IDS.tenantA);

    const journal = await createJournalEntry({
      userId: TWO_TENANT_IDS.userA,
      tenantId: TWO_TENANT_IDS.tenantB,
      symbol: 'XAUUSD',
      side: 'long',
      openedAt: new Date(),
      entry: 2400,
    });
    expect(journal.tenantId).toBe(TWO_TENANT_IDS.tenantA);

    const position = await createPosition({
      userId: TWO_TENANT_IDS.userA,
      tenantId: TWO_TENANT_IDS.tenantB,
      symbol: 'XAUUSD',
      direction: 'long',
      lotSize: 0.1,
      entryPrice: 2400,
      openedAt: new Date(),
    });
    expect(position.tenantId).toBe(TWO_TENANT_IDS.tenantA);

    await upsertPortfolioSettings(TWO_TENANT_IDS.userA, {
      accountBalance: 10_000,
    });
    const settings = await getPortfolioSettings(TWO_TENANT_IDS.userA);
    expect(settings?.tenantId).toBe(TWO_TENANT_IDS.tenantA);
    expect(settings?.accountBalance).toBe(10_000);
  });

  it('excludes child messages whose tenant disagrees with the owning thread', async () => {
    const { listMessages, countThreadMessages } = await import('../src/queries/threads');
    const threadId = UUID('730000000001');
    const messageId = UUID('730000000002');

    await sql(`
      INSERT INTO "chat_threads" ("id", "user_id", "tenant_id", "title")
      VALUES ('${threadId}', '${TWO_TENANT_IDS.userA}', '${TWO_TENANT_IDS.tenantA}', 'Owned thread')
    `);
    await sql(`
      INSERT INTO "chat_messages" ("id", "thread_id", "tenant_id", "role", "content")
      VALUES ('${messageId}', '${threadId}', '${TWO_TENANT_IDS.tenantB}', 'assistant', 'wrong tenant child')
    `);

    expect(await listMessages(TWO_TENANT_IDS.userA, threadId)).toEqual([]);
    expect(await countThreadMessages(TWO_TENANT_IDS.userA, threadId)).toBe(0);
  });

  it('derives tenant ownership for push, telemetry, and queue writes', async () => {
    const { createPushSubscription } = await import('../src/queries/push');
    const { recordTelemetry } = await import('../src/queries/telemetry');
    const { enqueueFullAnalysisQueue } = await import('../src/queries/full-analysis-queue');

    const push = await createPushSubscription({
      userId: TWO_TENANT_IDS.userA,
      tenantId: TWO_TENANT_IDS.tenantB,
      endpoint: 'https://push.example.test/user-a',
      p256dh: 'p256dh-a',
      auth: 'auth-a',
    });
    expect(push.tenantId).toBe(TWO_TENANT_IDS.tenantA);

    await recordTelemetry({
      userId: TWO_TENANT_IDS.userA,
      tenantId: TWO_TENANT_IDS.tenantB,
      threadId: null,
      messageId: null,
      model: 'test/model',
      inputTokens: 1,
      outputTokens: 2,
      toolCalls: 0,
      ms: 3,
    });
    const telemetry = await pglite.execute<{ tenant_id: string }>(
      `SELECT "tenant_id" FROM "chat_telemetry" WHERE "user_id" = '${TWO_TENANT_IDS.userA}' ORDER BY "created_at" DESC LIMIT 1`,
    );
    expect(telemetry.rows[0]?.tenant_id).toBe(TWO_TENANT_IDS.tenantA);

    const queue = await enqueueFullAnalysisQueue({
      runId: 'queue-run-a',
      userId: TWO_TENANT_IDS.userA,
      threadId: 'thread-a',
      idempotencyKey: 'queue-key-a',
      payload: { symbol: 'XAUUSD' },
    });
    expect(queue.tenantId).toBe(TWO_TENANT_IDS.tenantA);
  });

  it('scopes settings, symbols, provider health, and sessions to the canonical tenant', async () => {
    const { getUserWithSettings, updateUserSettingsField } = await import('../src/queries/user-settings');
    const { getUserApiKeys, getProviderHealthForUser } = await import('../src/queries/provider-tests');
    const { listUserSymbols, countUserSymbols } = await import('../src/queries/user-symbols');
    const { listUserSessions, revokeUserSession } = await import('../src/queries/user-sessions');

    await sql(`
      INSERT INTO "user_settings" ("user_id", "tenant_id", "ai_api_keys")
      VALUES ('${TWO_TENANT_IDS.userA}', '${TWO_TENANT_IDS.tenantB}', 'wrong-tenant-key')
      ON CONFLICT ("user_id") DO UPDATE SET "tenant_id" = EXCLUDED."tenant_id", "ai_api_keys" = EXCLUDED."ai_api_keys"
    `);
    await sql(`
      INSERT INTO "provider_tests" ("user_id", "tenant_id", "provider_id", "ok")
      VALUES ('${TWO_TENANT_IDS.userA}', '${TWO_TENANT_IDS.tenantB}', 'wrong-provider', false)
    `);
    await sql(`
      INSERT INTO "user_symbols" ("user_id", "tenant_id", "symbol", "display_order") VALUES
        ('${TWO_TENANT_IDS.userA}', '${TWO_TENANT_IDS.tenantA}', 'XAUUSD', 0),
        ('${TWO_TENANT_IDS.userA}', '${TWO_TENANT_IDS.tenantB}', 'BTCUSDT', 1)
    `);
    await sql(`
      INSERT INTO "user_sessions" ("id", "user_id", "tenant_id", "device_name", "ip") VALUES
        ('session-a', '${TWO_TENANT_IDS.userA}', '${TWO_TENANT_IDS.tenantA}', 'A device', '127.0.0.1'),
        ('session-b', '${TWO_TENANT_IDS.userA}', '${TWO_TENANT_IDS.tenantB}', 'B device', '127.0.0.2')
    `);

    expect((await getUserWithSettings(TWO_TENANT_IDS.userA)).settings).toBeNull();
    expect(await getUserApiKeys(TWO_TENANT_IDS.userA)).toBeNull();
    expect(await getProviderHealthForUser(TWO_TENANT_IDS.userA)).toEqual([]);
    expect((await listUserSymbols(TWO_TENANT_IDS.userA)).map((row) => row.symbol)).toEqual(['XAUUSD']);
    expect(await countUserSymbols(TWO_TENANT_IDS.userA)).toBe(1);
    expect((await listUserSessions(TWO_TENANT_IDS.userA)).map((row) => row.id)).toEqual(['session-a']);

    await revokeUserSession('session-b', TWO_TENANT_IDS.userA);
    const remainingWrongTenantSession = await pglite.execute<{ id: string }>(
      `SELECT "id" FROM "user_sessions" WHERE "id" = 'session-b'`,
    );
    expect(remainingWrongTenantSession.rows).toHaveLength(1);

    await sql(`
      UPDATE "user_settings"
      SET "tenant_id" = '${TWO_TENANT_IDS.tenantA}'
      WHERE "user_id" = '${TWO_TENANT_IDS.userA}'
    `);
    await updateUserSettingsField(TWO_TENANT_IDS.userA, 'theme', 'dark');
    const settings = await getUserWithSettings(TWO_TENANT_IDS.userA);
    expect(settings.settings?.tenantId).toBe(TWO_TENANT_IDS.tenantA);
    expect(settings.settings?.theme).toBe('dark');

    await revokeUserSession('session-a', TWO_TENANT_IDS.userA);
    const remainingOwnedSession = await pglite.execute<{ id: string }>(
      `SELECT "id" FROM "user_sessions" WHERE "id" = 'session-a'`,
    );
    expect(remainingOwnedSession.rows).toHaveLength(0);
  });

  it('atomically purges user-owned data while retaining billing and audit history', async () => {
    const { deleteUserAccount } = await import('../src/queries/auth');
    const userId = TWO_TENANT_IDS.userA;
    const tenantId = TWO_TENANT_IDS.tenantA;
    const threadId = UUID('740000000001');
    const messageId = UUID('740000000002');
    const feedbackId = UUID('740000000003');
    const shadowId = UUID('740000000004');
    const regressionId = UUID('740000000005');
    const alertId = UUID('740000000006');
    const journalId = UUID('740000000007');
    const positionId = UUID('740000000008');
    const snapshotId = UUID('740000000009');
    const pushId = UUID('740000000010');

    await sql(`
      INSERT INTO "user_settings" ("user_id", "tenant_id", "ai_api_keys", "telegram_bot_token", "telegram_chat_id")
      VALUES ('${userId}', '${tenantId}', 'encrypted-byok', 'encrypted-telegram', 'chat-a')
      ON CONFLICT ("user_id") DO UPDATE SET
        "tenant_id" = EXCLUDED."tenant_id",
        "ai_api_keys" = EXCLUDED."ai_api_keys",
        "telegram_bot_token" = EXCLUDED."telegram_bot_token",
        "telegram_chat_id" = EXCLUDED."telegram_chat_id"
    `);
    await sql(`
      INSERT INTO "account" ("userId", "type", "provider", "providerAccountId", "access_token", "refresh_token")
      VALUES ('${userId}', 'oauth', 'test-provider', 'account-a', 'oauth-access', 'oauth-refresh')
    `);
    await sql(`
      INSERT INTO "session" ("sessionToken", "userId", "expires")
      VALUES ('db-session-a', '${userId}', now() + interval '1 day')
    `);
    await sql(`
      INSERT INTO "verificationToken" ("identifier", "token", "purpose", "expires")
      VALUES ('a@example.com', 'verification-hash-a', 'email_verify', now() + interval '1 day')
    `);
    await sql(`
      INSERT INTO "user_sessions" ("id", "user_id", "tenant_id", "device_name", "ip")
      VALUES ('tracked-session-a', '${userId}', '${tenantId}', 'A device', '127.0.0.1')
    `);
    await sql(`
      INSERT INTO "chat_threads" ("id", "user_id", "tenant_id", "title")
      VALUES ('${threadId}', '${userId}', '${tenantId}', 'Delete me')
    `);
    await sql(`
      INSERT INTO "chat_messages" ("id", "thread_id", "tenant_id", "role", "content") VALUES
        ('${messageId}', '${threadId}', '${tenantId}', 'assistant', 'Delete this answer')
    `);
    await sql(`
      INSERT INTO "ai_message_feedback" ("id", "user_id", "tenant_id", "thread_id", "message_id", "rating")
      VALUES ('${feedbackId}', '${userId}', '${tenantId}', '${threadId}', '${messageId}', 'negative')
    `);
    await sql(`
      INSERT INTO "ai_regression_cases" (
        "id", "feedback_id", "user_id", "tenant_id", "thread_id", "message_id",
        "prompt_sha256", "assistant_output_sha256"
      ) VALUES (
        '${regressionId}', '${feedbackId}', '${userId}', '${tenantId}', '${threadId}', '${messageId}',
        'prompt-hash', 'answer-hash'
      )
    `);
    await sql(`
      INSERT INTO "agent_opinions" (
        "id", "user_id", "thread_id", "tenant_id", "message_id", "agent_name", "bias",
        "confidence", "reasoning", "raw_data", "model", "cost_usd", "latency_ms", "analysis_mode"
      ) VALUES (
        '${UUID('740000000011')}', '${userId}', '${threadId}', '${tenantId}', '${messageId}',
        'technical', 'neutral', 0.8, 'Delete this opinion', '{}'::jsonb, 'test/model', 0, 1, 'single'
      )
    `);
    await sql(`
      INSERT INTO "briefings_emitted" ("user_id", "tenant_id", "event_id", "kind", "message_id")
      VALUES ('${userId}', '${tenantId}', 'delete-event', 'pre', '${messageId}')
    `);
    await sql(`
      INSERT INTO "ai_shadow_comparisons" (
        "id", "user_id", "tenant_id", "thread_id", "prompt_sha256", "primary_agent", "outcome"
      ) VALUES ('${shadowId}', '${userId}', '${tenantId}', '${threadId}', 'shadow-hash', 'mastra', 'completed')
    `);
    await sql(`
      INSERT INTO "ai_quality_results" (
        "id", "user_id", "tenant_id", "run_id", "passed", "mandatory_passed"
      ) VALUES ('${UUID('740000000012')}', '${userId}', '${tenantId}', 'quality-delete-run', true, true)
    `);
    await sql(`
      INSERT INTO "full_analysis_queue" (
        "run_id", "user_id", "tenant_id", "thread_id", "idempotency_key", "payload"
      ) VALUES ('queue-delete-run', '${userId}', '${tenantId}', '${threadId}', 'queue-delete-key', '{}'::jsonb)
    `);
    await sql(`
      INSERT INTO "persistence_outbox" (
        "id", "user_id", "tenant_id", "operation", "dedupe_key", "payload"
      ) VALUES ('${UUID('740000000013')}', '${userId}', '${tenantId}', 'message.assistant', 'outbox-delete-key', '{}'::jsonb)
    `);
    await sql(`
      INSERT INTO "mutation_executions" (
        "run_id", "user_id", "tenant_id", "thread_id", "mutation", "input_digest"
      ) VALUES ('mutation-delete-run', '${userId}', '${tenantId}', '${threadId}', 'delete-test', 'digest')
    `);
    await sql(`
      INSERT INTO "ai_budget_reservations" (
        "id", "user_id", "tenant_id", "day", "reserved_usd_cents"
      ) VALUES ('${UUID('740000000014')}', '${userId}', '${tenantId}', current_date, 10)
    `);
    await sql(`
      INSERT INTO "daily_ai_spend" ("user_id", "tenant_id", "day", "total_usd_cents")
      VALUES ('${userId}', '${tenantId}', current_date, 10)
    `);
    await sql(`
      INSERT INTO "chat_telemetry" ("id", "user_id", "tenant_id", "model")
      VALUES ('${UUID('740000000015')}', '${userId}', '${tenantId}', 'test/model')
    `);
    await sql(`
      INSERT INTO "chat_tool_telemetry" ("id", "user_id", "tenant_id", "tool")
      VALUES ('${UUID('740000000016')}', '${userId}', '${tenantId}', 'test_tool')
    `);
    await sql(`
      INSERT INTO "diagnostic_traces" ("id", "user_id", "thread_id", "started_at", "status")
      VALUES ('trace-delete-a', '${userId}', '${threadId}', now(), 'completed')
    `);
    await sql(`
      INSERT INTO "alerts" ("id", "user_id", "tenant_id", "rule")
      VALUES ('${alertId}', '${userId}', '${tenantId}', '{}'::jsonb)
    `);
    await sql(`
      INSERT INTO "journal_entries" (
        "id", "user_id", "tenant_id", "symbol", "side", "opened_at", "entry"
      ) VALUES ('${journalId}', '${userId}', '${tenantId}', 'XAUUSD', 'long', now(), 2000)
    `);
    await sql(`
      INSERT INTO "portfolio_positions" (
        "id", "user_id", "tenant_id", "symbol", "direction", "lot_size", "entry_price", "opened_at"
      ) VALUES ('${positionId}', '${userId}', '${tenantId}', 'XAUUSD', 'long', 0.1, 2000, now())
    `);
    await sql(`
      INSERT INTO "portfolio_settings" ("user_id", "tenant_id", "account_balance")
      VALUES ('${userId}', '${tenantId}', 10000)
    `);
    await sql(`
      INSERT INTO "shared_snapshots" ("id", "user_id", "tenant_id", "title", "body", "expires_at")
      VALUES ('${snapshotId}', '${userId}', '${tenantId}', 'Delete snapshot', 'body', now() + interval '1 day')
    `);
    await sql(`
      INSERT INTO "push_subscriptions" (
        "id", "user_id", "tenant_id", "endpoint", "p256dh", "auth"
      ) VALUES ('${pushId}', '${userId}', '${tenantId}', 'https://push.delete.test/a', 'p256dh', 'auth')
    `);
    await sql(`
      INSERT INTO "provider_tests" ("user_id", "tenant_id", "provider_id", "ok")
      VALUES ('${userId}', '${tenantId}', 'delete-provider', true)
    `);
    await sql(`
      INSERT INTO "notification_noise_state" (
        "user_id", "tenant_id", "dedup_key", "route_type", "last_sent_at", "expires_at"
      ) VALUES ('${userId}', '${tenantId}', 'delete-noise', 'alert', now(), now() + interval '1 day')
    `);
    await sql(`
      INSERT INTO "bot_links" ("user_id", "tenant_id", "platform", "chat_id")
      VALUES ('${userId}', '${tenantId}', 'telegram', 'delete-chat')
    `);
    await sql(`
      INSERT INTO "user_symbols" ("user_id", "tenant_id", "symbol")
      VALUES ('${userId}', '${tenantId}', 'XAUUSD')
    `);
    await sql(`
      INSERT INTO "rate_limits" ("user_id", "tenant_id", "endpoint_group", "window_start")
      VALUES ('${userId}', '${tenantId}', 'delete-test', now())
    `);
    await sql(`
      INSERT INTO "audit_logs" ("id", "user_id", "tenant_id", "action")
      VALUES ('audit-delete-a', '${userId}', '${tenantId}', 'account.delete.requested')
    `);

    await deleteUserAccount(userId);

    const user = await pglite.execute<{ email: string; deletedAt: string | null; hashedPassword: string | null }>(
      `SELECT "email", "deletedAt", "hashedPassword" FROM "user" WHERE "id" = '${userId}'`,
    );
    expect(user.rows[0]).toMatchObject({
      email: `deleted-${userId}@deleted.invalid`,
      deletedAt: expect.anything(),
      hashedPassword: null,
    });

    const purged = await pglite.execute<{ count: string }>(`
      SELECT count(*)::text AS count FROM (
        SELECT 1 FROM "user_settings" WHERE "user_id" = '${userId}'
        UNION ALL SELECT 1 FROM "account" WHERE "userId" = '${userId}'
        UNION ALL SELECT 1 FROM "session" WHERE "userId" = '${userId}'
        UNION ALL SELECT 1 FROM "verificationToken" WHERE "identifier" IN ('a@example.com', '${userId}')
        UNION ALL SELECT 1 FROM "user_sessions" WHERE "user_id" = '${userId}'
        UNION ALL SELECT 1 FROM "chat_threads" WHERE "user_id" = '${userId}'
        UNION ALL SELECT 1 FROM "chat_messages" WHERE "id" = '${messageId}'
        UNION ALL SELECT 1 FROM "ai_message_feedback" WHERE "user_id" = '${userId}'
        UNION ALL SELECT 1 FROM "ai_regression_cases" WHERE "user_id" = '${userId}'
        UNION ALL SELECT 1 FROM "agent_opinions" WHERE "user_id" = '${userId}'
        UNION ALL SELECT 1 FROM "briefings_emitted" WHERE "user_id" = '${userId}'
        UNION ALL SELECT 1 FROM "ai_shadow_comparisons" WHERE "user_id" = '${userId}'
        UNION ALL SELECT 1 FROM "ai_quality_results" WHERE "user_id" = '${userId}'
        UNION ALL SELECT 1 FROM "full_analysis_queue" WHERE "user_id" = '${userId}'
        UNION ALL SELECT 1 FROM "persistence_outbox" WHERE "user_id" = '${userId}'
        UNION ALL SELECT 1 FROM "mutation_executions" WHERE "user_id" = '${userId}'
        UNION ALL SELECT 1 FROM "ai_budget_reservations" WHERE "user_id" = '${userId}'
        UNION ALL SELECT 1 FROM "daily_ai_spend" WHERE "user_id" = '${userId}'
        UNION ALL SELECT 1 FROM "chat_telemetry" WHERE "user_id" = '${userId}'
        UNION ALL SELECT 1 FROM "chat_tool_telemetry" WHERE "user_id" = '${userId}'
        UNION ALL SELECT 1 FROM "diagnostic_traces" WHERE "user_id" = '${userId}'
        UNION ALL SELECT 1 FROM "alerts" WHERE "user_id" = '${userId}'
        UNION ALL SELECT 1 FROM "journal_entries" WHERE "user_id" = '${userId}'
        UNION ALL SELECT 1 FROM "portfolio_positions" WHERE "user_id" = '${userId}'
        UNION ALL SELECT 1 FROM "portfolio_settings" WHERE "user_id" = '${userId}'
        UNION ALL SELECT 1 FROM "shared_snapshots" WHERE "user_id" = '${userId}'
        UNION ALL SELECT 1 FROM "push_subscriptions" WHERE "user_id" = '${userId}'
        UNION ALL SELECT 1 FROM "provider_tests" WHERE "user_id" = '${userId}'
        UNION ALL SELECT 1 FROM "notification_noise_state" WHERE "user_id" = '${userId}'
        UNION ALL SELECT 1 FROM "bot_links" WHERE "user_id" = '${userId}'
        UNION ALL SELECT 1 FROM "user_symbols" WHERE "user_id" = '${userId}'
        UNION ALL SELECT 1 FROM "rate_limits" WHERE "user_id" = '${userId}'
      ) AS purged_rows
    `);
    expect(purged.rows[0]?.count).toBe('0');

    const retained = await pglite.execute<{ count: string }>(`
      SELECT count(*)::text AS count FROM (
        SELECT 1 FROM "subscriptions" WHERE "tenant_id" = '${tenantId}'
        UNION ALL SELECT 1 FROM "payments" WHERE "tenant_id" = '${tenantId}'
        UNION ALL SELECT 1 FROM "audit_logs" WHERE "user_id" = '${userId}'
      ) AS retained_rows
    `);
    expect(retained.rows[0]?.count).toBe('3');
  });

  it('fails closed on ambiguous or deleted organization membership', async () => {
    const { getTenantIdForUser, requireTenantIdForUser } = await import('../src/tenant');

    await sql(`
      INSERT INTO "organization" ("id", "name", "plan")
      VALUES ('shared-org-a', 'Shared Org A', 'free')
    `);
    await sql(`
      INSERT INTO "organization_member" ("org_id", "user_id", "role")
      VALUES ('shared-org-a', '${TWO_TENANT_IDS.userA}', 'member')
    `);

    await expect(getTenantIdForUser(TWO_TENANT_IDS.userA)).rejects.toThrow(/multiple active organization memberships/i);
    await expect(requireTenantIdForUser(TWO_TENANT_IDS.userA)).rejects.toThrow(/multiple active organization memberships/i);

    await sql(`UPDATE "organization" SET "deleted_at" = now() WHERE "id" = 'shared-org-a'`);
    expect(await getTenantIdForUser(TWO_TENANT_IDS.userA)).toBe(TWO_TENANT_IDS.tenantA);
  });

  it('preserves the first IPN payload and rejects conflicting idempotency reuse', async () => {
    const { claimIpnEvent } = await import('../src/queries/ipn-events');

    const first = await claimIpnEvent({
      nowpaymentsPaymentId: 'audit-payment-a',
      paymentStatus: 'finished',
      bodyHash: 'first-body-hash',
      rawBody: { payment_id: 'audit-payment-a', payment_status: 'finished', txid: 'tx-first' },
    });
    expect(first.kind).toBe('claimed');

    const conflict = await claimIpnEvent({
      nowpaymentsPaymentId: 'audit-payment-a',
      paymentStatus: 'finished',
      bodyHash: 'different-body-hash',
      rawBody: { payment_id: 'audit-payment-a', payment_status: 'finished', txid: 'tx-conflict' },
    });
    expect(conflict.kind).toBe('conflict');

    const stored = await pglite.execute<{ body_hash: string; raw_body: { txid?: string } }>(
      `SELECT "body_hash", "raw_body" FROM "ipn_events" WHERE "nowpayments_payment_id" = 'audit-payment-a'`,
    );
    expect(stored.rows[0]?.body_hash).toBe('first-body-hash');
    expect(stored.rows[0]?.raw_body?.txid).toBe('tx-first');
  });

  it('alerts on stale pending failures and wedged replay leases only', async () => {
    const { countStaleBillingWebhookFailures } = await import('../src/queries/ipn-events');

    await sql(`
      INSERT INTO "billing_webhook_dlq" (
        "id", "provider", "event_type", "event_id", "payload", "error",
        "received_at", "replay_started_at", "status"
      ) VALUES
        ('dlq-stale-pending', 'nowpayments', 'finished', 'event-stale-pending', '{}', 'failed', now() - interval '2 hours', NULL, 'pending'),
        ('dlq-stale-replay', 'nowpayments', 'finished', 'event-stale-replay', '{}', 'failed', now() - interval '2 hours', now() - interval '2 hours', 'replaying'),
        ('dlq-active-replay', 'nowpayments', 'finished', 'event-active-replay', '{}', 'failed', now() - interval '2 hours', now() - interval '5 minutes', 'replaying'),
        ('dlq-replayed', 'nowpayments', 'finished', 'event-replayed', '{}', 'failed', now() - interval '2 hours', NULL, 'replayed')
    `);

    const stale = await countStaleBillingWebhookFailures(new Date(Date.now() - 60 * 60_000));
    expect(stale).toBe(2);
  });

  it('does not regress terminal billing projections on stale provider events', async () => {
    const { updatePaymentStatus, updateSubscriptionFromPayment } =
      await import('../src/queries/ipn-events');

    expect(
      await updatePaymentStatus(UUID('720000000001'), {
        tenantId: TWO_TENANT_IDS.tenantA,
        status: 'finished',
      }),
    ).toBe(true);
    expect(
      await updatePaymentStatus(UUID('720000000001'), {
        tenantId: TWO_TENANT_IDS.tenantA,
        status: 'failed',
      }),
    ).toBe(false);

    const stalePayment = await pglite.execute<{ status: string }>(
      `SELECT "status" FROM "payments" WHERE "id" = '${UUID('720000000001')}'`,
    );
    expect(stalePayment.rows[0]?.status).toBe('finished');

    expect(
      await updatePaymentStatus(UUID('720000000001'), {
        tenantId: TWO_TENANT_IDS.tenantA,
        status: 'refunded',
      }),
    ).toBe(true);
    const refundedPayment = await pglite.execute<{ status: string }>(
      `SELECT "status" FROM "payments" WHERE "id" = '${UUID('720000000001')}'`,
    );
    expect(refundedPayment.rows[0]?.status).toBe('refunded');

    expect(
      await updateSubscriptionFromPayment(UUID('710000000001'), 'finished', {
        tenantId: TWO_TENANT_IDS.tenantA,
      }),
    ).toBe(true);
    expect(
      await updateSubscriptionFromPayment(UUID('710000000001'), 'failed', {
        tenantId: TWO_TENANT_IDS.tenantA,
      }),
    ).toBe(false);

    const staleSubscription = await pglite.execute<{
      status: string;
      last_payment_status: string;
    }>(
      `SELECT "status", "last_payment_status" FROM "subscriptions" WHERE "id" = '${UUID('710000000001')}'`,
    );
    expect(staleSubscription.rows[0]?.status).toBe('active');
    expect(staleSubscription.rows[0]?.last_payment_status).toBe('finished');

    expect(
      await updateSubscriptionFromPayment(UUID('710000000001'), 'refunded', {
        tenantId: TWO_TENANT_IDS.tenantA,
      }),
    ).toBe(true);
    const refundedSubscription = await pglite.execute<{ status: string }>(
      `SELECT "status" FROM "subscriptions" WHERE "id" = '${UUID('710000000001')}'`,
    );
    expect(refundedSubscription.rows[0]?.status).toBe('canceled');
  });

  it('allows billing writes only for the payment tenant', async () => {
    const {
      getPaymentByNowpaymentsId,
      updatePaymentStatus,
      updateSubscriptionFromPayment,
    } = await import('../src/queries/ipn-events');

    expect(await getPaymentByNowpaymentsId('payment-b', undefined, TWO_TENANT_IDS.tenantA)).toBeNull();

    await updatePaymentStatus(UUID('720000000002'), {
      tenantId: TWO_TENANT_IDS.tenantA,
      status: 'finished',
    });
    await updateSubscriptionFromPayment(UUID('710000000002'), 'failed', {
      tenantId: TWO_TENANT_IDS.tenantA,
    });

    const payment = await pglite.execute<{ status: string }>(
      `SELECT "status" FROM "payments" WHERE "id" = '${UUID('720000000002')}'`,
    );
    const subscription = await pglite.execute<{ status: string }>(
      `SELECT "status" FROM "subscriptions" WHERE "id" = '${UUID('710000000002')}'`,
    );
    expect(payment.rows[0]?.status).toBe('waiting');
    expect(subscription.rows[0]?.status).toBe('active');

    expect(await getPaymentByNowpaymentsId('payment-b', undefined, TWO_TENANT_IDS.tenantB)).not.toBeNull();
    await updatePaymentStatus(UUID('720000000002'), {
      tenantId: TWO_TENANT_IDS.tenantB,
      status: 'finished',
    });
    await updateSubscriptionFromPayment(UUID('710000000002'), 'failed', {
      tenantId: TWO_TENANT_IDS.tenantB,
    });

    const updatedPayment = await pglite.execute<{ status: string }>(
      `SELECT "status" FROM "payments" WHERE "id" = '${UUID('720000000002')}'`,
    );
    const updatedSubscription = await pglite.execute<{ status: string }>(
      `SELECT "status" FROM "subscriptions" WHERE "id" = '${UUID('710000000002')}'`,
    );
    expect(updatedPayment.rows[0]?.status).toBe('finished');
    expect(updatedSubscription.rows[0]?.status).toBe('past_due');
  });
});
