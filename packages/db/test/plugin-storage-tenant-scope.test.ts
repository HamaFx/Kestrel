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

// Tenant-scope guarantees for plugin_storage (FORCE ROW LEVEL SECURITY).
//
// The public Telegram webhook and streaming chat continuations call these
// helpers after the request transaction has closed. They must therefore open
// their own `withTenantDb` scope instead of falling back to the unscoped pool
// connection (where SELECTs see zero rows and INSERTs raise SQLSTATE 42501).

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as clientModule from '../src/client';
import type { DbClient } from '../src/client';
import { pluginStorageGet, pluginStorageSet } from '../src/queries/plugins/storage';

const mocks = vi.hoisted(() => ({
  withTenantDb: vi.fn(),
  getTenantDbScope: vi.fn(),
  requireTenantIdForUser: vi.fn(),
  getDb: vi.fn(() => {
    throw new Error('plugin storage must not fall back to an unscoped connection');
  }),
}));

vi.mock('../src/client', async (importOriginal) => {
  const actual = await importOriginal<typeof clientModule>();
  return {
    ...actual,
    getDb: mocks.getDb,
    getTenantDbScope: mocks.getTenantDbScope,
    withTenantDb: mocks.withTenantDb,
  };
});

vi.mock('../src/tenant', () => ({
  requireTenantIdForUser: mocks.requireTenantIdForUser,
}));

interface QueryCall {
  method: string;
  args: unknown[];
}

/**
 * Minimal fluent Drizzle stand-in: every builder method records its call and
 * returns the same thenable proxy, so `await db.select()...limit(1)` resolves
 * to the configured rows.
 */
function createQuerySpy(rows: unknown[]): { db: DbClient; calls: QueryCall[] } {
  const calls: QueryCall[] = [];
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (value: unknown) => void) => resolve(rows);
        }
        return (...args: unknown[]) => {
          calls.push({ method: String(prop), args });
          return proxy;
        };
      },
    },
  );
  return { db: proxy as DbClient, calls };
}

describe('pluginStorage tenant scoping', () => {
  beforeEach(() => {
    mocks.withTenantDb.mockClear();
    mocks.getTenantDbScope.mockClear();
    mocks.requireTenantIdForUser.mockClear();
  });

  it('opens its own withTenantDb scope when no scope is active', async () => {
    const scoped = createQuerySpy([{ value: { seen: true } }]);
    mocks.getTenantDbScope.mockReturnValue(null);
    mocks.requireTenantIdForUser.mockResolvedValue('tenant-1');
    mocks.withTenantDb.mockImplementation(
      async (_tenantId: string, work: (db: DbClient) => Promise<unknown>) => work(scoped.db),
    );

    const value = await pluginStorageGet(
      { userId: 'user-1', pluginId: 'telegram-bot' },
      'updates',
      '42',
    );

    expect(value).toEqual({ seen: true });
    expect(mocks.requireTenantIdForUser).toHaveBeenCalledWith('user-1', undefined);
    expect(mocks.withTenantDb).toHaveBeenCalledWith('tenant-1', expect.any(Function), {
      userId: 'user-1',
    });
  });

  it('reuses an active tenant scope for the same user without nesting a transaction', async () => {
    const active = createQuerySpy([{ value: { cached: true } }]);
    mocks.getTenantDbScope.mockReturnValue({
      tenantId: 'tenant-1',
      db: active.db,
      userId: 'user-1',
    });

    const value = await pluginStorageGet(
      { userId: 'user-1', pluginId: 'paper-trading', tenantId: 'tenant-1' },
      'positions',
      'xauusd',
    );

    expect(value).toEqual({ cached: true });
    expect(mocks.withTenantDb).not.toHaveBeenCalled();
    expect(mocks.requireTenantIdForUser).not.toHaveBeenCalled();
  });

  it('does not borrow an active scope that belongs to another user', async () => {
    const otherUser = createQuerySpy([]);
    const scoped = createQuerySpy([{ value: null }]);
    mocks.getTenantDbScope.mockReturnValue({
      tenantId: 'tenant-other',
      db: otherUser.db,
      userId: 'user-other',
    });
    mocks.requireTenantIdForUser.mockResolvedValue('tenant-1');
    mocks.withTenantDb.mockImplementation(
      async (_tenantId: string, work: (db: DbClient) => Promise<unknown>) => work(scoped.db),
    );

    await pluginStorageGet({ userId: 'user-1', pluginId: 'paper-trading' }, 'positions', 'xauusd');

    expect(mocks.withTenantDb).toHaveBeenCalledWith('tenant-1', expect.any(Function), {
      userId: 'user-1',
    });
    expect(otherUser.calls).toHaveLength(0);
  });

  it('writes the resolved tenant id on insert under its own scope', async () => {
    const scoped = createQuerySpy([]);
    mocks.getTenantDbScope.mockReturnValue(null);
    mocks.requireTenantIdForUser.mockResolvedValue('tenant-9');
    mocks.withTenantDb.mockImplementation(
      async (_tenantId: string, work: (db: DbClient) => Promise<unknown>) => work(scoped.db),
    );

    await pluginStorageSet({ userId: 'user-9', pluginId: 'telegram-bot' }, 'updates', '7', {
      processedAt: 'now',
    });

    expect(mocks.withTenantDb).toHaveBeenCalledWith('tenant-9', expect.any(Function), {
      userId: 'user-9',
    });
    const insert = scoped.calls.find((call) => call.method === 'values');
    expect(insert?.args[0]).toMatchObject({
      tenantId: 'tenant-9',
      userId: 'user-9',
      pluginId: 'telegram-bot',
      collection: 'updates',
      key: '7',
    });
  });

  it('uses an explicitly supplied handle without opening a transaction', async () => {
    const explicit = createQuerySpy([{ value: 7 }]);
    mocks.getTenantDbScope.mockReturnValue(null);

    const value = await pluginStorageGet(
      { userId: 'user-1', pluginId: 'paper-trading', tenantId: 'tenant-1' },
      'positions',
      'xauusd',
      explicit.db,
    );

    expect(value).toBe(7);
    expect(mocks.withTenantDb).not.toHaveBeenCalled();
  });
});
