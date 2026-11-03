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

// Phase 1 (Task 1.1) — the BYOK settings payload carries masks, never secrets.

import { describe, expect, it, vi } from 'vitest';

import {
  buildKeyPreviewMap,
  maskApiKeyPreview,
} from '../src/app/(app)/settings/api-keys/_lib/mask-api-key';

const RAW_GOOGLE_KEY = 'sk-proj-super-secret-value-1a2b';

const mocks = vi.hoisted(() => ({
  computeUsage: vi.fn(),
  getDb: vi.fn(),
  getOwnUserSettings: vi.fn(),
  getUserWithSettings: vi.fn(),
  requireTenantIdForUser: vi.fn(),
  withUserTenant: vi.fn(),
  buildCatalogForUser: vi.fn(),
  decryptByok: vi.fn(),
}));

vi.mock('@kestrel/ai', () => ({ computeUsage: mocks.computeUsage }));
vi.mock('@kestrel/db', () => ({
  getDb: mocks.getDb,
  getOwnUserSettings: mocks.getOwnUserSettings,
  getUserWithSettings: mocks.getUserWithSettings,
  requireTenantIdForUser: mocks.requireTenantIdForUser,
  withUserTenant: mocks.withUserTenant,
  schema: new Proxy(
    {},
    {
      get: () => new Proxy({}, { get: () => 'column' }),
    },
  ),
}));
vi.mock('@kestrel/shared/encryption', () => ({ decryptByok: mocks.decryptByok }));
vi.mock('@/lib/services/catalog-server', () => ({
  buildCatalogForUser: mocks.buildCatalogForUser,
}));

describe('maskApiKeyPreview', () => {
  it('marks empty and whitespace-only values as unconfigured', () => {
    expect(maskApiKeyPreview('')).toEqual({ configured: false, maskedPreview: null });
    expect(maskApiKeyPreview('   ')).toEqual({ configured: false, maskedPreview: null });
    expect(maskApiKeyPreview(null)).toEqual({ configured: false, maskedPreview: null });
    expect(maskApiKeyPreview(undefined)).toEqual({ configured: false, maskedPreview: null });
  });

  it('keeps only a prefix and last four characters', () => {
    expect(maskApiKeyPreview(RAW_GOOGLE_KEY)).toEqual({
      configured: true,
      maskedPreview: 'sk-p••••1a2b',
    });
  });

  it('does not leak a short key', () => {
    expect(maskApiKeyPreview('abcd')).toEqual({ configured: true, maskedPreview: '••••' });
    expect(maskApiKeyPreview('abcdefgh')).toEqual({
      configured: true,
      maskedPreview: '••••efgh',
    });
  });
});

describe('buildKeyPreviewMap', () => {
  it('omits empty providers and never returns the raw value', () => {
    const previews = buildKeyPreviewMap({
      google: RAW_GOOGLE_KEY,
      openai: '',
      anthropic: null,
    });

    expect(previews).toEqual({ google: 'sk-p••••1a2b' });
    expect(JSON.stringify(previews)).not.toContain('super-secret');
  });
});

describe('loadApiKeysPageData', () => {
  it('never serialises the decrypted key into the RSC page payload', async () => {
    mocks.withUserTenant.mockImplementation(async (_id: string, cb: () => unknown) => cb());
    mocks.getUserWithSettings.mockResolvedValue({ settings: {}, user: null });
    mocks.getOwnUserSettings.mockResolvedValue({ aiApiKeys: 'encrypted-payload' });
    mocks.decryptByok.mockReturnValue({ google: RAW_GOOGLE_KEY });
    mocks.computeUsage.mockResolvedValue({ byProvider: [], thirtyDayTurns: 0, thirtyDayUsd: 0 });
    mocks.getDb.mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    });
    mocks.requireTenantIdForUser.mockResolvedValue('tenant-1');
    mocks.buildCatalogForUser.mockResolvedValue({ providers: [] });

    const { loadApiKeysPageData } =
      await import('../src/app/(app)/settings/api-keys/_lib/load-page-data');
    const data = await loadApiKeysPageData('user-1');

    expect(data.configuredKeyIds).toEqual(['google']);
    expect(data.maskedPreviewByProvider).toEqual({ google: 'sk-p••••1a2b' });
    expect(JSON.stringify(data)).not.toContain(RAW_GOOGLE_KEY);
    expect(JSON.stringify(data)).not.toContain('super-secret');
  });
});
