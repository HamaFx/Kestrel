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

// Audit 2026-10-31 (R1): the DI-backed `getDb()` caches a fallback client,
// but any active AsyncLocalStorage scope (tenant transaction OR explicit
// `withAdminDb`) must win. Otherwise a cron route that opens an admin scope
// silently keeps querying as the non-bypass role and sees zero RLS rows.

import { container } from '@kestrel/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDb } from '../src/runtime/db';

const mocks = vi.hoisted(() => ({
  tenantScope: false,
  adminScope: false,
  rawCalls: 0,
}));

vi.mock('@kestrel/db', () => ({
  getDb: vi.fn(() => ({ source: 'scoped-raw', call: (mocks.rawCalls += 1) })),
  getAdminDb: vi.fn(() => ({ source: 'admin' })),
  hasTenantDbScope: vi.fn(() => mocks.tenantScope),
  hasAdminDbScope: vi.fn(() => mocks.adminScope),
}));

describe('@kestrel/ai getDb scope propagation', () => {
  beforeEach(() => {
    mocks.tenantScope = false;
    mocks.adminScope = false;
    mocks.rawCalls = 0;
    process.env.KESTREL_RUNTIME = 'web';
    delete process.env.ADMIN_DATABASE_URL;
    // The container caches the fallback client per process; reset it so each
    // test starts from an empty cache.
    container.clear();
  });

  it('uses the cached fallback client outside any scope', () => {
    const first = getDb();
    const second = getDb();

    expect(first).toBe(second);
    expect(mocks.rawCalls).toBe(1);
  });

  it('bypasses the cache inside a tenant scope', () => {
    const cached = getDb();
    mocks.tenantScope = true;

    const scoped = getDb();

    expect(scoped).not.toBe(cached);
    expect(mocks.rawCalls).toBe(2);
  });

  it('bypasses the cache inside an admin scope', () => {
    const cached = getDb();
    mocks.adminScope = true;

    const scoped = getDb();

    expect(scoped).not.toBe(cached);
    expect(mocks.rawCalls).toBe(2);
  });
});
