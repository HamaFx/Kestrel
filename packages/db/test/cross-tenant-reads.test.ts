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

// Audit 2026-10-31 (R1) — connection choice for the cross-tenant
// `user_settings` reads. These helpers run on nearly every page via
// `getUserWithSettings`, so the contract is:
//   1. a caller-provided client always wins (no extra pool checkout),
//   2. with `ADMIN_DATABASE_URL` configured they read on the admin
//      (BYPASSRLS) connection,
//   3. without it they skip the read, return the degraded result (null / [])
//      and warn once per process — never throw and never silently read a
//      tenant-scoped zero.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as clientModule from '../src/client';

const mocks = vi.hoisted(() => ({
  getAdminDb: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock('../src/client', async (importOriginal) => {
  const actual = await importOriginal<typeof clientModule>();
  return {
    ...actual,
    getAdminDb: mocks.getAdminDb,
    getDb: mocks.getDb,
  };
});

const SETTINGS_ROW = {
  userId: 'admin-1',
  tenantId: 'tenant-1',
  defaultSymbol: 'XAUUSD',
};

/** Minimal thenable Drizzle-query stand-in. */
class FakeDb {
  constructor(private readonly rows: unknown[]) {}

  select(): this {
    return this;
  }
  from(): this {
    return this;
  }
  innerJoin(): this {
    return this;
  }
  where(): this {
    return this;
  }
  orderBy(): this {
    return this;
  }
  limit(): this {
    return this;
  }

  then<TResult1 = unknown[], TResult2 = never>(
    onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.rows).then(onfulfilled, onrejected);
  }
}

describe('cross-tenant user_settings reads', () => {
  beforeEach(() => {
    // Fresh module state so the once-per-process warning flag starts unset.
    vi.resetModules();
    mocks.getAdminDb.mockReset();
    mocks.getDb.mockReset();
    vi.stubEnv('ADMIN_DATABASE_URL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns null without ADMIN_DATABASE_URL, never reads, and warns once per process', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { getPlatformAdminSettings } = await import('../src/queries/user-settings');

    await expect(getPlatformAdminSettings()).resolves.toBeNull();
    await expect(getPlatformAdminSettings()).resolves.toBeNull();

    // The cross-tenant read is skipped entirely — no tenant-scoped fallback.
    expect(mocks.getAdminDb).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('ADMIN_DATABASE_URL');
  });

  it('caps listAllUserSettings at [] without ADMIN_DATABASE_URL and shares the single warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { getPlatformAdminSettings, listAllUserSettings } =
      await import('../src/queries/user-settings');

    await expect(listAllUserSettings()).resolves.toEqual([]);
    await expect(getPlatformAdminSettings()).resolves.toBeNull();
    await expect(listAllUserSettings()).resolves.toEqual([]);

    expect(mocks.getAdminDb).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
    // Both functions share one once-per-process flag, so the caller sees a
    // single warning for the platform-wide degradation.
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('reads on the admin client when ADMIN_DATABASE_URL is configured', async () => {
    vi.stubEnv('ADMIN_DATABASE_URL', 'postgres://admin:secret@admin.example.test/app');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.getAdminDb
      .mockReturnValueOnce(new FakeDb([{ settings: SETTINGS_ROW }]))
      .mockReturnValueOnce(new FakeDb([SETTINGS_ROW]));
    const { getPlatformAdminSettings, listAllUserSettings } =
      await import('../src/queries/user-settings');

    await expect(getPlatformAdminSettings()).resolves.toEqual(SETTINGS_ROW);
    await expect(listAllUserSettings()).resolves.toEqual([SETTINGS_ROW]);

    expect(mocks.getAdminDb).toHaveBeenCalledTimes(2);
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('prefers a caller-provided client over both pools and never warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const settingsClient = new FakeDb([
      { settings: SETTINGS_ROW },
    ]) as unknown as clientModule.DbClient;
    const listClient = new FakeDb([SETTINGS_ROW]) as unknown as clientModule.DbClient;
    const { getPlatformAdminSettings, listAllUserSettings } =
      await import('../src/queries/user-settings');

    await expect(getPlatformAdminSettings(settingsClient)).resolves.toEqual(SETTINGS_ROW);
    await expect(listAllUserSettings(listClient)).resolves.toEqual([SETTINGS_ROW]);

    expect(mocks.getAdminDb).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
