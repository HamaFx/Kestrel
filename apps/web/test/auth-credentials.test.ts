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

// Batch 4: behavioral coverage for the real credentials authorize pipeline.
//
// The previous revision only tested the pure helpers in credentials.ts; the
// `authorizeCredentials` flow (lockout, bcrypt verification, reset, 2FA
// required/locked, backup-code consumption) was previously "covered" by
// readFileSync source greps. Only the DB/encryption/TOTP boundaries are
// mocked here; bcrypt hashing and the AuthError contract are real, and
// `passwordSchema` runs the production validation module verbatim.

import bcrypt from 'bcryptjs';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { recordAuthEvent } from '@/lib/auth-anomaly';

import {
  DUMMY_PASSWORD_HASH,
  normalizeCredential,
  normalizeEmail,
} from '../src/lib/auth/credentials';
import { authorizeCredentials } from '../src/lib/auth/credentials-authorize';
import { passwordSchema } from '../src/lib/validation';

const VALID_PASSWORD = 'Str0ngPassw0rd!';

const selectRows: unknown[] = [];
const setCalls: Array<Record<string, unknown>> = [];
let updateFails = false;

const mockDb = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve(selectRows)),
      })),
    })),
  })),
  update: vi.fn(() => ({
    set: vi.fn((values: Record<string, unknown>) => {
      setCalls.push(values);
      return {
        where: vi.fn(() => ({
          returning: vi.fn(() =>
            updateFails
              ? Promise.reject(new Error('update failed'))
              : Promise.resolve([{ id: 'user-1' }]),
          ),
        })),
      };
    }),
  })),
};

vi.mock('@kestrel/ai', () => ({
  getDb: () => mockDb,
}));

vi.mock('@kestrel/db', () => ({
  withRateLimit: vi.fn(async () => ({ allowed: true })),
  schema: {
    users: {
      id: 'users.id',
      email: 'users.email',
      name: 'users.name',
      image: 'users.image',
      hashedPassword: 'users.hashedPassword',
      tokenVersion: 'users.tokenVersion',
      twoFactorEnabled: 'users.twoFactorEnabled',
      twoFactorSecret: 'users.twoFactorSecret',
      lockedUntil: 'users.lockedUntil',
      failedLoginAttempts: 'users.failedLoginAttempts',
      twoFactorBackupCodes: 'users.twoFactorBackupCodes',
      failed2faAttempts: 'users.failed2faAttempts',
      twoFactorLockedUntil: 'users.twoFactorLockedUntil',
      emailVerified: 'users.emailVerified',
      deletedAt: 'users.deletedAt',
    },
  },
}));

vi.mock('@kestrel/shared/encryption', () => ({
  decryptSecret: (value: string) => `decrypted:${value}`,
}));

vi.mock('otplib', () => ({
  verifySync: vi.fn(() => ({ valid: false })),
}));

vi.mock('@/lib/auth-anomaly', () => ({
  recordAuthEvent: vi.fn(),
}));

let hashedValidPassword = '';

beforeAll(async () => {
  hashedValidPassword = await bcrypt.hash(VALID_PASSWORD, 4);
});

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'trader@example.com',
    name: 'Trader',
    image: null,
    hashedPassword: hashedValidPassword,
    tokenVersion: 3,
    twoFactorEnabled: false,
    twoFactorSecret: null,
    lockedUntil: null,
    failedLoginAttempts: 0,
    twoFactorBackupCodes: null,
    failed2faAttempts: 0,
    twoFactorLockedUntil: null,
    emailVerified: null,
    ...overrides,
  };
}

describe('credential helpers', () => {
  it('normalizes email casing and surrounding whitespace', () => {
    expect(normalizeEmail('  User@Example.COM ')).toBe('user@example.com');
  });

  it('rejects non-string credential values without throwing', () => {
    expect(normalizeCredential(undefined)).toBe('');
    expect(normalizeCredential(null)).toBe('');
    expect(normalizeCredential(42)).toBe('');
  });

  it('keeps the dummy hash in bcrypt format', () => {
    expect(DUMMY_PASSWORD_HASH).toMatch(/^\$2b\$12\$/);
  });
});

const OVER_MAX_PASSWORD = `Aa1${'x'.repeat(126)}`;
const MAX_LENGTH_PASSWORD = `Aa1${'x'.repeat(125)}`;

describe('passwordSchema (src/lib/validation.ts)', () => {
  it.each([
    ['strong valid password', 'StrongPass1', true],
    ['valid password at the 128-char cap', MAX_LENGTH_PASSWORD, true],
    ['shorter than the 10-char minimum', 'Short1Aa', false],
    ['longer than the 128-char cap', OVER_MAX_PASSWORD, false],
    ['missing uppercase letter', 'strongpass1', false],
    ['missing lowercase letter', 'STRONGPASS1', false],
    ['missing digit', 'StrongPass', false],
  ])('validates %s', (_label, value, expected) => {
    expect(passwordSchema.safeParse(value).success).toBe(expected);
  });
});

describe('authorizeCredentials (src/lib/auth/credentials-authorize.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectRows.length = 0;
    setCalls.length = 0;
    updateFails = false;
  });

  it('returns null immediately for missing email or password without touching the database', async () => {
    await expect(authorizeCredentials(undefined)).resolves.toBeNull();
    await expect(authorizeCredentials({ email: 'a@example.com' })).resolves.toBeNull();
    await expect(authorizeCredentials({ email: '', password: 'x' })).resolves.toBeNull();

    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('returns null when no user row matches the normalized email', async () => {
    const result = await authorizeCredentials({
      email: '  USER@Example.COM ',
      password: VALID_PASSWORD,
    });

    expect(result).toBeNull();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('throws ACCOUNT_LOCKED and records the anomaly while the lockout is active', async () => {
    selectRows.push(makeUser({ lockedUntil: new Date(Date.now() + 60_000) }));

    await expect(
      authorizeCredentials({ email: 'trader@example.com', password: VALID_PASSWORD }),
    ).rejects.toThrow('ACCOUNT_LOCKED');

    expect(recordAuthEvent).toHaveBeenCalledWith('account_locked');
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('increments failedLoginAttempts and returns null when the password does not match', async () => {
    selectRows.push(makeUser());

    const result = await authorizeCredentials({
      email: 'trader@example.com',
      password: 'TotallyWrong123',
    });

    expect(result).toBeNull();
    expect(setCalls.some((values) => 'failedLoginAttempts' in values)).toBe(true);
  });

  it('returns null when the user lookup itself fails', async () => {
    mockDb.select.mockImplementationOnce(() => {
      throw new Error('connection lost');
    });

    const result = await authorizeCredentials({
      email: 'trader@example.com',
      password: VALID_PASSWORD,
    });

    expect(result).toBeNull();
  });

  it('resets lockout counters and returns the authenticated user for valid credentials', async () => {
    selectRows.push(makeUser({ failedLoginAttempts: 3 }));

    const result = await authorizeCredentials({
      email: ' TRADER@Example.com ',
      password: VALID_PASSWORD,
      rememberMe: 'true',
      deviceName: 'laptop',
      ip: '1.2.3.4',
    });

    expect(result).toMatchObject({
      id: 'user-1',
      email: 'trader@example.com',
      name: 'Trader',
      tokenVersion: 3,
      rememberMe: true,
      deviceName: 'laptop',
      ip: '1.2.3.4',
    });
    expect(typeof result?.sessionId).toBe('string');
    expect(result?.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(setCalls.some((values) => values.failedLoginAttempts === 0)).toBe(true);
  });

  it('throws 2FA_REQUIRED when 2FA is enabled and no code is supplied', async () => {
    selectRows.push(makeUser({ twoFactorEnabled: true, twoFactorSecret: 'v1:encrypted-secret' }));

    await expect(
      authorizeCredentials({ email: 'trader@example.com', password: VALID_PASSWORD }),
    ).rejects.toThrow('2FA_REQUIRED');
  });

  it('accepts and consumes a valid backup code when TOTP verification fails', async () => {
    const hashedBackupCode = await bcrypt.hash('backup-code-1', 4);
    selectRows.push(
      makeUser({
        twoFactorEnabled: true,
        twoFactorSecret: 'v1:encrypted-secret',
        twoFactorBackupCodes: [hashedBackupCode],
      }),
    );

    const result = await authorizeCredentials({
      email: 'trader@example.com',
      password: VALID_PASSWORD,
      totpCode: 'backup-code-1',
    });

    expect(result).toMatchObject({ id: 'user-1', email: 'trader@example.com' });
    expect(setCalls.some((values) => 'twoFactorBackupCodes' in values)).toBe(true);
    expect(recordAuthEvent).not.toHaveBeenCalledWith('2fa_failure');
  });

  it('increments the 2FA failure counter and throws INVALID_2FA_CODE when the code does not verify', async () => {
    selectRows.push(
      makeUser({
        twoFactorEnabled: true,
        twoFactorSecret: 'v1:encrypted-secret',
        twoFactorBackupCodes: null,
      }),
    );

    await expect(
      authorizeCredentials({
        email: 'trader@example.com',
        password: VALID_PASSWORD,
        totpCode: '000000',
      }),
    ).rejects.toThrow('INVALID_2FA_CODE');

    expect(recordAuthEvent).toHaveBeenCalledWith('2fa_failure');
    expect(setCalls.some((values) => 'failed2faAttempts' in values)).toBe(true);
  });
});
