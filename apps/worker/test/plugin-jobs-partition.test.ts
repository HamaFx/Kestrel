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

// R16 (audit 2026-10-31) — plugin jobs used to enumerate every enabled install
// across all tenants, so on a multi-worker deployment every replica ran every
// tenant's paper-trading strategies and briefings. The user lookup is now
// filtered through the same partition the core jobs use.

import { describe, expect, it, vi } from 'vitest';

import { loadInstalledUsers } from '../src/plugin-jobs';
import { TenantRouter } from '../src/tenant-router';

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), with: vi.fn() } as never;

// userId deliberately differs from tenantId so the test pins which column is
// partitioned.
const ROWS = [
  { userId: 'u1', tenantId: 'user-1', settings: {} },
  { userId: 'u2', tenantId: 'user-2', settings: {} },
  { userId: 'u3', tenantId: 'tenant-a', settings: {} },
  { userId: 'u4', tenantId: 'tenant-b', settings: {} },
];

describe('plugin job tenant partitioning (R16)', () => {
  it('returns only the tenants this partition owns', async () => {
    const listUsers = vi.fn(async () => ROWS);
    const router = new TenantRouter({ partition: 1, totalPartitions: 2 });

    const users = await loadInstalledUsers('paper-trading', log, router, listUsers);

    expect(listUsers).toHaveBeenCalledWith('paper-trading');
    // md5 buckets for these ids: user-1 mod 2 = 1, tenant-b mod 2 = 1.
    expect(users.map((user) => user.tenantId)).toEqual(['user-1', 'tenant-b']);
  });

  it('returns every tenant in single-worker mode', async () => {
    const router = new TenantRouter({ partition: 0, totalPartitions: 1 });
    const users = await loadInstalledUsers('paper-trading', log, router, async () => ROWS);
    expect(users.map((user) => user.tenantId)).toEqual(ROWS.map((row) => row.tenantId));
  });

  it('partitions on tenantId, not the user id', async () => {
    // A row whose tenantId is not in this partition would be dropped even
    // though its userId happens to bucket here.
    const router = new TenantRouter({ partition: 1, totalPartitions: 2 });
    const users = await loadInstalledUsers('telegram-bot', log, router, async () => [
      { userId: 'user-1', tenantId: 'user-2', settings: {} },
    ]);
    expect(users).toEqual([]);
  });

  it('returns an empty list when the user lookup fails', async () => {
    const error = vi.fn();
    const users = await loadInstalledUsers(
      'paper-trading',
      { info: vi.fn(), warn: vi.fn(), error, with: vi.fn() } as never,
      new TenantRouter({ partition: 0, totalPartitions: 1 }),
      async () => {
        throw new Error('db down');
      },
    );
    expect(users).toEqual([]);
    expect(error).toHaveBeenCalledWith(
      'Failed to resolve plugin installed users',
      expect.objectContaining({ pluginId: 'paper-trading' }),
    );
  });
});
