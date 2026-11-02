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

// Audit 2026-10-31 (R1): `completeOnboardingAction` is a `'use server'`
// module, so it does not inherit the onboarding page's tenant scope. Its
// `user_settings` / `user_symbols` writes are RLS-protected and must run
// inside `withUserTenant`; unscoped they match zero rows / violate the
// WITH CHECK policy. This test pins the ordering around that scope.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { completeOnboardingAction } from '@/app/onboarding/actions';

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  auth: vi.fn(),
  catalogDb: vi.fn(),
  withUserTenant: vi.fn(),
  requireTenantIdForUser: vi.fn(),
  revalidatePath: vi.fn(),
  decryptByok: vi.fn(),
  encryptByok: vi.fn(),
}));

vi.mock('@kestrel/ai', () => ({ getDb: mocks.catalogDb }));
vi.mock('@kestrel/db', () => ({
  schema: {
    users: { id: 'users.id', name: 'users.name' },
    userSettings: {
      userId: 'user_settings.user_id',
      tenantId: 'user_settings.tenant_id',
      aiApiKeys: 'user_settings.ai_api_keys',
      aiApiKeysUpdatedAt: 'user_settings.ai_api_keys_updated_at',
      onboardingProgress: 'user_settings.onboarding_progress',
    },
    userSymbols: {
      userId: 'user_symbols.user_id',
      tenantId: 'user_symbols.tenant_id',
      symbol: 'user_symbols.symbol',
    },
    symbolCatalog: {
      symbol: 'symbol_catalog.symbol',
      isActive: 'symbol_catalog.is_active',
      tenantId: 'symbol_catalog.tenant_id',
    },
  },
  requireTenantIdForUser: mocks.requireTenantIdForUser,
  withUserTenant: mocks.withUserTenant,
  applyUserByokPatch: (
    state: { keys: Record<string, string>; updatedAt: Record<string, string> },
    patch: { set?: Record<string, string | null | undefined> },
  ) => {
    const keys = { ...state.keys };
    const changed: string[] = [];
    for (const [id, raw] of Object.entries(patch.set ?? {})) {
      const value = raw?.trim() ?? '';
      if (value.length > 0) {
        keys[id] = value;
        changed.push(id);
      }
    }
    return { keys, updatedAt: {}, changed, removed: [] };
  },
}));
vi.mock('@kestrel/shared', () => ({
  DEFAULT_WATCHLIST_SYMBOLS: ['XAUUSD'],
  normalizeSymbol: (symbol: string) => symbol.toUpperCase(),
}));
vi.mock('@kestrel/shared/encryption', () => ({
  decryptByok: mocks.decryptByok,
  encryptByok: mocks.encryptByok,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/logger', () => ({
  createScopedLoggerWithContext: () => ({
    error: vi.fn(),
    errorContext: vi.fn(),
  }),
}));

/** Chainable thenable stand-in for the Drizzle client. */
function makeDb(rows: unknown[] = []): Record<string, unknown> {
  const db: Record<string, unknown> = {};
  const method = () => db;
  Object.assign(db, {
    select: method,
    from: method,
    where: method,
    set: method,
    values: method,
    update: method,
    insert: method,
    delete: method,
    onConflictDoNothing: method,
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
    transaction: async (work: (tx: unknown) => Promise<unknown>) => {
      mocks.events.push('tx:enter');
      const result = await work(db);
      mocks.events.push('tx:exit');
      return result;
    },
  });
  return db;
}

function payloadForm(payload: Record<string, unknown>): FormData {
  const formData = new FormData();
  formData.set('payload', JSON.stringify(payload));
  return formData;
}

describe('completeOnboardingAction scope (audit 2026-10-31 R1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.events.length = 0;

    mocks.auth.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.catalogDb.mockImplementation(() => makeDb([{ symbol: 'XAUUSD' }]));
    mocks.requireTenantIdForUser.mockResolvedValue('tenant-1');
    mocks.decryptByok.mockReturnValue({});
    mocks.encryptByok.mockReturnValue('encrypted');
    mocks.withUserTenant.mockImplementation(
      async (userId: string, work: (db: unknown) => Promise<unknown>) => {
        mocks.events.push(`tenant:enter:${userId}`);
        const result = await work(makeDb());
        mocks.events.push(`tenant:exit:${userId}`);
        return result;
      },
    );
  });

  it('wraps the user_settings / user_symbols write unit in the tenant scope', async () => {
    const result = await completeOnboardingAction(
      payloadForm({ symbols: ['XAUUSD'], defaultSymbol: 'XAUUSD' }),
    );

    expect(result).toEqual({ ok: true, success: true });
    expect(mocks.withUserTenant).toHaveBeenCalledWith('user-1', expect.any(Function));
    expect(mocks.events).toEqual([
      'tenant:enter:user-1',
      'tx:enter',
      'tx:exit',
      'tenant:exit:user-1',
    ]);
    expect(mocks.requireTenantIdForUser).toHaveBeenCalledWith('user-1', expect.anything());
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/');
  });

  it('rejects unavailable symbols before opening any tenant scope', async () => {
    const result = await completeOnboardingAction(
      payloadForm({ symbols: ['NOTREAL'], defaultSymbol: 'NOTREAL' }),
    );

    expect(result).toEqual({ ok: false, error: 'Symbol "NOTREAL" is not supported or active' });
    expect(mocks.withUserTenant).not.toHaveBeenCalled();
  });

  it('returns an auth error without opening any tenant scope', async () => {
    mocks.auth.mockResolvedValue(null);

    const result = await completeOnboardingAction(payloadForm({}));

    expect(result).toEqual({ ok: false, error: 'Not authenticated' });
    expect(mocks.withUserTenant).not.toHaveBeenCalled();
    expect(mocks.catalogDb).not.toHaveBeenCalled();
  });
});
