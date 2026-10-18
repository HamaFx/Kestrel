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

// Batch 4: behavioral coverage for the real NextAuth callbacks.
//
// The previous revision was 100% `fs.readFileSync` source grepping and never
// executed `handleJwtCallback` / `handleSessionCallback`. Here the session
// persistence + DB boundaries are mocked, while the REAL `validateSession`
// fail-closed policy in src/lib/auth/session-validators.ts runs end-to-end
// against a fake Drizzle chain.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleJwtCallback, handleSessionCallback } from '../src/lib/auth/callbacks';
import { _resetSessionThrottles } from '../src/lib/auth/session-validators';

// The validator keeps an in-process throttle ledger (the token fields do not
// survive the RSC path); reset it so tests do not inherit another test's
// throttle timestamps.
beforeEach(() => {
  _resetSessionThrottles();
});

const mockCreateUserSession = vi.fn();
const mockGetDb = vi.fn();

vi.mock('@kestrel/db', () => ({
  createUserSession: (...args: unknown[]) => mockCreateUserSession(...args),
  schema: {
    users: { tokenVersion: 'users.tokenVersion' },
    userSessions: {
      id: 'userSessions.id',
      userId: 'userSessions.userId',
      lastActiveAt: 'userSessions.lastActiveAt',
    },
  },
}));

vi.mock('@kestrel/ai', () => ({
  getDb: (...args: unknown[]) => mockGetDb(...args),
}));

/** Fake Drizzle client for the real `validateSession` checks. */
function makeDb(row: unknown, updateFails = false) {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        leftJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve(row === undefined ? [] : [row])),
          })),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() =>
          updateFails ? Promise.reject(new Error('update failed')) : Promise.resolve(),
        ),
      })),
    })),
  };
}

/** The session must carry no user identity and be expired after invalidation. */
function expectInvalidated(result: { user?: unknown; expires?: string }) {
  expect(result.expires).toBe('0');
  expect(result.user).toBeUndefined();
}

describe('handleJwtCallback', () => {
  beforeEach(() => {
    mockCreateUserSession.mockReset();
    mockGetDb.mockReset();
  });

  it('creates a session on initial sign-in and attaches identity fields to the token', async () => {
    mockCreateUserSession.mockResolvedValue(undefined);

    const token = await handleJwtCallback(
      {} as never,
      {
        id: 'u1',
        tokenVersion: 2,
        sessionId: 'sess-123',
        rememberMe: true,
        deviceName: 'dev-1',
        ip: '1.2.3.4',
      } as never,
    );

    expect(mockCreateUserSession).toHaveBeenCalledWith('sess-123', 'u1', 'dev-1', '1.2.3.4');
    expect(token).toEqual({
      id: 'u1',
      tokenVersion: 2,
      emailVerified: null,
      rememberMe: true,
      sessionId: 'sess-123',
    });
  });

  it('generates a session id when the user has none and defaults tokenVersion for non-sign-in passes', async () => {
    mockCreateUserSession.mockResolvedValue(undefined);

    const token = await handleJwtCallback({} as never, { id: 'u1' } as never);

    expect(typeof token.sessionId).toBe('string');
    expect(token.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(token.tokenVersion).toBe(0);
    expect(mockCreateUserSession).toHaveBeenCalledWith(token.sessionId, 'u1', null, null);

    mockCreateUserSession.mockClear();
    const refreshToken = await handleJwtCallback({ sub: 'existing' } as never);
    expect(refreshToken).toEqual({ sub: 'existing', tokenVersion: 0 });
    expect(mockCreateUserSession).not.toHaveBeenCalled();
  });

  it('fails closed by throwing SESSION_SYSTEM_ERROR when the session insert fails', async () => {
    mockCreateUserSession.mockRejectedValue(new Error('insert failed'));

    await expect(
      handleJwtCallback({} as never, { id: 'u1', sessionId: 'sess-1' } as never),
    ).rejects.toThrow('SESSION_SYSTEM_ERROR');
  });
});

describe('handleSessionCallback', () => {
  beforeEach(() => {
    mockGetDb.mockReset();
  });

  it('fails closed with an expired session when getDb throws', async () => {
    mockGetDb.mockImplementation(() => {
      throw new Error('DB down');
    });

    const result = await handleSessionCallback(
      { user: { id: 'u1' }, expires: '2026-12-01' } as never,
      { id: 'u1', sessionId: 'sess-1' } as never,
    );

    expectInvalidated(result);
  });

  it('invalidates the session when the DB tokenVersion differs from the token (real validateSession)', async () => {
    mockGetDb.mockReturnValue(makeDb({ tv: 5, sessionId: 'sess-1' }));

    const result = await handleSessionCallback(
      { user: { id: 'u1' }, expires: '2026-12-01' } as never,
      { id: 'u1', tokenVersion: 1, sessionId: 'sess-1' } as never,
    );

    expectInvalidated(result);
  });

  it('invalidates the session when the session row is missing (revoked session)', async () => {
    mockGetDb.mockReturnValue(makeDb({ tv: 3, sessionId: null }));

    const result = await handleSessionCallback(
      { user: { id: 'u1' }, expires: '2026-12-01' } as never,
      { id: 'u1', tokenVersion: 3, sessionId: 'revoked-session' } as never,
    );

    expectInvalidated(result);
  });

  it('keeps a valid session and merges token identity into it', async () => {
    const db = makeDb({ tv: 3, sessionId: 'sess-1' });
    mockGetDb.mockReturnValue(db);
    const token = {
      id: 'u1',
      tokenVersion: 3,
      sessionId: 'sess-1',
      emailVerified: new Date('2026-01-01T00:00:00Z'),
    };

    const result = await handleSessionCallback(
      { user: { id: 'stale-id' }, expires: '2026-12-01' } as never,
      token as never,
    );

    expect(result.user?.id).toBe('u1');
    expect(result.user?.emailVerified).toEqual(new Date('2026-01-01T00:00:00Z'));
    expect(result.sessionId).toBe('sess-1');
    expect(result.expires).toBe('2026-12-01');
    expect(db.update).toHaveBeenCalled();
    expect(token.tvCheckedAt).toBeGreaterThan(0);
    expect(token.lastActiveUpdate).toBeGreaterThan(0);
  });

  it('fails closed when the last-active write fails during validation', async () => {
    mockGetDb.mockReturnValue(makeDb({ tv: 3, sessionId: 'sess-1' }, true));

    const result = await handleSessionCallback(
      { user: { id: 'u1' }, expires: '2026-12-01' } as never,
      { id: 'u1', tokenVersion: 3, sessionId: 'sess-1' } as never,
    );

    expectInvalidated(result);
  });
});
