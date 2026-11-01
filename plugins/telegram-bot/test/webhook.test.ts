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

// Public Telegram webhook behaviour under Postgres RLS.
//
// The webhook is unauthenticated, so it has no request tenant transaction.
// These tests pin the phase-1 contract: claim + handling + ledger write run
// inside `withTenantDb(install.tenantId, ..., { userId })`, and a failed
// post-reply ledger write must never surface as a 5xx (Telegram would retry
// the update and re-run the prompt).
//
// R10 (audit 2026-10-31) — the dedup claim is now a single atomic insert
// (`claimTelegramUpdate`, proven against real PostgreSQL in
// `update-ledger.test.ts`). This suite covers what the route does with the
// claim it is given: exactly one of two concurrent deliveries runs the prompt.

import type * as dbModule from '@kestrel/db';
import type {
  PluginPublicApiRouteContext,
  PluginPublicInstall,
  PluginStorage,
} from '@kestrel/plugin-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createWebhookToken } from '../src/bot/link';
import { handleTelegramWebhookRoute } from '../src/server/webhook';

const mocks = vi.hoisted(() => ({
  withTenantDb: vi.fn(),
  handleTelegramUpdate: vi.fn(),
  claimTelegramUpdate: vi.fn(),
}));

vi.mock('@kestrel/db', async (importOriginal) => {
  const actual = await importOriginal<typeof dbModule>();
  return {
    ...actual,
    withTenantDb: mocks.withTenantDb,
  };
});

vi.mock('../src/bot/runner', () => ({
  handleTelegramUpdate: mocks.handleTelegramUpdate,
}));

vi.mock('../src/server/update-ledger', () => ({
  UPDATE_COLLECTION: 'updates',
  claimTelegramUpdate: mocks.claimTelegramUpdate,
}));

const TENANT_ID = 'tenant-1';
const USER_ID = 'user-1';
const UPDATE_ID = 101;

interface StorageHarness {
  storage: PluginStorage;
  documents: Map<string, unknown>;
  setError: { current: Error | null };
}

function createStorageHarness(): StorageHarness {
  const documents = new Map<string, unknown>();
  const setError: { current: Error | null } = { current: null };
  const key = (collection: string, entryKey: string): string => `${collection}:${entryKey}`;

  return {
    documents,
    setError,
    storage: {
      get: (async (collection: string, entryKey: string) =>
        documents.get(key(collection, entryKey)) ?? null) as PluginStorage['get'],
      set: vi.fn(async (collection: string, entryKey: string, value: unknown) => {
        if (setError.current) throw setError.current;
        documents.set(key(collection, entryKey), value);
      }),
      list: vi.fn(async () => []),
      delete: vi.fn(async (collection: string, entryKey: string) => {
        documents.delete(key(collection, entryKey));
      }),
      clear: vi.fn(async () => {
        documents.clear();
      }),
    },
  };
}

function buildWebhookContext(harness: StorageHarness): PluginPublicApiRouteContext {
  const token = createWebhookToken(USER_ID);
  const install: PluginPublicInstall = {
    userId: USER_ID,
    tenantId: TENANT_ID,
    settings: { botToken: '123:abc', webhookSecret: 'header-secret' },
    storage: harness.storage,
  };
  const request = new Request(
    `https://kestrel.test/api/plugins/public/telegram-bot/webhook/${token}`,
    {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'header-secret' },
      body: JSON.stringify({
        update_id: UPDATE_ID,
        message: { message_id: 1, chat: { id: 555 }, text: '/status' },
      }),
    },
  );
  return {
    request,
    params: { token },
    pluginId: 'telegram-bot',
    log: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    getInstall: vi.fn(async () => install),
  } as unknown as PluginPublicApiRouteContext;
}

describe('telegram webhook — tenant scope and idempotency', () => {
  beforeEach(() => {
    process.env.TELEGRAM_PLUGIN_SECRET = 'test-secret-that-is-long-enough';
    mocks.withTenantDb.mockReset();
    mocks.handleTelegramUpdate.mockReset();
    mocks.claimTelegramUpdate.mockReset();
    mocks.claimTelegramUpdate.mockResolvedValue({ claimed: true, reClaimed: false });
    mocks.withTenantDb.mockImplementation(
      async (_tenantId: string, work: (db: unknown) => Promise<Response>) => work(undefined),
    );
  });

  it('runs the atomic claim, handling and the ledger write inside the install tenant scope', async () => {
    const harness = createStorageHarness();
    const ctx = buildWebhookContext(harness);
    mocks.handleTelegramUpdate.mockResolvedValue({ text: 'ok' });

    const response = await handleTelegramWebhookRoute(ctx);

    expect(response.status).toBe(200);
    expect(mocks.withTenantDb).toHaveBeenCalledWith(TENANT_ID, expect.any(Function), {
      userId: USER_ID,
    });
    expect(mocks.claimTelegramUpdate).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      userId: USER_ID,
      pluginId: 'telegram-bot',
      updateId: UPDATE_ID,
    });
    expect(mocks.handleTelegramUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.handleTelegramUpdate.mock.calls[0]?.[0]).toMatchObject({
      userId: USER_ID,
      tenantId: TENANT_ID,
      storage: harness.storage,
    });
    expect(harness.documents.get(`updates:${UPDATE_ID}`)).toMatchObject({
      processedAt: expect.any(String),
    });
  });

  it('does not run the prompt when the claim says the update is already held', async () => {
    mocks.claimTelegramUpdate.mockResolvedValue({ claimed: false, reClaimed: false });
    const harness = createStorageHarness();
    const ctx = buildWebhookContext(harness);

    const response = await handleTelegramWebhookRoute(ctx);

    expect(response.status).toBe(200);
    expect(mocks.handleTelegramUpdate).not.toHaveBeenCalled();
    expect(harness.storage.set).not.toHaveBeenCalled();
    expect(ctx.log.info).toHaveBeenCalledWith(
      'Skipping duplicate Telegram update',
      expect.objectContaining({ updateId: UPDATE_ID }),
    );
  });

  it('runs the prompt exactly once when two deliveries of one update arrive together', async () => {
    // The real claim is a single `INSERT … ON CONFLICT DO NOTHING RETURNING`,
    // so the database hands the update to exactly one of the two attempts.
    const claimedIds = new Set<number>();
    mocks.claimTelegramUpdate.mockImplementation(async ({ updateId }: { updateId: number }) => {
      if (claimedIds.has(updateId)) return { claimed: false, reClaimed: false };
      claimedIds.add(updateId);
      return { claimed: true, reClaimed: false };
    });

    const handlerStarted: { resolve: () => void } = { resolve: () => undefined };
    const started = new Promise<void>((resolve) => {
      handlerStarted.resolve = resolve;
    });
    const handlerFinished: { resolve: () => void } = { resolve: () => undefined };
    const finished = new Promise<void>((resolve) => {
      handlerFinished.resolve = resolve;
    });
    mocks.handleTelegramUpdate.mockImplementation(() => {
      handlerStarted.resolve();
      return finished;
    });

    const ctxA = buildWebhookContext(createStorageHarness());
    const ctxB = buildWebhookContext(createStorageHarness());
    const first = handleTelegramWebhookRoute(ctxA);
    const second = handleTelegramWebhookRoute(ctxB);
    // The handler only runs after the claim has been decided.
    await started;
    handlerFinished.resolve();
    const [responseA, responseB] = await Promise.all([first, second]);

    expect(responseA.status).toBe(200);
    expect(responseB.status).toBe(200);
    expect(mocks.handleTelegramUpdate).toHaveBeenCalledTimes(1);
  });

  it('logs a re-claimed abandoned update', async () => {
    mocks.claimTelegramUpdate.mockResolvedValue({ claimed: true, reClaimed: true });
    const harness = createStorageHarness();
    const ctx = buildWebhookContext(harness);
    mocks.handleTelegramUpdate.mockResolvedValue({ text: 'ok' });

    await handleTelegramWebhookRoute(ctx);

    expect(ctx.log.warn).toHaveBeenCalledWith(
      'Re-claimed an abandoned Telegram update',
      expect.objectContaining({ updateId: UPDATE_ID }),
    );
  });

  it('answers 200 when the post-reply ledger write fails, so Telegram does not retry', async () => {
    const harness = createStorageHarness();
    harness.setError.current = new Error('new row violates row-level security policy');
    const ctx = buildWebhookContext(harness);
    mocks.handleTelegramUpdate.mockResolvedValue({ text: 'ok' });

    const response = await handleTelegramWebhookRoute(ctx);

    expect(response.status).toBe(200);
    expect(ctx.log.warn).toHaveBeenCalledWith(
      'Telegram webhook dedupe write failed after handling update',
      expect.objectContaining({ userId: USER_ID, updateId: UPDATE_ID }),
    );
  });

  it('releases the claim and returns 500 when handling fails', async () => {
    const harness = createStorageHarness();
    const ctx = buildWebhookContext(harness);
    mocks.handleTelegramUpdate.mockRejectedValue(new Error('send failed'));

    const response = await handleTelegramWebhookRoute(ctx);

    expect(response.status).toBe(500);
    expect(harness.storage.delete).toHaveBeenCalledWith('updates', String(UPDATE_ID));
    expect(ctx.log.error).toHaveBeenCalled();
  });
});
