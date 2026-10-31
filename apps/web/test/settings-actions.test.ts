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

// SPDX-License-Identifier: Apache-2.0

import { getDb, getUserPasswordHash, updateUserDisplayName } from '@kestrel/db';
// Pre-register mock DB in the container BEFORE @kestrel/ai is imported.
// importOriginal for @kestrel/ai runs db.ts which does container.register('db', ...),
// but since @kestrel/db is mocked and getRawDb = mockGetDb, the container will
// resolve to mockGetDb correctly.
import { container } from '@kestrel/shared';
import {
  decryptByok,
  decryptWithPassword,
  encryptByok,
  encryptWithPassword,
  PROVIDER_IDS,
} from '@kestrel/shared/encryption';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { afterEach, beforeAll, beforeEach, describe, expect, it, Mock, vi } from 'vitest';

import { auth } from '@/auth';
import { logActionError } from '@/lib/http/action-errors';

import {
  addSymbolAction,
  exportDataAction,
  exportKeysAction,
  importKeysAction,
  removeSymbolAction,
  updateApiKeysAction,
  updateJevApiKeysAction,
  updateProfileAction,
  updateUsageSettingsAction,
} from '../src/app/(app)/settings/actions';
import { mockNextAuthSession } from './auth-helpers';

// Transparent mock of @kestrel/shared/encryption.
vi.mock('@kestrel/shared/encryption', async () => {
  const byok = await import('@kestrel/shared/byok');
  return {
    PROVIDER_IDS: byok.PROVIDER_IDS,
    JEV_PROVIDER_IDS: byok.JEV_PROVIDER_IDS,
    encryptByok: vi.fn((payload: unknown) => `enc:${JSON.stringify(payload)}`),
    decryptByok: vi.fn((encrypted: string | null | undefined) => {
      if (!encrypted || !encrypted.startsWith('enc:')) return null;
      try {
        return JSON.parse(encrypted.slice(4));
      } catch {
        return null;
      }
    }),
    encryptWithPassword: vi.fn(
      (payload: unknown, password: string) => `pwe:${password}:${JSON.stringify(payload)}`,
    ),
    decryptWithPassword: vi.fn((encrypted: string, password: string) => {
      const prefix = `pwe:${password}:`;
      if (!encrypted.startsWith(prefix)) return null;
      try {
        return JSON.parse(encrypted.slice(prefix.length));
      } catch {
        return null;
      }
    }),
  };
});

vi.mock('@/auth', () => ({ auth: vi.fn() }));

const mockGetDb = vi.hoisted(() => vi.fn());
const mockWithRateLimit = vi.hoisted(() => vi.fn());
const mockUpdateUserDisplayName = vi.hoisted(() => vi.fn());
const mockGetUserPasswordHash = vi.hoisted(() => vi.fn());
const mockRequireTenantIdForUser = vi.hoisted(() => vi.fn());
const mockTestProviderKey = vi.hoisted(() => vi.fn());
// Self-referencing proxy: schema.anything.anything... always returns a truthy
// object so drizzle column accesses (e.g. schema.symbolCatalog.symbol) don't throw.
const schemaProxy = vi.hoisted(() => {
  const p: Record<string, unknown> = {};
  return new Proxy(p, {
    get: (_target, prop) => {
      if (prop === 'then' || typeof prop === 'symbol') return undefined;
      return schemaProxy;
    },
  });
});

vi.mock('@kestrel/db', () => ({
  getDb: mockGetDb,
  withRateLimit: mockWithRateLimit,
  updateUserDisplayName: mockUpdateUserDisplayName,
  getUserPasswordHash: mockGetUserPasswordHash,
  requireTenantIdForUser: mockRequireTenantIdForUser,
  updatePaymentStatus: vi.fn(),
  updateSubscriptionFromPayment: vi.fn(),
  schema: schemaProxy,
}));

vi.mock('@/lib/http/action-errors', () => ({ logActionError: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@kestrel/ai', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getDb: mockGetDb,
    deleteAllThreads: vi.fn(),
    testProviderKey: mockTestProviderKey,
  };
});

container.register('db', () => mockGetDb());

const USER_ID = 'user-test-001';
const TEST_PASSWORD = 'my-strong-password-123';

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
}

/** The last payload handed to the (mocked) encryptor — i.e. the vault write. */
function savedByokPayload(): Record<string, unknown> {
  const call = (encryptByok as Mock).mock.calls.at(-1);
  return (call?.[0] ?? {}) as Record<string, unknown>;
}

/**
 * Drizzle query-builder mock.
 * Each call to a chain method returns a new thenable that resolves to the
 * next entry in `results`. Use for sequential db.select / db.insert / etc.
 */
function mockQueryChain(results: unknown[][] = []) {
  const next = () => ({
    then: (resolve: (v: unknown) => void) => resolve(results.shift() ?? []),
  });

  const where = {
    ...next(),
    limit: vi.fn(() => next()),
    orderBy: vi.fn(() => next()),
  };

  const joined = {
    ...where,
    where: vi.fn(() => where),
    innerJoin: vi.fn(() => joined),
  };
  const from = {
    where: vi.fn(() => where),
    orderBy: vi.fn(() => where),
    innerJoin: vi.fn(() => joined),
  };

  return {
    select: vi.fn(() => ({ from: vi.fn(() => from) })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ onConflictDoNothing: vi.fn(() => Promise.resolve()) })),
    })),
    delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
    execute: vi.fn(() => Promise.resolve([{ request_count: 1 }])),
    transaction: vi.fn((cb: (tx: unknown) => Promise<void>) => {
      const tx = mockQueryChain(results);
      return cb(tx);
    }),
  };
}

function mockDb(results: unknown[][] = []) {
  mockGetDb.mockReturnValue(mockQueryChain(results));
}

let hashedTestPassword: string;

beforeAll(async () => {
  hashedTestPassword = await bcrypt.hash(TEST_PASSWORD, 4);
});

beforeEach(() => {
  mockWithRateLimit.mockResolvedValue({ allowed: true, count: 1, limit: 10 });
  // verifyAccountPassword calls getUserPasswordHash internally, so the mock
  // must return the known hash so bcrypt.compare can succeed.
  mockGetUserPasswordHash.mockResolvedValue(hashedTestPassword);
  mockRequireTenantIdForUser.mockResolvedValue('tenant-test');
});

afterEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// updateProfileAction
// ===========================================================================

describe('updateProfileAction', () => {
  beforeEach(() => {
    (auth as Mock).mockImplementation(mockNextAuthSession(USER_ID));
    mockDb();
  });

  it('returns error when not authenticated', async () => {
    (auth as Mock).mockResolvedValue(null);
    const result = await updateProfileAction(formData({ name: 'New Name' }));
    expect(result).toEqual({ ok: false, error: 'Unauthorized' });
  });

  it('returns error when name is empty', async () => {
    const result = await updateProfileAction(formData({ name: '' }));
    expect(result).toEqual({ ok: false, error: 'Name must be between 1 and 80 characters' });
  });

  it('returns error when name exceeds max length', async () => {
    const result = await updateProfileAction(formData({ name: 'x'.repeat(81) }));
    expect(result).toEqual({ ok: false, error: 'Name must be between 1 and 80 characters' });
  });

  it('returns ok without DB update when name is unchanged', async () => {
    (auth as Mock).mockResolvedValue({
      user: { id: USER_ID, name: 'Same Name', email: `testuser-${USER_ID}@example.com` },
      expires: new Date(Date.now() + 86400000).toISOString(),
    });
    const result = await updateProfileAction(formData({ name: 'Same Name' }));
    expect(result).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith('/settings/profile');
    expect(updateUserDisplayName).not.toHaveBeenCalled();
  });

  it('returns ok after updating name in database', async () => {
    const result = await updateProfileAction(formData({ name: 'Updated Name' }));
    expect(result).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith('/settings/profile');
    expect(updateUserDisplayName).toHaveBeenCalledWith(USER_ID, 'Updated Name');
  });

  it('logs server-action errors', async () => {
    (updateUserDisplayName as Mock).mockRejectedValueOnce(new Error('connection lost'));

    const result = await updateProfileAction(formData({ name: 'Updated Name' }));
    expect(result).toEqual({ ok: false, error: 'connection lost' });
    expect(logActionError).toHaveBeenCalled();
  });
});

// ===========================================================================
// addSymbolAction / removeSymbolAction
// ===========================================================================

describe('addSymbolAction', () => {
  beforeEach(() => {
    (auth as Mock).mockImplementation(mockNextAuthSession(USER_ID));
  });

  it('returns error when not authenticated', async () => {
    (auth as Mock).mockResolvedValue(null);
    const result = await addSymbolAction(formData({ symbol: 'XAUUSD' }));
    expect(result).toEqual({ ok: false, error: 'Unauthorized' });
  });

  it('returns error when symbol is missing', async () => {
    const result = await addSymbolAction(formData({}));
    expect(result).toEqual({ ok: false, error: 'Symbol is required' });
  });

  it('returns error when symbol is too short', async () => {
    const result = await addSymbolAction(formData({ symbol: 'A' }));
    expect(result).toEqual({ ok: false, error: 'Symbol must be between 2 and 20 characters' });
  });

  it('returns error when symbol is too long', async () => {
    const result = await addSymbolAction(formData({ symbol: 'A'.repeat(21) }));
    expect(result).toEqual({ ok: false, error: 'Symbol must be between 2 and 20 characters' });
  });

  it('returns error when symbol is not in active catalog', async () => {
    mockDb([[]]);
    const result = await addSymbolAction(formData({ symbol: 'UNKNOWN' }));
    expect(result).toEqual({ ok: false, error: 'Symbol "UNKNOWN" is not supported or active.' });
  });

  it('adds symbol with correct display order', async () => {
    mockDb([
      [{ symbol: 'BTCUSD' }], // catalog select
      [{ maxOrder: 4 }], // maxOrder select
    ]);
    const result = await addSymbolAction(formData({ symbol: 'BTCUSD' }));
    expect(result).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith('/settings/symbols');
  });

  it('starts displayOrder at 0 when user has no symbols', async () => {
    mockDb([
      [{ symbol: 'BTCUSD' }], // catalog select
      [{ maxOrder: null }], // maxOrder select
    ]);
    const result = await addSymbolAction(formData({ symbol: 'BTCUSD' }));
    expect(result).toEqual({ ok: true });
  });

  it('handles onConflictDoNothing for duplicate symbol', async () => {
    mockDb([
      [{ symbol: 'BTCUSD' }], // catalog select
      [{ maxOrder: 2 }], // maxOrder select
    ]);
    const result = await addSymbolAction(formData({ symbol: 'btcusd' }));
    expect(result).toEqual({ ok: true });
  });

  it('logs server-action errors', async () => {
    const db = mockQueryChain([]);
    mockGetDb.mockReturnValue(db);
    db.select = vi.fn(() => {
      throw new Error('db timeout');
    });

    const result = await addSymbolAction(formData({ symbol: 'BTCUSD' }));
    expect(result).toEqual({ ok: false, error: 'db timeout' });
    expect(logActionError).toHaveBeenCalled();
  });
});

describe('removeSymbolAction', () => {
  beforeEach(() => {
    (auth as Mock).mockImplementation(mockNextAuthSession(USER_ID));
  });

  it('returns error when not authenticated', async () => {
    (auth as Mock).mockResolvedValue(null);
    const result = await removeSymbolAction(formData({ symbol: 'XAUUSD' }));
    expect(result).toEqual({ ok: false, error: 'Unauthorized' });
  });

  it('returns error when symbol is missing', async () => {
    const result = await removeSymbolAction(formData({}));
    expect(result).toEqual({ ok: false, error: 'Symbol is required' });
  });

  it('removes symbol successfully', async () => {
    mockDb();
    const result = await removeSymbolAction(formData({ symbol: 'XAUUSD' }));
    expect(result).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith('/settings/symbols');
  });

  it('logs server-action errors', async () => {
    const db = mockQueryChain([]);
    mockGetDb.mockReturnValue(db);
    db.delete = vi.fn(() => {
      throw new Error('permission denied');
    });

    const result = await removeSymbolAction(formData({ symbol: 'XAUUSD' }));
    expect(result).toEqual({ ok: false, error: 'permission denied' });
    expect(logActionError).toHaveBeenCalled();
  });
});

// ===========================================================================
// exportKeysAction / importKeysAction  (encryption round-trip)
// ===========================================================================

describe('exportKeysAction', () => {
  beforeEach(() => {
    (auth as Mock).mockImplementation(mockNextAuthSession(USER_ID));
  });

  it('returns error when not authenticated', async () => {
    (auth as Mock).mockResolvedValue(null);
    const result = await exportKeysAction(TEST_PASSWORD);
    expect(result).toEqual({ ok: false, error: 'Unauthorized' });
  });

  it('returns error when password is too short', async () => {
    const result = await exportKeysAction('short');
    expect(result).toEqual({ ok: false, error: 'Password must be at least 8 characters' });
  });

  it('returns error when account password is incorrect', async () => {
    // verifyAccountPassword calls getUserPasswordHash(userId) which returns
    // hashedTestPassword. bcrypt.compare will fail for a different password.
    // The 2FA check calls getDb() BEFORE password verification, so we need a mock.
    mockDb([[{ twoFactorEnabled: false }]]);
    const result = await exportKeysAction('wrong-password-123');
    expect(result).toEqual({ ok: false, error: 'Incorrect account password' });
  });

  it('returns error when no keys are configured (null aiApiKeys)', async () => {
    // exportKeysAction calls getDb() twice: once for 2FA check, once for keys.
    // The first getDb call selects twoFactorEnabled, the second selects aiApiKeys.
    mockDb([
      [{ twoFactorEnabled: false }], // 2FA check
      [{ aiApiKeys: null }], // key retrieval
    ]);
    const result = await exportKeysAction(TEST_PASSWORD);
    expect(result).toEqual({ ok: false, error: 'No keys configured to export' });
  });

  it('returns error when no keys are configured (empty after decrypt)', async () => {
    const payload = encryptByok({});
    mockDb([
      [{ twoFactorEnabled: false }], // 2FA check
      [{ aiApiKeys: payload }], // key retrieval
    ]);
    const result = await exportKeysAction(TEST_PASSWORD);
    expect(result).toEqual({ ok: false, error: 'No keys configured to export' });
  });

  it('exports keys successfully (encryption round-trip)', async () => {
    const originalKeys = { openai: 'sk-abc', anthropic: 'sk-def' };
    const payload = encryptByok(originalKeys);
    mockDb([
      [{ twoFactorEnabled: false }], // 2FA check
      [{ aiApiKeys: payload }], // key retrieval
    ]);
    const result = await exportKeysAction(TEST_PASSWORD);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const decrypted = decryptWithPassword(result.data!.payload, TEST_PASSWORD);
      expect(decrypted).toEqual(originalKeys);
    }
  });

  it('logs server-action errors', async () => {
    // First getDb call: returns twoFactorEnabled fine.
    // Second getDb call: throws on select.
    const okDb = mockQueryChain([[{ twoFactorEnabled: false }]]);
    const badDb = mockQueryChain([]);
    badDb.select = vi.fn(() => {
      throw new Error('read failure');
    });

    mockGetDb.mockReturnValueOnce(okDb).mockReturnValueOnce(badDb);

    const result = await exportKeysAction(TEST_PASSWORD);
    expect(result).toEqual({ ok: false, error: 'read failure' });
    expect(logActionError).toHaveBeenCalled();
  });
});

// ===========================================================================
// exportDataAction (complete tenant-scoped data export)
// ===========================================================================

describe('exportDataAction', () => {
  beforeEach(() => {
    (auth as Mock).mockImplementation(mockNextAuthSession(USER_ID));
  });

  it('exports all user-owned domains without credential material', async () => {
    const profile = {
      id: USER_ID,
      email: 'user@example.com',
      name: 'User',
      image: null,
      role: 'user',
      hashedPassword: 'bcrypt-hash',
      twoFactorSecret: 'encrypted-totp',
      twoFactorBackupCodes: ['hashed-backup-code'],
    };
    const settings = {
      userId: USER_ID,
      tenantId: 'tenant-test',
      aiApiKeys: 'encrypted-byok',
      telegramBotToken: 'encrypted-telegram',
      telegramChatId: 'chat-id',
      defaultSymbol: 'XAUUSD',
    };
    const rows = [
      [{ twoFactorEnabled: false }],
      [profile],
      [settings],
      [[]], // threads; empty means the message query is skipped
      [[]], // journal entries
      [[]], // alerts
      [[]], // symbols
      [[]], // push subscriptions
      [[]], // memories
      [[]], // shared snapshots
      [[]], // telemetry
      [[]], // spend
      [[]], // briefings
      [[]], // audit logs
      [[]], // provider tests
      [[]], // notification noise state
      [[]], // bot links
      [[]], // rate limits
      [[]], // tool telemetry
      [[{ id: 'feedback-a' }]],
      [[{ id: 'regression-a' }]],
      [[{ id: 'shadow-a' }]],
      [[{ id: 'quality-a' }]],
      [[{ runId: 'queue-a' }]],
      [[{ id: 'outbox-a' }]],
      [[{ runId: 'mutation-a' }]],
      [[{ id: 'budget-a' }]],
      [[{ id: 'opinion-a' }]],
      [[{ id: 'trace-a', userId: USER_ID }]],
      [[]], // memory backfill state
      [[]], // memory projection state
    ];
    const authDb = mockQueryChain(rows.slice(0, 1));
    const exportDb = mockQueryChain(rows.slice(1));
    mockGetDb.mockReturnValueOnce(authDb).mockReturnValueOnce(exportDb);

    const result = await exportDataAction(TEST_PASSWORD);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const serialized = result.data;
    expect(serialized).toContain('feedback');
    expect(serialized).toContain('regressionCases');
    expect(serialized).toContain('toolTelemetry');
    expect(serialized).not.toContain('bcrypt-hash');
    expect(serialized).not.toContain('encrypted-totp');
    expect(serialized).not.toContain('hashed-backup-code');
    expect(serialized).not.toContain('encrypted-byok');
    expect(serialized).not.toContain('encrypted-telegram');
    expect(serialized).toContain('chat-id');
  });
});

// ===========================================================================
// updateApiKeysAction / updateJevApiKeysAction  (Decision 4A — preservation)
// ===========================================================================

describe('updateApiKeysAction', () => {
  beforeEach(() => {
    (auth as Mock).mockImplementation(mockNextAuthSession(USER_ID));
    mockTestProviderKey.mockResolvedValue({ ok: true });
  });

  it('returns error when not authenticated', async () => {
    (auth as Mock).mockResolvedValue(null);
    const result = await updateApiKeysAction({ status: 'idle' }, formData({ google: 'new-g' }));
    expect(result).toEqual({ ok: false, error: 'Not authenticated' });
  });

  it('preserves opencode, liquid, typesafe, and finnhub keys when saving chat provider keys', async () => {
    mockDb([
      [
        {
          aiApiKeys: encryptByok({
            google: 'old-g',
            opencode: 'oc-free-1',
            liquid: 'lq-1',
            typesafe: 'ts-1',
            finnhub: 'fh-1',
          }),
          aiApiKeysUpdatedAt: null,
        },
      ],
    ]);

    const result = await updateApiKeysAction({ status: 'idle' }, formData({ google: 'new-g' }));

    expect(result.ok).toBe(true);
    expect(savedByokPayload()).toMatchObject({
      google: 'new-g',
      opencode: 'oc-free-1',
      liquid: 'lq-1',
      typesafe: 'ts-1',
      finnhub: 'fh-1',
    });
    expect(mockTestProviderKey).toHaveBeenCalledWith('google', 'new-g');
  });

  it('removes a cleared chat key without touching the decision-model or market-data keys', async () => {
    mockDb([
      [
        {
          aiApiKeys: encryptByok({ google: 'old-g', opencode: 'oc-free-1' }),
          aiApiKeysUpdatedAt: null,
        },
      ],
    ]);

    const result = await updateApiKeysAction({ status: 'idle' }, formData({}));

    expect(result.ok).toBe(true);
    expect(savedByokPayload()).toMatchObject({ opencode: 'oc-free-1' });
    expect(savedByokPayload()).not.toHaveProperty('google');
  });
});

describe('updateJevApiKeysAction', () => {
  beforeEach(() => {
    (auth as Mock).mockImplementation(mockNextAuthSession(USER_ID));
  });

  it('returns error when not authenticated', async () => {
    (auth as Mock).mockResolvedValue(null);
    const result = await updateJevApiKeysAction({ status: 'idle' }, formData({ opencode: 'x' }));
    expect(result).toEqual({ ok: false, error: 'Not authenticated' });
  });

  it('saves decision-model keys without touching chat providers or finnhub', async () => {
    mockDb([
      [
        {
          aiApiKeys: encryptByok({ google: 'old-g', finnhub: 'fh-1' }),
          aiApiKeysUpdatedAt: null,
        },
      ],
    ]);

    const result = await updateJevApiKeysAction(
      { status: 'idle' },
      formData({ opencode: 'oc-new', liquid: 'lq-new', typesafe: 'ts-new' }),
    );

    expect(result).toEqual({
      ok: true,
      data: { savedCount: 3, clearedCount: 0, at: expect.any(Number) },
    });
    expect(savedByokPayload()).toMatchObject({
      google: 'old-g',
      finnhub: 'fh-1',
      opencode: 'oc-new',
      liquid: 'lq-new',
      typesafe: 'ts-new',
    });
  });

  it('clears one decision key with an empty value while untouched keys keep their stored value', async () => {
    mockDb([
      [
        {
          aiApiKeys: encryptByok({ opencode: 'oc-old', liquid: 'lq-old' }),
          aiApiKeysUpdatedAt: null,
        },
      ],
    ]);

    const result = await updateJevApiKeysAction({ status: 'idle' }, formData({ liquid: '' }));

    expect(result.ok).toBe(true);
    const saved = savedByokPayload();
    expect(saved).toMatchObject({ opencode: 'oc-old' });
    expect(saved).not.toHaveProperty('liquid');
  });

  it('keeps the stored value when the field still carries the KEEP sentinel', async () => {
    mockDb([
      [
        {
          aiApiKeys: encryptByok({ opencode: 'oc-old' }),
          aiApiKeysUpdatedAt: null,
        },
      ],
    ]);

    await updateJevApiKeysAction({ status: 'idle' }, formData({ opencode: '***KEEP***' }));

    expect(savedByokPayload()).toMatchObject({ opencode: 'oc-old' });
  });
});

describe('importKeysAction', () => {
  beforeEach(() => {
    (auth as Mock).mockImplementation(mockNextAuthSession(USER_ID));
  });

  it('returns error when not authenticated', async () => {
    (auth as Mock).mockResolvedValue(null);
    const result = await importKeysAction('payload', TEST_PASSWORD);
    expect(result).toEqual({ ok: false, error: 'Unauthorized' });
  });

  it('returns error when payload is empty', async () => {
    const result = await importKeysAction('', TEST_PASSWORD);
    expect(result).toEqual({ ok: false, error: 'Payload and password are required' });
  });

  it('returns error when password is empty', async () => {
    const result = await importKeysAction('payload', '');
    expect(result).toEqual({ ok: false, error: 'Payload and password are required' });
  });

  it('returns error when account password is incorrect', async () => {
    (getUserPasswordHash as Mock).mockResolvedValueOnce('wrong-hash');

    const result = await importKeysAction('backup-string', 'wrong-pass');
    expect(result).toEqual({ ok: false, error: 'Incorrect account password' });
  });

  it('imports keys successfully (encryption round-trip)', async () => {
    const backup = encryptWithPassword(
      { anthropic: 'sk-new1', google: 'AIza-new2' },
      TEST_PASSWORD,
    );
    // verifyAccountPassword calls getUserPasswordHash → returns hashedTestPassword (set in beforeEach)
    // importKeysAction then calls getDb() once for the update
    mockDb();
    const result = await importKeysAction(backup, TEST_PASSWORD);
    expect(result).toEqual({ ok: true, data: { importedCount: 2 } });
    expect(revalidatePath).toHaveBeenCalledWith('/settings/api-keys');
  });

  it('imports decision-model and market-data keys from the backup payload', async () => {
    const backup = encryptWithPassword(
      { google: 'g-new', opencode: 'oc-b', liquid: 'lq-b', typesafe: 'ts-b', finnhub: 'fh-b' },
      TEST_PASSWORD,
    );
    mockDb([[{ aiApiKeys: null, aiApiKeysUpdatedAt: null }]]);

    const result = await importKeysAction(backup, TEST_PASSWORD);

    expect(result).toEqual({ ok: true, data: { importedCount: 5 } });
    expect(savedByokPayload()).toMatchObject({
      google: 'g-new',
      opencode: 'oc-b',
      liquid: 'lq-b',
      typesafe: 'ts-b',
      finnhub: 'fh-b',
    });
  });

  it('carries stored decision-model and market-data keys forward when the backup predates them', async () => {
    const backup = encryptWithPassword({ google: 'g-new' }, TEST_PASSWORD);
    mockDb([
      [
        {
          aiApiKeys: encryptByok({ opencode: 'oc-old', finnhub: 'fh-old' }),
          aiApiKeysUpdatedAt: null,
        },
      ],
    ]);

    const result = await importKeysAction(backup, TEST_PASSWORD);

    expect(result).toEqual({ ok: true, data: { importedCount: 3 } });
    expect(savedByokPayload()).toMatchObject({
      google: 'g-new',
      opencode: 'oc-old',
      finnhub: 'fh-old',
    });
  });

  it('filters out unknown provider keys', async () => {
    const backup = encryptWithPassword({ unknown_provider: 'key-value' }, TEST_PASSWORD);
    const result = await importKeysAction(backup, TEST_PASSWORD);
    expect(result).toEqual({ ok: false, error: 'No valid keys found in backup payload' });
  });

  it('returns error when backup payload is tampered', async () => {
    const result = await importKeysAction('tampered-data', TEST_PASSWORD);
    expect(result).toEqual({ ok: false, error: 'Invalid backup payload or incorrect password' });
  });

  it('logs server-action errors', async () => {
    const backup = encryptWithPassword({ openai: 'sk-abc' }, TEST_PASSWORD);

    // importKeysAction calls getDb() once for the update
    const badDb = mockQueryChain([]);
    badDb.update = vi.fn(() => {
      throw new Error('update failed');
    });
    mockGetDb.mockReturnValueOnce(badDb);

    const result = await importKeysAction(backup, TEST_PASSWORD);
    expect(result).toEqual({ ok: false, error: 'update failed' });
    expect(logActionError).toHaveBeenCalled();
  });
});

// ===========================================================================
// updateUsageSettingsAction
// ===========================================================================

describe('updateUsageSettingsAction', () => {
  beforeEach(() => {
    (auth as Mock).mockImplementation(mockNextAuthSession(USER_ID));
    mockDb();
  });

  it('returns error when not authenticated', async () => {
    (auth as Mock).mockResolvedValue(null);
    const result = await updateUsageSettingsAction(formData({}));
    expect(result).toEqual({ ok: false, error: 'Unauthorized' });
  });

  it('stores parsed monthlyBudgetLimit and alert flags', async () => {
    const result = await updateUsageSettingsAction(
      formData({
        monthlyBudgetLimit: '100',
        emailAlert: 'on',
        telegramAlert: 'on',
      }),
    );
    expect(result).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith('/settings/usage');
  });

  it('logs server-action errors', async () => {
    const db = mockQueryChain([]);
    mockGetDb.mockReturnValue(db);
    db.update = vi.fn(() => {
      throw new Error('write conflict');
    });

    const result = await updateUsageSettingsAction(
      formData({
        monthlyBudgetLimit: '100',
        emailAlert: 'on',
      }),
    );
    expect(result).toEqual({ ok: false, error: 'write conflict' });
    expect(logActionError).toHaveBeenCalled();
  });
});
