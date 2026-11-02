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

// Audit 2026-10-31 (R1) — pins which tenant wrapper each per-user scope helper
// selects. The write path must use `withTenantDb`; the read-only helper must
// use `withTenantDbRO` so `DATABASE_URL_REPLICA` can serve read-only pages.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withUserTenant, withUserTenantRO } from '../src/tenant/with-user-tenant';

const mocks = vi.hoisted(() => ({
  requireTenantIdForUser: vi.fn(),
  withTenantDb: vi.fn(),
  withTenantDbRO: vi.fn(),
}));

vi.mock('../src/tenant', () => ({
  requireTenantIdForUser: mocks.requireTenantIdForUser,
}));

vi.mock('../src/client', () => ({
  withTenantDb: mocks.withTenantDb,
  withTenantDbRO: mocks.withTenantDbRO,
}));

describe('withUserTenant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireTenantIdForUser.mockResolvedValue('tenant-1');
  });

  it('resolves the tenant and runs the work inside the writable wrapper', async () => {
    const work = vi.fn().mockResolvedValue('result');
    mocks.withTenantDb.mockImplementation((_tenantId, callback) => callback({}));

    await expect(withUserTenant('user-1', work)).resolves.toBe('result');

    expect(mocks.requireTenantIdForUser).toHaveBeenCalledWith('user-1');
    expect(mocks.withTenantDb).toHaveBeenCalledWith('tenant-1', work, { userId: 'user-1' });
    expect(mocks.withTenantDbRO).not.toHaveBeenCalled();
  });
});

describe('withUserTenantRO', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireTenantIdForUser.mockResolvedValue('tenant-1');
  });

  it('resolves the tenant and runs the work inside the read-only wrapper', async () => {
    const work = vi.fn().mockResolvedValue('result');
    mocks.withTenantDbRO.mockImplementation((_tenantId, callback) => callback({}));

    await expect(withUserTenantRO('user-1', work)).resolves.toBe('result');

    expect(mocks.requireTenantIdForUser).toHaveBeenCalledWith('user-1');
    expect(mocks.withTenantDbRO).toHaveBeenCalledWith('tenant-1', work, { userId: 'user-1' });
    expect(mocks.withTenantDb).not.toHaveBeenCalled();
  });
});
