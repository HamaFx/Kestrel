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

// Audit 2026-10-31 (R1) — real (unmocked) client: the two cross-tenant
// aggregates that are only reachable from admin-gated surfaces must fail
// closed when the admin connection is not configured, while the optional
// user_settings inheritance reads degrade without opening any connection.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeAdminDb } from '../src/client';
import { listTraceExplorerEvents } from '../src/queries/diagnostic-traces/explorer';
import { getToolStats } from '../src/queries/tool-telemetry';
import { getPlatformAdminSettings, listAllUserSettings } from '../src/queries/user-settings';

describe('admin-gated cross-tenant aggregates fail closed', () => {
  beforeEach(async () => {
    vi.stubEnv('ADMIN_DATABASE_URL', '');
    // Keep assertTenantIsolationConfig() out of the way so the assertion
    // below pins the admin-pool error, not an unrelated config guard.
    vi.stubEnv('KESTREL_ENABLE_RLS', 'true');
    // No cached admin pool from a sibling test can satisfy the call.
    await closeAdminDb();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('getToolStats throws instead of aggregating zero rows', async () => {
    await expect(getToolStats(Date.now())).rejects.toThrow(/ADMIN_DATABASE_URL/);
  });

  it('listTraceExplorerEvents throws instead of returning an empty timeline', async () => {
    await expect(listTraceExplorerEvents({})).rejects.toThrow(/ADMIN_DATABASE_URL/);
  });
});

describe('optional cross-tenant user_settings reads degrade without a connection', () => {
  beforeEach(() => {
    vi.stubEnv('ADMIN_DATABASE_URL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('skips both reads, returning null / [] and warning once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Reaching a real pool here would throw (no DATABASE_URL in unit tests) or
    // open a connection; resolving proves the read was skipped before that.
    await expect(getPlatformAdminSettings()).resolves.toBeNull();
    await expect(listAllUserSettings()).resolves.toEqual([]);
    await expect(getPlatformAdminSettings()).resolves.toBeNull();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('ADMIN_DATABASE_URL');
  });
});
