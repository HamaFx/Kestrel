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
// These tests pin the phase-1 contract: dedupe + handling + ledger write run
// inside `withTenantDb(install.tenantId, ..., { userId })`, and a failed
// post-reply ledger write must never surface as a 5xx (Telegram would retry
// the update and re-run the prompt).

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
    mocks.withTenantDb.mockImplementation(
      async (_tenantId: string, work: (db: unknown) => Promise<Response>) => work(undefined),
    );
  });

  it('runs dedupe, handling and the ledger write inside the install tenant scope', async () => {
    const harness = createStorageHarness();
    const ctx = buildWebhookContext(harness);
    mocks.handleTelegramUpdate.mockResolvedValue({ text: 'ok' });

    const response = await handleTelegramWebhookRoute(ctx);

    expect(response.status).toBe(200);
    expect(mocks.withTenantDb).toHaveBeenCalledWith(TENANT_ID, expect.any(Function), {
      userId: USER_ID,
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

  it('deduplicates a repeated update without invoking the handler again', async () => {
    const harness = createStorageHarness();
    harness.documents.set(`updates:${UPDATE_ID}`, { processedAt: 'earlier' });
    const ctx = buildWebhookContext(harness);

    const response = await handleTelegramWebhookRoute(ctx);

    expect(response.status).toBe(200);
    expect(mocks.handleTelegramUpdate).not.toHaveBeenCalled();
    expect(harness.storage.set).not.toHaveBeenCalled();
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

  it('releases the idempotency key and returns 500 when handling fails', async () => {
    const harness = createStorageHarness();
    const ctx = buildWebhookContext(harness);
    mocks.handleTelegramUpdate.mockRejectedValue(new Error('send failed'));

    const response = await handleTelegramWebhookRoute(ctx);

    expect(response.status).toBe(500);
    expect(harness.storage.delete).toHaveBeenCalledWith('updates', String(UPDATE_ID));
    expect(ctx.log.error).toHaveBeenCalled();
  });
});
