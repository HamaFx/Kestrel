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

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as clientModule from '../src/client';

interface ScopeHolder {
  tenantId: string;
  db: { execute: (query: unknown) => Promise<unknown> };
}

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  withTenantDb: vi.fn(),
  withUserTenant: vi.fn(),
  scope: null as ScopeHolder | null,
}));

vi.mock('../src/client', async (importOriginal) => {
  const actual = await importOriginal<typeof clientModule>();
  return {
    ...actual,
    getTenantDbScope: vi.fn(() => mocks.scope),
    withTenantDb: mocks.withTenantDb,
  };
});

// `withRateLimit` resolves an authenticated subject's tenant through this
// helper (fail closed when membership is missing).
vi.mock('../src/tenant/with-user-tenant', () => ({
  withUserTenant: mocks.withUserTenant,
}));

const fakeDb = { execute: mocks.execute };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.scope = null;
  mocks.withTenantDb.mockImplementation(
    (_tenantId: string, work: (db: typeof fakeDb) => Promise<unknown>) => work(fakeDb),
  );
  mocks.withUserTenant.mockImplementation(
    (_userId: string, work: (db: typeof fakeDb) => Promise<unknown>) => work(fakeDb),
  );
});

describe('resolveRateLimitTenant', () => {
  it('seeds the platform tenant for the pre-auth system subject', async () => {
    const { resolveRateLimitTenant, SYSTEM_RATE_LIMIT_TENANT_ID } =
      await import('../src/ops/rate-limit');
    // POST /login regression: without an explicit tenant the insert fell back to
    // an empty `app.current_tenant` GUC and violated rate_limits_tenant_id_fkey.
    expect(resolveRateLimitTenant('__system__')).toBe(SYSTEM_RATE_LIMIT_TENANT_ID);
  });

  it('leaves authenticated subjects to the active scope / membership lookup', async () => {
    const { resolveRateLimitTenant } = await import('../src/ops/rate-limit');
    expect(resolveRateLimitTenant('user-1')).toBeUndefined();
    expect(resolveRateLimitTenant('user-1', 'org-1')).toBe('org-1');
  });
});

describe('withRateLimit with mocked client', () => {
  it('includes tenant_id in the pre-auth insert and scopes to the platform tenant', async () => {
    mocks.execute.mockResolvedValue([{ request_count: 1 }]);
    const { withRateLimit } = await import('../src/ops/rate-limit');
    await withRateLimit('__system__', 'login-ip', 10);
    const query = JSON.stringify(mocks.execute.mock.calls[0]?.[0]);
    expect(query).toContain('tenant_id');
    expect(query).toContain('__system__');
    // Pre-auth buckets have no user scope: the helper must open the platform
    // tenant's scope itself (RLS rejects an unscoped INSERT).
    expect(mocks.withTenantDb).toHaveBeenCalledWith('__system__', expect.any(Function));
    expect(mocks.withUserTenant).not.toHaveBeenCalled();
  });

  it('opens the user tenant scope for an authenticated subject outside any scope', async () => {
    mocks.execute.mockResolvedValue([{ request_count: 1 }]);
    const { withRateLimit } = await import('../src/ops/rate-limit');
    await withRateLimit('user-1', 'ai_chat', 10);
    expect(mocks.withUserTenant).toHaveBeenCalledWith('user-1', expect.any(Function));
    expect(mocks.withTenantDb).not.toHaveBeenCalled();
  });

  it('fails closed when an authenticated subject has no resolvable tenant', async () => {
    mocks.withUserTenant.mockRejectedValue(
      new Error('No organization membership found for user user-1'),
    );
    const { withRateLimit } = await import('../src/ops/rate-limit');
    await expect(withRateLimit('user-1', 'ai_chat', 10)).rejects.toThrow(/membership/i);
  });

  it('reuses an active same-tenant scope without opening another one', async () => {
    mocks.scope = { tenantId: 'org-1', db: fakeDb };
    mocks.execute.mockResolvedValue([{ request_count: 1 }]);
    const { withRateLimit } = await import('../src/ops/rate-limit');
    await withRateLimit('user-1', 'ai_chat', 10);
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.withTenantDb).not.toHaveBeenCalled();
    expect(mocks.withUserTenant).not.toHaveBeenCalled();
  });

  it('honours an explicit tenant over the active scope', async () => {
    mocks.scope = { tenantId: 'org-1', db: fakeDb };
    mocks.execute.mockResolvedValue([{ request_count: 1 }]);
    const { withRateLimit } = await import('../src/ops/rate-limit');
    await withRateLimit('user-1', 'ai_chat', 10, { tenantId: 'org-2' });
    expect(mocks.withTenantDb).toHaveBeenCalledWith('org-2', expect.any(Function));
  });

  it('returns { allowed: true } when count <= limit', async () => {
    mocks.execute.mockResolvedValue([{ request_count: 3 }]);
    const { withRateLimit } = await import('../src/ops/rate-limit');
    const result = await withRateLimit('user-1', 'ai_chat', 10);
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(3);
    expect(result.limit).toBe(10);
  });

  it('returns { allowed: false } when count exceeds limit', async () => {
    mocks.execute.mockResolvedValue([{ request_count: 15 }]);
    const { withRateLimit } = await import('../src/ops/rate-limit');
    const result = await withRateLimit('user-2', 'ai_chat', 10);
    expect(result.allowed).toBe(false);
    expect(result.count).toBe(15);
  });

  it('handles legacy result row shape ({ rows })', async () => {
    mocks.execute.mockResolvedValue({ rows: [{ request_count: 7 }] });
    const { withRateLimit } = await import('../src/ops/rate-limit');
    const result = await withRateLimit('user-3', 'ai_chat', 10);
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(7);
  });

  it('handles empty result from both shapes', async () => {
    mocks.execute.mockResolvedValue([]);
    const { withRateLimit } = await import('../src/ops/rate-limit');
    const result = await withRateLimit('user-4', 'ai_chat', 10);
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(0);
  });

  it('coerces string/bigint count to number', async () => {
    mocks.execute.mockResolvedValue([{ request_count: '42' }]);
    const { withRateLimit } = await import('../src/ops/rate-limit');
    const result = await withRateLimit('user-5', 'ai_chat', 10);
    expect(result.count).toBe(42);
    expect(typeof result.count).toBe('number');
  });
});
