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

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAdminUser, withAdminAuth } from '@/lib/admin-auth';

// ── Mock db ────────────────────────────────────────────────────────
// admin-auth.ts uses one query pattern: select → from → where (user lookup).
// `.where()` returns a thenable so the caller can await it directly.

const whereResults: unknown[] = [];
let whereCallIndex = 0;

function makeFromResult(): Record<string, unknown> {
  return {
    then: (resolve: (v: unknown) => void) => resolve([]),
    where: vi.fn((_cond: unknown) => {
      const idx = whereCallIndex++;
      return makeThenable(whereResults[idx] ?? []);
    }),
  };
}

function makeThenable(value: unknown): Record<string, unknown> {
  return {
    then: (resolve: (v: unknown) => void) => resolve(value),
  };
}

vi.mock('@kestrel/db', () => {
  const fromResult = makeFromResult();
  return {
    hasTenantDbScope: () => false,
    getDb: () => ({
      select: vi.fn(() => ({ from: vi.fn(() => fromResult) })),
    }),
    schema: {
      users: {} as Record<string, unknown>,
    },
  };
});

const mockAuth = vi.hoisted(() => vi.fn());
vi.mock('@/auth', () => ({
  auth: mockAuth,
}));

function pushWhereResult(value: unknown) {
  whereResults.push(value);
}

function resetMockState() {
  whereResults.length = 0;
  whereCallIndex = 0;
}

describe('getAdminUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockState();
  });

  it('returns unauthenticated when no session exists', async () => {
    mockAuth.mockResolvedValue(null);

    const result = await getAdminUser();

    expect(result.admin).toBeNull();
    expect(result.reason).toBe('unauthenticated');
  });

  it('returns admin when user has admin role', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u-123' } });
    pushWhereResult([{ id: 'u-123', email: 'admin@example.com', name: 'Admin', role: 'admin' }]);

    const result = await getAdminUser();

    expect(result.admin).toEqual({ userId: 'u-123', email: 'admin@example.com', name: 'Admin' });
    expect(result.reason).toBe('authenticated');
  });

  it('returns forbidden when user is not admin', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u-456' } });
    pushWhereResult([{ id: 'u-456', email: 'user@example.com', name: 'User', role: 'user' }]);

    const result = await getAdminUser();

    expect(result.admin).toBeNull();
    expect(result.reason).toBe('forbidden');
  });

  it('returns forbidden when user record is missing', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u-missing' } });
    pushWhereResult([]);

    const result = await getAdminUser();

    expect(result.admin).toBeNull();
    expect(result.reason).toBe('forbidden');
  });
});

describe('withAdminAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockState();
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null);

    const handler = withAdminAuth(async () => Response.json({ ok: true }));
    const res = await handler(
      new Request('http://localhost/api/admin/test', {
        headers: { 'x-request-id': 'admin-req-1' },
      }),
    );

    expect(res.status).toBe(401);
    expect(res.headers.get('x-request-id')).toBe('admin-req-1');
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 when forbidden', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u-456' } });
    pushWhereResult([{ id: 'u-456', email: 'user@example.com', name: 'User', role: 'user' }]);

    const handler = withAdminAuth(async () => Response.json({ ok: true }));
    const res = await handler(new Request('http://localhost/api/admin/test'));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('calls the handler when admin is authenticated', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u-123' } });
    pushWhereResult([{ id: 'u-123', email: 'admin@example.com', name: 'Admin', role: 'admin' }]);

    const handler = withAdminAuth(async (_req, { user }) => Response.json({ admin: user.userId }));
    const res = await handler(new Request('http://localhost/api/admin/test'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.admin).toBe('u-123');
  });
});
